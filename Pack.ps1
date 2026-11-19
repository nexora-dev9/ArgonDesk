#requires -Version 5.1
param([string]$OutputDirectory = (Join-Path $PSScriptRoot 'dist'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$files = @('.gitignore','.gitattributes','LICENSE','llms.txt','index.html','app.js','i18n.js','style.css','app-icon.svg','app-icon.ico','app-icon-512.png','privacy.html','terms.html','help.html','package.json','package-lock.json','server.mjs','workspace-files.mjs','file-reader.mjs','document-worker.mjs','tunnel.mjs','oauth.mjs','Launch.ps1','Setup.ps1','Install-Tunnel.ps1','Build.ps1','Pack.ps1','pick-folder.ps1','secret.ps1','Start-ArgonDesk.cmd','打开Gemini工作台.cmd','安装依赖.cmd','README.md','README.zh-CN.md','使用说明.md','QUICKSTART.en.md','THIRD_PARTY_NOTICES.md','SECURITY.md','CONTRIBUTING.md','CONTRIBUTING.zh-CN.md','CHANGELOG.md')
foreach ($folder in @('native','tests','licenses','docs','.github')) {
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot $folder) -File -Recurse) { $files += $file.FullName.Substring($PSScriptRoot.Length + 1) }
}
function Write-Package([string]$Destination, [string]$Prefix, [string[]]$Entries) {
    $stream = [IO.File]::Open($Destination, [IO.FileMode]::Create)
    $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        foreach ($relative in $Entries) {
            $source = Join-Path $PSScriptRoot $relative
            if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw ('Missing release file: ' + $relative) }
            $entryName = $Prefix + '/' + $relative.Replace('\','/')
            $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $source, $entryName, [IO.Compression.CompressionLevel]::Optimal)
        }
    } finally { $archive.Dispose(); $stream.Dispose() }
}
$files += @('workspace-agent.mjs','workspace-search-worker.mjs')
$sourcePath = Join-Path $OutputDirectory ('ArgonDesk-' + $version + '-Source.zip')
Write-Package $sourcePath 'ArgonDesk-Source' $files
$portableFiles = $files + @('ArgonDesk.exe','ArgonDesk.WorkspaceHost.exe','.local\bin\node.exe')
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'node_modules') -File -Recurse -Force) { $portableFiles += $file.FullName.Substring($PSScriptRoot.Length + 1) }
$portablePath = Join-Path $OutputDirectory ('ArgonDesk-' + $version + '-Windows-x64.zip')
Write-Package $portablePath 'ArgonDesk' $portableFiles
$markers = @()
$configPath = Join-Path $PSScriptRoot '.local\state\config.json'
if (Test-Path -LiteralPath $configPath) {
    try { $private = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($configPath, [Text.Encoding]::UTF8)) -ErrorAction Stop }
    catch { throw 'Cannot parse private runtime configuration. Release validation stopped.' }
    $markers = @($private.key, $private.publicBase, $private.root) | Where-Object { $_ -and $_.Length -gt 8 }
}
$packages = @()
foreach ($artifact in @($sourcePath,$portablePath)) {
    $archive = [IO.Compression.ZipFile]::OpenRead($artifact)
    try {
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName -match '/\.local/(?!bin/node\.exe$)' -or $entry.FullName -match '\.(encrypted|log)$' -or $entry.FullName -match '/(config|running|history)\.json$' -or $entry.FullName -match '/ngrok\.exe$') { throw 'Private runtime data or an unbundled client found in package.' }
            if ($entry.FullName -match '\.(md|html|css|js|mjs|json|ps1|cs|cmd|gitignore|gitattributes|yml|yaml|txt|svg)$' -or $entry.FullName -match '/LICENSE$') {
                $reader = [IO.StreamReader]::new($entry.Open())
                try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
                foreach ($marker in $markers) { if ($text.Contains($marker)) { throw ('Private marker found in release entry: ' + $entry.FullName) } }
            }
        }
        $hashStream = [IO.File]::OpenRead($artifact)
        $algorithm = [Security.Cryptography.SHA256]::Create()
        try { $digest = [BitConverter]::ToString($algorithm.ComputeHash($hashStream)).Replace('-','') }
        finally { $algorithm.Dispose(); $hashStream.Dispose() }
        $packages += [ordered]@{file=[IO.Path]::GetFileName($artifact);bytes=(Get-Item -LiteralPath $artifact).Length;sha256=$digest;entries=$archive.Entries.Count;privateRuntimeExcluded=$true;privateMarkersAbsent=$true}
    } finally { $archive.Dispose() }
}
$report = [ordered]@{checkedAt=[DateTime]::UtcNow.ToString('o');version=$version;passed=$true;packages=$packages}
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDirectory '发布包校验.json') -Encoding utf8
$report | ConvertTo-Json -Depth 5 -Compress
