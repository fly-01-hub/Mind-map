[CmdletBinding()]
param([switch]$ShowPairing, [switch]$ConnectNetwork, [switch]$PairLocal)
$ErrorActionPreference = 'Stop'
$taskProgramRoot = Split-Path $PSScriptRoot -Parent
$taskData = Join-Path $env:APPDATA 'ResearchMindSync'
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
$taskService = Join-Path $PSScriptRoot 'personal-sync-server.mjs'
$taskApp = Join-Path $taskProgramRoot 'app'
if (-not (Test-Path -LiteralPath $taskApp)) { $taskApp = Join-Path $taskProgramRoot 'dist' }
$taskTailscale = Join-Path $env:ProgramFiles 'Tailscale/tailscale.exe'
$taskNetworkUrl = $null
if (Test-Path -LiteralPath $taskTailscale) {
    try {
        $taskTs = (& $taskTailscale status --json 2>$null | Out-String | ConvertFrom-Json)
        if ($taskTs.BackendState -eq 'Running' -and $taskTs.Self.DNSName) { $taskNetworkUrl = 'https://' + $taskTs.Self.DNSName.TrimEnd('.') }
    } catch { }
}
if ($ConnectNetwork -and -not $taskNetworkUrl) { throw 'Please sign in to Tailscale on this Windows computer first, then run Connect Network again.' }
New-Item -ItemType Directory -Path $taskData -Force | Out-Null
$taskConfig = Join-Path $taskData 'launch-config.json'
$taskPrevious = $null
if (Test-Path -LiteralPath $taskConfig) { $taskPrevious = Get-Content -LiteralPath $taskConfig -Raw -Encoding UTF8 | ConvertFrom-Json }
if (-not $taskNetworkUrl -and $taskPrevious.publicOrigin) { $taskNetworkUrl = $taskPrevious.publicOrigin }
$taskBuild = (Get-FileHash -LiteralPath (Join-Path $taskApp 'index.html') -Algorithm SHA256).Hash.ToLowerInvariant()
$taskHealthy = $false
try { $taskHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:4180/api/personal-sync/health' -TimeoutSec 2; $taskHealthy = $taskHealth.application -eq 'ResearchMind personal sync' } catch { }
if ($taskHealthy -and $taskPrevious -and ($taskPrevious.publicOrigin -ne $taskNetworkUrl -or $taskPrevious.appBuild -ne $taskBuild)) {
    $taskListeners = @(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 4180 -State Listen -ErrorAction Stop)
    $taskIds = @($taskListeners.OwningProcess | Select-Object -Unique)
    if ($taskIds.Count -ne 1) { throw 'Expected a single personal sync server.' }
    $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($taskIds[0])"
    if ($taskProcess.Name -ne 'node.exe' -or -not $taskProcess.CommandLine.Contains('"' + $taskService + '"') -or -not $taskProcess.CommandLine.Contains('"' + $taskData + '"')) { throw 'Unexpected process owns the sync address. It was not stopped.' }
    Stop-Process -Id $taskProcess.ProcessId -ErrorAction Stop
    Wait-Process -Id $taskProcess.ProcessId -Timeout 5 -ErrorAction SilentlyContinue
    $taskHealthy = $false
}
if (-not $taskHealthy) {
    $taskOccupied = @(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 4180 -State Listen -ErrorAction SilentlyContinue)
    if ($taskOccupied.Count) { throw 'The sync address is occupied. No unrelated process was stopped.' }
    $taskArguments = @('"' + $taskService + '"', '--data', '"' + $taskData + '"', '--app', '"' + $taskApp + '"')
    if ($taskNetworkUrl) { $taskArguments += @('--public-url', $taskNetworkUrl) }
    Start-Process -FilePath $taskNode -ArgumentList $taskArguments -WorkingDirectory $taskProgramRoot -WindowStyle Hidden
    for ($taskAttempt = 0; $taskAttempt -lt 40; $taskAttempt++) {
        Start-Sleep -Milliseconds 250
        try { $taskHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:4180/api/personal-sync/health' -TimeoutSec 2; if ($taskHealth.application -eq 'ResearchMind personal sync') { $taskHealthy = $true; break } } catch { }
    }
    if (-not $taskHealthy) { throw 'The personal sync server did not start. Existing documents were not changed.' }
    @{ publicOrigin=$taskNetworkUrl; app=$taskApp; appBuild=$taskBuild; updatedAt=(Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $taskConfig -Encoding UTF8
}
if ($ConnectNetwork) {
    & $taskTailscale serve --bg --https=443 http://127.0.0.1:4180
    if ($LASTEXITCODE -ne 0) { throw 'Tailscale HTTPS setup is not complete. Follow the official authorization link shown by Tailscale, then run Connect Network again.' }
}
if ($ShowPairing -or $ConnectNetwork) {
    $taskPairingPath = Join-Path $taskData 'device-pairing.txt'
    $taskSecret = (Get-Content -LiteralPath (Join-Path $taskData 'pairing-key.txt') -Raw -Encoding UTF8).Trim()
    $taskLines = @('ResearchMind personal device sync', '', 'Windows local URL: http://127.0.0.1:4180', 'Remote URL: ' + $(if ($taskNetworkUrl) { $taskNetworkUrl } else { 'Sign in to Tailscale, then run Connect Network.' }), '', 'Pairing key (keep private):', $taskSecret, '', 'Use the same remote URL and pairing key on your Mac and Android browser. Keep automatic synchronization enabled.')
    $taskLines | Set-Content -LiteralPath $taskPairingPath -Encoding UTF8
    Start-Process -FilePath notepad.exe -ArgumentList ('"' + $taskPairingPath + '"')
}
if ($PairLocal) {
    $taskWebConfig = Get-Content -LiteralPath (Join-Path $taskProgramRoot 'web-config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    & (Join-Path $taskProgramRoot 'launch-web.ps1') -ServerOnly
    $taskSecret = (Get-Content -LiteralPath (Join-Path $taskData 'pairing-key.txt') -Raw -Encoding UTF8).Trim()
    $taskPairUrl = $taskWebConfig.origin + '/library#researchmind-pair=' + $taskSecret
    Start-Process -FilePath $taskWebConfig.browser -ArgumentList @('--user-data-dir="' + $taskWebConfig.profile + '"', '--app=' + $taskPairUrl, '--no-first-run', '--no-default-browser-check')
}
Write-Output 'Personal sync host is ready on 127.0.0.1:4180. Original browser data was not changed.'
