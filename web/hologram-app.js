import {createHologramImageRenderer,INTRO_DURATION,IDLE_DURATION,FRAME_DURATIONS,FRAME_SIZE,idleFrameAt} from '../lib/hologram-image.js';
const $=id=>document.getElementById(id),canvas=$('hologram'),ratio=2;
function surface(w,h){const c=document.createElement('canvas');c.width=w*ratio;c.height=h*ratio;const context=c.getContext('2d');context.setTransform(ratio,0,0,ratio,0,0);return {canvas:c,context,ratio};}
canvas.width=480*ratio;canvas.height=320*ratio;const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);
const options={mode:'idle',brightness:1,glow:.28,distortion:true},reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer=null,time=0,playing=false,request=null,anchor=performance.now(),anchorTime=0,lastPaint=-Infinity,resumeOnShow=false;
const duration=()=>options.mode==='idle'?IDLE_DURATION:INTRO_DURATION;
function draw(){if(!renderer)return;const phase=renderer.render(ctx,time,options);$('seek').value=String(Math.round(time));$('time').textContent=(time/1000).toFixed(1)+' / '+(duration()/1000).toFixed(1)+' 秒';$('phase').textContent=phase.label;$('frame-index').textContent=(phase.frame+1)+' / 8 帧';$('play').textContent=playing?'暂停':time>=duration()?'播放':'继续';canvas.dataset.phase=phase.key;canvas.dataset.frame=String(phase.frame);canvas.dataset.time=String(Math.round(time));canvas.dataset.playing=String(playing);canvas.dataset.mode=options.mode;for(const button of $('frames').children)button.setAttribute('aria-pressed',String(Number(button.dataset.frame)===phase.frame));}
function stop(){if(request!==null)cancelAnimationFrame(request);request=null;}
function schedule(){if(!playing||document.hidden||request!==null)return;request=requestAnimationFrame(step);}
function step(now){request=null;if(!playing||document.hidden)return;const elapsed=anchorTime+now-anchor;time=Math.min(duration(),elapsed);if(now-lastPaint>=24||time>=duration()){lastPaint=now;draw();}if(time>=duration()){if($('loop').checked){time=elapsed%duration();anchorTime=time;anchor=now;lastPaint=-Infinity;}else{playing=false;draw();return;}}schedule();}
function play(){if(!renderer)return;if(time>=duration())time=0;anchorTime=time;anchor=performance.now();playing=true;draw();schedule();}
function pause(){if(playing)time=Math.min(duration(),anchorTime+performance.now()-anchor);playing=false;stop();draw();}
$('play').onclick=()=>playing?pause():play();$('replay').onclick=()=>{time=0;play();};
$('seek').oninput=e=>{playing=false;stop();time=Number(e.target.value);draw();};
$('glow').oninput=e=>{options.glow=Number(e.target.value)/100;draw();};$('brightness').oninput=e=>{options.brightness=Number(e.target.value)/100;draw();};$('distortion').onchange=e=>{options.distortion=e.target.checked;draw();};
for(const mode of ['idle','intro'])$('mode-'+mode).onclick=()=>{pause();time=0;options.mode=mode;$('seek').max=String(duration());$('loop').checked=mode==='idle';$('distortion').disabled=mode==='idle';for(const item of ['idle','intro'])$('mode-'+item).setAttribute('aria-pressed',String(item===mode));play();};
document.addEventListener('visibilitychange',()=>{if(document.hidden){resumeOnShow=playing;pause();}else if(resumeOnShow){resumeOnShow=false;play();}});
window.addEventListener('pagehide',()=>{playing=false;stop();});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.target.matches('input,button')){e.preventDefault();playing?pause():play();}});
async function start(){
 try{
  let image=new Image();image.src='/web/assets/art/hologram/idle-v3-8.png';await image.decode();
  if(image.naturalWidth!==FRAME_SIZE*4||image.naturalHeight!==FRAME_SIZE*2)throw Error('图集尺寸不匹配');
  const cached=document.createElement('canvas');cached.width=image.naturalWidth;cached.height=image.naturalHeight;cached.getContext('2d').drawImage(image,0,0);image=null;
  renderer=createHologramImageRenderer(surface,{canvas:cached});canvas.dataset.ready='true';canvas.dataset.cacheFrames='8';canvas.dataset.cacheBytes=String(FRAME_SIZE*FRAME_SIZE*8*4);
  let offset=0;for(let i=0;i<8;i++){
   const button=document.createElement('button'),thumb=document.createElement('canvas'),label=document.createElement('span'),frameTime=offset+1;
   thumb.width=96;thumb.height=96;thumb.getContext('2d').drawImage(cached,i%4*FRAME_SIZE,Math.floor(i/4)*FRAME_SIZE,FRAME_SIZE,FRAME_SIZE,0,0,96,96);label.textContent=String(i+1);button.type='button';button.dataset.frame=String(i);button.setAttribute('aria-label','查看第 '+(i+1)+' 帧');button.onclick=()=>{pause();if(options.mode!=='idle'){options.mode='idle';$('seek').max=String(IDLE_DURATION);$('loop').checked=true;$('distortion').disabled=true;$('mode-idle').setAttribute('aria-pressed','true');$('mode-intro').setAttribute('aria-pressed','false');}time=frameTime;draw();};button.append(thumb,label);$('frames').append(button);offset+=FRAME_DURATIONS[i];
  }
  for(const control of document.querySelectorAll('.controls button,.controls input,.modes button'))control.disabled=false;$('distortion').disabled=true;
  draw();if(!reduced)play();
 }catch(error){$('phase').textContent='素材加载失败，请刷新';canvas.dataset.error=error.message;}
}
start();
