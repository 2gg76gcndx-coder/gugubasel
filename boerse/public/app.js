const $=id=>document.getElementById(id);
let invitation=new URLSearchParams(location.hash.slice(1)).get('invite'), challenge=null;
// Never send invitation secrets in the URL to the backend, referrer or analytics.
if(location.hash) history.replaceState(null,'',location.pathname);
if(invitation){$('heading').textContent='Your personal invitation';$('explanation').textContent='Verify your approved WhatsApp number with an SMS code to join Gugu Börse.';$('phone').required=false;$('phone').hidden=true;document.querySelector('label[for="phone"]').hidden=true;}
async function api(path,body){
 const r=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json','X-Gugu-Request':'1'}:{},body:body?JSON.stringify(body):undefined});
 const data=await r.json();if(!r.ok)throw new Error(data.error||'Please try again.');return data;
}
function message(s,error=false){$('message').textContent=s;$('message').classList.toggle('error',error);}
async function action(fn){
 document.querySelectorAll('button').forEach(b=>b.disabled=true);
 try{message('');await fn();}catch(e){message(e.message,true);}finally{document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
function reset(){challenge=null;$('code').value='';$('start').hidden=false;$('finish').hidden=true;}
async function show(m){$('access').hidden=true;$('account').hidden=false;$('welcome').textContent=`Welcome, ${m.name}`;$('admin').hidden=m.role!=='admin';invitation=null;challenge=null;if(m.role==='admin')await members();}
async function members(){
 const rows=await api('/api/admin/members');$('members').replaceChildren();
 for(const m of rows){
  const card=document.createElement('div');card.className='member';
  for(const line of [`${m.DISPLAY_NAME} · ${m.STATUS}`,m.PHONE,m.REFERRED_BY?`Referred by: ${m.REFERRED_BY}`:'']){if(!line)continue;const p=document.createElement('p');p.textContent=line;card.append(p);}
  if(m.ROLE!=='admin'&&m.STATUS!=='blocked'){
   const b=document.createElement('button');b.className='secondary';b.textContent='Deactivate access';b.onclick=()=>{if(confirm(`Deactivate access for ${m.DISPLAY_NAME}? Their invitations and sessions will end.`))action(async()=>{await api('/api/admin/deactivate',{id:m.ID});await members();message('Member access deactivated.');});};card.append(b);
  }$('members').append(card);
 }
}
$('start').onsubmit=e=>{e.preventDefault();action(async()=>{const d=await api('/api/start',invitation?{invitation}:{phone:$('phone').value});challenge=d.challenge;$('start').hidden=true;$('finish').hidden=false;$('code').focus();message(d.message);});};
$('finish').onsubmit=e=>{e.preventDefault();action(async()=>{const d=await api('/api/finish',{challenge,code:$('code').value});await show(d.member);message('You are signed in.');});};
$('restart').onclick=()=>{reset();message('Request a new SMS code. Please wait at least one minute between requests.');};
$('logout').onclick=()=>action(async()=>{await api('/api/logout',{});location.reload();});
$('invite').onsubmit=e=>{e.preventDefault();action(async()=>{const d=await api('/api/admin/invite',Object.fromEntries(new FormData(e.target)));$('invite-url').value=d.url;$('invitation').hidden=false;await members();message('Invitation created. Any previous unused invitation for this number is now revoked.');});};
$('copy').onclick=()=>action(async()=>{await navigator.clipboard.writeText($('invite-url').value);message('Invitation copied. Send it privately to the approved member.');});
$('refresh').onclick=()=>action(members);
api('/api/me').then(show).catch(e=>{if(e.message!=='Access unavailable. Check your invitation or contact Gugu Basel.')message('Member service is unavailable. Please try again later.',true);});
