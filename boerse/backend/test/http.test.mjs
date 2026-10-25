import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHandler} from '../http.mjs';
import {fixture,origin} from './memory.mjs';
async function withServer(fn){
 const f=fixture(),server=http.createServer(createHandler({service:f.service,origin}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const root=`http://127.0.0.1:${server.address().port}`;
 try{await fn(root,f);}finally{await new Promise(resolve=>server.close(resolve));}
}
test('POST requests require exact origin, JSON and custom header',()=>withServer(async root=>{
 const path=root+'/api/register/options',body=JSON.stringify({phone:'+41791234567',name:'Parent'});
 for(const headers of [{},{Origin:'https://evil.example','Content-Type':'application/json','X-Gugu-Request':'1'},{Origin:origin,'Content-Type':'text/plain','X-Gugu-Request':'1'},{Origin:origin,'Content-Type':'application/json'}]){
  assert.equal((await fetch(path,{method:'POST',headers,body})).status,403);
 }
 const r=await fetch(path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Gugu-Request':'1'},body});
 assert.equal(r.status,200);assert.ok((await r.json()).options.challenge);
}));
test('legacy SMS routes are unavailable; directory is admin-only',()=>withServer(async root=>{
 for(const path of ['/api/start','/api/finish','/api/admin/invite']){
  const r=await fetch(root+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Gugu-Request':'1'},body:'{}'});assert.equal(r.status,404);
 }
 assert.equal((await fetch(root+'/api/admin/members')).status,403);
 assert.equal((await fetch(root+'/api/admin/registrations')).status,403);
}));
test('frontend serves local WebAuthn bundle and restrictive security headers',()=>withServer(async root=>{
 const r=await fetch(root+'/boerse/');assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.match(await r.text(),/Create my passkey/);
 const bundle=await fetch(root+'/boerse/webauthn.js');assert.equal(bundle.status,200);assert.match(await bundle.text(),/SimpleWebAuthnBrowser/);
 assert.equal((await fetch(root+'/boerse/backend/.env')).status,404);
}));
