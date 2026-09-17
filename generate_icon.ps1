Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 512, 512
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

# Фон - красивый синий градиент
$rect = New-Object System.Drawing.Rectangle 0, 0, 512, 512
$brushBg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(59, 130, 246)), ([System.Drawing.Color]::FromArgb(29, 78, 216)), 45.0
$g.FillRectangle($brushBg, $rect)

# Золотая звезда / акцентная плашка
$brushStar = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 158, 11))
$g.FillEllipse($brushStar, 340, 40, 130, 130)

$fontSmall = New-Object System.Drawing.Font("Segoe UI", 48, [System.Drawing.FontStyle]::Bold)
$brushWhite = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$g.DrawString("★", $fontSmall, $brushWhite, 375, 65)

# Белая раскрытая книга / текст
$fontLarge = New-Object System.Drawing.Font("Segoe UI", 160, [System.Drawing.FontStyle]::Bold)
$g.DrawString("1", $fontLarge, $brushWhite, 160, 100)

$fontSub = New-Object System.Drawing.Font("Segoe UI", 42, [System.Drawing.FontStyle]::Bold)
$g.DrawString("КЛАСС", $fontSub, $brushWhite, 175, 360)

$bmp.Save("public\icons\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = New-Object System.IO.FileStream("public\icons\icon.ico", [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
$icon.Dispose()

$g.Dispose()
$bmp.Dispose()
Write-Host "icon.png and icon.ico created successfully"
