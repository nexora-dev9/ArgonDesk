#requires -Version 5.1
param([switch]$NoWindow)
$ErrorActionPreference = 'Stop'
$stateRoot = if ($env:GEMINI_WORKSPACE_STATE) { $env:GEMINI_WORKSPACE_STATE } else { Join-Path $PSScriptRoot '.local\state' }
$runningPath = Join-Path $stateRoot 'running.json'
$address = 'http://127.0.0.1:3008'
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules\@modelcontextprotocol\sdk\package.json'))) { throw '请先双击“安装依赖.cmd”，安装本地运行依赖。' }
function Get-Health {
    $client = [Net.WebClient]::new()
    $client.Proxy = $null
    try { $client.DownloadString("$address/healthz") | ConvertFrom-Json } finally { $client.Dispose() }
}
$ready = $false
if (Test-Path -LiteralPath $runningPath) {
    $saved = Get-Content -LiteralPath $runningPath -Raw | ConvertFrom-Json
    $tracked = Get-Process -Id $saved.pid -ErrorAction SilentlyContinue
    if ($tracked -and $tracked.ProcessName -eq 'node' -and $tracked.StartTime.ToUniversalTime().Ticks.ToString() -eq $saved.ticks) {
        try {
            $health = Get-Health
            $ready = $health.app -eq 'gemini-workspace' -and $health.pid -eq $saved.pid
        } catch { }
        if (!$ready) { throw '已记录的服务尚未就绪；未启动重复进程。' }
    }
}
if (!$ready) {
    if (@(Get-NetTCPConnection -LocalPort 3008 -State Listen -ErrorAction SilentlyContinue).Count) { throw '3008 端口已被其他程序使用。' }
    $entry = Join-Path $PSScriptRoot 'server.mjs'
    $nodePath = Join-Path $PSScriptRoot '.local\bin\node.exe'
    if (!(Test-Path -LiteralPath $nodePath)) { $nodePath = (Get-Command node.exe -ErrorAction Stop).Source }
    $process = Start-Process -FilePath $nodePath -ArgumentList ('"' + $entry + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateRoot 'server.stdout.log') -RedirectStandardError (Join-Path $stateRoot 'server.stderr.log') -PassThru
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 300
        try { $health = Get-Health; if ($health.app -eq 'gemini-workspace' -and $health.pid -eq $process.Id) { $ready = $true; break } } catch { }
        $process.Refresh()
        if ($process.HasExited) { break }
    }
    if (!$ready) { $process.Refresh(); if (!$process.HasExited) { Stop-Process -Id $process.Id }; throw ('工作台未就绪。请查看 ' + (Join-Path $stateRoot 'server.stderr.log')) }
    @{ pid = $process.Id; ticks = $process.StartTime.ToUniversalTime().Ticks.ToString(); address = $address } | ConvertTo-Json | Set-Content -LiteralPath $runningPath -Encoding utf8
}
try {
    $client = [Net.WebClient]::new(); $client.Proxy = $null; $client.Encoding = [Text.Encoding]::UTF8
    $startupState = $client.DownloadString("$address/api/state") | ConvertFrom-Json
    $client.Headers['Content-Type'] = 'application/json'
    $client.Headers['X-Workspace-Csrf'] = $startupState.csrf
    $client.UploadString("$address/api/startup/restore", 'POST', '{}') | Out-Null
} catch { Write-Warning '自动恢复未完成，可在工作台中检查所选文件夹和连接设置。' }
finally { if ($client) { $client.Dispose() } }
if (!$NoWindow) {
    $edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
    if (!(Test-Path -LiteralPath $edge)) { $edge = 'C:\Program Files\Microsoft\Edge\Application\msedge.exe' }
    if (Test-Path -LiteralPath $edge) { Start-Process -FilePath $edge -ArgumentList ('--app=' + $address), '--window-size=1280,950' -WindowStyle Normal | Out-Null }
    else { Start-Process $address | Out-Null }
}
Write-Output 'Gemini 工作台已就绪。再次打开会复用正在运行的服务。'
