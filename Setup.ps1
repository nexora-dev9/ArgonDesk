#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node.exe -ErrorAction Stop
$nodeVersion = [version]((& $nodeCommand.Source --version) -replace '^v', '')
if ($nodeVersion -lt [version]'22.13.0') { throw 'Install Node.js 22.13 or newer from https://nodejs.org/ first.' }
Push-Location $PSScriptRoot
try {
    & npm.cmd ci --ignore-scripts --no-audit --no-fund --cache (Join-Path $PSScriptRoot '.local\npm-cache')
    if ($LASTEXITCODE) { throw 'Dependency installation failed.' }
    & (Join-Path $PSScriptRoot 'Install-Tunnel.ps1')
    Write-Output 'Setup complete. Open Start-ArgonDesk.cmd.'
} finally { Pop-Location }
