import {ACTIONS,frameAt} from './pet-state.js';
import {getDestination,getObject,tripProgress} from './pet-content.js';
const GREEN='#66ffd1',DIM='rgba(102,255,209,0.65)';
function text(c,v,x,y,size=14,color=GREEN,align='left'){c.font=size+'px sans-serif';c.fillStyle=color;c.textAlign=align;c.textBaseline='top';c.fillText(String(v),x,y);}
function line(c,x,y,a,b,color=DIM){c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.moveTo(x,y);c.lineTo(a,b);c.stroke();}
function panel(c,x,y,w,h){c.fillStyle='rgba(4,13,23,0.8)';c.fillRect(x,y,w,h);c.strokeStyle='rgba(102,255,209,0.25)';c.lineWidth=1;c.strokeRect(x,y,w,h);}
function wrap(c,v,x,y,w,size=14,max=3){c.font=size+'px sans-serif';let row=0,s='';for(const ch of String(v)){if(c.measureText(s+ch).width>w&&s){text(c,s,x,y+row*(size+6),size);s='';if(++row>=max)return;}s+=ch;}if(s&&row<max)text(c,s,x,y+row*(size+6),size);}
function orb(c,x,y,r){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke();}
function glyph(c,id,x,y,scale=1){c.save();c.translate(x,y);c.scale(scale,scale);c.strokeStyle=GREEN;c.lineWidth=1.7;c.fillStyle='rgba(102,255,209,0.08)';
 if(id==='toy'){orb(c,0,0,22);orb(c,-19,-19,9);orb(c,19,-19,9);orb(c,-8,-3,2);orb(c,8,-3,2);c.beginPath();c.arc(0,7,7,0,Math.PI);c.stroke();}
 else if(id==='cup'){c.strokeRect(-20,-18,32,35);c.beginPath();c.arc(15,-1,11,-Math.PI/2,Math.PI/2);c.stroke();line(c,-23,22,23,22);}
 else if(id==='plant'){c.strokeRect(-13,10,26,18);line(c,0,10,0,-24);c.beginPath();c.ellipse(-10,-6,12,6,.6,0,Math.PI*2);c.stroke();c.beginPath();c.ellipse(10,-17,12,6,-.6,0,Math.PI*2);c.stroke();}
 else if(id==='keyboard'){c.strokeRect(-29,-17,58,35);for(let row=0;row<3;row++)for(let col=0;col<6;col++)c.strokeRect(-23+col*8,-11+row*9,5,5);}
 else if(id==='book'){c.strokeRect(-23,-25,46,50);line(c,-16,-25,-16,25);line(c,-8,-10,15,-10);line(c,-8,0,15,0);}
 else{c.strokeRect(-22,-17,44,34);line(c,-22,-17,0,-29);line(c,0,-29,22,-17);line(c,0,-29,0,17);}
 c.restore();}
