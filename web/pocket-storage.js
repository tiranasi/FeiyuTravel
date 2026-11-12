import {normalizeBadges} from '../lib/pocket.js';
// A new, separate store leaves all previous game saves untouched.
export function achievementStorage(){let opening;
 const database=()=>opening||(opening=new Promise((resolve,reject)=>{const r=indexedDB.open('dafeiyu-pocket-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('badges');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}));
 return {async read(){const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction('badges').objectStore('badges').get('main');r.onsuccess=()=>resolve(normalizeBadges(r.result));r.onerror=()=>reject(r.error);});},async write(value){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('badges','readwrite'),s=tx.objectStore('badges'),r=s.get('main');let saved;r.onsuccess=()=>{saved=normalizeBadges({unlocked:[...normalizeBadges(r.result).unlocked,...normalizeBadges(value).unlocked]});s.put(saved,'main');};tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('保存中断'));});}};
}
