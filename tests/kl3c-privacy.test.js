'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','jalan-kl-3c.js'),'utf8');
function scene({defer=false,postUnavailable=false}={}){
 const elements={};
 for(const id of ['kl3c-status','kl3c-consent','kl3c-run','kl3c-gps','kl3c-clear'])
  elements[id]={checked:false,textContent:'',onclick:null,onchange:null};
 let fetches=[],gpsCalls=0,gpsCallback=null,drawn=0,cleared=0,aborts=0,pendingResolve;
 const layer={addTo(){return this},clearLayers(){cleared++}};
 const card={className:'',innerHTML:'',querySelector(selector){
  return elements[selector.replace('#','')];
 }};
 const document={
  getElementById(id){return id==='panel-details'?{prepend(){}}:null},
  createElement(tag){assert.equal(tag,'section');return card},
  querySelector(){return null}
 };
 const L={layerGroup:()=>layer,polyline(){
  drawn++;
  return {addTo(){return {getBounds(){return {}}}}};
 }};
 const map={fitBounds(){}};
 const navigator={geolocation:{getCurrentPosition(fn){gpsCalls++;gpsCallback=fn}}};
 const fakeResponse=()=>postUnavailable?({
  ok:false,json:async()=>({ok:false,error:'POST endpoint not deployed'})
 }):({
  ok:true,json:async()=>({
   ok:true,distanceMeters:1200,edgeCount:3,startSnapMeters:0,
   endSnapMeters:18,illustrativeEtaMinutes:2.4,
   geometry:{type:'LineString',coordinates:[[101.686,3.139],[101.695,3.148]]}
  })
 });
 const fetch=(url,opts)=>{
  fetches.push({url:String(url),opts});
  if(opts.signal)opts.signal.addEventListener('abort',()=>aborts++);
  if(defer)return new Promise(resolve=>{pendingResolve=resolve});
  return Promise.resolve(fakeResponse());
 };
 const context={window:{L},document,L,map,navigator,fetch,URL,Error,
  AbortController,console,startPoint:[3.139,101.686],destination:[3.148,101.695]};
 vm.runInNewContext(src,context,{filename:'jalan-kl-3c.js'});
 const tick=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve))};
 return {elements,fetches,tick,setStart(p){context.startPoint=p},get gpsCalls(){return gpsCalls},
  gps:(p)=>gpsCallback?.(p),resolve:()=>pendingResolve?.(fakeResponse()),
  get drawn(){return drawn},get cleared(){return cleared},get aborts(){return aborts}};
}
test('no consent means no coordinates transmitted and no GPS permission prompt',async()=>{
 const s=scene();
 s.elements['kl3c-run'].onclick();
 s.elements['kl3c-gps'].onclick();
 await s.tick();
 assert.equal(s.fetches.length,0);
 assert.equal(s.gpsCalls,0);
 assert.match(s.elements['kl3c-status'].textContent,/No coordinates sent/);
});
test('explicit consent permits one bounded read-only experimental request',async()=>{
 const s=scene();
 s.elements['kl3c-consent'].checked=true;
 s.elements['kl3c-consent'].onchange();
 s.elements['kl3c-run'].onclick();
 await s.tick();
 assert.equal(s.fetches.length,1);
 assert.match(s.fetches[0].url,/mterm2026-559f9bf571b5\.herokuapp\.com/);
 assert.equal(new URL(s.fetches[0].url).search,'','Coordinates must not enter router URL logs');
 assert.equal(s.fetches[0].opts.method,'POST');
 assert.equal(s.fetches[0].opts.credentials,'omit');
 assert.equal(s.fetches[0].opts.headers['Content-Type'],'application/json');
 assert.deepEqual(JSON.parse(s.fetches[0].opts.body),{
   startLat:3.139,startLng:101.686,endLat:3.148,endLng:101.695
 });
 assert.equal(s.fetches[0].opts.cache,'no-store');
 assert.equal(s.fetches[0].opts.referrerPolicy,'no-referrer');
 assert.equal(s.drawn,1);
 assert.match(s.elements['kl3c-status'].textContent,/NOT FOR DRIVING/);
});
test('unavailable POST fails closed; no legacy GET with location query fallback',async()=>{
 const s=scene({postUnavailable:true}),c=s.elements['kl3c-consent'];
 c.checked=true;c.onchange();
 s.elements['kl3c-run'].onclick();await s.tick();
 assert.equal(s.fetches.length,1);
 assert.equal(s.fetches[0].opts.method,'POST');
 assert.equal(new URL(s.fetches[0].url).search,'');
 assert.match(s.elements['kl3c-status'].textContent,/POST endpoint not deployed/);
 assert.equal(s.drawn,0);
});
test('revocation aborts pending request and prevents drawing a late response',async()=>{
 const s=scene({defer:true});
 const consent=s.elements['kl3c-consent'];
 consent.checked=true;consent.onchange();
 s.elements['kl3c-run'].onclick();
 assert.equal(s.fetches.length,1);
 consent.checked=false;consent.onchange();
 assert.equal(s.aborts,1);
 s.resolve();await s.tick();
 assert.equal(s.drawn,0);
 s.elements['kl3c-run'].onclick();
 assert.equal(s.fetches.length,1);
});
test('clear preview also clears consent and blocks further route calls',async()=>{
 const s=scene();
 const consent=s.elements['kl3c-consent'];
 consent.checked=true;consent.onchange();
 s.elements['kl3c-clear'].onclick();
 assert.equal(consent.checked,false);
 s.elements['kl3c-run'].onclick();await s.tick();
 assert.equal(s.fetches.length,0);
 assert.ok(s.cleared>=1);
});
test('GPS permission callback after consent revocation never transmits coordinates',async()=>{
 const s=scene(),c=s.elements['kl3c-consent'];
 c.checked=true;c.onchange();
 s.elements['kl3c-gps'].onclick();
 assert.equal(s.gpsCalls,1);
 c.checked=false;c.onchange();
 s.gps({coords:{accuracy:9,latitude:3.14,longitude:101.69}});
 await s.tick();assert.equal(s.fetches.length,0);
});
test('rejects coordinates outside bounded KL experimental pilot despite consent',async()=>{
 const s=scene(),c=s.elements['kl3c-consent'];
 c.checked=true;c.onchange();
 s.setStart([35.1,-120.3]);
 s.elements['kl3c-run'].onclick();await s.tick();
 assert.equal(s.fetches.length,0);
});
test('client-side consent is not persisted to localStorage or sessionStorage',()=>{
 assert.doesNotMatch(src,/localStorage|sessionStorage|document\.cookie/);
 assert.match(src,/id="kl3c-consent"/);
 assert.match(src,/server-side access logs may retain the request/);
});
