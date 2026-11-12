import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const request=new URL(req.url,'http://127.0.0.1');let target=decodeURIComponent(request.pathname);
    if(target==='/')target='/web/lvfeiyu.html';
    if((!/^\/(web|lib)\/[a-zA-Z0-9_.\/-]+$/.test(target)&&!/^\/assets\/[ab]-[0-7]\.png$/.test(target))||target.includes('..')||!['.html','.css','.js','.jpg','.png','.svg'].includes(path.extname(target))){res.writeHead(404);res.end('Not found');return;}
    const file=path.resolve(root,'.'+target);if(!file.startsWith(root)){res.writeHead(404);res.end();return;}
    const data=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'"});
    res.end(req.method==='HEAD'?undefined:data);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end('Unable to serve file');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is occupied. Reuse the existing preview or choose another PORT.`:error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`大肥鱼本机开发室: http://127.0.0.1:${port}\nLocal-only server; no cloud or model calls. Ctrl+C to stop.`));
