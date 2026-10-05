'use strict';
const $=s=>document.querySelector(s);let config,account={signedIn:false,plan:'free'},seq=0,recognition,recognizing=false;const cache=new Map();
const status=(msg,error=false)=>{const e=$('#status');if(e){e.textContent=msg;e.classList.toggle('error',error);}};
async function api(path,data){const r=await fetch(path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Request failed.');return j;}
const safeAction=fn=>async()=>{try{await fn();}catch(e){status(e.message,true);}};
async function translate(){const source=$('#source'),out=$('#output');if(!source)return;const text=source.value.trim(),from=$('#from').value,to=$('#to').value;if(!text){invalidate();status('Enter a message first.',true);source.focus();return;}const limit=account.plan==='pro'?1000:500;if([...text].length>limit){invalidate();status(`Keep this message under ${limit} characters.`,true);return;}out.value='';$('#latency').textContent='Measured after translation';if('speechSynthesis' in window)speechSynthesis.cancel();const key=JSON.stringify([text,from,to]);const id=++seq;$('#translate').disabled=true;status('Translating your message…');const start=performance.now();try{let result=cache.get(key),cached=!!result;if(!result){result=await api('/api/translate',{text,source:from,target:to});if(cache.size>=20)cache.delete(cache.keys().next().value);cache.set(key,result);}if(id!==seq)return;out.value=result.text;$('#latency').textContent=cached?'From this tab’s memory':`${((performance.now()-start)/1000).toFixed(2)}s · round trip`;status(cached?'Reused your previous translation. No new server request.':'Translation ready. Check names, numbers and tone before sending.');}catch(e){if(id===seq)status(e.message,true);}finally{if(id===seq)$('#translate').disabled=false;}}
function count(){if($('#count'))$('#count').textContent=`${[...$('#source').value].length} / ${account.plan==='pro'?1000:500}`;}
function invalidate(){if('speechSynthesis' in window)speechSynthesis.cancel();seq++;if($('#translate'))$('#translate').disabled=false;if($('#output'))$('#output').value='';if($('#latency'))$('#latency').textContent='Measured after translation';count();status('Draft changed. Translate it to get a new result.');}
function clear(){if(recognition)recognition.abort();if('speechSynthesis'in window)speechSynthesis.cancel();cache.clear();$('#source').value='';invalidate();status('Draft, translation and this tab’s translation cache cleared.');}
function dictate(){const C=window.SpeechRecognition||window.webkitSpeechRecognition;if(!C){status('Voice input is not supported here. Type or paste your text instead.',true);return;}if(recognizing){recognition.stop();return;}if(!$('#voiceConsent').checked){$('#voiceNotice').hidden=false;$('#voiceConsent').focus();status('Review the voice privacy note and check the box before recording.');return;}recognition=new C();recognition.lang=$('#from').value;recognition.interimResults=true;recognition.continuous=false;let prefix=$('#source').value.trim();recognition.onstart=()=>{recognizing=true;$('#mic').textContent='■ Stop recording';status('Listening… Click Stop recording when done.');};recognition.onresult=e=>{let t='';for(let i=0;i<e.results.length;i++)t+=e.results[i][0].transcript;$('#source').value=(prefix?prefix+' ':'')+t;invalidate();};recognition.onerror=e=>status(e.error==='not-allowed'?'Microphone permission was denied. You can still type.':'Voice input stopped. Try again or type your message.',true);recognition.onend=()=>{recognizing=false;$('#mic').textContent='◉ Voice input';};recognition.start();}
function speak(){if(!('speechSynthesis'in window)){status('Read aloud is unavailable in this browser.',true);return;}const text=$('#output').value;if(!text){status('Translate a message first.',true);return;}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang=$('#to').value;u.rate=.95;u.onerror=()=>status('Read aloud could not start. Check your browser audio settings.',true);speechSynthesis.speak(u);status('Reading aloud. Voice availability depends on your browser.');}
function download(text,name,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function updateCheckoutState(){
 const button=$('#subscribe');if(!button)return;
 button.disabled=!account.billing||account.plan==='pro'||!$('#savedKey').checked||!$('#acceptTerms').checked;
 button.textContent=account.plan==='pro'?'Pro is active':account.billing?'Continue to secure checkout':'Pro purchases are not open yet';
}
async function accountRefresh(){
 account=await api('/api/account');
 if($('#accountState'))$('#accountState').textContent=account.signedIn?'Your account is ready. Save your recovery key to use it on another device.':'Try the free tools without an account, or create one to prepare your subscription access.';
 for(const e of document.querySelectorAll('[data-signed]'))e.hidden=!account.signedIn;
 for(const e of document.querySelectorAll('[data-unsigned]'))e.hidden=account.signedIn;
 if($('#portal'))$('#portal').hidden=!account.billingPortalAvailable;
 if($('#planName'))$('#planName').textContent=account.plan==='pro'?'Pro plan':'Free plan';
 if($('#proUsage')){
  $('#proUsage').hidden=account.plan!=='pro';
  $('#usageMeter').max=account.limit;$('#usageMeter').value=Math.min(account.used,account.limit);
  $('#usageText').textContent=`${account.used.toLocaleString()} / ${account.limit.toLocaleString()} characters this UTC calendar month.`;
  $('#renewalText').textContent=account.validUntil?`Current access ends ${new Date(account.validUntil*1000).toLocaleString()}. Manage renewal in Stripe.`:'';
 }
 if($('#billingState'))$('#billingState').textContent=account.billing?'Pro subscriptions are available. Review the terms before checkout.':'Pro purchases are not open yet. No payment is collected. Free tools are available now.';
 updateCheckoutState();count();
}
function initTranslation(){if(!$('#source'))return;$('#translate').addEventListener('click',translate);$('#source').addEventListener('input',invalidate);$('#from').addEventListener('change',invalidate);$('#to').addEventListener('change',invalidate);$('#source').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();translate();}});$('#swap').addEventListener('click',()=>{let old=$('#from').value;$('#from').value=$('#to').value;$('#to').value=old;const previous=$('#output').value;if(previous)$('#source').value=previous;invalidate();});$('#clear').addEventListener('click',clear);$('#mic').addEventListener('click',safeAction(dictate));$('#speak').addEventListener('click',speak);$('#stopAudio').addEventListener('click',()=>{if('speechSynthesis'in window)speechSynthesis.cancel();});$('#copy').addEventListener('click',safeAction(async()=>{if(!$('#output').value)throw new Error('Translate a message first.');try{await navigator.clipboard.writeText($('#output').value);status('Translation copied.');}catch{$('#output').focus();$('#output').select();status('Copy is unavailable here. The translation is selected; use your device’s Copy command.');}}));$('#export').addEventListener('click',()=>{if(!$('#output').value){status('Translate a message first.',true);return;}download($('#output').value,'phrase-lane-translation.txt');status('Download requested. Check your browser’s downloads.');});document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>{$('#source').value=b.dataset.example;invalidate();$('#source').focus();}));const C=window.SpeechRecognition||window.webkitSpeechRecognition;if(!C){$('#mic').disabled=true;$('#mic').title='Voice input is unavailable in this browser. Type or paste instead.';}}
function initAccount(){
 if(!$('#createAccount'))return;
 for(const id of ['savedKey','acceptTerms'])$('#'+id).addEventListener('change',updateCheckoutState);
 const action=(id,fn)=>$('#'+id).addEventListener('click',async()=>{const button=$('#'+id);button.disabled=true;try{await fn();}catch(e){status(e.message,true);}finally{button.disabled=false;updateCheckoutState();}});
 action('createAccount',async()=>{const r=await api('/api/accounts',{});$('#recoveryKey').textContent=r.recoveryKey;$('#keyPanel').hidden=false;await accountRefresh();status('Account created. Save the key now; it is not shown again.');});
 action('copyKey',async()=>{try{await navigator.clipboard.writeText($('#recoveryKey').textContent);status('Account key copied. Save it privately.');}catch{const range=document.createRange();range.selectNodeContents($('#recoveryKey'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);status('The key is selected. Use your device’s Copy command and save it privately.');}});
 $('#loginForm').addEventListener('submit',e=>{e.preventDefault();safeAction(async()=>{await api('/api/login',{key:$('#loginKey').value.trim()});$('#loginKey').value='';await accountRefresh();status('Account restored.');})();});
 action('logout',async()=>{await api('/api/logout',{});$('#keyPanel').hidden=true;$('#recoveryKey').textContent='';$('#savedKey').checked=false;$('#acceptTerms').checked=false;await accountRefresh();status('Signed out on this browser.');});
 action('subscribe',async()=>{status('Opening secure checkout…');const r=await api('/api/checkout',{savedKey:$('#savedKey').checked,acceptedTerms:$('#acceptTerms').checked});const u=new URL(r.url);if(u.protocol!=='https:'||u.hostname!=='checkout.stripe.com')throw new Error('Unexpected checkout destination.');location.assign(u.href);});
 action('portal',async()=>{status('Opening billing management…');const r=await api('/api/portal',{});const u=new URL(r.url);if(u.protocol!=='https:'||u.hostname!=='billing.stripe.com')throw new Error('Unexpected billing destination.');location.assign(u.href);});
 const checkout=new URLSearchParams(location.search).get('checkout');
 if(checkout)safeAction(async()=>{status('Checking payment confirmation…');await api('/api/sync',{checkout});history.replaceState(null,'','/account');await accountRefresh();status(account.plan==='pro'?'Payment confirmed. Pro access is active.':'Payment checked. Your subscription is not active yet. Reload to check again or contact support.');})();
}
function initClientExamples(){
 if(!$('#source'))return;
 const examples=window.PHRASELANE_EXAMPLES||[];
 const choose=id=>{
  const example=examples.find(item=>item.id===id);if(!example)return;
  if(recognition)recognition.abort();
  $('#from').value='en';$('#to').value='ja';$('#source').value=example.en;
  invalidate();$('#output').value=example.ja;$('#latency').textContent='Prepared example · EN → JA';
  status('Example translation. No cloud request made. Edit the English text, then translate your own message.');
  document.querySelectorAll('[data-client-example]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.clientExample===id)));
  $('#source').focus({preventScroll:true});
 };
 document.querySelectorAll('[data-client-example]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.clientExample)));
 for(const id of ['source','from','to'])$('#'+id).addEventListener(id==='source'?'input':'change',()=>document.querySelectorAll('[data-client-example]').forEach(button=>button.setAttribute('aria-pressed','false')));
 const requested=new URLSearchParams(location.search).get('example');if(requested)choose(requested);
}

initTranslation();initClientExamples();initAccount();if($('#source')||$('#createAccount'))api('/api/config').then(c=>{config=c;return accountRefresh();}).catch(()=>status('Account status is unavailable. Please reload before using cloud translation.',true));
window.addEventListener('pagehide',()=>{if(recognition)recognition.abort();if('speechSynthesis'in window)speechSynthesis.cancel();cache.clear();});
