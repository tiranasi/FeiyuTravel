# Converts the user's chibi three-view sheet into single-channel green intensity sprites for the monochrome display.
import sys, json, numpy as np
from PIL import Image, ImageDraw, ImageFilter
SRC='../output/references/dafeiyu-20261112/character-standard.png'
sheet=Image.open(SRC).convert('RGB')
CROPS={
 'front':(92,18,513,599),'side':(583,18,997,599),'back':(1022,18,1484,599),
 'smug':(12,607,398,996),'pout':(398,607,777,996),'wow':(780,607,1159,996),'think':(1163,607,1533,996),
}
def bgmask(rgb):
  a=np.asarray(rgb).astype(np.int16)
  white=(a.min(axis=2)>=232)&((a.max(axis=2)-a.min(axis=2))<18)
  m=Image.fromarray((white*255).astype(np.uint8)).copy()
  W,H=m.size
  for x in range(0,W,3):
    for y in (0,H-1):
      if m.getpixel((x,y))==255: ImageDraw.floodfill(m,(x,y),128)
  for y in range(0,H,3):
    for x in (0,W-1):
      if m.getpixel((x,y))==255: ImageDraw.floodfill(m,(x,y),128)
  return np.asarray(m)==128
def convert(name,box,height,pad=4,fade=0):
  c=sheet.crop(box)
  bg=bgmask(c)
  fg=~bg
  ys,xs=np.where(fg)
  y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
  c=c.crop((x0,y0,x1,y1)); fg=fg[y0:y1,x0:x1]
  scale=height/c.size[1]
  w=max(1,round(c.size[0]*scale))
  W2,H2=w*2,height*2
  big=c.resize((W2,H2),Image.LANCZOS)
  mask=Image.fromarray((fg*255).astype(np.uint8)).resize((W2,H2),Image.LANCZOS)
  a=np.asarray(big).astype(np.float32)/255
  L=0.30*a[...,0]+0.55*a[...,1]+0.15*a[...,2]
  m=np.asarray(mask).astype(np.float32)/255
  Ls=np.asarray(Image.fromarray((L*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32)/255
  gx=np.zeros_like(Ls);gy=np.zeros_like(Ls)
  gx[:,1:-1]=Ls[:,2:]-Ls[:,:-2]; gy[1:-1]=Ls[2:]-Ls[:-2]
  edge=np.sqrt(gx*gx+gy*gy)
  ms=np.asarray(mask.filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32)/255
  sx=np.zeros_like(ms);sy=np.zeros_like(ms)
  sx[:,1:-1]=ms[:,2:]-ms[:,:-2]; sy[1:-1]=ms[2:]-ms[:-2]
  sil=np.clip(np.sqrt(sx*sx+sy*sy)*2.2,0,1)
  dark=np.clip((0.42-L)/0.42,0,1)  # dark ink lines inside the art
  fill=0.05+0.58*L**2.0
  inten=np.clip(fill+1.9*edge+0.35*dark*(edge>0.06),0,1)
  inten=np.maximum(inten*m,sil)
  out=Image.fromarray((inten*255).astype(np.uint8)).resize((w,height),Image.LANCZOS)
  g=np.asarray(out).astype(np.float32)
  if fade:
    n=int(height*fade);ramp=np.linspace(1,0,n)**1.5
    g[height-n:]*=ramp[:,None]
  g=g.astype(np.uint8)
  g=np.pad(g,pad)
  return g

def holo(height):
  im=Image.open('web/assets/art/hologram/line-tail-simple-v3.png').convert('RGBA')
  im=im.crop(im.getbbox())
  w=round(im.width*height/im.height)
  im=im.resize((w,height),Image.LANCZOS)
  a=np.asarray(im).astype(np.float32)
  g=a[...,3]*(a[...,:3].max(axis=2)/255)
  return np.pad(np.clip(g,0,255).astype(np.uint8),2)
SPEC={'front':(126,0),'side':(126,0),'back':(126,0),'smug':(196,.22),'pout':(196,.22),'wow':(196,.22),'think':(196,.22)}
def main():
  import base64
  res={}
  for name,(h,fade) in SPEC.items(): res[name]=convert(name,CROPS[name],h,fade=fade)
  res['holo']=holo(276)
  lines=['// 由 tools-art/convert.py 生成：用户提供的Q版三视图与已确认的全息线稿，单通道亮度（0–255），运行时展开为绿色RGBA。','export const SPRITES={']
  total=0
  for name,g in res.items():
    hgt,wid=g.shape;total+=g.size
    Image.fromarray(g).save(f'build/art/{name}.png')
    lines.append(f'  {name}:{{w:{wid},h:{hgt},d:"{base64.b64encode(g.tobytes()).decode()}"}},')
    print(name,wid,hgt)
  lines.append('};')
  open('lib/sprite-data.js','w',encoding='utf8').write('\n'.join(lines)+'\n')
  print('bytes',total)
if __name__=="__main__": main()
