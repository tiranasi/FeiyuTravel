import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),source=path.join(root,'probe'),stage=path.join(root,'build/runtime-probe');
const cli=path.join(root,'../skymate_v15/node_modules/@yodaos-pkg/aix-cli/dist/cli.js');
const serial='1906092618121455',mode=process.argv[2]||'launch',probeMode=process.argv[3]||'read';
function run(args){const p=spawnSync(process.execPath,[cli,...args],{stdio:'inherit',cwd:root});if(p.status!==0)throw Error('aix failed');}
if(mode==='install'){
 fs.mkdirSync(stage,{recursive:true});fs.cpSync(source,stage,{recursive:true});fs.mkdirSync(path.join(stage,'.aix'),{recursive:true});fs.writeFileSync(path.join(stage,'.aix/agent-id'),'dafeiyu-runtime-probe-20261112\n');
 const ink=fs.readFileSync(path.join(stage,'pages/index/index.ink'),'utf8'),js=ink.match(/<script setup>([\s\S]*?)<\/script>/)[1];
 const syntax=spawnSync(process.execPath,['--check','--input-type=module'],{input:js,encoding:'utf8'});if(syntax.status!==0)throw Error(syntax.stderr);
 run(['install',stage,'-s',serial]);
}else if(mode!=='launch')throw Error('expected install or launch');
run(['launch-page',stage,'pages/index/index','-s',serial,'--params',JSON.stringify({mode:probeMode})]);
