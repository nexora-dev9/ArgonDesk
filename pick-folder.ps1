param([string]$InitialPath, [ValidateSet('zh-CN','en')][string]$Language = 'en')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$picker = [System.Windows.Forms.FolderBrowserDialog]::new()
$picker.Description = if ($Language -eq 'en') { 'Choose the folder Gemini can access. Changing folders pauses file access.' } else { '选择 Gemini 可以读取或编辑的文件夹；切换后会自动暂停' }
if ($picker.PSObject.Properties.Name -contains 'UseDescriptionForTitle') { $picker.UseDescriptionForTitle = $true }
$picker.SelectedPath = $InitialPath
$owner = [System.Windows.Forms.Form]::new()
$owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$owner.Size = [Drawing.Size]::new(1, 1)
$owner.ShowInTaskbar = $false
$owner.Opacity = 0
$owner.TopMost = $true
$owner.Show()
$owner.Activate()
try {
    if ($picker.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
        @{ path = $picker.SelectedPath } | ConvertTo-Json -Compress
    } else { '{}' }
} finally { $picker.Dispose(); $owner.Close(); $owner.Dispose() }
