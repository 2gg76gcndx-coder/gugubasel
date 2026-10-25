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
async function show(m){panel('account');$('welcome').textContent=`Welcome, ${m.name}`;$('admin').hidden=m.role!=='admin';if(m.role==='admin')await lists();}
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
api('/api/me').then(show).catch(e=>{if(e.message!=='Access unavailable. Contact your Gugu community admin.')message('Member service is unavailable. Please try again later.',true);});
