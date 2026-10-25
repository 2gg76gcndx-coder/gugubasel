const $=id=>document.getElementById(id);
const webauthn=window.SimpleWebAuthnBrowser;
let savedReference='';
async function api(path,body){
 const r=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json','X-Gugu-Request':'1'}:{},body:body?JSON.stringify(body):undefined});
 const data=await r.json();if(!r.ok)throw new Error(data.error||'Please try again.');return data;
}
function message(s,error=false){$('message').textContent=s;$('message').classList.toggle('error',error);}
async function action(fn){
 document.querySelectorAll('button').forEach(b=>b.disabled=true);
 try{message('');await fn();}catch(e){message(e.name==='NotAllowedError'?'Passkey request cancelled or unavailable. Please try again.':e.message,true);}finally{document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
function support(){if(!webauthn?.browserSupportsWebAuthn())throw new Error('This browser does not support passkeys. Open the site in a recent Safari, Chrome, Edge or Firefox browser.');}
function panel(id){for(const key of ['access','registration','pending','account','admin'])$(key).hidden=key!==id;message('');}
function openRegistration(recovery=false){
 panel('registration');$('register-phone').value=$('phone').value;
 $('register-heading').textContent=recovery?'Replace your passkey':'Join Gugu Börse';
 $('register-explanation').textContent=recovery?'Create a replacement passkey and send the new reference from your approved WhatsApp number. Your admin must approve recovery; your old passkey works until then.':'Create a passkey, then send your registration reference privately to the community admin on WhatsApp. You can sign in after approval.';
}
async function show(m){
 panel('account');
 $('welcome').textContent=`Welcome, ${m.name}`;
 $('admin').hidden=m.role!=='admin';
 try{await loadMarketplace();}catch(e){message('Marketplace could not load. '+e.message,true);}
 if(m.role==='admin')await lists();
}
function paragraph(parent,line){const p=document.createElement('p');p.textContent=line;parent.append(p);}
async function lists(){
 const [members,registrations]=await Promise.all([api('/api/admin/members'),api('/api/admin/registrations')]);
 $('members').replaceChildren();$('registrations').replaceChildren();
 if(!registrations.length)paragraph($('registrations'),'No pending registrations.');
 for(const r of registrations){
  const card=document.createElement('div');card.className='member';
  paragraph(card,`${r.DISPLAY_NAME} · ${r.PHONE}`);paragraph(card,r.REFERENCE.match(/.{1,4}/g).join('-'));
  const b=document.createElement('button');b.className='secondary';b.textContent='Reject registration';b.onclick=()=>{if(confirm('Reject this pending registration?'))action(async()=>{await api('/api/admin/reject',{reference:r.REFERENCE});await lists();message('Registration rejected.');});};card.append(b);$('registrations').append(card);
 }
 for(const m of members){
  const card=document.createElement('div');card.className='member';paragraph(card,`${m.DISPLAY_NAME} · ${m.STATUS}`);paragraph(card,m.PHONE);
  if(m.ROLE!=='admin'&&m.STATUS!=='blocked'){
   const b=document.createElement('button');b.className='secondary';b.textContent='Deactivate access';b.onclick=()=>{if(confirm(`Deactivate ${m.DISPLAY_NAME}? Their passkeys and sessions will stop working.`))action(async()=>{await api('/api/admin/deactivate',{id:m.ID});await lists();message('Member access deactivated.');});};card.append(b);
  }$('members').append(card);
 }
}
$('login').onsubmit=e=>{e.preventDefault();action(async()=>{
 support();const d=await api('/api/login/options',{phone:$('phone').value});
 const response=await webauthn.startAuthentication({optionsJSON:d.options});
 const result=await api('/api/login/finish',{ceremony:d.ceremony,response});await show(result.member);
});};
$('register').onsubmit=e=>{e.preventDefault();action(async()=>{
 support();const d=await api('/api/register/options',Object.fromEntries(new FormData(e.target)));
 const response=await webauthn.startRegistration({optionsJSON:d.options});
 const result=await api('/api/register/finish',{ceremony:d.ceremony,response});
 savedReference=result.reference;$('reference').textContent=savedReference;$('whatsapp').href=result.whatsappUrl;panel('pending');
});};
$('open-register').onclick=()=>openRegistration();$('open-recovery').onclick=()=>openRegistration(true);
$('back').onclick=$('pending-login').onclick=()=>panel('access');
$('copy').onclick=()=>action(async()=>{await navigator.clipboard.writeText(savedReference);message('Reference copied. Send it privately from your registered WhatsApp number.');});
$('logout').onclick=()=>action(async()=>{await api('/api/logout',{});location.reload();});
$('approve').onsubmit=e=>{e.preventDefault();action(async()=>{
 const data=Object.fromEntries(new FormData(e.target));data.communityConfirmed=$('community-confirmed').checked;data.recovery=$('recovery').checked;
 if(data.recovery&&!confirm('Replace the existing passkey and end all sessions? Only proceed after checking the WhatsApp sender.'))return;
 await api('/api/admin/approve',data);e.target.reset();await lists();message('Approved. The member can now sign in with their passkey.');
});};
$('refresh').onclick=()=>action(lists);

function selectedPhotos(){
 const inputs=[$('listing-photo-1'),$('listing-photo-2')];
 const files=inputs.map(input=>input.files[0]).filter(Boolean);
 const allowed=['image/jpeg','image/png','image/webp'];
 if(files.length>2)throw new Error('Choose no more than two photos.');
 if(files.some(file=>!allowed.includes(file.type)))
  throw new Error('Photos must be JPEG, PNG or WebP images.');
 if(files.some(file=>file.size===0||file.size>2*1024*1024))
  throw new Error('Each photo must be no larger than 2 MB.');
 if(files.reduce((sum,file)=>sum+file.size,0)>4*1024*1024)
  throw new Error('The two photos combined must be no larger than 4 MB.');
 return Promise.all(files.map(file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>{
   const result=String(reader.result||'');
   const comma=result.indexOf(',');
   if(comma<0)return reject(new Error('Could not read a photo.'));
   resolve({type:file.type,data:result.slice(comma+1)});
  };
  reader.onerror=()=>reject(new Error('Could not read a photo.'));
  reader.readAsDataURL(file);
 })));
}
function resetPhotoPreviews(){
 for(const [inputId,previewId] of [
  ['listing-photo-1','listing-photo-preview-1'],
  ['listing-photo-2','listing-photo-preview-2']
 ]){
  const input=$(inputId),preview=$(previewId);
  preview.replaceChildren();
  input.value='';
 }
}
function wirePhotoPreview(inputId,previewId){
 const input=$(inputId),preview=$(previewId);
 input.onchange=()=>{
  for(const img of preview.querySelectorAll('img')){
   if(img.src.startsWith('blob:'))URL.revokeObjectURL(img.src);
  }
  preview.replaceChildren();
  const file=input.files[0];
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)
     || file.size===0 || file.size>2*1024*1024){
   input.value='';
   message('Choose a JPEG, PNG or WebP photo no larger than 2 MB.',true);
   return;
  }
  const img=document.createElement('img');
  img.alt='Selected photo preview';
  img.src=URL.createObjectURL(file);
  preview.append(img);
 };
}
function setMarketplaceTab(tab){
 const searching=tab==='search';
 $('search-panel').hidden=!searching;
 $('sell-panel').hidden=searching;
 $('tab-search').classList.toggle('active',searching);
 $('tab-sell').classList.toggle('active',!searching);
 $('tab-search').setAttribute('aria-selected',String(searching));
 $('tab-sell').setAttribute('aria-selected',String(!searching));
}
async function loadMarketplace(){
 const categories=await api('/api/categories');
 const publishCat=$('listing-category'),filterCat=$('filter-category');
 publishCat.replaceChildren();filterCat.replaceChildren();
 filterCat.add(new Option('All categories',''));
 for(const c of categories){
  publishCat.add(new Option(`${c.EMOJI} ${c.NAME}`,c.ID));
  filterCat.add(new Option(`${c.EMOJI} ${c.NAME}`,c.ID));
 }
 await loadSubtypes(publishCat.value,'listing-subcategory',false);
 $('filter-category').onchange=async()=>{
  await loadSubtypes($('filter-category').value,'filter-subcategory',true);
  await loadListings();
 };
 publishCat.onchange=()=>loadSubtypes(publishCat.value,'listing-subcategory',false);
 $('apply-filters').onclick=()=>action(loadListings);
 $('clear-filters').onclick=()=>action(async()=>{
  ['filter-category','filter-condition','filter-gender','filter-size','filter-postcode','filter-twint'].forEach(id=>$(id).value='');
  await loadSubtypes('','filter-subcategory',true);
  await loadListings();
 });
 wirePhotoPreview('listing-photo-1','listing-photo-preview-1');
 wirePhotoPreview('listing-photo-2','listing-photo-preview-2');
 $('tab-search').onclick=()=>setMarketplaceTab('search');
 $('tab-sell').onclick=()=>setMarketplaceTab('sell');
 setMarketplaceTab('search');
 $('cancel-listing').onclick=()=>{
   $('listing-form').reset();
   resetPhotoPreviews();
   setMarketplaceTab('search');
 };
 $('listing-form').onsubmit=e=>{
  e.preventDefault();
  action(async()=>{
   const f=new FormData(e.target);
   const photos=await selectedPhotos();
   const payload={
    title:f.get('title'),description:f.get('description'),
    categoryId:Number(f.get('categoryId')),
    subcategoryId:f.get('subcategoryId')?Number(f.get('subcategoryId')):null,
    condition:f.get('condition'),gender:f.get('gender'),
    size:f.get('size'),
    price:f.get('price'),postcode:f.get('postcode'),
    twintAvailable:Number(f.get('twintAvailable')),photos
   };
   await api('/api/listings',payload);
   e.target.reset();
   resetPhotoPreviews();
   $('listing-editor').hidden=true;
   await loadListings();
   message('Your item has been published.');
  });
 };
 await loadListings();
}
async function loadSubtypes(categoryId,selectId,allowAll){
 const select=$(selectId);
 select.replaceChildren();
 select.add(new Option(allowAll?'All sub-types':'No sub-type',''));
 if(!categoryId){select.disabled=true;return;}
 const rows=await api('/api/subcategories?categoryId='+encodeURIComponent(categoryId));
 for(const r of rows)select.add(new Option(r.NAME,r.ID));
 select.disabled=false;
}
async function loadListings(){
 const params=new URLSearchParams();
 const pairs=[
  ['categoryId','filter-category'],['subcategoryId','filter-subcategory'],
  ['condition','filter-condition'],['gender','filter-gender'],
  ['size','filter-size'],
  ['postcode','filter-postcode'],['twintAvailable','filter-twint']
 ];
 for(const [key,id] of pairs){const value=$(id).value.trim();if(value)params.set(key,value);}
 const rows=await api('/api/listings?'+params.toString());
 const target=$('listing-results');target.replaceChildren();
 $('listing-count').textContent=`${rows.length} item${rows.length===1?'':'s'} found`;
 if(!rows.length){
  const empty=document.createElement('p');empty.className='small';
  empty.textContent='No available items match these filters yet.';
  target.append(empty);return;
 }
 for(const item of rows){
  const card=document.createElement('article');card.className='listing-card';
  const title=document.createElement('h3');title.textContent=item.TITLE;card.append(title);
  const category=document.createElement('p');category.className='small';
  category.textContent=`${item.CATEGORY_EMOJI||''} ${item.CATEGORY_NAME}${item.SUBCATEGORY_NAME?' · '+item.SUBCATEGORY_NAME:''}`;
  card.append(category);
  const gender=document.createElement('p');
  gender.className='small';
  gender.textContent='Gender: '+(item.GENDER||'Not specified');
  card.append(gender);
  for(const path of [item.IMAGE1_PATH,item.IMAGE2_PATH]){
   if(!path)continue;
   const img=document.createElement('img');
   img.className='listing-photo';
   img.alt='Photo of '+item.TITLE;
   img.loading='lazy';
   img.src='/api/photos/'+encodeURIComponent(path);
   card.append(img);
  }
  if(item.DESCRIPTION){const d=document.createElement('p');d.textContent=item.DESCRIPTION;card.append(d);}
  const condition=document.createElement('p');condition.className='small';
  condition.textContent=`Condition: ${{very_good:'Very good',good:'Good',fair:'Fair'}[item.ITEM_CONDITION]||item.ITEM_CONDITION}`;
  card.append(condition);
  if(item.ITEM_SIZE){const z=document.createElement('p');z.className='small';z.textContent='Size: '+item.ITEM_SIZE;card.append(z);}
  if(item.POSTCODE){const z=document.createElement('p');z.className='small';z.textContent='Postcode: '+item.POSTCODE;card.append(z);}
  const price=document.createElement('p');price.className='listing-price';
  price.textContent=item.PRICE_CHF===null?'Price on request':'CHF '+Number(item.PRICE_CHF).toFixed(2);
  card.append(price);
  const twint=document.createElement('p');twint.className='small';twint.textContent=item.TWINT_AVAILABLE?'TWINT accepted':'TWINT not available';card.append(twint);
  target.append(card);
 }
}

api('/api/me').then(show).catch(e=>{if(e.message!=='Access unavailable. Contact your Gugu community admin.')message('Member service is unavailable. Please try again later.',true);});
