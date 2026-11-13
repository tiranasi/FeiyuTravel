import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const cli=path.join(root,'../skymate_v15/node_modules/@yodaos-pkg/aix-cli/dist/cli.js');
const stage=path.join(root,'build/staging');
const mode=process.argv[2]||'check';
const option=name=>{const i=process.argv.indexOf('--'+name);return i<0?undefined:process.argv[i+1];};
const serial=option('serial')||'1906092618121455';
function run(command,args,capture=false,input){
  const r=spawnSync(command,args,{cwd:root,encoding:'utf8',input,stdio:capture?'pipe':'inherit',maxBuffer:16*1024*1024});
  if(r.error)throw r.error;
  if(r.status!==0)throw Error((r.stderr||r.stdout||'Command failed').slice(-4000));
  return r.stdout;
}
const aix=(args,capture=false)=>run(process.execPath,[cli,...args],capture);
const PERMISSIONS=['network','microphone','audio','RECORD_AUDIO','CAMERA'];
const LIB=['app.js','camera.js','card-data.js','content.js','draw.js','game.js','motion.js','gift-data.js','postcards.js','qban-data.js','scenes.js','sprite-data.js','sprites.js','title.js'];
// 新页面只允许调用真机已画出的 Canvas 方法。
const UNVERIFIED=/ctx\.(?:scale|rect|ellipse|translate|transform|setTransform|getImageData|createPattern)\s*\(|globalCompositeOperation\s*=\s*['"]lighter/;
async function check(){
  const app=JSON.parse(await fs.readFile(path.join(root,'app.json'),'utf8'));
  assert.deepEqual(app.permissions,PERMISSIONS);
  assert.equal(app.version,JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version);
  assert.deepEqual(app.pages,['pages/home/index']);
  assert.equal(app.entryPagePath,'pages/home/index');
  const ink=await fs.readFile(path.join(root,'pages/home/index.ink'),'utf8');
  JSON.parse(ink.match(/<script def>([\s\S]*?)<\/script>/)[1]);
  const script=ink.match(/<script setup>([\s\S]*?)<\/script>/)[1];
  run(process.execPath,['--check','--input-type=module'],true,script);
  run(process.execPath,['--check','app.js'],true);
  assert.equal((ink.match(/<page>/g)||[]).length,1);
  assert.ok(!/\b(?:App|Page|Widget)\s*\(/.test(script));
  assert.ok(!/<image\b/.test(ink),'Canvas page must not use image components');
  assert.ok(script.includes('ctx.flush()'));
  for(const file of LIB){
    const src=await fs.readFile(path.join(root,'lib',file),'utf8');
    run(process.execPath,['--check',path.join('lib',file)],true);
    assert.ok(!UNVERIFIED.test(src),`${file} uses an unverified Canvas call`);
    assert.ok(!/\b(?:document|localStorage|window)\./.test(src),`${file} must not touch DOM/localStorage`);
  }
  run(process.execPath,['--test','tests/lvfeiyu.test.mjs'],true);
  console.log('PASS: 旅行肥鱼 page, shared lib syntax, Canvas whitelist, logic/render tests, permissions '+PERMISSIONS.join(','));
}
async function prepare(){
  await fs.mkdir(stage,{recursive:true});
  await fs.rm(stage,{recursive:true,force:true});
  for(const name of ['app.json','app.js','AGENTS.md'])await fs.cp(path.join(root,name),path.join(stage,name));
  await fs.mkdir(path.join(stage,'pages/home'),{recursive:true});
  await fs.cp(path.join(root,'pages/home/index.ink'),path.join(stage,'pages/home/index.ink'));
  await fs.mkdir(path.join(stage,'lib'),{recursive:true});
  for(const file of LIB)await fs.cp(path.join(root,'lib',file),path.join(stage,'lib',file));
  await fs.mkdir(path.join(stage,'.aix'),{recursive:true});
  await fs.writeFile(path.join(stage,'.aix/agent-id'),'lvfeiyu-20261112\n');
  const def=JSON.parse(aix(['show',stage,'--compact'],true));
  assert.equal(def.agentId,'develop.rokid.agent.lvfeiyu-20261112');
  console.log('Prepared independent agent '+def.agentId);
}
function closePage(){
  for(let i=0;i<4;i++){run('adb',['-s',serial,'shell','input','keyevent','4'],true);run('adb',['-s',serial,'shell','sleep','0.3'],true);}
}
function launch(){
  closePage();
  const params=option('params');if(params)JSON.parse(params);
  aix(['launch-page',stage,option('page')||'pages/home/index','-s',serial,...(params?['--params',params]:[])]);
}
async function main(){
  assert.ok(['check','pack','install','launch'].includes(mode));
  if(mode==='launch'){launch();return;}
  await check();await prepare();
  if(mode==='check')return;
  await fs.mkdir(path.join(root,'dist'),{recursive:true});
  const app=JSON.parse(await fs.readFile(path.join(root,'app.json'),'utf8'));
  const artifact=path.join(root,`dist/lvfeiyu-${app.version}.aix`);
  aix(['pack',stage,'-o',artifact]);
  const list=aix(['list',artifact],true);
  for(const file of LIB)assert.ok(list.includes('lib/'+file),file);
  assert.ok(list.includes('pages/home/index.ink'));
  console.log('PASS: packed archive includes page and all shared lib files.');
  if(mode==='install'){closePage();aix(['install',stage,'-s',serial]);launch();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
