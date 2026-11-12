// Image-backed presentation core. The host decodes the atlas once and supplies
// a cached Canvas surface; this module has no DOM or image-loading dependency.
export const INTRO_DURATION=4200;
export const FRAME_SIZE=512;
export const FRAME_DURATIONS=[1050,380,85,100,85,280,380,680];
export const IDLE_DURATION=FRAME_DURATIONS.reduce((sum,t)=>sum+t,0);
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const green=a=>'rgba(64,255,144,'+clamp(a).toFixed(4)+')';
export function idleFrameAt(milliseconds){
 let time=((Number.isFinite(milliseconds)?milliseconds:0)%IDLE_DURATION+IDLE_DURATION)%IDLE_DURATION;
 for(let i=0;i<FRAME_DURATIONS.length;i++){if(time<FRAME_DURATIONS[i])return i;time-=FRAME_DURATIONS[i];}return 7;
}
export function introPhase(milliseconds){
 const t=clamp(milliseconds/INTRO_DURATION);
 return {fraction:t,key:t<.1?'signal':t<.38?'reveal':t<.77?'awake':t<.94?'settle':'ready',label:t<.1?'信号接入':t<.38?'投影显现':t<.77?'全息唤醒':t<.94?'投影收束':'我在。'};
}
function line(ctx,points,a=.2,w=1){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.lineWidth=w;ctx.strokeStyle=green(a);ctx.stroke();}
function text(ctx,value,x,y,size,a=.8){ctx.font='400 '+size+'px sans-serif';ctx.textAlign='center';ctx.fillStyle=green(a);ctx.fillText(value,x,y);}
export function createHologramImageRenderer(makeSurface,atlas){
 const portrait=makeSurface(480,320);
 return {render(ctx,milliseconds,options={}){
  const idle=options.mode!=='intro',time=idle?Math.max(0,milliseconds):Math.max(0,Math.min(INTRO_DURATION,milliseconds));
  const phase=idle?{key:'idle',label:'待机循环',fraction:1}:introPhase(time),t=phase.fraction;
  const frame=idleFrameAt(time),brightness=options.brightness??1,glow=options.glow??.28;
  const born=idle?1:smooth(t/.16),settle=idle?1:smooth((t-.77)/.2),reveal=idle?1:smooth((t-.1)/.28);
  ctx.clearRect(0,0,480,320);ctx.fillStyle='#000';ctx.fillRect(0,0,480,320);ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  const field=ctx.createRadialGradient(205,150,15,205,150,220);field.addColorStop(0,green(.018*born));field.addColorStop(1,green(0));ctx.fillStyle=field;ctx.fillRect(0,0,480,320);
  line(ctx,[[26,52],[26,34],[43,17],[91,17]],.21*born);line(ctx,[[340,287],[340,300],[290,300]],.16*born);
  line(ctx,[[345,34],[449,34],[456,41]],.1*born);line(ctx,[[366,276],[449,276]],.1*born);
  const pc=portrait.context;pc.clearRect(0,0,480,320);
  const size=idle?310:mix(322,310,settle),x=idle?29:mix(20,29,settle),y=idle?3:mix(-1,3,settle);
  pc.drawImage(atlas.canvas,frame%4*FRAME_SIZE,Math.floor(frame/4)*FRAME_SIZE,FRAME_SIZE,FRAME_SIZE,x,y,size,size);if(typeof pc.flush==='function')pc.flush();
  const upper=4+reveal*312;
  if(reveal>0){ctx.save();ctx.beginPath();ctx.rect(0,0,480,upper);ctx.clip();ctx.globalAlpha=brightness*(idle?1:mix(.7,1,smooth((t-.27)/.17)));if(glow>0){ctx.shadowColor=green(.7);ctx.shadowBlur=glow*8;}ctx.drawImage(portrait.canvas,0,0,480,320);ctx.restore();}
  if(!idle&&t>.1&&t<.38){const g=ctx.createLinearGradient(0,upper-17,0,upper+1);g.addColorStop(0,green(0));g.addColorStop(1,green(.11));ctx.fillStyle=g;ctx.fillRect(28,upper-17,310,18);line(ctx,[[28,upper],[337,upper]],.75,1);}
  if(!idle&&options.distortion!==false&&((t>.405&&t<.43)||(t>.6&&t<.625))){const ratio=portrait.ratio||1;for(const [sy,h,dx]of [[49,3,2],[256,3,-2]]){ctx.save();ctx.globalAlpha=.3*brightness;ctx.drawImage(portrait.canvas,0,sy*ratio,480*ratio,h*ratio,dx,sy,480,h);ctx.restore();}}
  const titleIn=idle?1:smooth((t-.28)/.17);text(ctx,'霓潮',400,139,27,.84*titleIn);line(ctx,[[374,156],[426,156]],.28*titleIn);
  text(ctx,idle||t>.94?'我在。':'正在唤醒…',400,188,idle||t>.94?20:16,.7*titleIn);
  if(!idle&&t<.1)for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(171+i*18,160,2,0,Math.PI*2);ctx.fillStyle=green(i===Math.floor(time/130)%3?.8:.15);ctx.fill();}
  ctx.restore();return {...phase,frame};
 },get surfaces(){return 1;}};
}
