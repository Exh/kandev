param(
    [string]$ExecutablePath = (Join-Path $PSScriptRoot '..\apps\backend\bin\kandev.exe')
)

$resolvedExecutable = (Resolve-Path -LiteralPath $ExecutablePath -ErrorAction Stop).Path
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'Kandev Start.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\cmd.exe'
$shortcut.Arguments = '/k "' + $resolvedExecutable + '" start'
$shortcut.WorkingDirectory = $repositoryRoot
$shortcut.Description = 'Start Kandev from this source checkout'
$shortcut.IconLocation = "$resolvedExecutable,0"
$shortcut.WindowStyle = 1
$shortcut.Save()

Write-Output "Created desktop shortcut: $shortcutPath"
