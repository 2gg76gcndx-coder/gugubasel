import {readFile} from 'node:fs/promises';
import {cookie,sessionCookie} from './security.mjs';
const publicFiles=new Map([
 ['/boerse/', ['index.html','text/html; charset=utf-8']],
 ['/boerse/app.js',['app.js','text/javascript; charset=utf-8']],
 ['/boerse/style.css',['style.css','text/css; charset=utf-8']]
]);
const headers={
 'Cache-Control':'no-store',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'Strict-Transport-Security':'max-age=31536000',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
};
export function createHandler({service,origin,trustLocalProxy=false}) {
 return async(req,res)=>{
  for(const [k,v] of Object.entries(headers)) res.setHeader(k,v);
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  try {
    const path=new URL(req.url,origin).pathname;
    if(req.method==='GET' && path==='/boerse') {res.writeHead(302,{Location:'/boerse/'});return res.end();}
    if(req.method==='GET' && publicFiles.has(path)) {
      const [file,type]=publicFiles.get(path);res.writeHead(200,{'Content-Type':type});return res.end(await readFile(new URL(`../public/${file}`,import.meta.url)));
    }
    if(req.method==='GET' && path==='/boerse/webauthn.js') {
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});
      return res.end(await readFile(new URL('./node_modules/@simplewebauthn/browser/dist/bundle/index.umd.min.js',import.meta.url)));
    }
    const session=sessionCookie(req.headers.cookie);
    if(req.method==='GET' && path==='/api/me') return json(200,await service.me(session));
    if(req.method==='GET' && path==='/api/admin/registrations') return json(200,await service.pending(session));
    if(req.method==='GET' && path==='/api/admin/members') return json(200,await service.members(session));
    if(req.method!=='POST' || !path.startsWith('/api/')) return json(404,{error:'Not found.'});
    if(req.headers.origin!==origin || req.headers['x-gugu-request']!=='1' || !(req.headers['content-type']??'').startsWith('application/json')) return json(403,{error:'Request not allowed.'});
    let body='';
    for await(const chunk of req) {body+=chunk;if(Buffer.byteLength(body)>65536) {json(413,{error:'Request too large.'});req.destroy();return;}}
    let input;try{input=JSON.parse(body);}catch{return json(400,{error:'Invalid request.'});}
    if(!input || typeof input!=='object' || Array.isArray(input)) return json(400,{error:'Invalid request.'});
    let ip=req.socket.remoteAddress;
    if(trustLocalProxy && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip)) ip=String(req.headers['x-forwarded-for']??ip).split(',')[0].trim();
    if(path==='/api/register/options') return json(200,await service.registerOptions(input,ip));
    if(path==='/api/register/finish') return json(200,await service.registerFinish(input,ip));
    if(path==='/api/login/options') return json(200,await service.loginOptions(input,ip));
    if(path==='/api/login/finish') {
      const result=await service.loginFinish(input,ip);res.setHeader('Set-Cookie',cookie(result.session,14*86400));return json(200,{member:result.member});
    }
    if(path==='/api/logout') {await service.logout(session);res.setHeader('Set-Cookie',cookie('',0));return json(200,{ok:true});}
    if(path==='/api/admin/approve') return json(200,await service.approve(session,input));
    if(path==='/api/admin/reject') return json(200,await service.reject(session,input));
    if(path==='/api/admin/deactivate') return json(200,await service.deactivate(session,input));
    return json(404,{error:'Not found.'});
  } catch(e) {
    // No phone numbers, credentials, registration references or session cookies in logs.
    const known=e.status || /^(Use |Invalid |Please )/.test(e.message);
    if(!known) console.error('Borse request failed',e.code??'internal');
    json(e.status??(known?400:503),{error:known?e.message:'Service unavailable. Please try again later.'});
  }
};
}
