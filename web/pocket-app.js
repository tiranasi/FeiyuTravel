import {BADGES,createPocket,demoRespond} from '../lib/pocket.js';
import {achievementStorage} from './pocket-storage.js';
const $=id=>document.getElementById(id),ctx=$('pet').getContext('2d'),durations=[1700,380,500,90,110,90,400,500];
let frames=[],frame=0,animationTimer,toastTimer,focus=0,ready=false,paused=false,lastNotice='';
const actionButtons=[$('talk-focus'),$('observe'),$('badges-shortcut')];
const engine=createPocket({storage:achievementStorage(),respond:demoRespond,onChange:render});
function draw(){
 ctx.clearRect(0,0,480,320);ctx.fillStyle='#000';ctx.fillRect(0,0,480,320);
 ctx.strokeStyle='#0b4528';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(50,260);ctx.lineTo(430,260);ctx.stroke();
 ctx.strokeStyle='#1f6d42';ctx.beginPath();ctx.ellipse(240,259,65,7,0,0,Math.PI*2);ctx.stroke();
 if(frames.length)ctx.drawImage(frames[frame],163,43,154,206);
 ctx.fillStyle='#75ffad';ctx.textAlign='center';ctx.font='20px "Microsoft YaHei", sans-serif';
 ctx.fillText(engine.state.busy?'等我想想…':engine.state.messages.length?'我在听。':'今天，想聊点什么？',240,295);
}
function animate(){clearTimeout(animationTimer);if(!ready||paused||document.hidden)return;draw();animationTimer=setTimeout(()=>{frame=(frame+1)%8;animate();},durations[frame]);}
function select(index){focus=(index+3)%3;actionButtons.forEach((b,i)=>b.classList.toggle('selected',i===focus));}
function openBadges(){renderBadges();$('badges').showModal();paused=true;clearTimeout(animationTimer);}
function renderBadges(){const items=BADGES.map(b=>{const item=document.createElement('div');const unlocked=engine.state.unlocked.includes(b.id);item.className='badge'+(unlocked?' unlocked':'');const glyph=document.createElement('span');glyph.className='badge-glyph';glyph.textContent=b.glyph;const copy=document.createElement('div'),title=document.createElement('h3'),description=document.createElement('p'),status=document.createElement('span');title.textContent=b.name;description.textContent=b.description;status.textContent=unlocked?'已点亮':'未解锁';status.className='badge-state';copy.append(title,description);item.append(glyph,copy,status);return item;});$('badge-list').replaceChildren(...items);}
function render(state){
 $('badge-count').textContent=state.unlocked.length+' / 4';$('save-status').textContent=state.status;$('retry-save').hidden=!state.saveError;
 $('send').disabled=state.busy;$('observe').disabled=state.busy;$('live-status').textContent=state.busy?'● 正在回应':'● 绿线缓存待机';
 const nodes=state.messages.map(message=>{const p=document.createElement('p'),label=document.createElement('span');p.className='message '+message.role;label.textContent=message.role==='user'?'YOU':'DAFEIYU';p.append(label,document.createTextNode(message.content));return p;});
 if(state.busy){const p=document.createElement('p');p.className='message busy';p.textContent='信号轻轻游过来…';nodes.push(p);}
 if(nodes.length)$('messages').replaceChildren(...nodes);else{const p=document.createElement('p');p.className='welcome';p.textContent='“我在。今天想和我说点什么？”';$('messages').replaceChildren(p);}
 $('messages').scrollTop=$('messages').scrollHeight;
 if(state.notice&&state.notice!==lastNotice){lastNotice=state.notice;$('toast').textContent=state.notice;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
 if($('badges').open)renderBadges();if(ready)draw();
}
function activate(){if(focus===0)$('message').focus();else if(focus===1)engine.observe($('object').value);else openBadges();}
$('chat-form').onsubmit=event=>{event.preventDefault();const text=$('message').value.trim();if(!text||engine.state.busy)return;$('message').value='';engine.talk(text);};
document.querySelectorAll('[data-say]').forEach(b=>b.onclick=()=>engine.talk(b.dataset.say));
$('talk-focus').onclick=()=>{select(0);activate();};$('observe').onclick=()=>{select(1);activate();};$('badges-shortcut').onclick=()=>{select(2);activate();};
$('open-badges').onclick=openBadges;$('close-badges').onclick=()=>$('badges').close();$('open-settings').onclick=()=>{$('settings').showModal();paused=true;clearTimeout(animationTimer);};$('close-settings').onclick=()=>$('settings').close();
for(const modal of [$('badges'),$('settings')])modal.addEventListener('close',()=>{paused=false;animate();$('pet').focus();});
$('new-conversation').onclick=()=>engine.newConversation();$('retry-save').onclick=()=>engine.retrySave();
// One confirmation per down/up pair. Text input keeps ordinary keyboard behavior.
let armed=false;
document.addEventListener('keydown',event=>{if(event.target.matches('input,select')||$('badges').open||$('settings').open)return;if(event.key==='Enter'){armed=!event.repeat;event.preventDefault();}else if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();select(focus+(event.key==='ArrowUp'?-1:1));}else if(event.key==='Escape'){engine.cancel();$('pet').focus();}});
document.addEventListener('keyup',event=>{if(event.key!=='Enter')return;const accepted=armed;armed=false;if(accepted){event.preventDefault();activate();}});
document.addEventListener('visibilitychange',()=>{armed=false;if(document.hidden){engine.hide();clearTimeout(animationTimer);}else{engine.show();animate();}});
window.addEventListener('pagehide',()=>{engine.destroy();clearTimeout(animationTimer);clearTimeout(toastTimer);});
await engine.load();
try{for(let i=0;i<8;i++){const image=new Image();image.src='/assets/a-'+i+'.png';await image.decode();const frameCanvas=document.createElement('canvas');frameCanvas.width=180;frameCanvas.height=240;frameCanvas.getContext('2d').drawImage(image,0,0,180,240);frames.push(frameCanvas);}$('cache-status').textContent='8 FRAMES / 1.32 MiB';ready=true;$('loading').hidden=true;animate();}catch(error){$('loading').textContent='角色加载失败，请刷新重试。';}
