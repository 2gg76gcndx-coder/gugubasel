import {randomBytes,randomUUID} from 'node:crypto';
import {writeFile,unlink} from 'node:fs/promises';
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
    async createListing(raw,input) {
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw fail('Invalid listing.',400);

      const photos = input.photos ?? [];
      if (!Array.isArray(photos) || photos.length > 2)
        throw fail('Upload no more than two photos.',400);

      const preparedPhotos = [];
      let combinedBytes = 0;
      for (const photo of photos) {
        if (!photo || !['image/jpeg','image/png','image/webp'].includes(photo.type)
            || typeof photo.data !== 'string'
            || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(photo.data))
          throw fail('Photos must be valid JPEG, PNG or WebP images.',400);

        const bytes = Buffer.from(photo.data,'base64');
        if (!bytes.length || bytes.length > 2*1024*1024
            || bytes.toString('base64') !== photo.data)
          throw fail('Each photo must be no larger than 2 MB.',400);

        const valid =
          (photo.type === 'image/jpeg' && bytes.length >= 3 &&
            bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) ||
          (photo.type === 'image/png' &&
            bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
          (photo.type === 'image/webp' && bytes.length >= 12 &&
            bytes.toString('ascii',0,4)==='RIFF' &&
            bytes.toString('ascii',8,12)==='WEBP');
        if (!valid)
          throw fail('The photo content does not match its image format.',400);

        combinedBytes += bytes.length;
        if (combinedBytes > 4*1024*1024)
          throw fail('The two photos combined must be no larger than 4 MB.',400);

        preparedPhotos.push({
          bytes,
          ext: photo.type==='image/jpeg' ? 'jpg' :
               photo.type==='image/png' ? 'png' : 'webp'
        });
      }
      const uploadsDir = new URL('./uploads/', import.meta.url);
      const savedPhotos = [];

      const title = typeof input.title === 'string' ? input.title.trim() : '';
      const description = typeof input.description === 'string'
        ? input.description.trim() : '';
      const categoryId = Number(input.categoryId);
      const subcategoryId = input.subcategoryId === '' ||
        input.subcategoryId === null || input.subcategoryId === undefined
        ? null : Number(input.subcategoryId);
      const condition = String(input.condition ?? '');
      const gender = String(input.gender ?? '');
      const size = typeof input.size === 'string' ? input.size.trim() : '';
      const postcode = typeof input.postcode === 'string'
        ? input.postcode.trim() : '';
      const twint = Number(input.twintAvailable);
      const price = input.price === '' || input.price === null ||
        input.price === undefined ? null : Number(input.price);

      if (!title || title.length > 200)
        throw fail('Enter a title of up to 200 characters.',400);
      if (description.length > 2000)
        throw fail('Description must be 2000 characters or fewer.',400);
      if (!Number.isInteger(categoryId) || categoryId < 1 || categoryId > 11)
        throw fail('Select a valid category.',400);
      if (subcategoryId !== null &&
          (!Number.isInteger(subcategoryId) || subcategoryId < 1))
        throw fail('Select a valid sub-type.',400);
      if (!['very_good','good','fair'].includes(condition))
        throw fail('Select a valid item condition.',400);
      if (!['Boy','Girl','Unisex'].includes(gender))
        throw fail('Select Boy, Girl or Unisex.',400);
      if (size.length > 50)
        throw fail('Size must be 50 characters or fewer.',400);
      if (postcode && !/^\\d{4}$/.test(postcode))
        throw fail('Enter a valid four-digit Swiss postcode.',400);
      if (![0,1].includes(twint))
        throw fail('Select whether TWINT is available.',400);
      if (price !== null && (!Number.isFinite(price) || price < 0 ||
          Math.round(price * 100) !== price * 100))
        throw fail('Enter a valid price in CHF.',400);

      try {
      return await transaction(async repo => {
        const member = await current(repo,raw,false,true);
        if (!await repo.activeCategory(categoryId))
          throw fail('This category is unavailable.',400);
        if (subcategoryId !== null &&
            !await repo.activeSubcategory(subcategoryId,categoryId))
          throw fail('The selected sub-type does not belong to this category.',400);

        const imagePaths = [];
        for (const photo of preparedPhotos) {
          const filename = randomUUID() + '.' + photo.ext;
          await writeFile(new URL(filename, uploadsDir), photo.bytes,
            {flag:'wx', mode:0o640});
          savedPhotos.push(filename);
          imagePaths.push(filename);
        }

        const id = randomUUID();
        await repo.createListing({
          id, sellerId:member.ID, title, description:description || null,
          categoryId, subcategoryId, condition, gender,
          size:size || null,
          postcode:postcode || null, twint, status:'available', price,
          image1Path:imagePaths[0] ?? null,
          image2Path:imagePaths[1] ?? null
        });
        await repo.audit(member.ID,'create-listing',id);
        return {ok:true,id};
      });
      } catch (error) {
        await Promise.all(savedPhotos.map(name =>
          unlink(new URL(name, uploadsDir)).catch(()=>{})
        ));
        throw error;
      }
    },
    async favourites(raw){return transaction(async repo=>{const m=await current(repo,raw);return repo.favourites(m.ID);});},
    async setFavourite(raw,input){
      const id=String(input.id||'');
      if(!/^[0-9a-f-]{36}$/i.test(id)||typeof input.favourite!=='boolean')throw fail('Invalid favourite request.',400);
      return transaction(async repo=>{
        const m=await current(repo,raw,false,true);
        if(input.favourite){if(!await repo.listingOwner(id))throw fail('Listing not found.',404);await repo.addFavourite(m.ID,id);}
        else await repo.removeFavourite(m.ID,id);
        return {ok:true};
      });
    },
    async setListingStatus(raw,input){
      const id=String(input.id||''),status=String(input.status||'').toLowerCase();
      if(!/^[0-9a-f-]{36}$/i.test(id)||!['available','reserved','sold'].includes(status))throw fail('Invalid listing status.',400);
      return transaction(async repo=>{
        const m=await current(repo,raw,false,true);
        const listing=await repo.listingOwner(id,true);
        if(!listing)throw fail('Listing not found.',404);
        if(listing.SELLER_ID!==m.ID)throw fail('Only the listing owner can change its status.',403);
        await repo.updateListingStatus(id,status);
        await repo.audit(m.ID,'listing-status-'+status,id);
        return {ok:true,status};
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