function pet(c,frames,variant,frame,x,y,h,glow){c.save();if(glow){c.shadowColor='#35cc8a';c.shadowBlur=3;}c.drawImage(frames[variant][frame],x,y,h*.75,h);c.restore();}
export function renderPet(c,s,{frames,art={},now,elapsed,variant='a',petHeight=164,paused=false,mode='immersive'}){
 c.clearRect(0,0,480,320);c.globalAlpha=1;c.lineWidth=1;
 const immersive=mode==='immersive',route=getDestination(s.trip?s.trip.route:s.selectedDestination),backdrop=s.page==='travel'?art[route.id]:art.home;
 if(immersive&&backdrop){c.globalAlpha=s.page==='home'?1:.45;c.drawImage(backdrop,0,0,480,320);c.globalAlpha=1;c.fillStyle=s.page==='home'?'rgba(2,8,17,0.16)':'rgba(2,8,17,0.65)';c.fillRect(0,0,480,320);}
 const titles={home:'霓潮居 / HOME',observe:'共感链接 / SENSE',travel:'远游信标 / VOYAGE',memories:'记忆星图 / MEMORY'};
 panel(c,12,12,456,30);text(c,titles[s.page],22,20,13);text(c,s.trip?(s.trip.status==='away'?'远游中':'旅行包已到家'):s.restUntil?'正在小憩':'在你身边',456,21,12,DIM,'right');
 let frame=paused?0:frameAt(elapsed);if(s.restUntil)frame=4;
 const away=s.trip&&s.trip.status==='away';
 if(s.page==='home'){
  for(let i=0;i<7;i++){c.strokeStyle='rgba(100,255,215,0.2)';orb(c,35+i*65,80+Math.sin(elapsed/2500+i)*12,1);}
  if(!away){const h=petHeight;pet(c,frames,variant,frame,169,272-h+Math.sin(elapsed/1800)*1.2,h,immersive);if(s.restUntil)text(c,'z z Z',283,113,15);}
  else{panel(c,136,191,208,63);text(c,'给你留着一盏灯',240,205,17,GREEN,'center');text(c,'她正在'+route.name,240,231,13,DIM,'center');}
  if(s.decorations.includes('neon-sign')){panel(c,355,214,91,30);text(c,'RAIN / 雨巷',400,224,12,'#ff9ae7','center');}
  if(s.decorations.includes('glow-plant'))glyph(c,'plant',100,235,.7);
  if(s.decorations.includes('star-orbit')){c.strokeStyle='#a5a1ff';orb(c,337,213,15);c.beginPath();c.ellipse(337,213,22,7,-.5,0,Math.PI*2);c.stroke();}
  if(now<s.bubbleUntil){panel(c,267,65,192,79);wrap(c,s.bubble,279,77,166,14,3);line(c,278,145,267,155);}
 }else if(s.page==='observe'){
  panel(c,21,61,246,192);text(c,'场景输入 · 本机模拟',34,73,12,DIM);const o=s.observation&&getObject(s.observation.objectId);
  c.strokeStyle='rgba(102,255,209,0.2)';orb(c,144,153,62);orb(c,144,153,44);
  if(s.pending){const y=110+(elapsed/12)%100;line(c,49,y,239,y);text(c,'正在接收场景…',144,218,13,GREEN,'center');}
  else if(o){glyph(c,o.id,144,146,1.3);text(c,o.label,144,208,20,GREEN,'center');}
  else{text(c,'世界有很多小事',144,144,17,GREEN,'center');text(c,'值得一起看一看',144,172,13,DIM,'center');}
  pet(c,frames,variant,frame,313,157,112,immersive);wrap(c,now<s.bubbleUntil?s.bubble:'把熟悉的日常，变成下一次旅行的灵感。',286,68,171,14,4);
 }else if(s.page==='travel'){
  panel(c,23,62,270,85);text(c,route.name,35,76,25);text(c,s.trip?'一趟属于她的小小冒险':route.subtitle,35,115,12,DIM);
  if(away){const p=tripProgress(s,now),seconds=Math.max(0,Math.ceil((s.trip.endsAt-now)/1000));pet(c,frames,variant,frame,100+p*170,150,117,immersive);panel(c,23,222,270,41);text(c,'还有 '+Math.floor(seconds/60)+'分'+String(seconds%60).padStart(2,'0')+'秒',35,231,14);c.fillStyle='rgba(102,255,209,0.2)';c.fillRect(35,254,244,3);c.fillStyle=GREEN;c.fillRect(35,254,244*p,3);}
  else if(s.trip&&s.trip.status==='returned'){glyph(c,'parcel',145,196,1.4);text(c,'一份远方的礼物，等你打开',145,248,13,GREEN,'center');}
  else{pet(c,frames,variant,frame,315,117,143,immersive);text(c,'准备 '+route.food+'份饭团 · '+route.energy+'点能量',35,179,14);text(c,'预计 '+route.duration/60000+' 分钟归来',35,209,13,DIM);}
 }else{
  panel(c,24,64,312,194);const m=s.memories[s.memoryIndex];if(m){text(c,m.pinned?'已置顶 / A KEEPSAKE':'一段被记住的日常',37,78,12,DIM);wrap(c,m.text,37,111,282,18,5);text(c,m.source==='simulation'?'来源：场景演练':'来源：我们的日常',37,235,12,DIM);}else wrap(c,'先一起生活，再让回忆慢慢发光。',37,114,271,22,4);pet(c,frames,variant,frame,355,142,101,immersive);
 }
 const actions=ACTIONS[s.page],w=456/actions.length;panel(c,12,281,456,29);actions.forEach((a,i)=>{if(i===s.focus){c.fillStyle='rgba(102,255,209,0.17)';c.fillRect(14+i*w,283,w-4,25);}text(c,a,12+(i+.5)*w,290,12,i===s.focus?GREEN:DIM,'center');});
}
