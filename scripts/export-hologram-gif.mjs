// Review export only. The HTML uses a PNG atlas cached in Canvas, not this GIF.
// A small fixed-palette GIF writer keeps the preview dependency-free.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {FRAME_DURATIONS,FRAME_SIZE} from '../lib/hologram-image.js';
const browser=await chromium.launch({channel:'msedge',headless:true});
let frames;
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4173/web/hologram.html');
 frames=await page.evaluate(async size=>{
  const img=new Image();img.src='/web/assets/art/hologram/idle-v3-8.png';await img.decode();
  const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d'),frames=[];
  for(let i=0;i<8;i++){
   x.clearRect(0,0,size,size);x.drawImage(img,i%4*size,Math.floor(i/4)*size,size,size,0,0,size,size);
   const d=x.getImageData(0,0,size,size).data,indexed=new Uint8Array(size*size);
   for(let p=0;p<indexed.length;p++)indexed[p]=Math.round(d[p*4+3]*31/255);
   let text='';for(let p=0;p<indexed.length;p+=8192)text+=String.fromCharCode(...indexed.subarray(p,p+8192));frames.push(btoa(text));
  }return frames;
 },FRAME_SIZE);
}finally{await browser.close();}
const blocks=[],bytes=(...v)=>blocks.push(Buffer.from(v)),word=n=>[n&255,n>>8&255];
blocks.push(Buffer.from('GIF89a'));bytes(...word(FRAME_SIZE),...word(FRAME_SIZE),0xf4,0,0);
for(let i=0;i<32;i++)bytes(Math.round(64*i/31),Math.round(255*i/31),Math.round(144*i/31));
bytes(0x21,0xff,11);blocks.push(Buffer.from('NETSCAPE2.0'));bytes(3,1,0,0,0);
for(let i=0;i<8;i++){
 bytes(0x21,0xf9,4,4,...word(Math.round(FRAME_DURATIONS[i]/10)),0,0);
 bytes(0x2c,0,0,0,0,...word(FRAME_SIZE),...word(FRAME_SIZE),0,5);
 const indices=Buffer.from(frames[i],'base64'),data=[];let bits=0,bitCount=0;
 const code=n=>{bits|=n<<bitCount;bitCount+=6;while(bitCount>=8){data.push(bits&255);bits>>>=8;bitCount-=8;}};
 // Reset before the dictionary grows past six-bit codes. Literal coding is
 // deliberately simple; the review file is about 1.6 MB for all eight frames.
 for(let p=0;p<indices.length;p++){if(p%24===0)code(32);code(indices[p]);}code(33);if(bitCount)data.push(bits&255);
 for(let p=0;p<data.length;p+=255){const sub=data.slice(p,p+255);bytes(sub.length,...sub);}bytes(0);
}bytes(0x3b);
const out=fileURLToPath(new URL('../build/hologram-evidence/idle-v3-preview.gif',import.meta.url));await fs.writeFile(out,Buffer.concat(blocks));console.log(out);
// Verify the exported byte stream with the browser's real GIF decoder.
const gif=Buffer.concat(blocks);let cursor=13+96,frameCount=0;
function skipBlocks(){let size;while((size=gif[cursor++])>0)cursor+=size;}
while(cursor<gif.length){
 const marker=gif[cursor++];if(marker===0x3b)break;
 if(marker===0x21){cursor++;skipBlocks();}
 else if(marker===0x2c){const packed=gif[cursor+8];cursor+=9;if(packed&128)cursor+=3*(2**((packed&7)+1));cursor++;skipBlocks();frameCount++;}
 else throw Error('Invalid GIF block');
}
if(frameCount!==8)throw Error('Expected eight GIF frames');
const verify=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await verify.newPage({viewport:{width:600,height:600}});
 await page.setContent('<body style="margin:0;background:black"><img id="gif" src="data:image/gif;base64,'+gif.toString('base64')+'"></body>');
 await page.waitForFunction(()=>document.getElementById('gif').complete&&document.getElementById('gif').naturalWidth===512);
 const first=await page.locator('#gif').screenshot();await page.waitForTimeout(1500);const blink=await page.locator('#gif').screenshot();
 if(first.equals(blink))throw Error('GIF playback did not change pixels');console.log(JSON.stringify({frames:frameCount,width:512,height:512,playbackChangesPixels:true}));
}finally{await verify.close();}
