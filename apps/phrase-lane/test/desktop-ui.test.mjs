import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

function ui(invoke) {
  const nodes=new Map(), timers=[];
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{value:id==='direction'?'en-ja':'',textContent:'',disabled:false,addEventListener(){},focus(){},select(){}});
    return nodes.get(id);
  };
  vm.runInNewContext(readFileSync(new URL('../desktop/ui/app.js',import.meta.url),'utf8'),{
    document:{getElementById:element},window:{__TAURI__:{core:{invoke}}},
    crypto:webcrypto,navigator:{clipboard:{writeText:async()=>{}}},
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},
  });
  return {element, timers};
}
test('desktop reconnect discards an old in-flight translation before it can appear',async()=>{
  let finish;
  const u=ui(async(name,args)=>{
    if(name==='start_connection')return {user_code:'ABCD-EFGH'};
    if(name==='poll_connection')return {connected:true};
    if(name==='translate')return new Promise(resolve=>{finish=()=>resolve({state:'completed',request_id:args.requestId,translated:'Old result'});});
  });
  await u.element('connect').onclick();await u.timers.shift()();
  u.element('source').value='Old original';
  const pending=u.element('translate').onclick();
  await u.element('connect').onclick();finish();await pending;
  assert.equal(u.element('output').value,'');
  assert.equal(u.element('translate').disabled,true);
});
test('desktop disconnect cancels a pending connection UI and ignores late approval data',async()=>{
  let finish;
  const u=ui(async name=>{
    if(name==='start_connection')return new Promise(resolve=>{finish=()=>resolve({user_code:'STALE-CODE'});});
    if(name==='disconnect')throw new Error('offline');
  });
  const pending=u.element('connect').onclick();
  await u.element('disconnect').onclick();finish();await pending;
  assert.equal(u.element('code').textContent,'');
  assert.equal(u.element('open').disabled,true);
  assert.equal(u.element('translate').disabled,true);
  assert.equal(u.timers.length,0);
  assert.match(u.element('connection').textContent,/Disconnected locally/);
});
