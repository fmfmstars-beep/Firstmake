'use strict';
const $=id=>document.getElementById(id),invoke=window.__TAURI__?.core?.invoke;
let connected=false,busy=false,pollTimer=null,pollGeneration=0,epoch=0,retry=null,expiryTimer=null;
const refresh=()=>{$('count').textContent=`${[...$('source').value].length} / 1,000`;$('translate').disabled=!connected||busy||!$('source').value.trim()||[...$('source').value].length>1000;$('copy').disabled=!$('output').value;};
function invalidate(){epoch++;retry=null;$('output').value='';refresh();}
$('source').addEventListener('input',invalidate);$('direction').addEventListener('change',invalidate);
$('clear').onclick=()=>{$('source').value='';invalidate();$('status').textContent='Cleared from this window.';};
function resetConnection(){
 connected=false;clearTimeout(pollTimer);clearTimeout(expiryTimer);invalidate();
 $('code').textContent='';$('open').disabled=true;$('disconnect').disabled=true;
}
$('connect').onclick=async()=>{
 if(!invoke)return;
 const gen=++pollGeneration;resetConnection();$('connect').disabled=true;
 try{
  await invoke('disconnect');
  if(gen!==pollGeneration)return;
  const d=await invoke('start_connection');
  if(gen!==pollGeneration)return;
  $('code').textContent=d.user_code;$('open').disabled=false;$('disconnect').disabled=false;
  $('connection').textContent='Open your browser, sign in, and enter this code. Never approve a code someone sent you.';
  const end=Date.now()+Math.min(600,Math.max(0,Number(d.expires_in)||0))*1000;
  async function poll(){
   if(gen!==pollGeneration)return;
   if(Date.now()>=end){resetConnection();$('connection').textContent='Code expired. Connect again.';return;}
   try{
    const result=await invoke('poll_connection');
    if(gen!==pollGeneration)return;
    if(result.connected){
     connected=true;$('code').textContent='';$('open').disabled=true;
     $('connection').textContent='Connected for up to 15 minutes. No token is stored on disk.';refresh();
     expiryTimer=setTimeout(()=>{if(gen!==pollGeneration)return;++pollGeneration;resetConnection();$('connection').textContent='Connection expired. Connect again.';invoke('disconnect').catch(()=>{});},Math.min(900,Math.max(0,Number(result.expires_in)||0))*1000);
     return;
    }
    pollTimer=setTimeout(poll,5000);
   }catch(e){if(gen===pollGeneration){resetConnection();$('connection').textContent=String(e);}}
  }
  pollTimer=setTimeout(poll,5000);
 }catch(e){if(gen===pollGeneration){resetConnection();$('connection').textContent=String(e);}}
 finally{if(gen===pollGeneration)$('connect').disabled=false;}
};
$('open').onclick=()=>invoke('open_connection_page').catch(e=>{$('connection').textContent=String(e);});
$('disconnect').onclick=async()=>{
 const gen=++pollGeneration;resetConnection();$('connect').disabled=true;
 try{await invoke('disconnect');}
 catch{/* Local state is already cleared; the server enforces expiry. */}
 finally{if(gen===pollGeneration){$('connect').disabled=false;$('connection').textContent='Disconnected locally. If offline, the server token expires within 15 minutes.';}}
};
$('translate').onclick=async()=>{if(busy)return;const key=JSON.stringify([$('source').value,$('direction').value]);if(!retry||retry.key!==key)retry={key,id:crypto.randomUUID()};const gen=++epoch;busy=true;$('output').value='';refresh();$('status').textContent='Translating…';try{const result=await invoke('translate',{text:$('source').value,direction:$('direction').value,requestId:retry.id});if(gen!==epoch)return;if(result.state!=='completed'||result.request_id!==retry.id)throw Error('Incomplete translation. Retry the same request.');$('output').value=result.translated;$('status').textContent='Translation complete. Check the meaning before sharing.';}catch(e){if(gen===epoch)$('status').textContent=String(e);}finally{busy=false;refresh();}};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('output').value);$('status').textContent='Copied.';}catch{$('output').focus();$('output').select();$('status').textContent='Press Ctrl+C to copy the selected translation.';}};
if(!invoke){$('connect').disabled=true;$('connection').textContent='This screen must run inside the native preview application.';}
refresh();
