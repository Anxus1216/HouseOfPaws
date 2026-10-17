param(
  [string]$Source = (Join-Path $PSScriptRoot '..\assets\pets\selected'),
  [string]$Destination = (Join-Path $PSScriptRoot '..\assets\pets\sprites')
)

$ErrorActionPreference = 'Stop'

$drawingAssemblies = if ($PSVersionTable.PSEdition -eq 'Core') {
  @('System.Drawing.Common', 'System.Drawing.Primitives',
    'System.Private.Windows.GdiPlus', 'System.Private.Windows.Core')
} else { @('System.Drawing') }
Add-Type -ReferencedAssemblies $drawingAssemblies -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public static class GouacheSpritePackager {
  public static Rectangle VisibleBounds(Bitmap image) {
    int left = image.Width, top = image.Height, right = -1, bottom = -1;
    for (int y = 0; y < image.Height; y++) {
      for (int x = 0; x < image.Width; x++) {
        if (image.GetPixel(x, y).A < 8) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    if (right < left) throw new InvalidOperationException("Source image is fully transparent");
    left = Math.Max(0, left - 2);
    top = Math.Max(0, top - 2);
    right = Math.Min(image.Width - 1, right + 2);
    bottom = Math.Min(image.Height - 1, bottom + 2);
    return Rectangle.FromLTRB(left, top, right + 1, bottom + 1);
  }

  public static string Pack(string source, string destination) {
    using (var image = new Bitmap(source)) {
      var bounds = VisibleBounds(image);
      const int canvasSize = 320;
      const int occupiedSize = 280; // 20 px transparent margin on each side.
      double scale = Math.Min((double)occupiedSize / bounds.Width, (double)occupiedSize / bounds.Height);
      int width = (int)Math.Round(bounds.Width * scale);
      int height = (int)Math.Round(bounds.Height * scale);
      int x = (canvasSize - width) / 2;
      int y = (canvasSize - height) / 2;
      using (var canvas = new Bitmap(canvasSize, canvasSize, PixelFormat.Format32bppArgb)) {
        using (var graphics = Graphics.FromImage(canvas)) {
          graphics.Clear(Color.Transparent);
          graphics.CompositingMode = CompositingMode.SourceCopy;
          graphics.CompositingQuality = CompositingQuality.HighQuality;
          graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
          graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
          graphics.DrawImage(image, new Rectangle(x, y, width, height), bounds, GraphicsUnit.Pixel);
        }
        canvas.Save(destination, ImageFormat.Png);
      }
      return String.Format("{0}x{1} -> {2}x{3} at {4},{5}", bounds.Width, bounds.Height, width, height, x, y);
    }
  }
}
'@

New-Item -ItemType Directory -Path $Destination -Force | Out-Null
$pets = @('cat', 'rabbit', 'dog')
$states = @('normal', 'happy', 'sleepy', 'need', 'feed', 'wash', 'play', 'rest')
foreach ($pet in $pets) {
  foreach ($state in $states) {
    $name = "pet_${pet}_${state}.png"
    $inputFile = Join-Path $Source $name
    $outputFile = Join-Path $Destination $name
    if (-not (Test-Path -LiteralPath $inputFile -PathType Leaf)) {
      throw "Missing source: $inputFile"
    }
    $layout = [GouacheSpritePackager]::Pack($inputFile, $outputFile)
    $sizeKb = [math]::Round((Get-Item -LiteralPath $outputFile).Length / 1KB)
    Write-Output "$name $layout ${sizeKb}KB"
  }
}
