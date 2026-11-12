// Original vector drawing, composed from the user's pose reference.
// Every visible mark is a Canvas path. No encoded images, fonts, SVG or textures.
export const HOLOGRAM_DURATION=4200;
export const HOLOGRAM_SIZE={width:480,height:320};
const TAU=Math.PI*2;
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const green=a=>'rgba(64,255,144,'+clamp(a).toFixed(4)+')';
function trace(ctx,commands){ctx.beginPath();for(const [op,...v] of commands){if(op==='M')ctx.moveTo(...v);else if(op==='L')ctx.lineTo(...v);else if(op==='C')ctx.bezierCurveTo(...v);else if(op==='Q')ctx.quadraticCurveTo(...v);else if(op==='Z')ctx.closePath();}}
function shape(ctx,commands,{a=.72,w=1.25,fill=.025,glow=0}={}){
 trace(ctx,commands);
 if(fill!==null){ctx.fillStyle='#000000';ctx.fill();if(fill){ctx.fillStyle=green(fill);ctx.fill();}}
 ctx.strokeStyle=green(a);ctx.lineWidth=w;
 if(glow){ctx.save();ctx.shadowColor=green(a*.65);ctx.shadowBlur=glow;ctx.stroke();ctx.restore();}else ctx.stroke();
}
function line(ctx,points,a=.4,w=1){shape(ctx,[['M',...points[0]],...points.slice(1).map(p=>['L',...p])],{a,w,fill:null});}
function curve(ctx,commands,a=.45,w=1){shape(ctx,commands,{a,w,fill:null});}
function ellipse(ctx,x,y,rx,ry,a=.5,w=1,fill=null){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);if(fill!==null){ctx.fillStyle=green(fill);ctx.fill();}ctx.strokeStyle=green(a);ctx.lineWidth=w;ctx.stroke();}
function label(ctx,value,x,y,size=16,a=.8,align='left'){ctx.font='400 '+size+'px sans-serif';ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillStyle=green(a);ctx.fillText(value,x,y);}
const BACK_HAIR=[['M',-80,-113],['C',-88,-162,-43,-180,-7,-173],['C',32,-185,91,-154,92,-104],['C',105,-55,87,5,113,56],['C',130,88,149,104,176,115],['C',151,131,130,125,113,111],['C',126,155,151,190,174,200],['C',130,211,103,186,82,158],['C',87,189,100,211,119,223],['C',72,218,48,184,35,154],['L',-41,156],['C',-65,196,-107,216,-151,209],['C',-119,195,-98,174,-85,148],['C',-124,177,-161,178,-183,163],['C',-149,150,-132,135,-118,111],['C',-144,132,-172,123,-184,111],['C',-135,109,-117,61,-105,25],['C',-83,-26,-94,-66,-80,-113],['Z']];
const DRESS=[['M',-26,54],['C',-49,57,-78,65,-99,92],['C',-116,118,-122,165,-139,226],['L',138,226],['C',122,173,124,124,103,94],['C',84,66,48,58,21,55],['Z']];
const FACE=[['M',-62,-105],['C',-35,-129,29,-133,59,-108],['C',79,-90,78,-45,70,-18],['C',60,16,34,41,4,48],['C',-24,43,-50,22,-64,-5],['C',-80,-34,-80,-81,-62,-105],['Z']];
const HAND=[['M',49,25],['C',39,16,42,3,47,-10],['L',58,-33],['Q',61,-39,64,-34],['Q',65,-30,62,-23],['L',58,-10],['L',68,-29],['Q',72,-34,75,-28],['L',70,-9],['L',79,-24],['Q',83,-29,86,-23],['L',80,-3],['L',86,-14],['Q',91,-18,93,-11],['C',90,7,82,29,78,43],['C',74,63,80,79,83,91],['L',47,99],['C',49,78,50,57,46,40],['Q',43,30,49,25],['Z']];
function rearHair(ctx,time){
 const wind=Math.sin(time/1100)*2.6;
 shape(ctx,BACK_HAIR,{a:.68,w:1.55,fill:.026,glow:2});
 for(const side of [-1,1]){
  ctx.save();ctx.scale(side,1);
  for(let i=0;i<5;i++){
   const d=i*10;curve(ctx,[['M',72-d*.25,-86+d*.25],['C',112-d,-23,72+d*.35,42+wind,107+d*.42,95],['C',125+d*.45,126+wind,123+d*.7,160,158+d*.45,191]],.18+i*.025,1);
  }
  shape(ctx,[['M',88,15],['C',115,43,108,79,139+wind,100],['Q',119,101,108,89],['C',120,121,110,151,140+wind,173],['C',98,153,95,121,85,97],['C',76,73,92,46,88,15]],{a:.53,w:1.1,fill:.02});
  curve(ctx,[['M',102,51],['C',97,91,120,107,117+wind,144]],.56,1);
  ctx.restore();
 }
}
function torso(ctx,time){
 ctx.save();ctx.scale(1,1+Math.sin(time/950)*.004);
 shape(ctx,DRESS,{a:.75,w:1.5,fill:.045});
 shape(ctx,[['M',-32,67],['Q',2,96,37,67],['C',40,118,62,174,74,226],['L',-71,226],['C',-54,165,-44,108,-32,67],['Z']],{a:.75,fill:.075});
 shape(ctx,[['M',-22,34],['L',-23,64],['Q',1,87,24,62],['L',23,34],['Z']],{a:.62,fill:.033});
 shape(ctx,[['M',-26,60],['L',0,80],['L',-24,88],['L',-40,70],['Z']],{a:.8,fill:.08});
 shape(ctx,[['M',25,59],['L',0,80],['L',26,87],['L',41,70],['Z']],{a:.8,fill:.08});
 for(const side of [-1,1]){
  ctx.save();ctx.scale(side,1);
  shape(ctx,[['M',37,67],['C',53,59,79,72,95,94],['Q',87,109,83,102],['Q',73,113,69,100],['Q',59,111,56,95],['Q',44,99,44,84],['Z']],{a:.77,fill:.08});
  curve(ctx,[['M',50,75],['Q',57,87,56,96],['M',66,78],['Q',74,88,70,102],['M',81,87],['L',83,102]],.42,1);
  curve(ctx,[['M',101,104],['C',109,140,106,172,124,211]],.36,1);
  curve(ctx,[['M',83,118],['C',93,145,88,182,100,226]],.27,1);
  ctx.restore();
 }
 shape(ctx,[['M',-3,84],['C',-12,68,-28,66,-36,76],['L',-28,95],['Q',-12,96,-3,86],['Z']],{a:.85,fill:.08});
 shape(ctx,[['M',4,84],['C',15,68,32,67,38,78],['L',28,97],['Q',13,96,4,86],['Z']],{a:.85,fill:.08});
 shape(ctx,[['M',0,77],['L',7,84],['L',1,92],['L',-6,85],['Z']],{a:1,fill:.14});
 curve(ctx,[['M',-4,92],['L',-18,120],['L',-4,111],['L',1,96]],.61,1.2);
 curve(ctx,[['M',7,93],['L',20,118],['L',7,111]],.61,1.2);
 curve(ctx,[['M',-23,98],['C',-25,137,-29,187,-33,225]],.62,1.1);
 curve(ctx,[['M',30,101],['C',33,137,43,189,47,224]],.38,1);
 for(let i=0;i<3;i++){const x=5+i*3,y=136+i*33;shape(ctx,[['M',x,y-3],['L',x+3,y],['L',x,y+3],['L',x-3,y],['Z']],{a:.8,fill:.1,w:1});}
 shape(ctx,[['M',-112,187],['Q',-81,202,-54,209],['L',47,192],['L',67,214],['L',-44,232],['Q',-92,228,-126,213],['Z']],{a:.62,fill:.045});
 curve(ctx,[['M',-100,202],['Q',-74,215,-46,218],['L',31,205]],.32,1);
 ctx.restore();
}
function headband(ctx){
 for(let i=0;i<15;i++){
  const a=Math.PI*1.035+i/14*Math.PI*.93,x=Math.cos(a)*86,y=-73+Math.sin(a)*79;
  ctx.save();ctx.translate(x,y);ctx.rotate(a+Math.PI/2);
  shape(ctx,[['M',-9,2],['Q',-13,-10,-10,-23],['Q',0,-28,9,-23],['Q',13,-10,9,2],['Z']],{a:.8,fill:.09,w:1.1});
  curve(ctx,[['M',-3,-2],['L',-5,-18],['M',3,-2],['L',5,-18]],.28,.8);
  ctx.restore();
 }
 ctx.beginPath();ctx.ellipse(0,-73,84,76,0,Math.PI*1.035,Math.PI*1.965);ctx.strokeStyle=green(.9);ctx.lineWidth=3;ctx.stroke();
 ctx.beginPath();ctx.ellipse(0,-73,77,69,0,Math.PI*1.035,Math.PI*1.965);ctx.strokeStyle=green(.45);ctx.lineWidth=1;ctx.stroke();
}
function eye(ctx,x,y,side,open,time){
 ctx.save();ctx.translate(x,y);ctx.scale(1,Math.max(.06,open));
 const contour=[['M',-20,0],['C',-12,-15,6,-16,19,-2],['C',13,13,-10,17,-20,0],['Z']];
 shape(ctx,contour,{a:.68,w:1,fill:.05});
 ctx.save();trace(ctx,contour);ctx.clip();
 const gx=Math.sin(time/1350)*1.2;
 const iris=ctx.createRadialGradient(gx,-1,1,gx,1,13);iris.addColorStop(0,green(.07));iris.addColorStop(.64,green(.27));iris.addColorStop(1,green(.6));
 ctx.beginPath();ctx.ellipse(gx,1,9.5,12.5,0,0,TAU);ctx.fillStyle=iris;ctx.fill();ctx.strokeStyle=green(.75);ctx.lineWidth=1;ctx.stroke();
 ctx.beginPath();ctx.ellipse(gx,1,3.7,7,0,0,TAU);ctx.fillStyle='#000000';ctx.fill();
 for(const [xx,yy,r,a] of [[-4,-6,3.1,1],[4,5,1.5,.9],[-2,9,.9,.85]]){ctx.beginPath();ctx.arc(xx,yy,r,0,TAU);ctx.fillStyle=green(a);ctx.fill();}
 ctx.restore();
 curve(ctx,[['M',-21,1],['C',-13,-15,7,-17,20,-2]],1,2.5);
 curve(ctx,[['M',-13,12],['Q',0,17,11,10]],.5,.9);
 const outer=side<0?-1:1;
 for(let i=0;i<3;i++){const xx=outer*(14+i*2.5);curve(ctx,[['M',xx,-5+i*2],['Q',xx+outer*5,-6+i*2,xx+outer*(6+i),-12+i*2]],.95,1.3);}
 ctx.restore();
 if(open<.24)curve(ctx,[['M',x-18,y],['Q',x,y+8,x+19,y]],.92,1.6);
}
function bangs(ctx,time){
 const sway=Math.sin(time/1050)*1.5;
 shape(ctx,[['M',-72,-103],['C',-75,-137,-39,-153,-8,-143],['C',29,-152,64,-132,73,-100],['L',67,-65],['C',40,-74,20,-84,0,-89],['C',-28,-80,-50,-77,-69,-61],['Z']],{a:0,w:1.4,fill:.04});
 curve(ctx,[['M',-72,-103],['C',-75,-137,-39,-153,-8,-143],['C',29,-152,64,-132,73,-100]],.82,1.45);
 const locks=[
  [['M',-70,-111],['C',-74,-80,-85,-51,-77,-13],['C',-69,-20,-58,-46,-54,-66],['L',-54,-112],['Z']],
  [['M',-41,-129],['C',-48,-101,-45,-68,-58,-43],['C',-40,-47,-24,-72,-21,-106],['L',-18,-135],['Z']],
  [['M',-12,-139],['C',-20,-102,-14,-60,-1,-38],['C',4,-61,5,-91,10,-125],['Z']],
  [['M',14,-137],['C',30,-117,20,-77,42,-44],['C',45,-61,51,-92,41,-119],['L',32,-135],['Z']],
  [['M',52,-123],['C',68,-110,72,-76,70,-49],['C',75,-34,79,-19,84,-11],['C',81,-61,83,-95,73,-115],['Z']],
 ];
 locks.forEach((lock,i)=>{shape(ctx,lock,{a:0,fill:.035});curve(ctx,lock.filter(part=>!['L','Z'].includes(part[0])),i===2?.9:.78,1.3);});
 for(const [x,endX,endY] of [[-62,-69,-43],[-35,-42,-58],[-8,-2,-56],[27,36,-60],[61,73,-42]])curve(ctx,[['M',x,-126],['C',x-9,-100,x+6+sway,-78,endX,endY]],.3,1);
 curve(ctx,[['M',-61,-108],['C',-70,-78,-67,-61,-69,-48]],.9,1.25);
 curve(ctx,[['M',57,-104],['C',69,-87,65,-68,71,-53]],.8,1.15);
 // Forelocks frame the cheeks, with separately moving tips.
 for(const s of [-1,1]){ctx.save();ctx.scale(s,1);shape(ctx,[['M',68,-76],['C',71,-38,61,-12,73,11],['Q',83,28,101+sway,29],['Q',90,39,78,29],['C',85,50,80,63,97+sway,70],['C',72,76,58,60,59,38],['C',54,11,64,-17,60,-46],['Z']],{a:.77,fill:.035,w:1.2});curve(ctx,[['M',69,-30],['C',63,9,76,28,73,50]],.38,1);ctx.restore();}
 curve(ctx,[['M',-3,-144],['C',-61,-179,-64,-211,15,-208],['C',73,-205,46,-166,18,-147]],.8,1.7);
 curve(ctx,[['M',-52,-184],['C',-33,-204,31,-208,46,-194]],.35,1);
 // Small fish-fin ribbons beside the head.
 for(const s of [-1,1]){ctx.save();ctx.scale(s,1);shape(ctx,[['M',78,-22],['Q',98,-48,110,-38],['L',101,-17],['Q',123,-9,118,2],['L',92,-5],['Z']],{a:.75,fill:.06});shape(ctx,[['M',84,-17],['L',95,-23],['L',101,-13],['L',93,-7],['Z']],{a:.95,fill:.11,w:1});ctx.restore();}
}
function supportingHand(ctx){
 shape(ctx,[['M',48,91],['L',88,82],['C',94,108,101,148,94,190],['L',59,202],['C',53,167,54,127,48,91],['Z']],{a:.76,w:1.4,fill:.055});
 shape(ctx,HAND,{a:.9,w:1.15,fill:.055});
 curve(ctx,[['M',50,24],['Q',60,30,64,43],['M',58,-10],['L',54,7],['M',70,-9],['L',65,11],['M',80,-3],['L',73,17]],.42,.85);
 shape(ctx,[['M',43,83],['L',84,77],['L',94,103],['L',48,115],['Z']],{a:.85,fill:.11});
 for(let i=0;i<5;i++){const x=48+i*9,y=107-i*2;curve(ctx,[['M',x,y],['Q',x+1,y+10,x+8,y+10],['L',x+9,y-2]],.65,1);}
 curve(ctx,[['M',58,121],['C',62,149,59,174,66,190]],.37,1);
 curve(ctx,[['M',80,117],['C',87,143,86,164,83,184]],.3,1);
 shape(ctx,[['M',62,145],['L',72,137],['L',80,146],['L',74,157],['Z']],{a:.75,fill:.035,w:1});
 curve(ctx,[['M',59,174],['L',94,163],['M',61,181],['L',94,170]],.65,1.1);
}
function drawPortrait(ctx,time,{wind=1,blink=true}={}){
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 rearHair(ctx,time*wind);torso(ctx,time);
 ctx.save();ctx.translate(Math.sin(time/1700)*.6,Math.sin(time/1000)*.7);ctx.rotate(Math.sin(time/1600)*.011);
 headband(ctx);shape(ctx,FACE,{a:.77,w:1.3,fill:.032});
 curve(ctx,[['M',-49,-57],['Q',-33,-67,-17,-60],['M',16,-61],['Q',34,-68,49,-59]],.62,1.1);
 const b=blink?clamp(1-Math.exp(-Math.pow((time-2130)/78,2))):1;
 eye(ctx,-31,-24,-1,b,time);eye(ctx,31,-24,1,b,time);
 curve(ctx,[['M',4,-8],['Q',-1,-1,4,1]],.4,.8);
 for(const side of [-1,1])for(let i=0;i<3;i++)line(ctx,[[side*(36+i*5),1],[side*(34+i*5),7]],.24,.85);
 shape(ctx,[['M',-14,15],['Q',1,20,17,13],['C',14,29,6,36,0,35],['Q',-10,32,-14,15],['Z']],{a:.66,w:1,fill:.07});
 curve(ctx,[['M',-8,19],['Q',2,23,11,18]],.65,.9);curve(ctx,[['M',-4,29],['Q',3,25,10,28]],.3,.8);
 bangs(ctx,time*wind);supportingHand(ctx);ctx.restore();ctx.restore();
}
export function hologramPhase(time){const t=clamp(time/HOLOGRAM_DURATION);return {fraction:t,key:t<.1?'signal':t<.38?'reveal':t<.77?'awake':t<.94?'settle':'ready',label:t<.1?'信号接入':t<.38?'投影显现':t<.77?'全息唤醒':t<.94?'投影收束':'我在。'};}
export function createHologramRenderer(makeSurface){
 const portrait=makeSurface(480,320);let frameCount=0;
 return {render(ctx,milliseconds,options={}){
  const time=Math.max(0,Math.min(HOLOGRAM_DURATION,milliseconds)),phase=hologramPhase(time),t=phase.fraction;
  const brightness=options.brightness??1,glow=options.glow??.65;
  ctx.clearRect(0,0,480,320);ctx.fillStyle='#000000';ctx.fillRect(0,0,480,320);ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  const born=smooth(t/.16),settle=smooth((t-.77)/.2),reveal=smooth((t-.1)/.28);
  // A projection plane, rails and sparse distant geometry are drawn, never sampled.
  const field=ctx.createRadialGradient(184,153,4,184,153,210);field.addColorStop(0,green(.055*born));field.addColorStop(1,green(0));ctx.fillStyle=field;ctx.fillRect(0,0,480,320);
  line(ctx,[[31,261],[31,40],[49,22],[318,22],[335,39],[335,260]],.16*born*(1-settle*.6));
  line(ctx,[[45,27],[94,27]],.4*born*(1-settle));line(ctx,[[312,252],[328,252],[328,230]],.5*born*(1-settle));
  for(let i=0;i<15;i++){const seed=Math.sin(i*37.2+3)*43758.545;const f=seed-Math.floor(seed);const x=18+f*443,y=(i*47+time*(.006+i%3*.004))%280;const a=(.045+(i%4)*.018)*born*(1-settle);line(ctx,[[x,y],[x+5+i%4*7,y]],a,.6);}
  for(let i=0;i<18;i++){const x=23+((i*67.3)%431),y=18+((i*37.7+time*.009)%269);const a=(.07+.08*(.5+.5*Math.sin(time/600+i)))*born*(1-settle);ctx.fillStyle=green(a);ctx.fillRect(x,y,i%5===0?2:1,i%5===0?2:1);}
  line(ctx,[[16,292],[465,284]],.14*born*(1-settle));line(ctx,[[22,310],[468,302]],.09*born*(1-settle));
  // Canvas-generated portrait surface enables clipped reveals and narrow-band displacement.
  const pctx=portrait.context;pctx.clearRect(0,0,480,320);pctx.save();
  const scale=mix(.70,.59,settle);pctx.translate(mix(186,140,settle),mix(162,173,settle));pctx.scale(scale,scale);drawPortrait(pctx,time,{wind:options.hairMotion===false?0:1,blink:options.blink!==false});pctx.restore();if(typeof pctx.flush==='function')pctx.flush();
  const upper=5+reveal*310;
  if(reveal>0){ctx.save();ctx.beginPath();ctx.rect(0,0,480,upper);ctx.clip();ctx.globalAlpha=brightness*mix(.67,1,smooth((t-.27)/.17));
   if(glow>0){ctx.shadowColor=green(.45*glow);ctx.shadowBlur=5+glow*6;}
   ctx.drawImage(portrait.canvas,0,0,480,320);ctx.restore();
  }
  if(t>.1&&t<.38){const yy=upper;const grad=ctx.createLinearGradient(0,yy-22,0,yy+2);grad.addColorStop(0,green(0));grad.addColorStop(1,green(.15));ctx.fillStyle=grad;ctx.fillRect(39,yy-22,294,24);ctx.save();ctx.shadowColor=green(.7);ctx.shadowBlur=6;line(ctx,[[39,yy],[330,yy]],.84,1.1);ctx.restore();}
  // Two local, short displacement events leave the eyes and mouth intact.
  if(options.distortion!==false&&((t>.405&&t<.43)||(t>.6&&t<.625))){const ratio=portrait.ratio||1;for(const [sy,sh,dx] of [[57,3,3],[241,4,-2]]){ctx.save();ctx.globalAlpha=.42*brightness;ctx.drawImage(portrait.canvas,0,sy*ratio,480*ratio,sh*ratio,dx,sy,480,sh);ctx.restore();}}
  if(reveal>0&&settle<1){ctx.save();ctx.beginPath();ctx.rect(35,18,298,Math.max(0,upper-18));ctx.clip();for(let y=22;y<300;y+=5)line(ctx,[[37,y],[332,y]],.024*(1-settle),.5);ctx.restore();}
  const titleIn=smooth((t-.26)/.18);label(ctx,'霓潮',375,141,28,.84*titleIn,'center');
  line(ctx,[[346,157],[405,157]],.35*titleIn);for(let i=0;i<5;i++)line(ctx,[[351+i*10,162],[355+i*10,162]],.26*titleIn);
  if(t<.94)label(ctx,'正在唤醒…',375,194,18,.6*titleIn,'center');else label(ctx,'我在。',375,194,24,.96,'center');
  if(t<.1){const k=(time/130)%3;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(189+i*18,160,2.2,0,TAU);ctx.fillStyle=green(i===Math.floor(k)?.85:.18);ctx.fill();}}
  if(settle>0){ctx.beginPath();ctx.ellipse(140,306,72+settle*8,6,0,0,TAU);ctx.strokeStyle=green(.28*settle);ctx.lineWidth=1;ctx.stroke();}
  ctx.restore();frameCount++;return {...phase,frameCount};
 },get surfaces(){return 1;}};
}
