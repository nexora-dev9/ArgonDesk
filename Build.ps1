#requires -Version 5.1
param([switch]$ToolsOnly)
$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework 4.x C# compiler is required.' }
$sourcePath = Join-Path $PSScriptRoot 'native\WebAgy.cs'
$iconPath = Join-Path $PSScriptRoot 'app-icon.ico'
& $compiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.Web.Extensions.dll ('/out:' + (Join-Path $PSScriptRoot 'WebAgy.WorkspaceHost.exe')) (Join-Path $PSScriptRoot 'native\WorkspaceHost.cs')
if ($LASTEXITCODE) { throw 'Could not build the workspace helper.' }
if ($ToolsOnly) { Write-Output 'Built WebAgy.WorkspaceHost.exe.'; return }
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll ('/win32icon:' + $iconPath) ('/out:' + (Join-Path $PSScriptRoot 'WebAgy.exe')) $sourcePath
if ($LASTEXITCODE) { throw 'Could not build the desktop launcher.' }
Write-Output 'Built WebAgy.exe.'
