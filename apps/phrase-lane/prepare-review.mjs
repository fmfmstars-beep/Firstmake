// Build a read-only sample review. This is NOT a live AI/auth/billing deployment.
import {cp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const target=process.argv[2];if(!target||!path.isAbsolute(target))throw Error('Pass an absolute empty review directory.');
await mkdir(target,{recursive:true});
if((await readdir(target)).some(n=>!['.openai','.git'].includes(n)))throw Error('Review directory must be empty.');
await cp('public',path.join(target,'dist'),{recursive:true});
const dist=path.join(target,'dist');
await mkdir(path.join(dist,'app'),{recursive:true});
await cp('public/translate.html',path.join(dist,'app/index.html'));
await cp('public/translate.html',path.join(dist,'index.html'));
// Force clear review labeling on every HTML page. No real customer records.
async function label(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){await label(p);continue;}if(!p.endsWith('.html'))continue;let html=await readFile(p,'utf8');html=html.replace(/<link[^>]*rel=["']canonical["'][^>]*>/gi,'').replace('<body>','<body><aside class="review-banner" role="note">PRIVATE DESIGN REVIEW · Fixed examples only. Cloud translation, account connection and purchases are not enabled here.</aside>').replace('</head>','<meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/review.css"></head>');await writeFile(p,html);}}
await label(dist);
await mkdir(path.join(dist,'api'),{recursive:true});
await writeFile(path.join(dist,'api/config'),JSON.stringify({sampleOnly:true,translationEnabled:false,replyEnabled:false,billing:false,billingReady:false,oidcReady:false}));
await writeFile(path.join(dist,'api/me'),JSON.stringify({signedIn:false,serviceReady:false,oidcReady:false,billingReady:false,canAdmin:false}));
await writeFile(path.join(dist,'review.css'),'.review-banner{padding:12px 20px;background:#e5eee6;color:#24493d;font:12px/1.6 system-ui;text-align:center;border-bottom:1px solid #c4d6ca}');
await writeFile(path.join(dist,'_headers'),'/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Cache-Control: no-store\n/api/*\n  Content-Type: application/json\n/offline\n  X-PhraseLane-Offline: 1\n');
await writeFile(path.join(target,'README.md'),'# PhraseLane private UI review\n\nDerived from fmfmstars-beep/Firstmake, feat/phraselane-desktop-web-20261014. Existing production and staging Workers are unchanged. This static review only demonstrates fixed examples and layout. It does not proxy live API data, authenticate users, charge money or distribute an EXE.\n');
console.log(target);
