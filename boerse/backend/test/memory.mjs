import {randomUUID} from 'node:crypto';
import {hash,token} from '../security.mjs';
import {createService} from '../service.mjs';
import {createWebAuthn} from '../webauthn.mjs';
export const origin='https://boerse.gugubasel.ch';
export function fixture(){
 let state={members:[],registrations:[],keys:[],logins:[],sessions:[],audits:[]};
 const copy=value=>value&&structuredClone(value),future=ms=>new Date(Date.now()+ms);
 const repo={
  member:async id=>copy(state.members.find(m=>m.ID===id)),
  memberByPhone:async p=>copy(state.members.find(m=>m.PHONE===p)),
  registration:async h=>copy(state.registrations.find(r=>r.TOKEN_HASH===h)),
  registrationByReference:async ref=>copy(state.registrations.find(r=>r.REFERENCE===ref)),
  registrations:async()=>copy(state.registrations.filter(r=>r.STATUS==='pending'&&r.EXPIRES_AT>new Date())),
  createRegistration:async r=>state.registrations.push({ID:r.id,TOKEN_HASH:r.h,REFERENCE:r.ref,PHONE:r.p,DISPLAY_NAME:r.name,CHALLENGE:r.challenge,STATUS:'started',CHALLENGE_EXPIRES_AT:future(600000),EXPIRES_AT:future(172800000)}),
  claimRegistration:async id=>{state.registrations.find(r=>r.ID===id).STATUS='verifying';},
  markPending:async id=>{state.registrations.find(r=>r.ID===id).STATUS='pending';},
  markApproved:async id=>{state.registrations.find(r=>r.ID===id).STATUS='approved';},
  rejectRegistration:async id=>{state.registrations.find(r=>r.ID===id).STATUS='rejected';},
  rejectOtherRegistrations:async(p,id)=>{for(const r of state.registrations)if(r.PHONE===p&&r.ID!==id&&['started','verifying','pending'].includes(r.STATUS))r.STATUS='rejected';},
  key:async id=>copy(state.keys.find(k=>k.CREDENTIAL_ID===id)),
  registrationKey:async id=>copy(state.keys.find(k=>k.REGISTRATION_ID===id)),
  keys:async id=>copy(state.keys.filter(k=>k.MEMBER_ID===id&&!k.REVOKED_AT)),
  createKey:async k=>{if(state.keys.some(x=>x.CREDENTIAL_ID===k.id))throw new Error('duplicate key');state.keys.push({CREDENTIAL_ID:k.id,REGISTRATION_ID:k.registration,PUBLIC_KEY:k.publicKey,SIGN_COUNT:k.counter,TRANSPORTS:k.transports,MEMBER_ID:null,REVOKED_AT:null});},
  attachKey:async(registration,id)=>{state.keys.find(k=>k.REGISTRATION_ID===registration).MEMBER_ID=id;},
  counter:async(id,count)=>{state.keys.find(k=>k.CREDENTIAL_ID===id).SIGN_COUNT=count;},
  revokeKeys:async id=>{for(const k of state.keys)if(k.MEMBER_ID===id)k.REVOKED_AT=new Date();},
  createMember:async m=>{if(state.members.some(x=>x.PHONE===m.p))throw new Error('duplicate phone');state.members.push({ID:m.id,PHONE:m.p,DISPLAY_NAME:m.name,ROLE:m.role,STATUS:'active'});},
  activateMember:async(id,name)=>{Object.assign(state.members.find(m=>m.ID===id),{STATUS:'active',DISPLAY_NAME:name});},
  blockMember:async id=>{state.members.find(m=>m.ID===id).STATUS='blocked';},
  session:async h=>copy(state.sessions.find(s=>s.TOKEN_HASH===h&&s.EXPIRES_AT>new Date())),
  createSession:async(h,id)=>state.sessions.push({TOKEN_HASH:h,MEMBER_ID:id,EXPIRES_AT:future(1209600000)}),
  deleteSession:async h=>{state.sessions=state.sessions.filter(s=>s.TOKEN_HASH!==h);},
  deleteSessions:async id=>{state.sessions=state.sessions.filter(s=>s.MEMBER_ID!==id);},
  loginChallenge:async h=>copy(state.logins.find(c=>c.TOKEN_HASH===h)),
  createLogin:async(h,id,c)=>state.logins.push({TOKEN_HASH:h,MEMBER_ID:id,CHALLENGE:c,EXPIRES_AT:future(300000),USED_AT:null}),
  consumeLogin:async h=>{state.logins.find(c=>c.TOKEN_HASH===h).USED_AT=new Date();},
  cancelLogins:async id=>{for(const c of state.logins)if(c.MEMBER_ID===id)c.USED_AT=new Date();},
  members:async()=>copy(state.members),
  adminExists:async()=>copy(state.members.find(m=>m.ROLE==='admin')),
  audit:async(actor,action,target)=>state.audits.push({actor,action,target}),
 };
 let queue=Promise.resolve();
 // Serialize transactions to model row locks and rollback without external infrastructure.
 const transaction=fn=>{
  const result=queue.then(async()=>{const before=structuredClone(state);try{return await fn(repo);}catch(e){state=before;throw e;}});
  queue=result.catch(()=>{});return result;
 };
 const webauthn=createWebAuthn(origin),limits=[];
 const service=createService({transaction,webauthn,rateTransaction:async(...args)=>limits.push(args),secret:'test-secret',adminWhatsApp:'+41790000000'});
 async function admin(){
  const id=randomUUID(),raw=token();await repo.createMember({id,p:'+41790000000',name:'Admin',role:'admin'});await repo.createSession(hash(raw),id);return raw;
 }
 return {service,webauthn,repo,transaction,admin,limits,get state(){return state;}};
}
