import {randomBytes,randomUUID} from 'node:crypto';
import {token,hash,phone,opaque,text,reference,liveRegistration,fail,bucket,publicMember} from './security.mjs';

// Caller holds a transaction; only admin API or private bootstrap may invoke this.
export async function approveRegistration(repo,ref,senderPhone,{role='member',actor=null,recovery=false}={}) {
  // Read immutable number first; acquire member before registration lock if it exists.
  const initial=await repo.registrationByReference(ref);
  if(!liveRegistration(initial)) throw fail('Registration is unavailable or expired.');
  if(initial.PHONE!==senderPhone) throw fail('The WhatsApp sender number does not match this registration.',400);
  let member=await repo.memberByPhone(initial.PHONE,true);
  const r=await repo.registrationByReference(ref,true);
  if(!liveRegistration(r)) throw fail('Registration is unavailable or expired.');
  const key=await repo.registrationKey(r.ID);
  if(!key || key.MEMBER_ID || key.REVOKED_AT) throw fail();
  if(member) {
    if(role==='admin') throw fail('Owner number already exists. Private operator enrollment is required.');
    if(member.STATUS==='blocked') throw fail('This number is blocked. Review it separately before restoring access.');
    if(member.ROLE==='admin') throw fail('Admin passkey recovery requires private operator assistance.');
    if(member.STATUS==='active' && !recovery) throw fail('This number already has access. Select passkey recovery only after checking the WhatsApp sender.',409);
    await repo.revokeKeys(member.ID);
    await repo.deleteSessions(member.ID);
    await repo.cancelLogins(member.ID);
    await repo.activateMember(member.ID,r.DISPLAY_NAME);
    member={...member,STATUS:'active',DISPLAY_NAME:r.DISPLAY_NAME};
  } else {
    member={ID:randomUUID(),PHONE:r.PHONE,DISPLAY_NAME:r.DISPLAY_NAME,ROLE:role,STATUS:'active'};
    await repo.createMember({id:member.ID,p:member.PHONE,name:member.DISPLAY_NAME,role});
  }
  await repo.attachKey(r.ID,member.ID);
  await repo.markApproved(r.ID);
  await repo.rejectOtherRegistrations(r.PHONE,r.ID);
  await repo.audit(actor??member.ID,recovery?'recover-passkey':'approve-registration',member.ID);
  return publicMember(member);
}

