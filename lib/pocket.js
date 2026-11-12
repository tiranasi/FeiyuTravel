// Conversation is volatile. The only durable data is a small allowlisted set of badges.
export const BADGES=[
 {id:'hello',glyph:'01',name:'初次接通',description:'完成一句对话。'},
 {id:'look',glyph:'02',name:'共享视线',description:'一起看见一件眼前的物体。'},
 {id:'followup',glyph:'03',name:'聊到一起',description:'接着刚才看见的东西，再聊一句。'},
 {id:'goodnight',glyph:'04',name:'晚安信号',description:'在聊天中互道晚安。'},
];
const allowed=new Set(BADGES.map(b=>b.id));
export const normalizeBadges=raw=>({version:1,unlocked:[...new Set((Array.isArray(raw?.unlocked)?raw.unlocked:[]).filter(id=>allowed.has(id)))].sort()});
export function createPocket({storage,respond,onChange=()=>{}}){
 let state={messages:[],unlocked:[],busy:false,visible:true,status:'当次对话，不存聊天记录',notice:'',error:false,saveError:false},generation=0,saveQueue=Promise.resolve(),saveRevision=0,alive=true;
 const emit=()=>{if(alive)onChange(state);};
 function cancel(){generation++;state={...state,messages:state.busy?state.messages.slice(0,-1):state.messages,busy:false};}
 function save(){
  const snapshot=normalizeBadges(state),revision=++saveRevision;state={...state,status:'正在保存成就'};emit();
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{
   try{const saved=normalizeBadges(await storage.write(snapshot)||snapshot);state={...state,unlocked:normalizeBadges({unlocked:[...state.unlocked,...saved.unlocked]}).unlocked};if(revision===saveRevision)state={...state,saveError:false,status:'成就已保存 · 对话仅在本次保留'};}
   catch(error){if(revision===saveRevision)state={...state,saveError:true,error:true,status:'成就保存失败，本次仍可聊天',notice:'请重试保存；聊天内容不会写入存档。'};}
   emit();
  });return saveQueue;
 }
 async function request(input){
  if(!alive||!state.visible||state.busy)return;
  const text=String(input.text||'').trim().slice(0,240);if(!text&&!input.object)return;
  const token=++generation,entry={role:'user',content:input.object?'一起看看：'+input.object:text,...(input.object?{object:input.object}:{})};
  const history=state.messages.slice(-12);state={...state,busy:true,error:false,notice:'',messages:[...history,entry]};emit();
  try{
   const reply=await respond({history,input:{text,object:input.object||null}});
   if(!alive||!state.visible||token!==generation)return;
   // A cancelled, failed or merely submitted request never awards an achievement.
   const signals=(Array.isArray(reply.signals)?reply.signals:[]).filter(id=>allowed.has(id));
   // The real host can return a valid tool call with an empty text answer.
   const fallback={goodnight:'晚安。我们下次再见。',followup:'我们接着刚才的话题聊。',look:'一起看见了眼前的小东西。',hello:'我在，听见你的声音啦。'};
   const answer=String(reply.text||fallback[signals[0]]||'').slice(0,500);if(!answer)throw Error('没有收到回答');
   const next=normalizeBadges({unlocked:[...state.unlocked,'hello',...signals]}).unlocked;
   const added=next.filter(id=>!state.unlocked.includes(id));
   state={...state,busy:false,messages:[...state.messages,{role:'assistant',content:answer}].slice(-12)};
   if(added.length){
    state={...state,unlocked:next,status:'正在保存成就',notice:'解锁 · '+BADGES.filter(b=>added.includes(b.id)).map(b=>b.name).join(' / ')};emit();
    save();
   }else if(!state.saveError)state={...state,status:'对话仅在本次保留'};
   emit();
  }catch(error){if(alive&&state.visible&&token===generation){state={...state,messages:state.messages.slice(0,-1),busy:false,error:true,status:'本次请求未完成',notice:'没有取得回答，请重试。'};emit();}}
 }
 return {get state(){return state;},async load(){try{state={...state,...normalizeBadges(await storage.read())};}catch(error){state={...state,error:true,status:'成就读取失败，原数据未清除'};}emit();},talk(text){return request({text});},observe(object){return request({object});},
  newConversation(){cancel();state={...state,messages:[],notice:'新的一次相遇。',status:'已清空当次对话，成就保留'};emit();},
  hide(){cancel();state={...state,visible:false,messages:[],status:'下次从新话题开始，成就保留'};emit();},show(){state={...state,visible:true};emit();},cancel(){cancel();emit();},
  retrySave(){state={...state,error:false};return save();},
  flush(){return saveQueue;},destroy(){cancel();alive=false;state={...state,messages:[]};}
 };
}

// Local preview only. The glasses adapter will use its built-in model, not these rules.
export async function demoRespond({history,input}){
 await new Promise(resolve=>setTimeout(resolve,500));
 if(input.object)return {text:input.object==='毛绒玩具'?'这只毛绒玩具看起来很好抱。让我也在它旁边待一小会儿吧。':'我看到'+input.object+'了。原来你的日常，是这样的呀。',signals:['look']};
 const previous=[...history].reverse().find(m=>m.object)?.object;
 if(/晚安|睡觉|good\s*night/i.test(input.text))return {text:'晚安。把今天放轻一点，我们下次再见。',signals:['goodnight']};
 if(previous&&/它|刚才|那个|这个|继续/.test(input.text))return {text:'你说的是刚才的'+previous+'吧？如果可以，我想陪你和它一起发一会儿呆。',signals:['followup']};
 return {text:/累|烦|难过/.test(input.text)?'那我们先慢一点。我在这里，你可以再说一句，也可以什么都不做。':'听见啦。今天不赶路，就在这里陪你聊一会儿。',signals:[]};
}
