'use strict';
let me=null;
const message=document.getElementById('link-status'),button=document.getElementById('approve-device');
fetch('/api/me',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Sign-in could not be checked.');me=await r.json();button.disabled=!me.signedIn;message.textContent=me.signedIn?'Compare the code with your own app before confirming. Recent Google authentication is required.':'Sign in on the Account page, then return here.';}).catch(e=>{message.textContent=e.message;});
document.getElementById('link-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!me?.signedIn)return;button.disabled=true;
 try{const r=await fetch('/api/desktop/approve',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrfToken},body:JSON.stringify({user_code:document.getElementById('device-code').value.replace(/[\s-]/g,'').toUpperCase(),confirmed:document.getElementById('confirm-device').checked})});const d=await r.json();if(!r.ok)throw Error(d.error||'Connection could not be approved.');message.textContent='Connected. Return to your desktop app. This code cannot be used again.';document.getElementById('link-form').hidden=true;}catch(e){message.textContent=e.message;button.disabled=false;}
});
