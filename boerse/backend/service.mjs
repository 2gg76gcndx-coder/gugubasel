import { randomUUID } from 'node:crypto';
import { token, hash, phone, opaque, text, eligible, bucket, publicMember } from './security.mjs';
const denied = () => { const e=new Error('Access unavailable. Check your invitation or contact Gugu Basel.'); e.status=403; return e; };
export function createService({transaction, rate, sms, secret, origin}) {
  const limited = (key, max, minutes) => transaction(db=>rate(db,bucket(secret,key),max,minutes));
  const audit = (db, actor, action, target) => db.run('INSERT INTO gb_audit(id,actor_id,action,target_id) VALUES (:id,:actor,:action,:target)',{id:randomUUID(),actor,action,target});
  async function target(db, input, lock=false) {
    const invited=!!input.invitation;
    const inv=invited ? await db.one('SELECT * FROM gb_invitations WHERE token_hash=:h',{h:hash(opaque(input.invitation))}) : null;
    const m=invited ? (inv && await db.one(`SELECT * FROM gb_members WHERE id=:id${lock?' FOR UPDATE':''}`,{id:inv.MEMBER_ID})) : await db.one(`SELECT * FROM gb_members WHERE phone=:p${lock?' FOR UPDATE':''}`,{p:phone(input.phone)});
    if(!eligible(m,inv,invited)) throw denied();
    return {m,inv};
  }
  async function current(db, raw, admin=false, lock=false) {
    if(!raw) throw denied();
    const s=await db.one('SELECT member_id FROM gb_sessions WHERE token_hash=:h AND expires_at>SYSTIMESTAMP',{h:hash(opaque(raw))});
    const m=s && await db.one(`SELECT * FROM gb_members WHERE id=:id${lock?' FOR UPDATE':''}`,{id:s.MEMBER_ID});
    if(!m || m.STATUS!=='active' || (admin && m.ROLE!=='admin')) throw denied();
    // A blocked/reapproved account must not restore a previously deleted session.
    if(lock && !await db.one('SELECT member_id FROM gb_sessions WHERE token_hash=:h AND expires_at>SYSTIMESTAMP',{h:hash(raw)})) throw denied();
    return m;
  }
  return {
    async start(input, ip) {
      await limited(`send-ip:${ip}`,20,60);
      const {m,inv}=await transaction(db=>target(db,input));
      await limited(`send-phone:${m.ID}`,5,60);
      await limited(`send-cooldown:${m.ID}`,1,1);
      const result=await sms.send(m.PHONE);
      const raw=token();
      await transaction(async db=>{
        await target(db,input,true);
        await db.run(`INSERT INTO gb_challenges(token_hash,member_id,invitation_hash,verification_sid,expires_at) VALUES (:h,:id,:inv,:sid,SYSTIMESTAMP+INTERVAL '10' MINUTE)`,{h:hash(raw),id:m.ID,inv:inv?.TOKEN_HASH??null,sid:result.sid});
      });
      return {challenge:raw, message:'Code sent to your approved phone number.'};
    },
    async finish(input, ip) {
      await limited(`check-ip:${ip}`,40,60);
      const h=hash(opaque(input.challenge));
      if(!/^\d{4,10}$/.test(input.code??'')) throw new Error('Enter your SMS verification code.');
      const c=await transaction(async db=>{
        const c=await db.one('SELECT * FROM gb_challenges WHERE token_hash=:h FOR UPDATE',{h});
        if(!c || c.USED_AT || c.ATTEMPTS>=5 || new Date(c.EXPIRES_AT)<=new Date()) throw denied();
        await db.run('UPDATE gb_challenges SET attempts=attempts+1 WHERE token_hash=:h',{h});
        return c;
      });
      const verified=await sms.verify(c.VERIFICATION_SID,input.code);
      if(verified.status!=='approved' || verified.sid!==c.VERIFICATION_SID) throw new Error('Incorrect or expired code.');
      const raw=token();
      return transaction(async db=>{
        // All account lifecycle changes lock the member first, then invitations/challenges.
        const m=await db.one('SELECT * FROM gb_members WHERE id=:id FOR UPDATE',{id:c.MEMBER_ID});
        const inv=c.INVITATION_HASH ? await db.one('SELECT * FROM gb_invitations WHERE token_hash=:h FOR UPDATE',{h:c.INVITATION_HASH}) : null;
        if(!eligible(m,inv,!!c.INVITATION_HASH)) throw denied();
        const live=await db.one('SELECT * FROM gb_challenges WHERE token_hash=:h FOR UPDATE',{h});
        if(!live || live.USED_AT || new Date(live.EXPIRES_AT)<=new Date()) throw denied();
        if(inv) {
          await db.run('UPDATE gb_invitations SET used_at=SYSTIMESTAMP WHERE token_hash=:h',{h:inv.TOKEN_HASH});
          await db.run("UPDATE gb_members SET status='active' WHERE id=:id",{id:m.ID});
        }
        await db.run('UPDATE gb_challenges SET used_at=SYSTIMESTAMP WHERE token_hash=:h',{h});
        await db.run("INSERT INTO gb_sessions VALUES (:h,:id,SYSTIMESTAMP+INTERVAL '14' DAY)",{h:hash(raw),id:m.ID});
        await audit(db,m.ID,inv?'activate':'login',m.ID);
        return {session:raw, member:publicMember(m)};
      });
    },
    async me(raw) {return transaction(async db=>publicMember(await current(db,raw)));},
    async logout(raw) {if(raw) await transaction(db=>db.run('DELETE FROM gb_sessions WHERE token_hash=:h',{h:hash(raw)}));},
    async members(raw) {return transaction(async db=>{await current(db,raw,true);return db.all('SELECT id,display_name,phone,role,status,referred_by FROM gb_members ORDER BY created_at DESC FETCH FIRST 500 ROWS ONLY');});},
    async invite(raw,input) {
      const p=phone(input.phone), name=text(input.name,80), ref=input.referredBy?text(input.referredBy,120):null;
      const invitation=token();
      await transaction(async db=>{
        const admin=await current(db,raw,true,true);
        let m=await db.one('SELECT * FROM gb_members WHERE phone=:p FOR UPDATE',{p});
        if(m && m.STATUS!=='pending') throw new Error('This number already has an active or blocked account.');
        if(!m) {
          m={ID:randomUUID()};
          await db.run('INSERT INTO gb_members(id,phone,display_name,referred_by) VALUES (:id,:p,:name,:ref)',{id:m.ID,p,name,ref});
        }
        await db.run('UPDATE gb_invitations SET revoked_at=SYSTIMESTAMP WHERE member_id=:id AND used_at IS NULL AND revoked_at IS NULL',{id:m.ID});
        await db.run("INSERT INTO gb_invitations(token_hash,member_id,created_by,expires_at) VALUES (:h,:id,:a,SYSTIMESTAMP+INTERVAL '2' DAY)",{h:hash(invitation),id:m.ID,a:admin.ID});
        await audit(db,admin.ID,'invite',m.ID);
      });
      return {url:`${origin}/boerse/#invite=${invitation}`,expiresInHours:48};
    },
    async deactivate(raw,input) {
      const id=text(input.id,36);
      await transaction(async db=>{
        const admin=await current(db,raw,true,true);
        if(id===admin.ID) throw new Error('You cannot deactivate your own admin account.');
        const m=await db.one('SELECT * FROM gb_members WHERE id=:id FOR UPDATE',{id});
        if(!m) throw denied();
        // Admin account lifecycle is intentionally not exposed in the member UI.
        if(m.ROLE==='admin') throw new Error('Admin accounts require operator assistance.');
        await db.run("UPDATE gb_members SET status='blocked' WHERE id=:id",{id});
        await db.run('DELETE FROM gb_sessions WHERE member_id=:id',{id});
        await db.run('UPDATE gb_invitations SET revoked_at=SYSTIMESTAMP WHERE member_id=:id AND revoked_at IS NULL',{id});
        await db.run('UPDATE gb_challenges SET used_at=SYSTIMESTAMP WHERE member_id=:id AND used_at IS NULL',{id});
        await audit(db,admin.ID,'deactivate',id);
      });return {ok:true};
    }
  };
}
