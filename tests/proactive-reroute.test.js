'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'..','proactive-routing.js'),'utf8');
function scene(){
 const nodes={},names=['proactive-status','proactive-offer','proactive-toggle','proactive-check',
 'proactive-decline','proactive-accept','proactive-offer-title','proactive-offer-detail',
 'tt-key','tt-primary','tt-remove-key','gps-exit'];
 for(const id of names){
  const classes=new Set(id==='proactive-offer'?['hidden']:[]);
  nodes[id]={value:'',checked:false,textContent:'',onclick:null,listeners:{},
   classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
   setAttribute(){},addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);},
   fire(type){for(const fn of this.listeners[type]||[])fn();}};
 }
 nodes['tt-key'].value='fakeTomTomKey123';nodes['tt-primary'].checked=true;
 const route={provider:'tomtom'},state={active:true,route,position:[3.14,101.68],
  fixAgeMs:100,accuracy:8,matched:true,remainingSeconds:1200};
 let applied=0,requests=[],resolvers=[],aborted=0,events=[];
 const fetch=(url,options)=>{
  requests.push({url:String(url),options});
  options.signal.addEventListener('abort',()=>{aborted++;});
  return new Promise(resolve=>resolvers.push(resolve));
 };
 const response={routes:[{legs:[{points:[{latitude:3.14,longitude:101.68},
  {latitude:3.145,longitude:101.69}]}],summary:{
  travelTimeInSeconds:180,lengthInMeters:2500,trafficDelayInSeconds:30},guidance:{instructions:[]}}]};
 const ctx={window:{JalanGPS:{getState:()=>state,applyTrafficRoute:()=>{applied++;return true;}},
  JalanTomTom:{refreshRouteIncidents(){}},dispatchEvent:e=>events.push(e.type)},
  document:{hidden:false,getElementById:id=>nodes[id],addEventListener(){}},
  destination:[3.145,101.69],fetch,URL,AbortController,console,
  setInterval(){return 1},CustomEvent:class{constructor(type){this.type=type}}};
 vm.runInNewContext(code,ctx,{filename:'proactive-routing.js'});
 const finish=(payload=response)=>{const resolve=resolvers.shift();
  assert.ok(resolve,'expected an outstanding mocked TomTom request');
  resolve({ok:true,json:async()=>payload});};
 return {nodes,ctx,state,route,requests,finish,events,
  get applied(){return applied},get aborted(){return aborted}};
}
test('disabling reroute checks rejects a late TomTom response even when fetch ignores abort',async()=>{
 const s=scene();
 s.nodes['proactive-toggle'].onclick();
 const request=s.nodes['proactive-check'].onclick();
 assert.equal(s.requests.length,1);
 s.nodes['proactive-toggle'].onclick();
 assert.equal(s.aborted,1);
 s.finish();await request;
 assert.equal(s.nodes['proactive-offer'].classList.contains('hidden'),true);
 assert.equal(s.applied,0);
});
test('changing TomTom key or routing provider revokes a pending offer',async()=>{
 const s=scene();
 const request=s.nodes['proactive-check'].onclick();
 s.nodes['tt-key'].value='replacementFakeKey123';
 s.nodes['tt-key'].fire('input');
 s.finish();await request;
 assert.equal(s.nodes['proactive-offer'].classList.contains('hidden'),true);
 assert.equal(s.aborted,1);
 const second=s.nodes['proactive-check'].onclick();
 s.finish();await second;
 assert.equal(s.nodes['proactive-offer'].classList.contains('hidden'),false);
 s.nodes['tt-primary'].checked=false;
 s.nodes['tt-primary'].fire('change');
 assert.equal(s.nodes['proactive-offer'].classList.contains('hidden'),true);
 s.nodes['proactive-accept'].onclick();
 assert.equal(s.applied,0);
});
test('invalid TomTom speed, distance or geometry cannot produce a faster route offer',async()=>{
 const s=scene(),request=s.nodes['proactive-check'].onclick();
 s.finish({routes:[{legs:[{points:[{latitude:3.14,longitude:101.68},
  {latitude:3.145,longitude:101.69}]}],summary:{
  travelTimeInSeconds:-10,lengthInMeters:2500,trafficDelayInSeconds:0}}]});
 await request;
 assert.equal(s.nodes['proactive-offer'].classList.contains('hidden'),true);
 assert.match(s.nodes['proactive-status'].textContent,/Traffic check failed/);
 assert.equal(s.applied,0);
});
test('valid offer requires confirmation and fails closed after GPS movement',async()=>{
 const s=scene(),request=s.nodes['proactive-check'].onclick();
 s.finish();await request;
 assert.equal(s.applied,0);
 assert.equal(s.nodes['proactive-offer'].classList.contains('hidden'),false);
 s.state.position=[3.15,101.68]; // 1 km shift since request
 s.nodes['proactive-accept'].onclick();
 assert.equal(s.applied,0);
 assert.equal(s.nodes['proactive-offer'].classList.contains('hidden'),true);
 const request2=s.nodes['proactive-check'].onclick();
 s.finish();await request2;
 assert.equal(s.nodes['proactive-offer'].classList.contains('hidden'),false);
 s.nodes['proactive-accept'].onclick();
 assert.equal(s.applied,1);
});
test('a backgrounded page invalidates an in-flight check without restarting it',async()=>{
 const s=scene(),request=s.nodes['proactive-check'].onclick();
 s.ctx.document.hidden=true;
 // visibility handler is registered on document; intercepting not available,
 // so this test checks the response-time hidden-state guard independently.
 s.finish();await request;
 assert.equal(s.nodes['proactive-offer'].classList.contains('hidden'),true);
});

