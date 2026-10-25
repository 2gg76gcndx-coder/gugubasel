import http from 'node:http';
import {createHandler} from './http.mjs';
import {createService} from './service.mjs';
import {transaction,rate} from './oracle.mjs';
import {createWebAuthn} from './webauthn.mjs';
import {repository} from './repository.mjs';
import {phone} from './security.mjs';
const required=['PUBLIC_ORIGIN','ORACLE_USER','ORACLE_PASSWORD','ORACLE_CONNECT_STRING','ADMIN_WHATSAPP_NUMBER','RATE_LIMIT_SECRET'];
for(const key of required) if(!process.env[key]) throw new Error(`Missing configuration: ${key}`);
const origin=new URL(process.env.PUBLIC_ORIGIN).origin;
if(!origin.startsWith('https://') || origin!==process.env.PUBLIC_ORIGIN || process.env.RATE_LIMIT_SECRET.length<32) throw new Error('Use a canonical HTTPS origin without a trailing slash, and a random rate limit secret.');
const service=createService({
  transaction:fn=>transaction(db=>fn(repository(db))),
  rateTransaction:(key,max,minutes)=>transaction(db=>rate(db,key,max,minutes)),
  webauthn:createWebAuthn(origin),secret:process.env.RATE_LIMIT_SECRET,
  adminWhatsApp:phone(process.env.ADMIN_WHATSAPP_NUMBER),
});
http.createServer(createHandler({service,origin,trustLocalProxy:process.env.TRUST_LOCAL_PROXY==='true'})).listen(Number(process.env.PORT??3000),'127.0.0.1',()=>console.log('Gugu Borse backend listening on loopback.'));
