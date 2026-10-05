'use strict';
fetch('/api/config').then(async response => {
 if (!response.ok) throw new Error('Unavailable');
 const config = await response.json();
 document.querySelector('#pricingAvailability').textContent = config.billing ? 'Pro is available. Review your plan and terms before checkout.' : 'Free tools are available now. Pro purchases are not open yet; no payment is collected.';
 if(config.billing){document.querySelector('#proBadge').textContent='Pro · monthly';document.querySelector('#proCta').textContent='Choose Pro ↗';}
}).catch(()=>{document.querySelector('#pricingAvailability').textContent='Free local tools are available. We could not confirm Pro availability. Please try again later.';});
