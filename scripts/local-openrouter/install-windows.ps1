param([switch]$EnableStartup, [switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$taskDesktop = Join-Path $taskRoot '.context/desktop'
New-Item -ItemType Directory -Path $taskDesktop -Force | Out-Null
$taskCompiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!(Test-Path -LiteralPath $taskCompiler)) { throw 'The Windows .NET Framework C# compiler is required.' }

$taskBrowserCandidates = @(
    (Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google/Chrome/Application/chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google/Chrome/Application/chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft/Edge/Application/msedge.exe')
)
$taskBrowser = $taskBrowserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (!$taskBrowser) { throw 'Install Chrome or Microsoft Edge before installing the launcher.' }

$taskSuffix = if ($ValidateOnly) { '.validation' } else { '' }
$taskIcon = Join-Path $taskDesktop "Inbox Zero$taskSuffix.ico"
$taskExe = Join-Path $taskDesktop "Inbox Zero$taskSuffix.exe"
Add-Type -AssemblyName System.Drawing
$taskSource = [Drawing.Image]::FromFile((Join-Path $taskRoot 'apps/web/public/icons/icon-192x192.png'))
$taskBitmap = New-Object Drawing.Bitmap($taskSource, 256, 256)
$taskPng = New-Object IO.MemoryStream
try {
    $taskBitmap.Save($taskPng, [Drawing.Imaging.ImageFormat]::Png)
    $taskBytes = $taskPng.ToArray()
    $taskStream = [IO.File]::Create($taskIcon)
    $taskWriter = New-Object IO.BinaryWriter($taskStream)
    try {
        $taskWriter.Write([uint16]0); $taskWriter.Write([uint16]1); $taskWriter.Write([uint16]1)
        $taskWriter.Write([byte]0); $taskWriter.Write([byte]0); $taskWriter.Write([byte]0); $taskWriter.Write([byte]0)
        $taskWriter.Write([uint16]1); $taskWriter.Write([uint16]32)
        $taskWriter.Write([uint32]$taskBytes.Length); $taskWriter.Write([uint32]22)
        $taskWriter.Write($taskBytes)
    } finally { $taskWriter.Dispose(); $taskStream.Dispose() }
} finally { $taskPng.Dispose(); $taskBitmap.Dispose(); $taskSource.Dispose() }

& $taskCompiler /nologo /target:winexe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/win32icon:$taskIcon" "/out:$taskExe" (Join-Path $PSScriptRoot 'InboxZeroLauncher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed.' }
if ($ValidateOnly) { Write-Output 'Windows launcher and icon validation passed; configuration and shortcuts were not changed.'; return }

$taskConfigPath = Join-Path $taskDesktop 'launcher.json'
if (!(Test-Path -LiteralPath $taskConfigPath)) {
    $taskConfig = @{
        root = $taskRoot
        browser = $taskBrowser
        arguments = '--app="http://localhost:3000/mail?accountScope=all&split=all"'
        appUserModelId = 'OpenInboxZero.Local'
    } | ConvertTo-Json
    [IO.File]::WriteAllText($taskConfigPath, $taskConfig)
}

$taskShell = New-Object -ComObject WScript.Shell
foreach ($taskFolder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $taskShortcut = $taskShell.CreateShortcut((Join-Path $taskFolder 'Open Inbox Zero.lnk'))
    $taskShortcut.TargetPath = $taskExe
    $taskShortcut.WorkingDirectory = $taskRoot
    $taskShortcut.IconLocation = $taskIcon
    $taskShortcut.Save()
}
if ($EnableStartup) {
    $taskShortcut = $taskShell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'Open Inbox Zero Background.lnk'))
    $taskShortcut.TargetPath = $taskExe
    $taskShortcut.Arguments = '--services-only'
    $taskShortcut.WorkingDirectory = $taskRoot
    $taskShortcut.IconLocation = $taskIcon
    $taskShortcut.WindowStyle = 7
    $taskShortcut.Save()
}
Write-Output 'Open Inbox Zero shortcuts installed. Pin the Start-menu shortcut to the taskbar if desired.'