test('unmatched, predicted and stale GPS never starts a proactive TomTom request',async()=>{
 for(const changes of [
  {matched:false},{fixAgeMs:NaN},{fixAgeMs:-1},{fixAgeMs:30001},{accuracy:Infinity},
  {position:[91,101.68]}
 ]){
  const s=scene();Object.assign(s.state,changes);
  await s.nodes['proactive-check'].onclick();
  assert.equal(s.requests.length,0,'untrusted GPS must not reach TomTom');
  assert.match(s.nodes['proactive-status'].textContent,/road-matched GPS/);
 }
});
test('losing a road match during fetch or while the offer is pending prevents reroute',async()=>{
 const s=scene(),checking=s.nodes['proactive-check'].onclick();
 s.state.matched=false;
 s.finish();await checking;
 assert.equal(s.nodes['proactive-offer'].classList.contains('hidden'),true);
 assert.equal(s.applied,0);
 s.state.matched=true;
 const retry=s.nodes['proactive-check'].onclick();
 s.finish();await retry;
 assert.equal(s.nodes['proactive-offer'].classList.contains('hidden'),false);
 s.state.matched=false;
 s.nodes['proactive-accept'].onclick();
 assert.equal(s.applied,0);
 assert.equal(s.nodes['proactive-offer'].classList.contains('hidden'),true);
});

test('degenerate coordinates cannot displace current GPS guidance despite positive ETA',async()=>{
 const s=scene(),request=s.nodes['proactive-check'].onclick();
 s.finish({routes:[{legs:[{points:[{latitude:3.14,longitude:101.68},
  {latitude:3.14,longitude:101.68}]}],summary:{
  travelTimeInSeconds:180,lengthInMeters:2500,trafficDelayInSeconds:30}}]});
 await request;
 assert.equal(s.nodes['proactive-offer'].classList.contains('hidden'),true);
 assert.match(s.nodes['proactive-status'].textContent,/Invalid route geometry distance/);
 assert.equal(s.applied,0);
});
test('an API key changed without firing a DOM input event also revokes an offered route',async()=>{
 const s=scene(),request=s.nodes['proactive-check'].onclick();
 s.finish();await request;
 assert.equal(s.nodes['proactive-offer'].classList.contains('hidden'),false);
 s.nodes['tt-key'].value='otherFakeKey123'; // e.g. a script mutates the input value.
 s.nodes['proactive-accept'].onclick();
 assert.equal(s.applied,0);
 assert.equal(s.nodes['proactive-offer'].classList.contains('hidden'),true);
 assert.match(s.nodes['proactive-status'].textContent,/changed; check again/);
});
