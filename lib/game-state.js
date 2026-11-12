import {DESTINATIONS,OBJECTS,DECORATIONS,QUESTS,getDestination,getObject,destinationUnlocked,questComplete} from './pet-content.js';
export const SCREEN={width:480,height:320};
export const FRAME_DURATIONS=[1700,380,500,90,110,90,400,500];
export const ACTIONS={home:['打个招呼','喂海盐饭团','休息片刻','出门旅行'],observe:['观察一次','收集灵感','回到家园'],travel:['打包出发','拆旅行包','回到家园'],memories:['上一条','下一条','置顶回忆','回到家园']};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
const integer=(v,max=1e9)=>Math.floor(clamp(v,0,max));
const text=(v,n)=>typeof v==='string'?v.slice(0,n):'';
const list=(v,allowed)=>Array.isArray(v)?[...new Set(v.filter(x=>allowed.includes(x)))]:[];
export function createState(now){return {version:2,createdAt:now,updatedAt:now,lastRegenAt:now,page:'home',focus:0,affection:0,energy:78,mood:72,coins:12,food:3,memories:[],memoryIndex:0,trip:null,restUntil:0,postcards:0,completedTrips:0,cards:[],souvenirs:[],decorations:[],discoveries:{},collectedInspirations:[],equippedInspiration:null,selectedDestination:'rain',claimedQuests:[],profile:[],counters:{greetings:0,feeds:0,observations:0},lastGreetingAt:0,sequence:0,bubble:'城市再大，也有一个等你回来的小小角落。',bubbleUntil:now+7000,observation:null,pending:false};}
function say(s,value,now){s.bubble=value;s.bubbleUntil=now+6500;}
function remember(s,value,kind,source,now,extra={}){s.sequence++;s.memories.push({id:now+'-'+s.sequence,text:value,kind,source,at:now,pinned:false,...extra});s.memoryIndex=s.memories.length-1;}
function settle(s,now){let changed=false;
 if(s.trip&&s.trip.status==='away'&&now>=s.trip.endsAt){s.trip.status='returned';say(s,'我回来啦，快来拆开旅行包！',now);changed=true;}
 if(s.restUntil&&now>=s.restUntil){s.restUntil=0;s.energy=Math.min(100,s.energy+25);s.mood=Math.min(100,s.mood+5);say(s,'休息好了，又有力气陪你啦。',now);changed=true;}
 const hours=Math.floor(Math.max(0,now-s.lastRegenAt)/3600000);if(hours>0){if(!s.trip||s.trip.status!=='away')s.energy=Math.min(100,s.energy+Math.min(hours,24)*4);s.lastRegenAt+=hours*3600000;changed=true;}
 if(changed)s.updatedAt=now;return changed;
}
export function restoreState(raw,now){const s=createState(now);if(!raw||![1,2].includes(raw.version)||!Array.isArray(raw.memories))return s;
 s.createdAt=Number.isFinite(raw.createdAt)?raw.createdAt:now;s.updatedAt=Number.isFinite(raw.updatedAt)?raw.updatedAt:now;s.affection=integer(raw.affection,10000);s.postcards=integer(raw.postcards);s.sequence=integer(raw.sequence);
 s.memories=raw.memories.filter(m=>m&&typeof m.id==='string'&&typeof m.text==='string'&&Number.isFinite(m.at)).map(m=>({id:m.id.slice(0,100),text:m.text.slice(0,400),at:m.at,source:['simulation','local','game'].includes(m.source)?m.source:'local',kind:text(m.kind,30)||'event',pinned:!!m.pinned,...(typeof m.objectId==='string'?{objectId:m.objectId.slice(0,30)}:{})}));s.sequence=Math.max(s.sequence,s.memories.length);s.memoryIndex=Math.max(0,s.memories.length-1);
 if(raw.version===2){
  s.energy=clamp(raw.energy,0,100);s.mood=clamp(raw.mood,0,100);s.coins=integer(raw.coins);s.food=integer(raw.food,999);s.completedTrips=integer(raw.completedTrips);
  s.lastRegenAt=Number.isFinite(raw.lastRegenAt)?Math.min(now,raw.lastRegenAt):now;s.restUntil=Number.isFinite(raw.restUntil)?raw.restUntil:0;s.lastGreetingAt=Number.isFinite(raw.lastGreetingAt)?raw.lastGreetingAt:0;
  s.cards=Array.isArray(raw.cards)?raw.cards.filter(c=>c&&typeof c.id==='string'&&DESTINATIONS.some(d=>d.id===c.route)&&Number.isFinite(c.at)).map(c=>({id:c.id.slice(0,100),route:c.route,at:c.at,inspiration:text(c.inspiration,30)})):[];
  s.souvenirs=list(raw.souvenirs,DECORATIONS.map(d=>d.id));s.decorations=list(raw.decorations,s.souvenirs);s.claimedQuests=list(raw.claimedQuests,QUESTS.map(q=>q.id));s.collectedInspirations=list(raw.collectedInspirations,OBJECTS.map(o=>o.inspiration));s.equippedInspiration=s.collectedInspirations.includes(raw.equippedInspiration)?raw.equippedInspiration:null;s.selectedDestination=getDestination(raw.selectedDestination).id;
  s.profile=Array.isArray(raw.profile)?raw.profile.filter(f=>typeof f==='string'&&f.trim()).map(f=>f.slice(0,120)):[];
  for(const o of OBJECTS){const d=raw.discoveries&&raw.discoveries[o.id];if(d&&Number.isFinite(d.firstSeen)&&Number.isFinite(d.lastSeen))s.discoveries[o.id]={label:o.label,firstSeen:d.firstSeen,lastSeen:d.lastSeen,encounters:Math.max(1,integer(d.encounters))};}
  for(const k of Object.keys(s.counters))s.counters[k]=integer(raw.counters&&raw.counters[k]);
 }else{s.completedTrips=s.postcards;s.counters.greetings=s.memories.filter(m=>m.kind==='greeting').length;}
 if(raw.trip&&['away','returned'].includes(raw.trip.status)&&Number.isFinite(raw.trip.startedAt)&&Number.isFinite(raw.trip.endsAt)&&raw.trip.endsAt>raw.trip.startedAt&&(raw.trip.status==='away'||raw.version===2)){const route=getDestination(raw.trip.route).id;s.trip={id:text(raw.trip.id,100)||'legacy-'+raw.trip.startedAt,status:raw.trip.status,route,destination:getDestination(route).name,startedAt:raw.trip.startedAt,endsAt:raw.trip.endsAt,inspiration:text(raw.trip.inspiration,30)};}
 s.bubble=s.memories.length?'我记得我们一起经历的事。':'欢迎回来，今天也一起收集一点小小的见闻吧。';s.bubbleUntil=now+6000;settle(s,now);return s;
}
export function reduceState(previous,event,now){
 const s={...previous,memories:previous.memories.slice(),trip:previous.trip?{...previous.trip}:null,counters:{...previous.counters},discoveries:{...previous.discoveries},cards:previous.cards.slice(),souvenirs:previous.souvenirs.slice(),decorations:previous.decorations.slice(),claimedQuests:previous.claimedQuests.slice(),collectedInspirations:previous.collectedInspirations.slice(),profile:previous.profile.slice()};let effect=null,save=false;
 if(event.type==='TICK'){save=settle(s,now);return {state:save?s:previous,effect,save};}
 function act(action){
  if(action==='greet'){
   if(s.trip&&s.trip.status==='away'){say(s,'我在旅途中，给你留了一盏灯。',now);return;}
   if(now-s.lastGreetingAt<60000&&s.counters.greetings){say(s,'问候收到啦，再陪我坐一会儿吧。',now);return;}
   s.lastGreetingAt=now;s.counters.greetings++;s.affection++;s.mood=Math.min(100,s.mood+4);s.coins+=2;const familiar=Object.values(s.discoveries).sort((a,b)=>b.lastSeen-a.lastSeen)[0];say(s,familiar?'还记得我们一起看的'+familiar.label+'吗？有你在，普通的一天也很特别。':'见到你，心情就变好了。',now);remember(s,'你和大肥鱼打了个招呼，她为你留着一盏灯。','greeting','local',now);save=true;
  }else if(action==='recall'){
   const pinned=s.memories.filter(m=>m.pinned).slice(-1)[0],known=Object.values(s.discoveries).sort((a,b)=>b.encounters-a.encounters)[0];
   say(s,s.profile.length?'你说过「'+s.profile[s.profile.length-1]+'」，我记着呢。':pinned?'你珍藏的那件事，我也记得：'+pinned.text:known?'我记得我们一起看过'+known.label+'，那是很温柔的日常。':'我们才刚刚相识，先一起创造一段回忆吧。',now);
  }else if(action==='feed'){
   if(s.trip&&s.trip.status==='away'){say(s,'等我回来，再一起吃饭吧。',now);return;}if(s.food<1){say(s,'饭团吃完了，去补给站准备一点吧。',now);return;}if(s.energy>=100){say(s,'已经吃饱啦，把饭团留给下一次出发吧。',now);return;}
   s.food--;s.energy=Math.min(100,s.energy+28);s.mood=Math.min(100,s.mood+6);s.counters.feeds++;s.affection++;say(s,'海盐的味道，像一口小小的海。',now);remember(s,'你为她准备了一份海盐饭团。','care','local',now);save=true;
  }else if(action==='rest'){
   if((s.trip&&s.trip.status==='away')||s.restUntil||s.energy>=100){say(s,'现在不用休息，等需要的时候再眯一会儿吧。',now);return;}s.restUntil=now+120000;say(s,'晚安两分钟，醒来继续陪你。',now);remember(s,'她在熟悉的小屋里安心地打了个盹。','care','game',now);save=true;
  }else if(action==='buyFood'){
   if(s.coins<4){say(s,'还差一点潮汐币，先完成一个小心愿吧。',now);return;}if(s.food>=999)return;s.coins-=4;s.food++;say(s,'一份饭团，下一次出发的底气。',now);save=true;
  }else if(action==='observe'){
   if((s.trip&&s.trip.status==='away')||s.restUntil){say(s,'等我旅行或休息结束，再一起看看吧。',now);return;}if(!s.pending){s.page='observe';s.focus=0;s.pending=true;s.observation=null;effect='observe';say(s,'让我仔细看一看……',now);}
  }else if(action==='collect'){
   const o=s.observation&&getObject(s.observation.objectId);if(!o){say(s,'先一起观察一个物体吧。',now);return;}if(s.collectedInspirations.includes(o.inspiration)){say(s,'这份灵感已经好好收着了，可以装进行囊带走。',now);return;}
   s.collectedInspirations.push(o.inspiration);s.coins+=3;s.affection++;if(o.id==='cup')s.food++;say(s,o.id==='plant'?'穹顶花园的路线解锁啦。':'把这份'+o.tag+'，带进下一次旅行。',now);remember(s,'从'+o.label+'收集了「'+o.tag+'」的旅行灵感。','inspiration','simulation',now,{objectId:o.id});save=true;
  }else if(action==='depart'){
   if(s.trip){say(s,s.trip.status==='returned'?'先拆开上一份旅行包吧。':'我已经在路上啦。',now);return;}const d=getDestination(s.selectedDestination);
   if(!destinationUnlocked(s,d.id)){say(s,'路线尚未解锁：'+d.condition+'。',now);return;}if(s.restUntil){say(s,'先等我休息好，再出发吧。',now);return;}if(s.energy<d.energy){say(s,'能量不够，先吃点东西或休息一下。',now);return;}if(s.food<d.food){say(s,'行囊还缺'+d.food+'份饭团，去补给站准备吧。',now);return;}
   s.energy-=d.energy;s.food-=d.food;s.sequence++;s.trip={id:now+'-trip-'+s.sequence,status:'away',route:d.id,destination:d.name,startedAt:now,endsAt:now+d.duration,inspiration:s.equippedInspiration||''};remember(s,'她带着'+d.food+'份饭团，出发去'+d.name+'。','departure','game',now);say(s,'我去'+d.name+'走一走，记得等我的见闻。',now);save=true;
  }else if(action==='claimTrip'){
   if(!s.trip||s.trip.status!=='returned'){say(s,'旅行包还没送到，再等一会儿吧。',now);return;}const d=getDestination(s.trip.route),id=s.trip.id;if(s.cards.some(c=>c.id===id)){s.trip=null;save=true;return;}
   s.cards.push({id,route:d.id,at:now,inspiration:s.trip.inspiration});s.postcards++;s.completedTrips++;s.coins+=d.coins+(s.trip.inspiration?2:0);s.mood=Math.min(100,s.mood+10);s.affection+=2;if(!s.souvenirs.includes(d.souvenir))s.souvenirs.push(d.souvenir);remember(s,d.story,'postcard','game',now);s.trip=null;s.page='home';s.focus=0;say(s,'我回来啦！带了'+d.souvenirName+'，还有一张明信片。',now);save=true;
  }
 }
 if(event.type==='NAVIGATE'&&Object.prototype.hasOwnProperty.call(ACTIONS,event.page)){if(s.pending&&event.page!=='observe'){s.pending=false;effect='cancelVision';}s.page=event.page;s.focus=0;}
 else if(event.type==='MOVE')s.focus=(s.focus+(event.delta<0?-1:1)+ACTIONS[s.page].length)%ACTIONS[s.page].length;
 else if(event.type==='BACK'){if(s.pending){s.pending=false;effect='cancelVision';say(s,'先不看啦。',now);}else{s.page='home';s.focus=0;}}
 else if(event.type==='CONFIRM'){const a=ACTIONS[s.page][s.focus],map={'打个招呼':'greet','喂海盐饭团':'feed','休息片刻':'rest','观察一次':'observe','收集灵感':'collect','打包出发':'depart','拆旅行包':'claimTrip'};if(map[a])act(map[a]);else if(a==='出门旅行'){s.page='travel';s.focus=0;}else if(a==='回到家园'){s.page='home';s.focus=0;}else if(a==='上一条')s.memoryIndex=Math.max(0,s.memoryIndex-1);else if(a==='下一条')s.memoryIndex=Math.min(Math.max(0,s.memories.length-1),s.memoryIndex+1);else if(a==='置顶回忆'&&s.memories[s.memoryIndex]){s.memories[s.memoryIndex]={...s.memories[s.memoryIndex],pinned:!s.memories[s.memoryIndex].pinned};save=true;}}
 else if(event.type==='ACTION')act(event.action);
 else if(event.type==='SELECT_DESTINATION'&&DESTINATIONS.some(d=>d.id===event.id)){s.selectedDestination=event.id;save=true;}
 else if(event.type==='EQUIP_INSPIRATION'){s.equippedInspiration=s.collectedInspirations.includes(event.id)?event.id:null;save=true;}
 else if(event.type==='DECORATE'&&s.souvenirs.includes(event.id)){s.decorations=s.decorations.includes(event.id)?s.decorations.filter(id=>id!==event.id):[...s.decorations,event.id];say(s,'家里又多了一段和你有关的故事。',now);save=true;}
 else if(event.type==='CLAIM_QUEST'){const q=QUESTS.find(q=>q.id===event.id);if(q&&!s.claimedQuests.includes(q.id)&&questComplete(s,q.id)){s.claimedQuests.push(q.id);s.coins+=q.reward;remember(s,'一起完成小心愿：「'+q.title+'」。','milestone','game',now);say(s,'又一起完成一件小事，真好。',now);save=true;}}
 else if(event.type==='PIN_MEMORY'){const i=s.memories.findIndex(m=>m.id===event.id);if(i>=0){s.memories[i]={...s.memories[i],pinned:!s.memories[i].pinned};s.memoryIndex=i;save=true;}}
 else if(event.type==='SELECT_MEMORY'){const i=s.memories.findIndex(m=>m.id===event.id);if(i>=0)s.memoryIndex=i;}
 else if(event.type==='ADD_NOTE'){const note=text(event.text,120).trim();if(note&&!s.profile.includes(note)){s.profile.push(note);remember(s,'你希望她记住：'+note,'note','local',now);say(s,'记住啦，这件事对你很重要。',now);save=true;}}
 else if(event.type==='VISION_RESULT'){
  if(!s.pending)return {state:previous,effect:null,save:false};s.pending=false;const o=event.result&&getObject(event.result.label);
  if(!o)say(s,'还没认出熟悉的物体，试试别的吧。',now);else{const old=s.discoveries[o.id];s.discoveries[o.id]={label:o.label,firstSeen:old?old.firstSeen:now,lastSeen:now,encounters:(old?old.encounters:0)+1};s.observation={label:o.label,objectId:o.id,source:'simulation'};s.counters.observations++;s.mood=Math.min(100,s.mood+2);say(s,old?'又见到'+o.label+'啦，我记得上次我们也一起看过。':o.reaction,now);remember(s,(old?'又一次':'第一次')+'和你一起观察了'+o.label+'。','observation','simulation',now,{objectId:o.id});save=true;}
 }else if(event.type==='VISION_ERROR'){if(!s.pending)return {state:previous,effect:null,save:false};s.pending=false;say(s,'这次信号有点模糊，稍后再一起看吧。',now);}
 else if(event.type==='HIDE'){s.pending=false;effect='cancelVision';}
 if(save)s.updatedAt=now;return {state:s,effect,save};
}
export function frameAt(elapsed){const total=FRAME_DURATIONS.reduce((a,b)=>a+b,0);let t=((elapsed%total)+total)%total;for(let i=0;i<FRAME_DURATIONS.length;i++){if(t<FRAME_DURATIONS[i])return i;t-=FRAME_DURATIONS[i];}return 0;}
export function persistentState(s){const {page,focus,memoryIndex,bubble,bubbleUntil,observation,pending,...persistent}=s;return JSON.parse(JSON.stringify(persistent));}
