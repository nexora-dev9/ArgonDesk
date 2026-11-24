#requires -Version 5.1
param([ValidateSet('ngrok', 'cloudflared')][string]$Provider = 'ngrok')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# A Node child can inherit module paths from a different PowerShell runtime.
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$localRoot = Join-Path $PSScriptRoot '.local'
New-Item -ItemType Directory -Path (Join-Path $localRoot 'bin') -Force | Out-Null

if ($Provider -eq 'cloudflared') {
    $binaryPath = Join-Path $localRoot 'bin\cloudflared.exe'
    function Assert-OfficialCloudflared([string]$Path) {
        $signature = Get-AuthenticodeSignature -LiteralPath $Path
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O="?Cloudflare, Inc\.') {
            throw 'cloudflared signature verification failed. The downloaded client will not be installed.'
        }
    }
    if (Test-Path -LiteralPath $binaryPath -PathType Leaf) {
        Assert-OfficialCloudflared $binaryPath
        Write-Output 'cloudflared is already installed and its signature is valid.'
        return
    }
    $tempRoot = Join-Path $localRoot ('cloudflared-install-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tempRoot | Out-Null
    try {
        Write-Output 'Downloading the official cloudflared client for this installation...'
        $downloaded = Join-Path $tempRoot 'cloudflared.exe'
        Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $downloaded -UseBasicParsing -TimeoutSec 120
        Assert-OfficialCloudflared $downloaded
        Move-Item -LiteralPath $downloaded -Destination $binaryPath
        @{source='https://github.com/cloudflare/cloudflared/releases/latest';sha256=(Get-FileHash -LiteralPath $binaryPath -Algorithm SHA256).Hash;signature='Valid';checkedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $localRoot 'cloudflared-download.json') -Encoding UTF8
        Write-Output 'cloudflared installed. No account token or network settings were changed.'
    } finally {
        $resolvedLocal = [IO.Path]::GetFullPath($localRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
        $resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
        if (!$resolvedTemp.StartsWith($resolvedLocal + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Installer cleanup path is outside its local directory.' }
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
    return
}

$binaryPath = Join-Path $localRoot 'bin\ngrok.exe'
function Assert-OfficialClient([string]$Path) {
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O="?ngrok, Inc\.') {
        throw 'ngrok signature verification failed. The downloaded client will not be installed.'
    }
}
if (Test-Path -LiteralPath $binaryPath -PathType Leaf) {
    Assert-OfficialClient $binaryPath
    Write-Output 'ngrok is already installed and its signature is valid.'
    return
}
$tempRoot = Join-Path $localRoot ('ngrok-install-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
    Write-Output 'Downloading the official ngrok client for this installation...'
    $archivePath = Join-Path $tempRoot 'download.zip'
    Invoke-WebRequest -Uri 'https://bin.ngrok.com/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip' -OutFile $archivePath -UseBasicParsing -TimeoutSec 90
    $extractRoot = Join-Path $tempRoot 'client'
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot
    $downloaded = Join-Path $extractRoot 'ngrok.exe'
    Assert-OfficialClient $downloaded
    Move-Item -LiteralPath $downloaded -Destination $binaryPath
    @{source='https://ngrok.com/download/windows';sha256=(Get-FileHash -LiteralPath $binaryPath -Algorithm SHA256).Hash;signature='Valid';checkedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $localRoot 'ngrok-download.json') -Encoding UTF8
    Write-Output 'ngrok installed. No account token or network settings were changed.'
} finally {
    $resolvedLocal = [IO.Path]::GetFullPath($localRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
    $resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
    if (!$resolvedTemp.StartsWith($resolvedLocal + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Installer cleanup path is outside its local directory.' }
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
}
