const LAST_CHECKED = "2026-10-28";

const toolData = [
  {
    id: "runway",
    name: "Runway",
    badge: "Pro workflow",
    free: "Trial-style free tier",
    freeDetail: "125 one-time credits; free generations include a watermark.",
    paid: "Standard: $15/mo",
    bestFor: "Polished text-to-video and image-to-video work",
    strengths: ["Text to video", "Image to video", "Strong camera control", "Professional workflow"],
    limits: ["Free credits do not renew", "Gen-4.5 requires Standard or higher"],
    official: "https://runwayml.com/",
    source: "https://help.runwayml.com/hc/en-us/articles/50404627334547-Free-plan-details",
    score: { marketing: 5, education: 4, social: 4, hobby: 3, text: 5, image: 5, audio: 2, none: 5, free: 2, low: 3, mid: 5, high: 5 }
  },
  {
    id: "pika",
    name: "Pika",
    badge: "Fast & social",
    free: "Free account",
    freeDetail: "0 monthly credits; credit packs can be purchased. No watermark, but the Free plan does not include commercial use.",
    paid: "Starter: $10/mo · Creator: $35/mo",
    bestFor: "Quick social clips and creative experiments",
    strengths: ["All models listed on Free", "No watermark", "Fast creative effects", "Good for social content"],
    limits: ["Free includes no monthly credits", "Commercial license starts on Creator"],
    official: "https://pika.art/",
    source: "https://creation.pika.art/pricing",
    score: { marketing: 3, education: 3, social: 5, hobby: 5, text: 4, image: 5, audio: 4, none: 4, free: 4, low: 5, mid: 5, high: 4 }
  },
  {
    id: "luma",
    name: "Luma AI",
    badge: "Multi-model",
    free: "Free trial credits",
    freeDetail: "Luma states that free trial credits are included on its plans. Current plan prices can change, so check the official pricing page.",
    paid: "Plus / Pro / Ultra",
    bestFor: "Multi-model creative work and continuity across projects",
    strengths: ["Ray video models", "Image + video workflows", "Project continuity", "Marketing and creative use cases"],
    limits: ["Exact current price should be checked before purchase", "Credits expire with the billing cycle"],
    official: "https://lumalabs.ai/",
    source: "https://lumalabs.ai/llm-info",
    score: { marketing: 5, education: 3, social: 4, hobby: 4, text: 4, image: 5, audio: 3, none: 4, free: 2, low: 2, mid: 4, high: 5 }
  },
  {
    id: "firefly",
    name: "Adobe Firefly",
    badge: "Adobe ecosystem",
    free: "Free trial available",
    freeDetail: "Adobe lists free trials on paid Firefly plans. Video uses generative credits.",
    paid: "Standard: $9.99/mo (US) · ¥1,580/mo (JP listed)",
    bestFor: "Marketing teams already using Adobe tools",
    strengths: ["Text to video", "Adobe workflow", "Partner models", "Video + audio tools"],
    limits: ["Video uses premium generative credits", "Plan prices differ by region"],
    official: "https://www.adobe.com/products/firefly.html",
    source: "https://www.adobe.com/products/firefly/plans.html",
    score: { marketing: 5, education: 4, social: 4, hobby: 3, text: 5, image: 4, audio: 5, none: 4, free: 2, low: 5, mid: 5, high: 5 }
  }
];

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

