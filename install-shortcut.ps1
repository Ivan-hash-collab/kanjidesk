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
  $old = Join-Path $dir "KanjiDesk.lnk"
  if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Force }
  $lnk = Join-Path $dir "KanjiDesk (отладка).lnk"
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath = $bat
  $s.WorkingDirectory = $root
  $s.WindowStyle = 1
  $s.Description = "Отладочная сборка KanjiDesk (start.bat). Не GitHub exe."
  if (Test-Path $ico) { $s.IconLocation = "$ico,0" }
  $s.Save()
  Write-Output $lnk
}
