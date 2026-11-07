# Finds out which filter drops the phone's connection to the PC test server.
# Run in an ADMINISTRATOR PowerShell from the project folder:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\phase0\diagnose.ps1
# It temporarily turns on Windows Filtering Platform drop auditing, starts the test server,
# waits while you try from the phone, reports the blocking filter, then restores everything.
# It does not change any firewall or security-software setting.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host '[X] 관리자 PowerShell에서 실행해야 합니다. (시작 → PowerShell 우클릭 → 관리자 권한으로 실행)'; exit 1 }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$work = Join-Path $env:TEMP 'scorecheck-diag'
New-Item -ItemType Directory -Force -Path $work | Out-Null
$backup = Join-Path $work 'audit-backup.csv'
$port = 8765

# Audit subcategories by GUID (names are localized on Korean Windows)
$dropGuid = '{0CCE9225-69AE-11D9-BED3-505054503030}'   # Filtering Platform Packet Drop
$connGuid = '{0CCE9226-69AE-11D9-BED3-505054503030}'   # Filtering Platform Connection

auditpol /backup /file:"$backup" | Out-Null
$server = $null
try {
    auditpol /set /subcategory:"$dropGuid" /failure:enable | Out-Null
    auditpol /set /subcategory:"$connGuid" /failure:enable | Out-Null
    Write-Host '[1/4] 차단 기록을 잠시 켰습니다.'

    $hot = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'hotspot.ps1') start | ConvertFrom-Json
    Write-Host ("[2/4] 핫스팟: {0}  (이름 {1})" -f $hot.state, $hot.ssid)

    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) { $node = Join-Path $env:ProgramFiles 'nodejs\node.exe' }
    if (-not (Test-Path $node)) { throw 'node.exe 를 찾지 못했습니다.' }
    $busy = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($busy) { $port = 8766 }
    $outLog = Join-Path $work 'server-out.txt'; $errLog = Join-Path $work 'server-err.txt'
    Remove-Item $outLog, $errLog -ErrorAction SilentlyContinue
    $server = Start-Process -FilePath $node -ArgumentList "`"$(Join-Path $here 'server.mjs')`" --port $port" -PassThru -NoNewWindow -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    $url = $null
    for ($i = 0; $i -lt 20 -and -not $url; $i++) {
        Start-Sleep -Milliseconds 500
        if ($server.HasExited) { break }
        if (Test-Path $outLog) { $url = (Select-String -Path $outLog -Pattern 'http://[0-9.]+:[0-9]+/s/[0-9a-f]+' -Encoding UTF8 | Select-Object -First 1).Matches.Value }
    }
    if (-not $url) {
        Write-Host '[X] 시험 서버가 시작되지 않았습니다. 오류 내용:'
        if (Test-Path $errLog) { Get-Content $errLog -Encoding UTF8 | Write-Host }
        if (Test-Path $outLog) { Get-Content $outLog -Encoding UTF8 | Write-Host }
        throw 'server did not start'
    }
    $start = Get-Date
    Write-Host ''
    Write-Host "[3/4] 폰 브라우저에 아래 주소를 그대로 입력하세요:"
    Write-Host ''
    Write-Host "        $url"
    Write-Host ''
    Write-Host '      폰에서 "연결할 수 없음"이 뜰 때까지 기다린 뒤, 여기서 Enter 를 누르세요.'
    Read-Host | Out-Null
    $log = if (Test-Path $outLog) { Get-Content $outLog -Encoding UTF8 | Where-Object { $_ -match '^\[' } } else { @() }
    if ($log) { Write-Host '      서버 기록:'; $log | ForEach-Object { Write-Host "        $_" } }
    else { Write-Host '      서버 기록: 폰에서 들어온 연결 없음' }

    Write-Host '[4/4] 차단 기록을 찾는 중...'
    $events = Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 5152, 5157; StartTime = $start } -ErrorAction SilentlyContinue |
        ForEach-Object {
            $x = [xml]$_.ToXml()
            $d = @{}; foreach ($n in $x.Event.EventData.Data) { $d[$n.Name] = $n.'#text' }
            [pscustomobject]@{ Id = $_.Id; Src = $d.SourceAddress; Dst = $d.DestAddress; DstPort = $d.DestPort; Filter = $d.FilterRTID; Layer = $d.LayerName; App = $d.Application }
        } | Where-Object { $_.DstPort -eq "$port" }

    if (-not $events) {
        Write-Host ''
        Write-Host '결과: 8765 포트에 대한 Windows 차단 기록이 없습니다.'
        Write-Host ' → Windows 방화벽이 아니라, 패킷이 Windows 필터에 닿기 전에 다른 보안 드라이버가 버리고 있을 가능성이 큽니다.'
    }
    else {
        $filtersXml = Join-Path $work 'filters.xml'
        netsh wfp show filters file="$filtersXml" | Out-Null
        [xml]$fx = Get-Content $filtersXml -Encoding UTF8
        $stateXml = Join-Path $work 'state.xml'
        netsh wfp show state file="$stateXml" | Out-Null
        [xml]$sx = Get-Content $stateXml -Encoding UTF8
        $providers = @{}
        foreach ($p in $sx.SelectNodes('//providers/item')) { $providers[$p.providerKey] = $p.displayData.name }

        Write-Host ''
        Write-Host '결과: 아래 필터가 폰의 접속을 막았습니다.'
        $events | Group-Object Filter | ForEach-Object {
            $fid = $_.Name
            $f = $fx.SelectNodes('//filters/item') | Where-Object { $_.filterId -eq $fid } | Select-Object -First 1
            $first = $_.Group[0]
            Write-Host ("  - 필터 {0}: {1}" -f $fid, $(if ($f) { $f.displayData.name } else { '(알 수 없음)' }))
            if ($f) {
                Write-Host ("    설명: {0}" -f $f.displayData.description)
                Write-Host ("    제공자: {0}" -f $(if ($f.providerKey -and $providers[$f.providerKey]) { $providers[$f.providerKey] } else { $f.providerKey }))
            }
            Write-Host ("    출발 {0} → {1}:{2}, 횟수 {3}, 계층 {4}" -f $first.Src, $first.Dst, $first.DstPort, $_.Count, $first.Layer)
        }
    }
}
finally {
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
    auditpol /restore /file:"$backup" | Out-Null
    Write-Host ''
    Write-Host '차단 기록 설정을 원래대로 돌려놓고 서버를 껐습니다. (핫스팟은 켜진 상태로 둡니다)'
}
