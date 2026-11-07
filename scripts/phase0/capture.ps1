# Packet capture: does the phone's request reach the PC, and which component drops it?
# Run in an ADMINISTRATOR PowerShell from the project folder:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\phase0\capture.ps1
# Uses Windows' built-in pktmon. Changes no firewall or security settings.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host '[X] 관리자 PowerShell에서 실행해야 합니다.'; exit 1 }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$work = Join-Path $env:TEMP 'scorecheck-capture'
New-Item -ItemType Directory -Force -Path $work | Out-Null
$etl = Join-Path $work 'cap.etl'; $txt = Join-Path $work 'cap.txt'; $cnt = Join-Path $work 'counters.txt'
Remove-Item $etl, $txt, $cnt -ErrorAction SilentlyContinue
$port = 8765
$server = $null

try {
    $hot = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'hotspot.ps1') start | ConvertFrom-Json
    Write-Host ("[1/4] 핫스팟: {0}" -f $hot.state)

    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) { $node = Join-Path $env:ProgramFiles 'nodejs\node.exe' }
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { $port = 8766 }
    $outLog = Join-Path $work 'server-out.txt'; $errLog = Join-Path $work 'server-err.txt'
    Remove-Item $outLog, $errLog -ErrorAction SilentlyContinue
    $server = Start-Process -FilePath $node -ArgumentList "`"$(Join-Path $here 'server.mjs')`" --port $port" -PassThru -NoNewWindow -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    $url = $null
    for ($i = 0; $i -lt 20 -and -not $url; $i++) {
        Start-Sleep -Milliseconds 500
        if ($server.HasExited) { break }
        if (Test-Path $outLog) { $url = (Select-String -Path $outLog -Pattern 'http://[0-9.]+:[0-9]+/s/[0-9a-f]+' -Encoding UTF8 | Select-Object -First 1).Matches.Value }
    }
    if (-not $url) { if (Test-Path $errLog) { Get-Content $errLog -Encoding UTF8 | Write-Host }; throw '시험 서버가 시작되지 않았습니다.' }

    $phone = (Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -like '192.168.137.*' -and $_.IPAddress -notin '192.168.137.1','192.168.137.255' -and $_.State -ne 'Unreachable' } | Select-Object -First 1).IPAddress
    if (-not $phone) { throw '핫스팟에 연결된 폰을 찾지 못했습니다. 폰을 핫스팟에 연결한 뒤 다시 실행하세요.' }
    Write-Host ("      폰 주소: {0}" -f $phone)
    pktmon filter remove | Out-Null
    pktmon filter add Phone -i $phone | Out-Null
    pktmon start --capture --pkt-size 128 --file-name "$etl" | Out-Null
    Write-Host '[2/4] 패킷 캡처를 시작했습니다.'
    Write-Host ''
    Write-Host '[3/4] 폰 브라우저에 아래 주소를 입력하세요:'
    Write-Host ''
    Write-Host "        $url"
    Write-Host ''
    Write-Host '      그다음 폰에서 아무 인터넷 사이트(예: naver.com)도 하나 열어 주세요.'
    Write-Host '      두 가지를 다 하고 여기서 Enter 를 누르세요.'
    Read-Host | Out-Null

    pktmon counters --type all --drop-reason > $cnt 2>&1
    pktmon stop | Out-Null
    pktmon etl2txt "$etl" --out "$txt" | Out-Null

    Write-Host '[4/4] 결과'
    $lines = if (Test-Path $txt) { Get-Content $txt } else { @() }
    $esc = [regex]::Escape($phone)
    $out = $lines | Where-Object { $_ -match "$esc\.\d+ > " }
    $toPc = $out | Where-Object { $_ -match "> 192\.168\.137\.1\.$port\b" }
    $toNet = $out | Where-Object { $_ -notmatch '> 192\.168\.137\.' }
    Write-Host ("  폰이 보낸 패킷 전체: {0}" -f @($out).Count)
    Write-Host ("  - 인터넷으로 나간 패킷: {0}" -f @($toNet).Count)
    Write-Host ("  - PC 시험 서버(:{0})로 온 패킷: {1}" -f $port, @($toPc).Count)
    $dests = $out | ForEach-Object { if ($_ -match '> (192\.168\.137\.1)\.(\d+)') { "PC:" + $Matches[2] } } | Group-Object | Sort-Object Count -Descending | Select-Object -First 5
    if ($dests) { Write-Host ('  - PC로 온 패킷의 포트: ' + (($dests | ForEach-Object { "$($_.Name)($($_.Count))" }) -join ', ')) }
    $drops = $lines | Where-Object { $_ -match 'Drop' }
    if ($drops) {
        Write-Host '  버려진 패킷 (드롭):'
        $drops | Select-Object -First 8 | ForEach-Object { Write-Host "    $_" }
    }
    Write-Host '  구성 요소별 카운터:'
    if (Test-Path $cnt) { Get-Content $cnt | Select-Object -First 60 | ForEach-Object { Write-Host "    $_" } }
    $log = if (Test-Path $outLog) { Get-Content $outLog -Encoding UTF8 | Where-Object { $_ -match '^\[' } } else { @() }
    Write-Host ('  서버 기록: ' + $(if ($log) { ($log -join ' / ') } else { '없음' }))
    Write-Host ''
    Write-Host ("  자세한 캡처 파일: {0}" -f $txt)
}
finally {
    try { pktmon stop *> $null } catch { }
    try { pktmon filter remove *> $null } catch { }
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
    Write-Host '캡처를 끝내고 서버를 껐습니다.'
}
