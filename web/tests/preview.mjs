import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const folder=new URL('../../build/game-evidence/',import.meta.url);await fs.mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:1536,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>document.getElementById('loading').hidden,{timeout:15000});await page.screenshot({path:new URL('pocket-first.png',folder).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});console.log(JSON.stringify({errors,title:await page.title(),ready:await page.locator('#cache-status').textContent()}));}finally{await browser.close();}