function layout(title, body, description = "Find the AI video tool that fits your workflow, source material and budget.") {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | FramePick</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow">
<meta name="theme-color" content="#0b1020">
<link rel="canonical" href="https://framepick.fmfm-stars.workers.dev/">
<style>
:root{--bg:#07101b;--panel:#0d1827;--panel2:#111f32;--text:#eef5ff;--muted:#9eb0c7;--line:#22344c;--accent:#62e8b6;--accent2:#7aa9ff;--warn:#ffce73;--max:1120px}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 15% 0%,#13243c 0,transparent 30%),var(--bg);color:var(--text);line-height:1.55}
a{color:inherit}button,input,select{font:inherit}button{cursor:pointer}
.wrap{width:min(var(--max),calc(100% - 32px));margin:auto}
header{position:sticky;top:0;z-index:20;background:rgba(7,16,27,.86);backdrop-filter:blur(14px);border-bottom:1px solid rgba(255,255,255,.07)}
.nav{height:68px;display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{font-weight:850;letter-spacing:-.04em;font-size:1.18rem;text-decoration:none}.brand span{color:var(--accent)}
.navlinks{display:flex;gap:18px;align-items:center}.navlinks a{text-decoration:none;color:var(--muted);font-size:.93rem}.navlinks a:hover{color:var(--text)}
.hero{padding:88px 0 46px}.eyebrow{display:inline-flex;gap:8px;align-items:center;border:1px solid var(--line);background:rgba(17,31,50,.65);padding:7px 11px;border-radius:999px;color:#c4d4e8;font-size:.84rem}
h1{font-size:clamp(2.4rem,7vw,5.2rem);line-height:.98;letter-spacing:-.065em;margin:20px 0 20px;max-width:900px}.grad{background:linear-gradient(100deg,var(--accent),#a8fff0 40%,var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.lede{max-width:720px;color:var(--muted);font-size:1.08rem;margin:0 0 26px}.actions{display:flex;flex-wrap:wrap;gap:12px}.btn{border:0;border-radius:12px;padding:12px 17px;font-weight:750;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.primary{background:var(--accent);color:#062016}.secondary{background:#142238;color:var(--text);border:1px solid #2a405d}
.trust{margin-top:28px;display:flex;flex-wrap:wrap;gap:9px;color:#91a7bf;font-size:.82rem}.pill{border:1px solid var(--line);padding:6px 9px;border-radius:999px;background:#0b1625}
section{padding:52px 0}.section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:22px}.section-head h2{font-size:clamp(1.65rem,4vw,2.55rem);letter-spacing:-.04em;margin:0}.section-head p{color:var(--muted);max-width:600px;margin:0}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.card{background:linear-gradient(180deg,rgba(17,31,50,.92),rgba(10,21,35,.92));border:1px solid var(--line);border-radius:18px;padding:20px}
.quiz{display:grid;grid-template-columns:1fr 1fr;gap:16px}.q{border:1px solid var(--line);border-radius:16px;padding:18px;background:#0d1827}.q h3{margin:0 0 12px;font-size:1rem}.options{display:flex;flex-wrap:wrap;gap:8px}.opt{border:1px solid #2a405d;background:#101f31;color:var(--text);border-radius:10px;padding:9px 11px}.opt[aria-pressed="true"]{border-color:var(--accent);background:#12372d;color:#dffff4}
.results{margin-top:16px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.rank{font-size:.78rem;color:var(--accent);font-weight:800}.toolname{font-size:1.25rem;font-weight:820;letter-spacing:-.025em;margin:4px 0}.muted{color:var(--muted)}.tiny{font-size:.81rem}.tag{display:inline-block;font-size:.75rem;color:#b9ccdf;border:1px solid #2b425f;border-radius:999px;padding:4px 8px;margin-bottom:10px}
.tool-card h3{margin:4px 0 6px}.tool-card ul{padding-left:18px;margin:10px 0}.tool-card li{margin:4px 0;color:#c5d3e4}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.meta div{background:#0a1523;border:1px solid #20324a;padding:10px;border-radius:10px}.meta b{display:block;font-size:.76rem;color:#8ea4bd;margin-bottom:3px}.source-link{color:#a8fff0;font-size:.84rem}
.calc{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end}.field label{display:block;font-size:.78rem;color:#9bb0c8;margin-bottom:6px}.field input{width:100%;padding:11px 12px;border-radius:10px;border:1px solid #2a405d;background:#0a1523;color:var(--text)}.output{margin-top:14px;font-size:1rem}.notice{border-left:3px solid var(--warn);background:#171a20;padding:12px 14px;border-radius:10px;color:#d9d5c7;font-size:.86rem}
table{width:100%;border-collapse:collapse;min-width:700px}.tablewrap{overflow:auto;border:1px solid var(--line);border-radius:16px}th,td{text-align:left;padding:13px;border-bottom:1px solid #20324a;vertical-align:top}th{background:#101d2e;font-size:.8rem;color:#aabed6}td{background:#0c1726;font-size:.9rem}
footer{padding:34px 0 50px;border-top:1px solid var(--line);color:#8298b2}.foot{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}.foot a{color:#a8bdd4}
.prose{max-width:820px}.prose h1{font-size:2.5rem}.prose h2{font-size:1.5rem;margin-top:36px}.prose p,.prose li{color:#b6c5d7}
@media(max-width:800px){.navlinks{display:none}.hero{padding-top:62px}.grid,.quiz,.results{grid-template-columns:1fr}.calc{grid-template-columns:1fr}.section-head{align-items:start;flex-direction:column}.meta{grid-template-columns:1fr}h1{font-size:clamp(2.6rem,13vw,4.2rem)}}
</style>
</head>
<body>
<header><div class="wrap nav"><a class="brand" href="/">Frame<span>Pick</span></a><nav class="navlinks"><a href="/#quiz">Finder</a><a href="/#compare">Compare</a><a href="/methodology">Methodology</a><a href="/privacy">Privacy</a></nav></div></header>
${body}
<footer><div class="wrap foot"><div><b>FramePick</b><div class="tiny">Independent AI video tool finder. Not affiliated with the listed companies.</div></div><div class="tiny"><a href="/methodology">Methodology</a> · <a href="/privacy">Privacy</a> · Last checked ${LAST_CHECKED}</div></div></footer>
</body></html>`;
}

function home() {
  const cards = toolData.map(t => `
  <article class="card tool-card">
    <span class="tag">${esc(t.badge)}</span>
    <h3>${esc(t.name)}</h3>
    <p class="muted">${esc(t.bestFor)}</p>
    <div class="meta"><div><b>Free access</b>${esc(t.free)}</div><div><b>Paid</b>${esc(t.paid)}</div></div>
    <ul>${t.strengths.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    <p class="tiny muted">${esc(t.freeDetail)}</p>
    <a class="source-link" href="${esc(t.source)}" target="_blank" rel="noopener noreferrer">Official source ↗</a>
  </article>`).join("");

  const tableRows = toolData.map(t => `<tr><td><b>${esc(t.name)}</b></td><td>${esc(t.free)}</td><td>${esc(t.paid)}</td><td>${esc(t.bestFor)}</td><td><a class="source-link" href="${esc(t.source)}" target="_blank" rel="noopener noreferrer">Verify ↗</a></td></tr>`).join("");

  const dataJSON = JSON.stringify(toolData).replace(/</g, "\\u003c");

  const body = `
<main>
<section class="hero"><div class="wrap">
  <span class="eyebrow">Independent comparison · Updated ${LAST_CHECKED}</span>
  <h1>Pick an AI video tool <span class="grad">without the guesswork.</span></h1>
  <p class="lede">Answer three quick questions. FramePick ranks verified tools by your use case, source material and budget, then shows why each match made the list.</p>
  <div class="actions"><a class="btn primary" href="#quiz">Start the 3-question finder</a><a class="btn secondary" href="#compare">See the comparison</a></div>
  <div class="trust"><span class="pill">No login</span><span class="pill">No payment</span><span class="pill">No ads yet</span><span class="pill">Official sources linked</span></div>
</div></section>

<section id="quiz"><div class="wrap">
  <div class="section-head"><div><span class="eyebrow">60-second finder</span><h2>What fits your workflow?</h2></div><p>The ranking is a transparent score, not a paid placement. Pricing and plan rules can change, so verify before subscribing.</p></div>
  <div class="quiz">
    <div class="q"><h3>1. What are you making?</h3><div class="options" data-key="use"><button class="opt" data-value="marketing">Ads & promotion</button><button class="opt" data-value="education">Explainers & education</button><button class="opt" data-value="social">Social posts</button><button class="opt" data-value="hobby">Hobby & personal</button></div></div>
    <div class="q"><h3>2. What are you starting with?</h3><div class="options" data-key="input"><button class="opt" data-value="text">Text</button><button class="opt" data-value="image">Image / photo</button><button class="opt" data-value="audio">Audio</button><button class="opt" data-value="none">Nothing — start from scratch</button></div></div>
    <div class="q"><h3>3. Monthly budget?</h3><div class="options" data-key="budget"><button class="opt" data-value="free">Free only</button><button class="opt" data-value="low">Under $15</button><button class="opt" data-value="mid">$15–$50</button><button class="opt" data-value="high">$50+</button></div></div>
    <div class="card"><h3 style="margin-top:0">How ranking works</h3><p class="muted">Each answer adds points from a published scoring matrix. Budget matters, but it never overrides a major feature mismatch.</p><a class="source-link" href="/methodology">See methodology →</a></div>
  </div>
  <div id="results" class="results" aria-live="polite"></div>
</div></section>

<section id="compare"><div class="wrap">
  <div class="section-head"><div><span class="eyebrow">Current snapshot</span><h2>Compare the shortlist</h2></div><p>We only publish details we could verify from official sources. Uncertain prices are left as “check official pricing” instead of guessed.</p></div>
  <div class="grid">${cards}</div>
</div></section>

<section><div class="wrap">
  <div class="section-head"><div><span class="eyebrow">At a glance</span><h2>Plan comparison</h2></div></div>
  <div class="tablewrap"><table><thead><tr><th>Tool</th><th>Free access</th><th>Paid entry</th><th>Best for</th><th>Source</th></tr></thead><tbody>${tableRows}</tbody></table></div>
</div></section>

<section id="cost"><div class="wrap">
  <div class="section-head"><div><span class="eyebrow">Simple calculator</span><h2>Estimate cost per finished clip</h2></div><p>This is a budgeting helper, not a credit-to-generation converter. AI tools charge credits differently by model, duration and resolution.</p></div>
  <div class="card">
    <div class="calc">
      <div class="field"><label for="monthly">Monthly plan cost</label><input id="monthly" type="number" min="0" step="0.01" value="15"></div>
      <div class="field"><label for="extra">Extra credit spend</label><input id="extra" type="number" min="0" step="0.01" value="0"></div>
      <div class="field"><label for="clips">Finished clips per month</label><input id="clips" type="number" min="1" step="1" value="20"></div>
      <button class="btn primary" id="calcBtn">Calculate</button>
    </div>
    <div class="output" id="calcOut">Estimated cost per finished clip: <b>$0.75</b></div>
  </div>
  <div class="notice" style="margin-top:12px">Prices and plan rules can change. FramePick does not sell these subscriptions and does not receive payment for ranking a tool in this MVP.</div>
</div></section>
</main>
<script>
const TOOLS = ${dataJSON};
const choices = {use:null,input:null,budget:null};
document.querySelectorAll(".options").forEach(group => {
  group.querySelectorAll(".opt").forEach(btn => {
    btn.addEventListener("click", () => {
      group.querySelectorAll(".opt").forEach(b => b.setAttribute("aria-pressed","false"));
      btn.setAttribute("aria-pressed","true");
      choices[group.dataset.key] = btn.dataset.value;
      render();
    });
  });
});
function render(){
  const box=document.getElementById("results");
  if(!choices.use || !choices.input || !choices.budget){
    box.innerHTML='<div class="card" style="grid-column:1/-1"><b>Choose all three answers</b><div class="muted tiny">Your top three matches will appear here.</div></div>';
    return;
  }
  const scored=TOOLS.map(t=>{
    const score=(t.score[choices.use]||0)+(t.score[choices.input]||0)+(t.score[choices.budget]||0);
    return {...t,score};
  }).sort((a,b)=>b.score-a.score).slice(0,3);
  box.innerHTML=scored.map((t,i)=>'<article class="card"><div class="rank">#'+(i+1)+' MATCH · '+t.score+' pts</div><div class="toolname">'+t.name+'</div><div class="muted tiny">'+t.bestFor+'</div><p class="tiny">'+explain(t)+'</p><a class="source-link" href="'+t.source+'" target="_blank" rel="noopener noreferrer">Verify current plan ↗</a></article>').join("");
}
function explain(t){
  const budget={free:"free access",low:"lower-cost plans",mid:"mid-range plans",high:"higher-budget workflows"}[choices.budget];
  return "Strong fit for "+choices.use+" work using "+choices.input+" as the starting point, with a good score for "+budget+".";
}
render();
function calc(){
  const m=Math.max(0,Number(document.getElementById("monthly").value)||0);
  const e=Math.max(0,Number(document.getElementById("extra").value)||0);
  const c=Math.max(1,Number(document.getElementById("clips").value)||1);
  document.getElementById("calcOut").innerHTML="Estimated cost per finished clip: <b>$"+((m+e)/c).toFixed(2)+"</b>";
}
document.getElementById("calcBtn").addEventListener("click",calc);
</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"FramePick","url":"https://framepick.fmfm-stars.workers.dev/","description":"Independent AI video tool finder and comparison site."}</script>`;
  return layout("AI Video Tool Finder", body);
}

function methodology(){
  return layout("Methodology", `<main><section><div class="wrap prose"><span class="eyebrow">Transparent ranking</span><h1>How FramePick ranks tools</h1><p>FramePick is an independent comparison project. The finder scores each tool against three user-selected factors: intended use, starting material and monthly budget.</p><h2>Source policy</h2><p>We prefer first-party pricing pages, official help centers and official product documentation. If a current price cannot be verified confidently, we do not invent one. We link the source beside every tool so readers can confirm the latest terms.</p><h2>Scoring</h2><p>Each tool receives a 1–5 fit score for each answer. The three values are added and the highest scores are shown first. The current MVP does not use sponsorship, affiliate payouts or advertising revenue to change ranking order.</p><h2>Free vs trial</h2><p>“Free” is not treated as one category. A renewable free allowance, a one-time trial credit, a free account with paid credit packs and a paid-plan free trial are described separately.</p><h2>Update policy</h2><p>Snapshot last checked: ${LAST_CHECKED}. AI plan details change frequently. Always verify the official source immediately before paying.</p></div></section></main>`, "Learn how FramePick verifies pricing and ranks AI video tools.");
}

function privacy(){
  return layout("Privacy", `<main><section><div class="wrap prose"><span class="eyebrow">Privacy-first MVP</span><h1>Privacy</h1><p>FramePick currently works entirely in your browser. The three-question finder and cost calculator do not require an account and do not send your answers to a database.</p><h2>Analytics and advertising</h2><p>This MVP does not intentionally include advertising scripts or third-party analytics. If analytics or advertising is added later, this page will be updated before those features are enabled.</p><h2>External links</h2><p>Links to AI tools and their official pricing or help pages take you to third-party websites. Their privacy policies apply after you leave FramePick.</p><h2>Data retention</h2><p>FramePick does not currently provide user accounts or store finder responses.</p></div></section></main>`, "FramePick privacy information for the current no-login, no-tracking MVP.");
}

function robots(){
  return "User-agent: *\nAllow: /\nSitemap: https://framepick.fmfm-stars.workers.dev/sitemap.xml\n";
}
function sitemap(){
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://framepick.fmfm-stars.workers.dev/</loc></url><url><loc>https://framepick.fmfm-stars.workers.dev/methodology</loc></url><url><loc>https://framepick.fmfm-stars.workers.dev/privacy</loc></url></urlset>`;
}

addEventListener("fetch", event => {
  event.respondWith(handle(event.request));
});

async function handle(request){
  const url = new URL(request.url);
  const headers = {
    "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };
  if(url.pathname === "/robots.txt") return new Response(robots(), {headers:{...headers,"content-type":"text/plain; charset=utf-8"}});
  if(url.pathname === "/sitemap.xml") return new Response(sitemap(), {headers:{...headers,"content-type":"application/xml; charset=utf-8"}});
  if(url.pathname === "/methodology") return new Response(methodology(), {headers:{...headers,"content-type":"text/html; charset=utf-8"}});
  if(url.pathname === "/privacy") return new Response(privacy(), {headers:{...headers,"content-type":"text/html; charset=utf-8"}});
  if(url.pathname !== "/") return new Response("Not found", {status:404,headers:{...headers,"content-type":"text/plain; charset=utf-8"}});
  return new Response(home(), {headers:{...headers,"content-type":"text/html; charset=utf-8"}});
}
