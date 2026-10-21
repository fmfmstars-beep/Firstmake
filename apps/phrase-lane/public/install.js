'use strict';
let installPrompt=null;
const install=document.getElementById('install-app'),status=document.getElementById('install-status');
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{if(status)status.textContent='App installation is unavailable here. The website still works online.';});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;if(install)install.hidden=false;});
install?.addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();const choice=await installPrompt.userChoice;if(status)status.textContent=choice.outcome==='accepted'?'Installation requested. Check your browser to finish.':'Installation canceled. You can keep using the website.';installPrompt=null;install.hidden=true;});
window.addEventListener('appinstalled',()=>{if(status)status.textContent='App installed on this device.';if(install)install.hidden=true;});
