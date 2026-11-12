import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const folder=new URL('../../build/pocket-evidence/',import.meta.url);await fs.mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1536,height:1000}}),page=await context.newPage();
const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));
const ready=p=>p.waitForFunction(()=>document.getElementById('loading').hidden);
const record=label=>{checks.push(label);console.log('PASS '+label);};
const settled=async()=>{await page.waitForFunction(()=>!document.getElementById('send').disabled);await page.waitForFunction(()=>!document.getElementById('save-status').textContent.includes('正在保存'));};
async function say(text){await page.locator('#message').fill(text);await page.locator('#send').click();await settled();}
const saved=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('dafeiyu-pocket-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('badges').objectStore('badges').get('main');q.onsuccess=()=>{resolve(q.result);db.close();};};}));
try{
 await page.goto('http://127.0.0.1:4173/');await ready(page);await page.screenshot({path:fileURLToPath(new URL('desktop.png',folder)),fullPage:true});assert.deepEqual(await page.locator('#pet').evaluate(c=>[c.width,c.height]),[480,320]);record('single-screen 480x320 green Canvas with eight cached frames');
 await say('你好，我的秘密是蓝色小岛');assert.equal(await page.locator('#badge-count').textContent(),'1 / 4');await page.locator('#observe').click();await settled();assert.equal(await page.locator('#badge-count').textContent(),'2 / 4');await say('它能陪我们做什么？');assert.ok((await page.locator('#messages').textContent()).includes('刚才的毛绒玩具'));await say('晚安');assert.equal(await page.locator('#badge-count').textContent(),'4 / 4');record('conversation, explicit observation, follow-up and goodnight unlock four badges');
 assert.deepEqual(await saved(),{version:1,unlocked:['followup','goodnight','hello','look']});await page.reload();await ready(page);assert.equal(await page.locator('.message').count(),0);assert.equal(await page.locator('#badge-count').textContent(),'4 / 4');assert.ok(!(await page.locator('#messages').textContent()).includes('秘密'));record('reload keeps only badges and resets the conversation');
 await page.locator('#open-badges').click();assert.equal(await page.locator('.badge.unlocked').count(),4);await page.screenshot({path:fileURLToPath(new URL('badges.png',folder)),fullPage:true});await page.locator('#close-badges').click();
 await page.locator('#observe').click();await page.locator('#new-conversation').click();await page.waitForTimeout(700);assert.equal(await page.locator('.message').count(),0);assert.equal(await page.locator('#badge-count').textContent(),'4 / 4');record('reset cancels an in-flight observation without adding a late response');
 const merged=await page.evaluate(async()=>{const {achievementStorage}=await import('/web/pocket-storage.js');const a=achievementStorage(),b=achievementStorage();await Promise.all([a.write({unlocked:['hello']}),b.write({unlocked:['look']})]);return a.read();});assert.equal(merged.unlocked.length,4);record('simultaneous windows cannot erase previously earned badges');
 await page.locator('#talk-focus').click();await page.locator('#pet').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await settled();assert.ok(await page.locator('.message.user').count()>0);record('glasses-style selection and paired confirmation trigger one observation');
 for(const width of [320,375,768]){await page.setViewportSize({width,height:900});await page.screenshot({path:fileURLToPath(new URL('width-'+width+'.png',folder)),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}record('320, 375 and 768-pixel layouts have no horizontal overflow');
 assert.deepEqual(errors,[]);await fs.writeFile(new URL('report.json',folder),JSON.stringify({checks,errors,browser:await browser.version()},null,2));
}finally{await browser.close();}
