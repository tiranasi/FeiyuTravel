import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const frames={};
for(const kind of ['a','b']){
  frames[kind]=[];
  for(let i=0;i<8;i++){
    const bytes=await fs.readFile(new URL(`build/rgba/${kind}-${i}.rgba`,root));
    assert.equal(bytes.length,180*240*4);
    const encoded=bytes.toString('base64');
    assert.deepEqual(Buffer.from(encoded,'base64'),bytes);
    frames[kind].push(encoded);
  }
}
await fs.mkdir(new URL('lib/',root),{recursive:true});
await fs.writeFile(new URL('lib/frame-data.js',root),
  '// Generated from user-selected PNGs at the maximum display size; straight RGBA, not premultiplied.\n'+
  'export const WIDTH=180;\nexport const HEIGHT=240;\nexport const FRAMES='+JSON.stringify(frames)+';\n');
console.log('Prepared 16 losslessly encoded RGBA buffers at 180x240 for Canvas cache. '+fileURLToPath(new URL('lib/frame-data.js',root)));
