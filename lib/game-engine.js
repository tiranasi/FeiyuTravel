import {createState,restoreState,reduceState,persistentState} from './pet-state.js';
export function createPetEngine({clock,storage,vision,onChange=()=>{}}){
 let state=createState(clock.now()),token=0,active=true,armed=false,destroyed=false,persistence='尚未写入',queue=Promise.resolve(),revision=0;
 const notify=()=>{if(!destroyed)onChange(state,{persistence,active});};
 function save(){const snapshot=persistentState(state),current=++revision;persistence='正在保存';notify();queue=queue.catch(()=>{}).then(()=>storage.write(snapshot)).then(()=>{if(current===revision){persistence='已保存到本机';notify();}},error=>{if(current===revision){persistence='保存失败：'+String(error.message||error);notify();}});return queue;}
 function send(event){if(destroyed)return;const old=state,result=reduceState(state,event,clock.now());state=result.state;if(result.effect==='cancelVision')token++;if(result.save)save();else if(event.type!=='TICK'||state!==old)notify();
  if(result.effect==='observe'){const request=++token;Promise.resolve().then(()=>vision.observe()).then(result=>{if(active&&!destroyed&&request===token)send({type:'VISION_RESULT',result});},()=>{if(active&&!destroyed&&request===token)send({type:'VISION_ERROR'});});}}
 return {get state(){return state;},get active(){return active;},get persistence(){return persistence;},
 async load(){try{const raw=await storage.read();if(raw){if(![1,2].includes(raw.version)||!Array.isArray(raw.memories))persistence='存档格式不兼容，原存档已保留';else{state=restoreState(raw,clock.now());if(raw.version!==2||state.updatedAt!==raw.updatedAt)await save();else persistence='已恢复本机存档';}}}catch(error){persistence='存档不可读，原记录未主动清除';}notify();},
 send(event){if(active)send(event);},tick(){if(active)send({type:'TICK'});},keyDown(code){if(active&&code==='Enter')armed=true;},
 keyUp(code){if(!active)return;if(code==='Enter'){const accepted=armed;armed=false;if(accepted)send({type:'CONFIRM'});}else if(code==='ArrowUp')send({type:'MOVE',delta:-1});else if(code==='ArrowDown')send({type:'MOVE',delta:1});else if(code==='Backspace'||code==='Escape')send({type:'BACK'});},
 tap(){if(active){armed=false;send({type:'CONFIRM'});}},hide(){if(destroyed)return;active=false;armed=false;token++;send({type:'HIDE'});notify();},show(){if(destroyed)return;active=true;armed=false;send({type:'TICK'});notify();},
 exportState(){return persistentState(state);},async importState(raw){if(!raw||![1,2].includes(raw.version)||!Array.isArray(raw.memories))throw Error('这不是受支持的桌宠存档');token++;state=restoreState(raw,clock.now());await save();if(persistence.startsWith('保存失败'))throw Error(persistence);},flush(){return queue;},
 destroy(){token++;armed=false;active=false;destroyed=true;state={...state,pending:false};}}
}
