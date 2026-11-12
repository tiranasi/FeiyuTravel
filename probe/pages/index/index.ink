<script def>
{"navigationBarTitleText":"运行诊断","description":"测试本次会话与关闭、重启后的成就记录","schema":{"data":{"type":"object","properties":{"mode":{"type":"string"}}}}}
</script>
<script setup>
import wx from 'wx';
import {LanguageModel} from 'language-model';
const KEY='dafeiyu.runtime-probe.v1';
function stable(value){if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value);}
let moduleLoads=0;
export default {
 data:{mode:'seed',status:'准备测试',detail:'请保持眼镜连接',result:''},
 onLoad(options){
  this.run=Date.now()+'-'+Math.floor(Math.random()*10000);this.dead=false;this.sessions=[];moduleLoads++;
  this.mode=(options&&options.mode)||this.data.mode||'seed';
  this.log('load',{mode:this.mode,moduleLoads,options:options||null});
 },
 onReady(){this.start();},
 onShow(){this.log('show',{});},
 onHide(){this.log('hide',{});this.cancel();},
 onUnload(){this.log('unload',{});this.cancel();},
 cancel(){this.dead=true;this.sessions.forEach(s=>{try{s.destroy();}catch(e){}});this.sessions=[];},
 log(type,value){console.log('[pet-probe] '+JSON.stringify({run:this.run,type,value}));},
 async session(history){const s=await LanguageModel.create({initialPrompts:[{role:'system',content:'这是简短的会话测试。只回答问题，不编造之前没有提供的暗号；不知道时只回答“不知道”。'},...(history||[])]});this.sessions.push(s);return s;},
 async ask(session,label,input){
  if(this.dead)throw Error('page hidden');this.setData({status:label});const begin=Date.now();let timer;
  try{const answer=await Promise.race([session.prompt(input),new Promise((_,reject)=>{timer=setTimeout(()=>{session.destroy();reject(Error('35s timeout'));},35000);})]);this.log('answer',{label,ms:Date.now()-begin,answer,inputChars:typeof input==='string'?input.length:JSON.stringify(input).length});return answer;}
  finally{if(timer)clearTimeout(timer);}
 },
 async start(){
  try{
   let record=wx.getStorageSync(KEY);this.log('read',{exists:!!record,token:record&&record.token,opens:record&&record.opens,payloadLength:record&&record.payload&&record.payload.length,achievements:record&&record.achievements,history:record&&record.history});
   if(!record){record={version:1,token:'pet-'+this.run,opens:0,createdAt:Date.now(),payload:'存档校验-大肥鱼'.repeat(1024),achievements:['初次相遇'],history:[]};}
   record.opens++;record.lastRun=this.run;wx.setStorageSync(KEY,record);
   const back=wx.getStorageSync(KEY);this.log('storage-check',{equal:stable(back)===stable(record),token:back.token,opens:back.opens,payloadLength:back.payload.length,payloadEqual:back.payload===record.payload});
   this.record=record;
   if(this.mode==='read'){this.setData({status:'存档读取完成',detail:'启动次数 '+record.opens,result:record.token});this.log('done',{mode:this.mode,token:record.token,opens:record.opens});return;}
   const available=await LanguageModel.availability();this.log('availability',{available});
   if(available!=='available')throw Error('model unavailable');
   if(this.mode==='seed'){
    const secret='青鱼'+Math.floor(100000+Math.random()*899999);const s=await this.session();
    await this.ask(s,'第一轮：提供暗号','本次对话的暗号是“'+secret+'”。请只回复“收到”。');
    const answer=await this.ask(s,'第二轮：同会话回忆','刚才我告诉你的暗号是什么？只回答暗号。');
    this.log('same-session',{pass:answer.includes(secret)});s.destroy();
    const fresh=await this.session();const blank=await this.ask(fresh,'第三轮：新会话隔离','上一段对话的暗号是什么？只回答暗号，不知道就回答不知道。');fresh.destroy();
    this.log('new-session',{leaked:blank.includes(secret),answer:blank});
    record.history=[{role:'user',content:'本次对话的暗号是“'+secret+'”。'},{role:'assistant',content:'收到。'}];record.expected=secret;
    record.achievements.push('对话测试完成');wx.setStorageSync(KEY,record);
   }else if(this.mode==='replay'){
    const s=await this.session();const blank=await this.ask(s,'重开后：空白会话','上一段对话的暗号是什么？只回答暗号，不知道就回答不知道。');s.destroy();
    this.log('reopened-empty',{leaked:!!record.expected&&blank.includes(record.expected),answer:blank});
    const restored=await this.session(record.history);const answer=await this.ask(restored,'重开后：显式补入两条上下文','之前告诉你的暗号是什么？只回答暗号。');restored.destroy();
    this.log('explicit-replay',{pass:!!record.expected&&answer.includes(record.expected)});
   }else if(this.mode==='award'){
    let unlocked=false;
    const s=await LanguageModel.create({initialPrompts:[{role:'system',content:'你是桌宠大肥鱼。用户表达晚安时调用 unlock_achievement，achievementId 必须是 goodnight。完成后简短道晚安。'}],tools:[{type:'function',function:{name:'unlock_achievement',description:'用户与桌宠道晚安时授予成就',parameters:{type:'object',properties:{achievementId:{type:'string',enum:['goodnight']}},required:['achievementId']}}}]});this.sessions.push(s);
    s.addEventListener('toolcall',event=>{const valid=event.isComplete===true&&event.functionName==='unlock_achievement'&&event.arguments&&event.arguments.achievementId==='goodnight';if(valid&&!this.dead)unlocked=true;this.log('toolcall',{name:event.functionName,arguments:event.arguments,valid:!!valid});});
    await this.ask(s,'自然对话触发晚安成就','大肥鱼，今天聊得很开心。我要睡觉了，晚安！');s.destroy();
    if(unlocked&&!record.achievements.includes('goodnight')){record.achievements.push('goodnight');wx.setStorageSync(KEY,record);}this.log('achievement-check',{pass:unlocked});
   }else if(this.mode==='length'){
    const secret='海盐'+Math.floor(100000+Math.random()*899999);const text='开头测试标记：'+secret+'。'+('这是一段与标记无关的城市散步背景资料。'.repeat(440));
    const s=await this.session();await this.ask(s,'较长上下文：录入约8千字',text+'\n请只回复收到。');const answer=await this.ask(s,'较长上下文：回忆开头标记','开头的测试标记是什么？只回答标记。');s.destroy();this.log('length-check',{chars:text.length,pass:answer.includes(secret)});
   }
   this.setData({status:'测试完成',detail:'已记录结果，可安全关闭',result:'启动 '+record.opens+' 次 · '+record.achievements.length+' 成就'});this.log('done',{mode:this.mode,token:record.token,opens:record.opens});
  }catch(error){this.setData({status:'测试未完成',detail:String(error.message||error)});this.log('error',{message:String(error.message||error),error:String(error.stack||error)});}
 },
 onKeyDown(){},
 onKeyUp(event){const code=event&&(event.code||event.key||event.keyCode);if(code==='Backspace'||code==='Escape'||code==='Back'||code===4||code===8||code===27){if(event.preventDefault)event.preventDefault();this.cancel();this.log('finish',{});window.close();}},
};
</script>
<page><view class="root"><text class="title">大肥鱼 · 独立运行诊断</text><text class="status">{{status}}</text><text>{{detail}}</text><text>{{result}}</text><text class="hint">测试结束后双击退出</text></view></page>
<style>.root{width:480px;height:320px;background-color:#000000;padding:28px;display:flex;flex-direction:column;gap:18px;color:#00ff88;font-size:20px;}.title{font-size:24px;}.status{font-size:26px;}.hint{font-size:16px;color:#55bb77;}</style>
