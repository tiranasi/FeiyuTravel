// Local cleanup of the generated line-art candidate. No drawing is synthesized here.
// Normalize the flat green ink and discard the low-alpha matte noise and tiny specks.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const variant=process.argv[2]||'line-tail-v2';
if(!/^[a-z0-9-]+$/.test(variant))throw Error('Invalid asset name');
const out=path.join(root,'web/assets/art/hologram/'+variant+'.png');
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:4173/web/hologram.html');
 const result=await page.evaluate(async variant=>{
  const image=new Image();image.src='/web/assets/art/hologram/'+variant+'-source.png';await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height),p=data.data;
  const width=canvas.width,height=canvas.height,count=width*height,mask=new Uint8Array(count);
  const smooth=(v,lo,hi)=>{const n=Math.max(0,Math.min(1,(v-lo)/(hi-lo)));return n*n*(3-2*n);};
  for(let n=0;n<count;n++){
   const i=n*4,a=p[i+3]/255;
   const stroke=smooth(a,.43,.88);
   p[i]=64;p[i+1]=255;p[i+2]=144;p[i+3]=Math.round(255*stroke);
   if(p[i+3]>24)mask[n]=1;
  }
  const seen=new Uint8Array(count),queue=new Int32Array(count);let removed=0;
  for(let n=0;n<count;n++){
   if(!mask[n]||seen[n])continue;
   let head=0,tail=1;queue[0]=n;seen[n]=1;
   while(head<tail){
    const at=queue[head++],x=at%width,y=Math.floor(at/width);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
     const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;
     const next=yy*width+xx;if(mask[next]&&!seen[next]){seen[next]=1;queue[tail++]=next;}
    }
   }
   if(tail<18)for(let k=0;k<tail;k++){p[queue[k]*4+3]=0;removed++;}
  }
  let visible=0,opaque=0;
  for(let i=3;i<p.length;i+=4){if(p[i]<25)p[i]=0;if(p[i])visible++;if(p[i]===255)opaque++;}
  ctx.putImageData(data,0,0);
  return {url:canvas.toDataURL('image/png'),width,height,visible,opaque,removed};
 },variant);
 await fs.writeFile(out,Buffer.from(result.url.split(',')[1],'base64'));
 const {url,...stats}=result;console.log(JSON.stringify({out,...stats}));
} finally {await browser.close();}
