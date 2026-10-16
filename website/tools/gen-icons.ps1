# TeleMAX Web — генератор иконок (one-time tool)
# Запуск:  powershell -ExecutionPolicy Bypass -File tools\gen-icons.ps1
# Создаёт icon-180.png (Apple), icon-192.png и icon-512.png (PWA/push) в корне сайта.

Add-Type -AssemblyName System.Drawing

function Make-Icon([int]$S, [string]$Out) {
  $bmp = New-Object System.Drawing.Bitmap([int]$S, [int]$S)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $bgColor = [System.Drawing.Color]::FromArgb(255, 10, 10, 12)
  $g.Clear($bgColor)

  [double]$pad = [double]$S * 0.075
  [float]$w = [float]([double]$S - 2.0 * $pad)
  $rect = New-Object System.Drawing.RectangleF([float]$pad, [float]$pad, $w, $w)
  $c1 = [System.Drawing.Color]::FromArgb(255, 255, 224, 130)
  $c2 = [System.Drawing.Color]::FromArgb(255, 255, 143, 0)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, [float]55.0)
  $g.FillEllipse($grad, $rect)

  [double]$k = [double]$S / 120.0
  $dark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 17, 17, 20))
  $pts = New-Object 'System.Drawing.PointF[]' 4
  $pts[0] = New-Object System.Drawing.PointF([float](30.0 * $k), [float](62.0 * $k))
  $pts[1] = New-Object System.Drawing.PointF([float](88.0 * $k), [float](34.0 * $k))
  $pts[2] = New-Object System.Drawing.PointF([float](66.0 * $k), [float](86.0 * $k))
  $pts[3] = New-Object System.Drawing.PointF([float](56.0 * $k), [float](68.0 * $k))
  $g.FillPolygon($dark, $pts)

  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 255, 255, 255))
  $fold = New-Object 'System.Drawing.PointF[]' 4
  $fold[0] = New-Object System.Drawing.PointF([float](88.0 * $k), [float](34.0 * $k))
  $fold[1] = New-Object System.Drawing.PointF([float](56.0 * $k), [float](68.0 * $k))
  $fold[2] = New-Object System.Drawing.PointF([float](52.5 * $k), [float](88.0 * $k))
  $fold[3] = New-Object System.Drawing.PointF([float](62.0 * $k), [float](70.0 * $k))
  $g.FillPolygon($white, $fold)

  $g.Dispose()
  $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "OK $Out"
}

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Make-Icon 192 (Join-Path $root 'icon-192.png')
Make-Icon 512 (Join-Path $root 'icon-512.png')
Make-Icon 180 (Join-Path $root 'icon-180.png')
