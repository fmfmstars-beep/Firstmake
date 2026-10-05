import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {identity,requireFresh,start} from '../src/worker.mjs';

// Only local test keys are generated. No Google credentials or network calls.
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'local-auth-test-key',alg:'RS256',use:'sig'};
const clientId='phrase-test.apps.googleusercontent.com';
const nonce='local-test-nonce';
const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt=(claims,header={alg:'RS256',kid:jwk.kid})=>{
 const signingInput=`${encoded(header)}.${encoded(claims)}`;
 return `${signingInput}.${sign('RSA-SHA256',Buffer.from(signingInput),privateKey).toString('base64url')}`;
};
function setup(t){
 const time=Math.floor(Date.now()/1000);
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{assert.equal(url,'https://www.googleapis.com/oauth2/v3/certs');return Response.json({keys:[jwk]});};
 t.after(()=>{globalThis.fetch=original;});
 const claims={iss:'https://accounts.google.com',aud:clientId,sub:'test-google-subject',email:'person@example.test',email_verified:true,iat:time,exp:time+3600,nonce};
 const challenge={created:time,nonce_hash:createHash('sha256').update(nonce).digest('hex')};
 return {time,claims,challenge,env:{GOOGLE_CLIENT_ID:clientId},session:authTime=>({authMethod:'google',authenticatedAt:time,verifiedAuthTime:authTime})};
}

test('normal Google sign-in accepts a signed token without optional auth_time and never invents freshness',async t=>{
 const s=setup(t);
 const result=await identity(jwt(s.claims),s.env,s.challenge);
 assert.equal(result.subject,s.claims.sub);assert.equal(result.email,s.claims.email);assert.equal(result.authTime,0);
 assert.throws(()=>requireFresh(s.session(result.authTime),s.time),error=>error.status===401&&error.message.includes('may not refresh'));
});

test('an older verified Google authentication permits normal sign-in but not sensitive actions',async t=>{
 const s=setup(t),old=s.time-86400;
 const result=await identity(jwt({...s.claims,auth_time:old}),s.env,s.challenge);
 assert.equal(result.authTime,old);
 assert.throws(()=>requireFresh(s.session(result.authTime),s.time),{status:401});
});

test('sensitive actions require both recent app sign-in and actual recent Google authentication',async t=>{
 const s=setup(t),result=await identity(jwt({...s.claims,auth_time:s.time-60}),s.env,s.challenge);
 assert.equal(requireFresh(s.session(result.authTime),s.time).verifiedAuthTime,s.time-60);
 assert.throws(()=>requireFresh({...s.session(result.authTime),authenticatedAt:s.time-301},s.time),{status:401});
 assert.throws(()=>requireFresh({...s.session(result.authTime),authMethod:'recovery'},s.time),{status:401});
 assert.throws(()=>requireFresh(s.session(s.time+31),s.time),{status:401});
});

test('present but invalid auth_time claims are rejected instead of normalized as fresh',async t=>{
 const s=setup(t);
 for(const authTime of [null,0,-1,'123',s.time+120]){
  await assert.rejects(identity(jwt({...s.claims,auth_time:authTime}),s.env,s.challenge),{status:400});
 }
});

test('normal sign-in still rejects wrong issuers, audiences, azp, nonces, token times and unverified email',async t=>{
 const s=setup(t);
 for(const override of [
  {iss:'https://attacker.test'},
  {aud:'other.apps.googleusercontent.com'},
  {aud:[clientId,'other'],azp:'other'},
  {azp:'other'},
  {nonce:'another-nonce'},
  {nonce:undefined},
  {iat:s.time-120},
  {iat:s.time+120},
  {exp:s.time-1},
  {email_verified:false}
 ])await assert.rejects(identity(jwt({...s.claims,...override}),s.env,s.challenge),{status:400});
 const accepted=await identity(jwt({...s.claims,aud:[clientId,'other'],azp:clientId}),s.env,s.challenge);
 assert.equal(accepted.authTime,0);
});

test('normal sign-in still requires the declared algorithm, signing key and an authentic signature',async t=>{
 const s=setup(t);
 await assert.rejects(identity(jwt(s.claims,{alg:'HS256',kid:jwk.kid}),s.env,s.challenge),{status:400});
 await assert.rejects(identity(jwt(s.claims,{alg:'RS256',kid:'unknown-key'}),s.env,s.challenge),{status:400});
 const parts=jwt(s.claims).split('.');parts[1]=encoded({...s.claims,sub:'tampered-subject'});
 await assert.rejects(identity(parts.join('.'),s.env,s.challenge),{status:400});
});

test('Google authorization requests use a supported prompt and opt in to auth_time without claiming forced reauthentication',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async url=>{assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');return Response.json({success:true,hostname:'phrase.test',action:'signup'});};
 const writes=[];
 const env={SITE_ORIGIN:'https://phrase.test',QUOTA_SALT:'local-test-salt',GOOGLE_CLIENT_ID:clientId,GOOGLE_CLIENT_SECRET:'local-test-secret',TURNSTILE_SITE_KEY:'local-site-key',TURNSTILE_SECRET_KEY:'local-turnstile-secret',DB:{prepare(sql){return{bind(...values){return{first:async()=>({amount:1}),run:async()=>{writes.push({sql,values});return{success:true};}};}};}}};
 const request=new Request('https://phrase.test/api/auth/start',{method:'POST',headers:{Origin:'https://phrase.test','Sec-Fetch-Site':'same-origin','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({turnstileToken:'local-verification-token'})});
 const response=await start(request,env,false);assert.equal(response.status,200);
 const url=new URL((await response.json()).url);
 assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.pathname,'/o/oauth2/v2/auth');
 assert.equal(url.searchParams.get('prompt'),'select_account');assert.equal(url.searchParams.has('max_age'),false);
 assert.deepEqual(JSON.parse(url.searchParams.get('claims')),{id_token:{auth_time:{essential:true}}});
 assert.equal(url.searchParams.get('scope'),'openid email');assert.equal(url.searchParams.get('response_type'),'code');
 assert.equal(url.searchParams.get('redirect_uri'),'https://phrase.test/api/auth/callback');
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.match(url.searchParams.get('code_challenge'),/^[A-Za-z0-9_-]{43}$/);
 assert.match(url.searchParams.get('state'),/^[a-f0-9]{64}$/);assert.match(url.searchParams.get('nonce'),/^[a-f0-9]{64}$/);
 assert.equal(writes.length,1);assert.match(writes[0].sql,/INSERT INTO oauth_challenges/);
 assert.match(response.headers.get('Set-Cookie'),/^__Host-phrase_oauth=.*HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
});
