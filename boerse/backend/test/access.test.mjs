import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './memory.mjs';
import {authenticator} from './authenticator.mjs';
import {phone,hash,token,reference,cookie,sessionCookie} from '../security.mjs';
import {approveRegistration} from '../service.mjs';
const ip='127.0.0.1',number='+41791234567';
async function pending(f,p=number){
 const a=authenticator(),start=await f.service.registerOptions({phone:p,name:'Parent'},ip);
 const response=a.registration(start.options),result=await f.service.registerFinish({ceremony:start.ceremony,response},ip);
 return {a,start,result};
}
async function approve(f,p){const admin=await f.admin();await f.service.approve(admin,{reference:p.result.reference,senderPhone:number,communityConfirmed:true});return admin;}
async function login(f,a,count=1){const start=await f.service.loginOptions({phone:number},ip);return f.service.loginFinish({ceremony:start.ceremony,response:a.assertion(start.options,{count})},ip);}

test('register → WhatsApp approval → real signed passkey login',async()=>{
 const f=fixture(),p=await pending(f);assert.equal(f.state.sessions.length,0);
 assert.equal(f.state.registrations[0].STATUS,'pending');assert.equal(f.state.keys[0].MEMBER_ID,null);
 assert.match(p.result.whatsappUrl,/^https:\/\/wa.me\/41790000000\?text=/);
 await assert.rejects(f.service.loginOptions({phone:number},ip));
 await approve(f,p);const result=await login(f,p.a);
 assert.equal(result.member.name,'Parent');assert.equal((await f.service.me(result.session)).id,result.member.id);
 assert.equal(f.state.sessions.at(-1).TOKEN_HASH,hash(result.session));
 assert.equal(f.state.keys[0].SIGN_COUNT,1);
});
test('entering someone else’s number creates no access or approved key',async()=>{
 const f=fixture();await pending(f);assert.equal(f.state.members.length,0);await assert.rejects(f.service.loginOptions({phone:number},ip));
});
test('approval requires actual sender number AND community confirmation',async()=>{
 const f=fixture(),p=await pending(f),admin=await f.admin();
 await assert.rejects(f.service.approve(admin,{reference:p.result.reference,senderPhone:'+41791111111',communityConfirmed:true}));
 await assert.rejects(f.service.approve(admin,{reference:p.result.reference,senderPhone:number,communityConfirmed:false}));
 assert.equal(f.state.keys[0].MEMBER_ID,null);
});
test('approval binds only the exact reference; other claims for that number are rejected',async()=>{
 const f=fixture(),attacker=await pending(f),legitimate=await pending(f);await approve(f,legitimate);
 assert.equal(f.state.registrations[0].STATUS,'rejected');assert.equal(f.state.keys[0].MEMBER_ID,null);
 await assert.rejects(login(f,attacker.a));await login(f,legitimate.a);
});
test('registration proof is single use, and expired ceremonies are denied',async()=>{
 const f=fixture(),p=await pending(f);
 await assert.rejects(f.service.registerFinish({ceremony:p.start.ceremony,response:p.a.registration(p.start.options)},ip));
 const a=authenticator(),s=await f.service.registerOptions({phone:number,name:'Parent'},ip);
 f.state.registrations.at(-1).CHALLENGE_EXPIRES_AT=new Date(0);
 await assert.rejects(f.service.registerFinish({ceremony:s.ceremony,response:a.registration(s.options)},ip));
});
test('admin rejection during registration verification cannot be undone by its completion',async()=>{
 const f=fixture(),a=authenticator(),s=await f.service.registerOptions({phone:number,name:'Parent'},ip);
 const verify=f.webauthn.verifyRegistration;
 f.webauthn.verifyRegistration=async(...args)=>{const result=await verify(...args);f.state.registrations[0].STATUS='rejected';return result;};
 await assert.rejects(f.service.registerFinish({ceremony:s.ceremony,response:a.registration(s.options)},ip));assert.equal(f.state.keys.length,0);
});
test('expired and rejected registration references cannot be approved',async()=>{
 for(const mode of ['expired','rejected']){
  const f=fixture(),p=await pending(f),admin=await f.admin();
  if(mode==='expired')f.state.registrations[0].EXPIRES_AT=new Date(0);else f.state.registrations[0].STATUS='rejected';
  await assert.rejects(f.service.approve(admin,{reference:p.result.reference,senderPhone:number,communityConfirmed:true}));
 }
});
test('reference reuse and concurrent approval produce one approved account',async()=>{
 const f=fixture(),p=await pending(f),admin=await f.admin();const input={reference:p.result.reference,senderPhone:number,communityConfirmed:true};
 const results=await Promise.allSettled([f.service.approve(admin,input),f.service.approve(admin,input)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.state.members.filter(m=>m.PHONE===number).length,1);
});
test('signed login challenge cannot be replayed',async()=>{
 const f=fixture(),p=await pending(f);await approve(f,p);const s=await f.service.loginOptions({phone:number},ip),response=p.a.assertion(s.options);
 await f.service.loginFinish({ceremony:s.ceremony,response},ip);
 await assert.rejects(f.service.loginFinish({ceremony:s.ceremony,response},ip));
});
test('signature failures consume the ceremony without creating sessions',async()=>{
 const f=fixture(),p=await pending(f);await approve(f,p);const s=await f.service.loginOptions({phone:number},ip),response=p.a.assertion(s.options);
 response.response.signature=Buffer.alloc(64).toString('base64url');
 await assert.rejects(f.service.loginFinish({ceremony:s.ceremony,response},ip));
 await assert.rejects(f.service.loginFinish({ceremony:s.ceremony,response:p.a.assertion(s.options)},ip));
 assert.equal(f.state.sessions.length,1); // admin only
});
test('deactivation revokes sessions, keys, pending claims and in-flight login challenges',async()=>{
 const f=fixture(),p=await pending(f),admin=await approve(f,p),signed=await login(f,p.a);
 const s=await f.service.loginOptions({phone:number},ip);await pending(f);
 await f.service.deactivate(admin,{id:signed.member.id});
 await assert.rejects(f.service.me(signed.session));await assert.rejects(f.service.loginOptions({phone:number},ip));
 await assert.rejects(f.service.loginFinish({ceremony:s.ceremony,response:p.a.assertion(s.options,{count:2})},ip));
 assert.ok(f.state.keys[0].REVOKED_AT);assert.equal(f.state.registrations.at(-1).STATUS,'rejected');
});
test('recovery needs explicit approval, replaces keys and ends existing sessions',async()=>{
 const f=fixture(),old=await pending(f),admin=await approve(f,old),session=await login(f,old.a),replacement=await pending(f);
 const input={reference:replacement.result.reference,senderPhone:number,communityConfirmed:true};
 await assert.rejects(f.service.approve(admin,input));
 await f.service.approve(admin,{...input,recovery:true});await assert.rejects(f.service.me(session.session));
 await assert.rejects(login(f,old.a,2));await login(f,replacement.a);
});
test('blocked member cannot be restored through recovery approval',async()=>{
 const f=fixture(),p=await pending(f),admin=await approve(f,p),member=await login(f,p.a);
 await f.service.deactivate(admin,{id:member.member.id});const next=await pending(f);
 await assert.rejects(f.service.approve(admin,{reference:next.result.reference,senderPhone:number,communityConfirmed:true,recovery:true}));
});
test('ordinary members cannot list, approve, reject or deactivate accounts',async()=>{
 const f=fixture(),p=await pending(f);await approve(f,p);const m=await login(f,p.a);
 await assert.rejects(f.service.pending(m.session));await assert.rejects(f.service.members(m.session));
 await assert.rejects(f.service.approve(m.session,{reference:p.result.reference,senderPhone:number,communityConfirmed:true}));
 await assert.rejects(f.service.reject(m.session,{reference:p.result.reference}));await assert.rejects(f.service.deactivate(m.session,{id:m.member.id}));
});
test('owner bootstrap binds an existing verified registration as admin',async()=>{
 const f=fixture(),p=await pending(f);await f.transaction(repo=>approveRegistration(repo,reference(p.result.reference),number,{role:'admin'}));
 const owner=await login(f,p.a);assert.equal(owner.member.role,'admin');assert.equal((await f.service.members(owner.session)).length,1);
});
test('phone/reference normalization and secure session cookies',()=>{
 assert.equal(phone('+41 (79) 123-45-67'),number);assert.throws(()=>phone('0791234567'));
 assert.equal(reference('abcd-abcd-abcd-abcd-abcd'),'ABCDABCDABCDABCDABCD');assert.throws(()=>reference('1234'));
 const t=token();assert.equal(sessionCookie(`__Host-gugu_session=${t}`),t);assert.equal(sessionCookie('__Host-gugu_session=bad'),null);
 assert.match(cookie(t,60),/HttpOnly; Secure; SameSite=Strict/);assert.ok(!cookie(t,60).includes('Domain='));
});
