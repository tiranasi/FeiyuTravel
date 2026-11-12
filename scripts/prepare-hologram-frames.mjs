// The approved illustration stays fixed outside the eye masks. The generated
// inbetweens supply only the eyes; tiny continuous warps add breath and tail sway.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=path.join(root,'web/assets/art/hologram');
const evidence=path.join(root,'build/hologram-evidence');await fs.mkdir(evidence,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4173/web/hologram.html');
 const result=await page.evaluate(async()=>{
  const SIZE=512,DURATIONS=[1050,380,85,100,85,280,380,680];
  const surface=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const smooth=(v,a,b)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
  async function load(name,cleanup=false){
   const img=new Image();img.src='/web/assets/art/hologram/'+name;await img.decode();
   const c=surface(1254,1254),x=c.getContext('2d');x.drawImage(img,0,0,1254,1254);
   if(cleanup){const d=x.getImageData(0,0,1254,1254);for(let i=0;i<d.data.length;i+=4){const a=smooth(d.data[i+3]/255,.43,.88);d.data[i]=64;d.data[i+1]=255;d.data[i+2]=144;d.data[i+3]=a<.1?0:Math.round(a*255);}x.putImageData(d,0,0);}
   return c;
  }
  const [base,half,closed]=await Promise.all([load('line-tail-simple-v3.png'),load('blink-half-source.png',true),load('blink-closed-source.png',true)]);
  const mask=surface(1254,1254),m=mask.getContext('2d');m.fillStyle='#fff';
  // Local masks include eyelids and irises, leaving eyebrows, nose and mouth locked.
  const polygons=[[[594,467],[617,448],[665,436],[709,440],[751,456],[771,487],[753,525],[710,541],[666,544],[624,529],[602,508]],[[815,455],[844,429],[884,421],[925,428],[960,447],[976,474],[952,510],[909,524],[865,515],[833,495]]];
  for(const points of polygons){m.beginPath();points.forEach(([x,y],i)=>i?m.lineTo(x,y):m.moveTo(x,y));m.closePath();m.fill();}
  const feather=surface(1254,1254),fctx=feather.getContext('2d');fctx.filter='blur(2px)';fctx.drawImage(mask,0,0);
  function pose(eyes){
   if(eyes===base)return base;
   const p=surface(1254,1254),x=p.getContext('2d');x.drawImage(base,0,0);x.globalCompositeOperation='destination-out';x.drawImage(feather,0,0);x.globalCompositeOperation='source-over';
   const patch=surface(1254,1254),pc=patch.getContext('2d');pc.drawImage(eyes,0,0);pc.globalCompositeOperation='destination-in';pc.drawImage(feather,0,0);x.drawImage(patch,0,0);return p;
  }
  const poses=[base,pose(half),pose(closed)];
  const face=surface(1050,340),fx=face.getContext('2d');fx.fillStyle='#000';fx.fillRect(0,0,face.width,face.height);
  poses.forEach((p,i)=>fx.drawImage(p,570,380,440,320,i*350,0,350,255));
  fx.fillStyle='#40ff90';fx.font='18px sans-serif';['OPEN','HALF','CLOSED'].forEach((v,i)=>fx.fillText(v,i*350+14,295));
  const atlas=surface(SIZE*4,SIZE*2),ax=atlas.getContext('2d');
  const states=[0,0,1,2,1,0,0,0],frames=[],sizes=[];
  for(let frame=0;frame<8;frame++){
   const theta=frame/8*Math.PI*2,s=Math.sin(theta),c=Math.cos(theta),source=surface(SIZE,SIZE),sx=source.getContext('2d');
   sx.imageSmoothingQuality='high';sx.drawImage(poses[states[frame]],10,10,SIZE-20,SIZE-20);
   const from=sx.getImageData(0,0,SIZE,SIZE).data,out=sx.createImageData(SIZE,SIZE),d=out.data;
   for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const xx=(x-10)/492*1254,yy=(y-10)/492*1254;
    const tail=(1-smooth(xx,340,460))*smooth(yy,400,450)*(1-smooth(yy,770,855));
    const px=x-2.8*s*tail-(y-500)*.00085*c;
    const py=(y-500)/(1+.0018*s)+500-.48*s+.7*s*tail;
    const x0=Math.floor(px),y0=Math.floor(py),dx=px-x0,dy=py-y0;
    let a=0;for(let iy=0;iy<2;iy++)for(let ix=0;ix<2;ix++){
     const tx=x0+ix,ty=y0+iy;if(tx>=0&&tx<SIZE&&ty>=0&&ty<SIZE)a+=from[(ty*SIZE+tx)*4+3]*(ix?dx:1-dx)*(iy?dy:1-dy);
    }
    const i=(y*SIZE+x)*4;d[i]=64;d[i+1]=255;d[i+2]=144;d[i+3]=Math.round(a);
   }
   sx.clearRect(0,0,SIZE,SIZE);sx.putImageData(out,0,0);ax.drawImage(source,frame%4*SIZE,Math.floor(frame/4)*SIZE);
   let visible=0;for(let i=3;i<d.length;i+=4)if(d[i])visible++;sizes.push(visible);frames.push(source.toDataURL('image/png'));
  }
  const contact=surface(1024,560),cx=contact.getContext('2d');cx.fillStyle='#000';cx.fillRect(0,0,1024,560);cx.fillStyle='#40ff90';cx.font='14px sans-serif';
  for(let i=0;i<8;i++){cx.drawImage(atlas,i%4*SIZE,Math.floor(i/4)*SIZE,SIZE,SIZE,i%4*256,Math.floor(i/4)*280,256,256);cx.fillText(`${i+1} / ${['open','open','half','closed','half','open','open','open'][i]} / ${DURATIONS[i]} ms`,i%4*256+12,Math.floor(i/4)*280+275);}
  return {frames,atlas:atlas.toDataURL('image/png'),face:face.toDataURL('image/png'),contact:contact.toDataURL('image/png'),size:SIZE,durations:DURATIONS,states,visible:sizes};
 });
 const save=async(file,url)=>fs.writeFile(file,Buffer.from(url.split(',')[1],'base64'));
 for(let i=0;i<8;i++)await save(path.join(dir,'idle-v3-'+String(i).padStart(2,'0')+'.png'),result.frames[i]);
 await save(path.join(dir,'idle-v3-8.png'),result.atlas);await save(path.join(evidence,'eyes-review-v3.png'),result.face);await save(path.join(evidence,'idle-contact-v3.png'),result.contact);
 const metadata={frames:8,width:result.size,height:result.size,columns:4,durations:result.durations,cycleMs:result.durations.reduce((a,b)=>a+b),eyeStates:result.states,visiblePixels:result.visible,decodedRgbaBytes:result.size*result.size*8*4};
 await fs.writeFile(path.join(dir,'idle-v3-metadata.json'),JSON.stringify(metadata,null,2)+'\n');console.log(JSON.stringify(metadata));
}finally{await browser.close();}
