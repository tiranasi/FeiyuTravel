$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
public static class CanvasFrameExport {
  public static void Run(string root) {
    string folder=Path.Combine(root,"build","rgba");
    Directory.CreateDirectory(folder);
    foreach(string kind in new string[]{"a","b"})for(int i=0;i<8;i++) {
      using(var source=new Bitmap(Path.Combine(root,"assets",kind+"-"+i+".png")))
      using(var target=new Bitmap(180,240,PixelFormat.Format32bppArgb)) {
        using(var g=Graphics.FromImage(target)) {
          g.CompositingMode=CompositingMode.SourceCopy;
          g.InterpolationMode=InterpolationMode.HighQualityBicubic;
          g.PixelOffsetMode=PixelOffsetMode.HighQuality;
          g.DrawImage(source,new Rectangle(0,0,180,240),new Rectangle(0,0,source.Width,source.Height),GraphicsUnit.Pixel);
        }
        var rgba=new byte[180*240*4];
        for(int y=0;y<240;y++)for(int x=0;x<180;x++) {
          Color c=target.GetPixel(x,y);int p=(y*180+x)*4;
          rgba[p]=c.R;rgba[p+1]=c.G;rgba[p+2]=c.B;rgba[p+3]=c.A;
        }
        File.WriteAllBytes(Path.Combine(folder,kind+"-"+i+".rgba"),rgba);
      }
    }
  }
}
'@
$project=Split-Path $PSScriptRoot -Parent
[CanvasFrameExport]::Run($project)
node (Join-Path $PSScriptRoot 'encode-canvas.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Canvas frame encoding failed' }