export function createService({transaction,rateTransaction,webauthn,secret,adminWhatsApp}) {
  const limited=(key,max,minutes)=>rateTransaction(bucket(secret,key),max,minutes);
  async function current(repo,raw,admin=false,lock=false) {
    if(!raw) throw fail();
    const session=await repo.session(hash(opaque(raw)));
    const m=session && await repo.member(session.MEMBER_ID,lock);
    if(!m || m.STATUS!=='active' || (admin && m.ROLE!=='admin')) throw fail();
    if(lock && !await repo.session(hash(raw))) throw fail();
    return m;
  }
  return {
    async registerOptions(input,ip) {
      await limited(`register-ip:${ip}`,20,60);
      const p=phone(input.phone),name=text(input.name,80);
      await limited(`register-phone:${p}`,10,1440);
      const id=randomUUID(),raw=token(),ref=randomBytes(10).toString('hex').toUpperCase();
      const options=await webauthn.registrationOptions({id,phone:p});
      await transaction(repo=>repo.createRegistration({id,h:hash(raw),ref,p,name,challenge:options.challenge}));
      return {ceremony:raw,options};
    },
    async registerFinish(input,ip) {
      await limited(`register-check-ip:${ip}`,40,60);
      const h=hash(opaque(input.ceremony));
      // Consume registration even if cryptographic verification fails: no challenge retries.
      const r=await transaction(async repo=>{
        const r=await repo.registration(h,true);
        if(!liveRegistration(r,'started') || new Date(r.CHALLENGE_EXPIRES_AT)<=new Date()) throw fail();
        await repo.claimRegistration(r.ID);
        return r;
      });
      const key=await webauthn.verifyRegistration(input.response,r.CHALLENGE);
      await transaction(async repo=>{
        const live=await repo.registration(h,true);
        if(!live || live.STATUS!=='verifying' || new Date(live.EXPIRES_AT)<=new Date()) throw fail();
        await repo.createKey({id:key.id,registration:r.ID,publicKey:key.publicKey,counter:key.counter,transports:JSON.stringify(key.transports)});
        await repo.markPending(r.ID);
      });
      const formatted=r.REFERENCE.match(/.{1,4}/g).join('-');
      const message=`Please approve my Gugu Börse registration. Reference: ${formatted}. Registered number: ${r.PHONE}.`;
      return {reference:formatted,expiresInHours:48,whatsappUrl:`https://wa.me/${adminWhatsApp.slice(1)}?text=${encodeURIComponent(message)}`};
    },
    async loginOptions(input,ip) {
      await limited(`login-ip:${ip}`,40,60);
      const p=phone(input.phone);
      const details=await transaction(async repo=>{
        const m=await repo.memberByPhone(p);
        if(!m || m.STATUS!=='active') throw fail();
        const keys=await repo.keys(m.ID);
        if(!keys.length) throw fail();
        return {m,keys};
      });
      const options=await webauthn.loginOptions(details.keys),raw=token();
      await transaction(repo=>repo.createLogin(hash(raw),details.m.ID,options.challenge));
      return {ceremony:raw,options};
    },
    async loginFinish(input,ip) {
      await limited(`login-check-ip:${ip}`,60,60);
      const h=hash(opaque(input.ceremony));
      // Commit consumption before checking signatures so failed ceremonies cannot be replayed.
      const c=await transaction(async repo=>{
        const c=await repo.loginChallenge(h,true);
        if(!c || c.USED_AT || new Date(c.EXPIRES_AT)<=new Date()) throw fail();
        await repo.consumeLogin(h);return c;
      });
      const raw=token();
      return transaction(async repo=>{
        const m=await repo.member(c.MEMBER_ID,true);
        const key=await repo.key(input.response?.id,true);
        if(!m || m.STATUS!=='active' || !key || key.MEMBER_ID!==m.ID || key.REVOKED_AT) throw fail();
        const counter=await webauthn.verifyLogin(input.response,c.CHALLENGE,key);
        await repo.counter(key.CREDENTIAL_ID,counter);
        await repo.createSession(hash(raw),m.ID);
        await repo.audit(m.ID,'login',m.ID);
        return {session:raw,member:publicMember(m)};
      });
    },
    async me(raw){return transaction(async repo=>publicMember(await current(repo,raw)));},
    async logout(raw){if(raw)await transaction(repo=>repo.deleteSession(hash(raw)));},
    async members(raw){return transaction(async repo=>{await current(repo,raw,true);return repo.members();});},
    async pending(raw){return transaction(async repo=>{await current(repo,raw,true);return repo.registrations();});},
    async approve(raw,input){
      const ref=reference(input.reference),sender=phone(input.senderPhone);
      if(input.communityConfirmed!==true) throw fail('Confirm the WhatsApp sender belongs to your approved community.',400);
      return transaction(async repo=>{
        const admin=await current(repo,raw,true,true);
        return approveRegistration(repo,ref,sender,{actor:admin.ID,recovery:input.recovery===true});
      });
    },
    async reject(raw,input){
      const ref=reference(input.reference);
      return transaction(async repo=>{
        const admin=await current(repo,raw,true,true);
        const r=await repo.registrationByReference(ref,true);
        if(!r || !['started','verifying','pending'].includes(r.STATUS)) throw fail();
        await repo.rejectRegistration(r.ID);await repo.audit(admin.ID,'reject-registration',null);
        return {ok:true};
      });
    },
    async deactivate(raw,input){
      const id=text(input.id,36);
      return transaction(async repo=>{
        const admin=await current(repo,raw,true,true);
        const m=await repo.member(id,true);
        if(!m || m.ROLE==='admin') throw fail('Admin accounts require private operator assistance.');
        await repo.blockMember(id);await repo.revokeKeys(id);await repo.deleteSessions(id);await repo.cancelLogins(id);
        await repo.rejectOtherRegistrations(m.PHONE,'none');
        await repo.audit(admin.ID,'deactivate',id);return {ok:true};
      });
    },
  };
}
