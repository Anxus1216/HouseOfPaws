param(
  [Parameter(Mandatory = $true)][string]$Source,
  [string]$Destination = (Join-Path $PSScriptRoot '..\assets\scenes')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$scenes = [ordered]@{
  '01-home-afternoon.png' = 'scene_home_afternoon.jpg'
  '02-wash-nook.png' = 'scene_wash_nook.jpg'
  '03-play-garden.png' = 'scene_play_garden.jpg'
  '04-rest-evening.png' = 'scene_rest_evening.jpg'
  '05-star-sky.png' = 'scene_star_sky.jpg'
}
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
$quality = [System.Drawing.Imaging.EncoderParameters]::new(1)
$quality.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
  [System.Drawing.Imaging.Encoder]::Quality, [long]88)
New-Item -ItemType Directory -Path $Destination -Force | Out-Null

try {
  foreach ($entry in $scenes.GetEnumerator()) {
    $inputFile = Join-Path $Source $entry.Key
    if (-not (Test-Path -LiteralPath $inputFile -PathType Leaf)) {
      throw "Missing scene source: $inputFile"
    }
    $sourceImage = [System.Drawing.Image]::FromFile($inputFile)
    try {
      $width = [math]::Min($sourceImage.Width, 960)
      $height = [int][math]::Round($sourceImage.Height * $width / $sourceImage.Width)
      $bitmap = [System.Drawing.Bitmap]::new($width, $height)
      try {
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
          $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
          $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
          $graphics.DrawImage($sourceImage, 0, 0, $width, $height)
        } finally { $graphics.Dispose() }
        $outputFile = Join-Path $Destination $entry.Value
        $bitmap.Save($outputFile, $jpeg, $quality)
        $sizeKb = [math]::Round((Get-Item -LiteralPath $outputFile).Length / 1KB)
        Write-Output "$($entry.Value) ${width}x${height} ${sizeKb}KB"
      } finally { $bitmap.Dispose() }
    } finally { $sourceImage.Dispose() }
  }
} finally { $quality.Dispose() }
