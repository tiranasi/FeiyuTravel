$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=Join-Path (Split-Path $PSScriptRoot -Parent) 'web\assets\art'
$codec=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object {$_.MimeType -eq 'image/jpeg'}
$parameters=[System.Drawing.Imaging.EncoderParameters]::new(1)
$parameters.Param[0]=[System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality,[long]90)
foreach($id in @('home','rain','garden','harbor')){
 $source=[System.Drawing.Bitmap]::new((Join-Path $root ($id+'-v1.png')))
 $target=[System.Drawing.Bitmap]::new(1200,800)
 $graphics=[System.Drawing.Graphics]::FromImage($target)
 try{$graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;$graphics.DrawImage($source,0,0,1200,800);$target.Save((Join-Path $root ($id+'-v1.jpg')),$codec,$parameters)}finally{$graphics.Dispose();$target.Dispose();$source.Dispose()}
}
$parameters.Dispose()
Write-Output 'Optimized four original illustrations for the local game.'
