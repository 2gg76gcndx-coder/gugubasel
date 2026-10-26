import {randomUUID} from 'node:crypto';
// All mutations are called inside an Oracle transaction. Keep member-before-key lock order.
export function repository(db) {
 return {
  member: (id,lock=false)=>db.one(`SELECT * FROM gb_members WHERE id=:id${lock?' FOR UPDATE':''}`,{id}),
  memberByPhone:(p,lock=false)=>db.one(`SELECT * FROM gb_members WHERE phone=:p${lock?' FOR UPDATE':''}`,{p}),
  registration:(h,lock=false)=>db.one(`SELECT * FROM gb_registrations WHERE token_hash=:h${lock?' FOR UPDATE':''}`,{h}),
  registrationByReference:(ref,lock=false)=>db.one(`SELECT * FROM gb_registrations WHERE reference=:ref${lock?' FOR UPDATE':''}`,{ref}),
  registrations:()=>db.all("SELECT id,reference,phone,display_name,expires_at FROM gb_registrations WHERE status='pending' AND expires_at>SYSTIMESTAMP ORDER BY created_at FETCH FIRST 200 ROWS ONLY"),
  createRegistration:r=>db.run(`INSERT INTO gb_registrations(id,token_hash,reference,phone,display_name,challenge,challenge_expires_at,expires_at)
    VALUES (:id,:h,:ref,:p,:name,:challenge,SYSTIMESTAMP+INTERVAL '10' MINUTE,SYSTIMESTAMP+INTERVAL '2' DAY)`,r),
  claimRegistration:id=>db.run("UPDATE gb_registrations SET status='verifying' WHERE id=:id",{id}),
  markPending:id=>db.run("UPDATE gb_registrations SET status='pending' WHERE id=:id",{id}),
  markApproved:id=>db.run("UPDATE gb_registrations SET status='approved' WHERE id=:id",{id}),
  rejectOtherRegistrations:(p,id)=>db.run("UPDATE gb_registrations SET status='rejected' WHERE phone=:p AND id<>:id AND status IN ('started','verifying','pending')",{p,id}),
  rejectRegistration:id=>db.run("UPDATE gb_registrations SET status='rejected' WHERE id=:id AND status IN ('started','verifying','pending')",{id}),
  key:(id,lock=false)=>db.one(`SELECT * FROM gb_passkeys WHERE credential_id=:id${lock?' FOR UPDATE':''}`,{id}),
  registrationKey:id=>db.one('SELECT * FROM gb_passkeys WHERE registration_id=:id',{id}),
  keys:id=>db.all('SELECT * FROM gb_passkeys WHERE member_id=:id AND revoked_at IS NULL',{id}),
  createKey:k=>db.run(`INSERT INTO gb_passkeys(credential_id,registration_id,public_key,sign_count,transports)
    VALUES (:id,:registration,:publicKey,:counter,:transports)`,k),
  attachKey:(registration,id)=>db.run('UPDATE gb_passkeys SET member_id=:id WHERE registration_id=:registration AND member_id IS NULL',{id,registration}),
  counter:(id,counter)=>db.run('UPDATE gb_passkeys SET sign_count=:counter WHERE credential_id=:id',{id,counter}),
  revokeKeys:id=>db.run('UPDATE gb_passkeys SET revoked_at=SYSTIMESTAMP WHERE member_id=:id AND revoked_at IS NULL',{id}),
  createMember:m=>db.run('INSERT INTO gb_members(id,phone,display_name,role,status) VALUES (:id,:p,:name,:role,\'active\')',m),
  activateMember:(id,name)=>db.run("UPDATE gb_members SET status='active',display_name=:name WHERE id=:id",{id,name}),
  blockMember:id=>db.run("UPDATE gb_members SET status='blocked' WHERE id=:id",{id}),
  session:h=>db.one('SELECT * FROM gb_sessions WHERE token_hash=:h AND expires_at>SYSTIMESTAMP',{h}),
  createSession:(h,id)=>db.run("INSERT INTO gb_sessions VALUES (:h,:id,SYSTIMESTAMP+INTERVAL '14' DAY)",{h,id}),
  deleteSession:h=>db.run('DELETE FROM gb_sessions WHERE token_hash=:h',{h}),
  deleteSessions:id=>db.run('DELETE FROM gb_sessions WHERE member_id=:id',{id}),
  loginChallenge:(h,lock=false)=>db.one(`SELECT * FROM gb_login_challenges WHERE token_hash=:h${lock?' FOR UPDATE':''}`,{h}),
  createLogin:(h,id,challenge)=>db.run("INSERT INTO gb_login_challenges(token_hash,member_id,challenge,expires_at) VALUES (:h,:id,:challenge,SYSTIMESTAMP+INTERVAL '5' MINUTE)",{h,id,challenge}),
  consumeLogin:h=>db.run('UPDATE gb_login_challenges SET used_at=SYSTIMESTAMP WHERE token_hash=:h',{h}),
  cancelLogins:id=>db.run('UPDATE gb_login_challenges SET used_at=SYSTIMESTAMP WHERE member_id=:id AND used_at IS NULL',{id}),
  members:()=>db.all('SELECT id,phone,display_name,role,status FROM gb_members ORDER BY created_at DESC FETCH FIRST 500 ROWS ONLY'),
  adminExists:()=>db.one("SELECT id FROM gb_members WHERE role='admin' FETCH FIRST 1 ROW ONLY"),
  activeCategory:id=>db.one(
    'SELECT id FROM gb_categories WHERE id=:id AND active=1',{id}),
  activeSubcategory:(id,categoryId)=>db.one(
    'SELECT id FROM gb_subcategories WHERE id=:id AND category_id=:categoryId AND active=1',
    {id,categoryId}),
  createListing:l=>db.run(`
    INSERT INTO gb_listings
      (id,seller_id,title,description,category_id,subcategory_id,
       item_condition,gender,item_size,postcode,twint_available,
       listing_status,price_chf,image1_path,image2_path,created_at,updated_at)
    VALUES
      (:id,:sellerId,:title,:description,:categoryId,:subcategoryId,
       :condition,:gender,:size,:postcode,:twint,:status,:price,
       :image1Path,:image2Path,SYSTIMESTAMP,SYSTIMESTAMP)`,l),
   listingOwner:(id,lock=false)=>db.one(`SELECT id,seller_id,listing_status FROM gb_listings WHERE id=:id${lock?' FOR UPDATE':''}`,{id}),
   updateListingStatus:(id,status)=>db.run('UPDATE gb_listings SET listing_status=:status,updated_at=SYSTIMESTAMP WHERE id=:id',{id,status}),
   favourites:memberId=>db.all(`SELECT l.ID,l.TITLE,l.LISTING_STATUS,l.PRICE_CHF,l.IMAGE1_PATH
     FROM gb_favourites f JOIN gb_listings l ON l.id=f.listing_id
     WHERE f.member_id=:memberId ORDER BY f.created_at DESC FETCH FIRST 100 ROWS ONLY`,{memberId}),
   addFavourite:(memberId,listingId)=>db.run(`MERGE INTO gb_favourites f USING (SELECT :memberId member_id,:listingId listing_id FROM dual) v
     ON (f.member_id=v.member_id AND f.listing_id=v.listing_id)
     WHEN NOT MATCHED THEN INSERT (member_id,listing_id) VALUES(v.member_id,v.listing_id)`,{memberId,listingId}),
   removeFavourite:(memberId,listingId)=>db.run('DELETE FROM gb_favourites WHERE member_id=:memberId AND listing_id=:listingId',{memberId,listingId}),
  audit:(actor,action,target)=>db.run('INSERT INTO gb_audit(id,actor_id,action,target_id) VALUES (:id,:actor,:action,:target)',{id:randomUUID(),actor,action,target}),
 };
}
