$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ico = Join-Path $root "branding\kanjidesk.ico"
if (-not (Test-Path $ico)) { $ico = Join-Path $root "public\favicon.ico" }
$bat = Join-Path $root "start.bat"
$desktop = [Environment]::GetFolderPath("Desktop")
$programs = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
New-Item -ItemType Directory -Force -Path $programs | Out-Null

$shell = New-Object -ComObject WScript.Shell
foreach ($dir in @($desktop, $programs)) {
  $lnk = Join-Path $dir "KanjiDesk.lnk"
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath = $bat
  $s.WorkingDirectory = $root
  $s.WindowStyle = 1
  $s.Description = "KanjiDesk — пропись кандзи на ПК"
  if (Test-Path $ico) { $s.IconLocation = "$ico,0" }
  $s.Save()
  Write-Output $lnk
}
