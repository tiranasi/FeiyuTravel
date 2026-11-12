param(
  [string]$ImageRoot = 'C:\Users\28762\.codex\generated_images\01a1c4cc-75c6-7a30-a5fd-18be0ff86e1e'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$project = Split-Path $PSScriptRoot -Parent
$assetDir = Join-Path $project 'assets'
New-Item -ItemType Directory -Path $assetDir -Force | Out-Null
$sources = @(
  @{ id='a'; name='首版造型'; file='exec-bdb6440f-03c5-4682-a9e3-a31028b9e111.png' },
  @{ id='b'; name='现有填色'; file='exec-160227e0-aa9b-42bb-9b51-0c8795fbde93.png' }
)
$manifest = @()
foreach ($source in $sources) {
  $sourcePath = Join-Path $ImageRoot $source.file
  $bitmap = [System.Drawing.Bitmap]::new($sourcePath)
  try {
    if ($bitmap.Width -ne 1536 -or $bitmap.Height -ne 1024) { throw 'Unexpected sprite sheet dimensions' }
    for ($i=0; $i -lt 8; $i++) {
      $rect = [System.Drawing.Rectangle]::new(($i % 4)*384, [Math]::Floor($i/4)*512, 384, 512)
      $frame = $bitmap.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      try { $frame.Save((Join-Path $assetDir ($source.id+'-'+$i+'.png')), [System.Drawing.Imaging.ImageFormat]::Png) }
      finally { $frame.Dispose() }
    }
    $manifest += [pscustomobject]@{
      id=$source.id; name=$source.name; source=$source.file; width=384; height=512; frames=8
      treatment='Original pixels and alpha, only split into 4x2 cells; no brightness, fill, outline or color changes.'
    }
  } finally { $bitmap.Dispose() }
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $assetDir 'sources.json') -Encoding utf8
Write-Output 'Prepared 16 original RGBA frames from the two user-selected sheets.'
