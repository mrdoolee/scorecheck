# Windows Mobile Hotspot control via WinRT (no admin required on most PCs).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File hotspot.ps1 status|start|stop
# Prints one line of JSON.
param([ValidateSet('status', 'start', 'stop')][string]$Action = 'status')

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Out-Json($obj) { $obj | ConvertTo-Json -Compress }

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
            $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
            $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
        })[0]
    function Await($op, [Type]$resultType) {
        $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
        $task.Wait(-1) | Out-Null
        $task.Result
    }

    $null = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]
    $null = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]
    $resultType = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]

    $profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
    if ($null -eq $profile) {
        Out-Json @{ ok = $false; error = 'NO_SOURCE_CONNECTION'; message = 'PC has no internet connection to share; hotspot cannot start.' }
        exit 1
    }

    $capability = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::GetTetheringCapabilityFromConnectionProfile($profile)
    if ($capability.ToString() -ne 'Enabled') {
        Out-Json @{ ok = $false; error = 'NOT_CAPABLE'; capability = $capability.ToString() }
        exit 1
    }

    $mgr = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile)

    if ($Action -eq 'start' -and $mgr.TetheringOperationalState.ToString() -ne 'On') {
        $r = Await ($mgr.StartTetheringAsync()) $resultType
        if ($r.Status.ToString() -ne 'Success') {
            Out-Json @{ ok = $false; error = 'START_FAILED'; status = $r.Status.ToString(); message = $r.AdditionalErrorMessage }
            exit 1
        }
    }
    elseif ($Action -eq 'stop' -and $mgr.TetheringOperationalState.ToString() -ne 'Off') {
        $r = Await ($mgr.StopTetheringAsync()) $resultType
        if ($r.Status.ToString() -ne 'Success') {
            Out-Json @{ ok = $false; error = 'STOP_FAILED'; status = $r.Status.ToString(); message = $r.AdditionalErrorMessage }
            exit 1
        }
    }

    $ap = $mgr.GetCurrentAccessPointConfiguration()
    Out-Json @{
        ok         = $true
        state      = $mgr.TetheringOperationalState.ToString()
        clients    = $mgr.ClientCount
        maxClients = $mgr.MaxClientCount
        ssid       = $ap.Ssid
        passphrase = $ap.Passphrase
        source     = $profile.ProfileName
    }
}
catch {
    Out-Json @{ ok = $false; error = 'EXCEPTION'; message = $_.Exception.Message }
    exit 1
}
