import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../service.mjs';
import {hash,token,eligible,phone,sessionCookie,cookie} from '../security.mjs';
const future=()=>new Date(Date.now()+3600000);
function fixture({status='pending',used=false,expired=false}={}){
 const invite=token(), challenge=token(), session=token();
 const m={ID:'member',PHONE:'+41791234567',DISPLAY_NAME:'Parent',STATUS:status,ROLE:'member'};
 const i={TOKEN_HASH:hash(invite),MEMBER_ID:m.ID,EXPIRES_AT:expired?new Date(0):future(),USED_AT:used?new Date():null,REVOKED_AT:null};
 const c={TOKEN_HASH:hash(challenge),MEMBER_ID:m.ID,INVITATION_HASH:hash(invite),VERIFICATION_SID:'VEtest',EXPIRES_AT:future(),ATTEMPTS:0,USED_AT:null};
 let state={m,i,c,sessions:[{TOKEN_HASH:hash(session),MEMBER_ID:m.ID}],audit:[]};
 const calls=[];
 const db={
  async one(sql,b){
   if(sql.includes('FROM gb_members')) return (b.id===state.m.ID||b.p===state.m.PHONE)?structuredClone(state.m):undefined;
   if(sql.includes('FROM gb_invitations')) return b.h===state.i.TOKEN_HASH?structuredClone(state.i):undefined;
   if(sql.includes('FROM gb_challenges')) return b.h===state.c.TOKEN_HASH?structuredClone(state.c):undefined;
   if(sql.includes('FROM gb_sessions')) return state.sessions.some(s=>s.TOKEN_HASH===b.h)?{MEMBER_ID:state.m.ID}:undefined;
   throw new Error(`Unexpected SQL: ${sql}`);
  },
  async run(sql,b){
   calls.push(sql);
   if(sql.startsWith('INSERT INTO gb_challenges')) state.c={TOKEN_HASH:b.h,MEMBER_ID:b.id,INVITATION_HASH:b.inv,VERIFICATION_SID:b.sid,ATTEMPTS:0,EXPIRES_AT:future(),USED_AT:null};
   else if(sql.includes('gb_challenges SET attempts')) state.c.ATTEMPTS++;
   else if(sql.includes('gb_challenges SET used_at')) state.c.USED_AT=new Date();
   else if(sql.includes('gb_invitations SET used_at')) state.i.USED_AT=new Date();
   else if(sql.includes("gb_members SET status='active'")) state.m.STATUS='active';
   else if(sql.startsWith('INSERT INTO gb_sessions')) state.sessions.push({TOKEN_HASH:b.h,MEMBER_ID:b.id});
   else if(sql.startsWith('INSERT INTO gb_audit')) state.audit.push(b.action);
   else if(sql.startsWith('DELETE FROM gb_sessions')) state.sessions=state.sessions.filter(s=>s.TOKEN_HASH!==b.h);
   else throw new Error(`Unexpected SQL: ${sql}`);
  }
 };
 const smsCalls=[];
 const sms={send:async p=>{smsCalls.push(p);return {sid:'VEtest'};},verify:async()=>({status:'approved',sid:'VEtest'})};
 const service=createService({transaction:async fn=>{const before=structuredClone(state);try{return await fn(db);}catch(e){state=before;throw e;}},rate:async()=>{},sms,secret:'test-secret',origin:'https://boerse.gugubasel.ch'});
 return {service,invite,challenge,session,sms,smsCalls,calls,get state(){return state;}};
}
test('phone normalization and validation reject non-international input',()=>{
 assert.equal(phone('+41 (79) 123-45-67'),'+41791234567');
 for(const value of ['0791234567','+0001234567','abc','+41;DROP TABLE'])assert.throws(()=>phone(value));
});
test('invitation eligibility rejects expiry, reuse, revocation and blocked users',()=>{
 const m={STATUS:'pending'},i={EXPIRES_AT:future()};assert.ok(eligible(m,i,true));
 for(const inv of [{...i,USED_AT:new Date()},{...i,REVOKED_AT:new Date()},{...i,EXPIRES_AT:new Date(0)}])assert.ok(!eligible(m,inv,true));
 assert.ok(!eligible({STATUS:'blocked'},i,true));assert.ok(!eligible(m,null,false));
});
test('unknown phone cannot trigger paid SMS',async()=>{
 const f=fixture();await assert.rejects(f.service.start({phone:'+41790000000'},'ip'));assert.equal(f.smsCalls.length,0);
});
test('pending member cannot bypass invitation using ordinary login',async()=>{
 const f=fixture();await assert.rejects(f.service.start({phone:f.state.m.PHONE},'ip'));assert.equal(f.smsCalls.length,0);
});
test('forwarded invitation always sends SMS to approved phone, ignoring replacement input',async()=>{
 const f=fixture();await f.service.start({invitation:f.invite,phone:'+41790000000'},'ip');assert.deepEqual(f.smsCalls,['+41791234567']);
});
test('expired and used invitations never trigger SMS',async()=>{
 for(const options of [{expired:true},{used:true}]){const f=fixture(options);await assert.rejects(f.service.start({invitation:f.invite},'ip'));assert.equal(f.smsCalls.length,0);}
});
test('successful activation consumes invitation and issues only hashed session storage',async()=>{
 const f=fixture();const result=await f.service.finish({challenge:f.challenge,code:'123456'},'ip');
 assert.equal(f.state.m.STATUS,'active');assert.ok(f.state.i.USED_AT);assert.ok(f.state.c.USED_AT);
 assert.equal(f.state.sessions.at(-1).TOKEN_HASH,hash(result.session));assert.notEqual(f.state.sessions.at(-1).TOKEN_HASH,result.session);
 await assert.rejects(f.service.finish({challenge:f.challenge,code:'123456'},'ip'));
});
test('wrong verification does not activate member or issue session',async()=>{
 const f=fixture();f.sms.verify=async()=>({status:'pending',sid:'VEtest'});
 await assert.rejects(f.service.finish({challenge:f.challenge,code:'999999'},'ip'));
 assert.equal(f.state.m.STATUS,'pending');assert.equal(f.state.sessions.length,1);assert.equal(f.state.c.ATTEMPTS,1);
});
test('verification from another challenge SID is rejected',async()=>{
 const f=fixture();f.sms.verify=async()=>({status:'approved',sid:'VEother'});
 await assert.rejects(f.service.finish({challenge:f.challenge,code:'123456'},'ip'));assert.equal(f.state.m.STATUS,'pending');
});
test('revocation during provider verification prevents activation',async()=>{
 const f=fixture();f.sms.verify=async()=>{f.state.i.REVOKED_AT=new Date();return {status:'approved',sid:'VEtest'};};
 await assert.rejects(f.service.finish({challenge:f.challenge,code:'123456'},'ip'));assert.equal(f.state.m.STATUS,'pending');
});
test('blocking during provider verification prevents session issuance',async()=>{
 const f=fixture();f.sms.verify=async()=>{f.state.m.STATUS='blocked';return {status:'approved',sid:'VEtest'};};
 await assert.rejects(f.service.finish({challenge:f.challenge,code:'123456'},'ip'));assert.equal(f.state.sessions.length,1);
});
test('challenge attempts capped before provider invocation',async()=>{
 const f=fixture();f.state.c.ATTEMPTS=5;let calls=0;f.sms.verify=async()=>{calls++;};
 await assert.rejects(f.service.finish({challenge:f.challenge,code:'123456'},'ip'));assert.equal(calls,0);
});
test('existing session fails immediately for blocked member',async()=>{
 const f=fixture({status:'active'});assert.equal((await f.service.me(f.session)).id,'member');f.state.m.STATUS='blocked';await assert.rejects(f.service.me(f.session));
});
test('ordinary member cannot access administration',async()=>{
 const f=fixture({status:'active'});await assert.rejects(f.service.members(f.session));await assert.rejects(f.service.invite(f.session,{phone:'+41790000000',name:'Other'}));
});
test('session cookies are host-only, secure, HTTP-only; malformed cookies rejected',()=>{
 const t=token();assert.equal(sessionCookie(`other=x; __Host-gugu_session=${t}`),t);assert.equal(sessionCookie('__Host-gugu_session=bad'),null);
 assert.match(cookie(t,60),/HttpOnly; Secure; SameSite=Strict/);assert.ok(!cookie(t,60).includes('Domain='));
});
