$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $root "build"
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
$iconPng = Join-Path $iconDir "icon.png"
$iconIco = Join-Path $iconDir "icon.ico"

Add-Type -AssemblyName System.Drawing
function New-IconBitmap([int]$size) {
  $bmp = New-Object Drawing.Bitmap $size, $size
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([Drawing.Color]::FromArgb(255, 16, 14, 22))
  $pad = [int]($size * 0.18)
  $brush = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(255, 255, 93, 143))
  $g.FillEllipse($brush, $pad, $pad, $size - 2 * $pad, $size - 2 * $pad)
  $g.Dispose(); $brush.Dispose()
  return $bmp
}
if (-not (Test-Path -LiteralPath $iconPng)) {
  (New-IconBitmap 256).Save($iconPng, [Drawing.Imaging.ImageFormat]::Png)
}
if (-not (Test-Path -LiteralPath $iconIco)) {
  $png = [Drawing.Image]::FromFile($iconPng)
  $bmp = New-Object Drawing.Bitmap $png, 32, 32
  $handle = $bmp.GetHicon()
  $icon = [Drawing.Icon]::FromHandle($handle)
  $fs = [IO.File]::Open($iconIco, [IO.FileMode]::Create)
  $icon.Save($fs)
  $fs.Close()
  $png.Dispose(); $bmp.Dispose()
}

$py = (& py -3 -c "import sys; print(sys.executable)").Trim()
if (-not $py) { throw "Не найден Python (py -3)." }
$pythonw = Join-Path (Split-Path $py) "pythonw.exe"
if (-not (Test-Path -LiteralPath $pythonw)) {
  $pythonw = $py
}

$programs = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
New-Item -ItemType Directory -Force -Path $programs | Out-Null
$lnkPath = Join-Path $programs "KanjyMemo.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $pythonw
$shortcut.Arguments = "-m app"
$shortcut.WorkingDirectory = $root
$shortcut.WindowStyle = 1
$shortcut.Description = "KanjyMemo — разбор кандзи"
$shortcut.IconLocation = "$iconIco,0"
$shortcut.Save()

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class KanjyShellNotify {
  [DllImport("shell32.dll")] public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
[KanjyShellNotify]::SHChangeNotify(0x8000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Output "pythonw=$pythonw"
Write-Output "shortcut=$lnkPath"
