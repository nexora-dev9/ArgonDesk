#requires -Version 5.1
param([switch]$ToolsOnly)
$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw '需要 Windows 自带的 .NET Framework 4.x C# 编译器。' }
$sourcePath = Join-Path $PSScriptRoot 'native\ArgonDesk.cs'
$iconPath = Join-Path $PSScriptRoot 'app-icon.ico'
& $compiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.Web.Extensions.dll ('/out:' + (Join-Path $PSScriptRoot 'ArgonDesk.WorkspaceHost.exe')) (Join-Path $PSScriptRoot 'native\WorkspaceHost.cs')
if ($LASTEXITCODE) { throw '工作区命令与回收站助手编译失败。' }
if ($ToolsOnly) { Write-Output 'ArgonDesk.WorkspaceHost.exe 已生成。'; return }
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll ('/win32icon:' + $iconPath) ('/out:' + (Join-Path $PSScriptRoot 'ArgonDesk.exe')) $sourcePath
if ($LASTEXITCODE) { throw '桌面入口编译失败。' }
Write-Output 'ArgonDesk.exe 已生成。'
