'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const M=require('../community-flow-model'),P=require('../community-report-model');
const r=coords=>({provider:'tomtom',knownTrafficDelay:0,duration:200,geometry:{coordinates:coords}});
const route=r([[101,0],[101+1000/111320,0]]),shape=M.layout(route);
function rows(type='heavy'){return shape.cells.map(c=>({...c,type,speed:15,normal:60,expiresAt:Date.now()+300000}));}
test('directed cells share an address across routes, keep parallel roads and opposing travel separate',()=>{
 const [a,b]=route.geometry.coordinates;
 const prefix=M.layout(r([[100.999,0],a,b])).edges[1].map(c=>c.segment);
 assert.deepEqual(prefix,shape.cells.map(c=>c.segment));
 for(const other of [r([b,a]),r([[a[0],.00008],[b[0],.00008]])])assert.ok(M.layout(other).cells.every(c=>!prefix.includes(c.segment)));
 assert.ok(shape.cells.every(c=>c.end-c.start<=120));assert.equal(M.locate(shape,0,1).cell,shape.cells.at(-1));
});
test('1 km at 15 instead of 60 adds three minutes; remaining, provider delay and expiry reduce the adjustment',()=>{
 const sections=rows(),eta=(changes,f=0)=>Math.round(M.remainingDelay({...route,...changes},sections,f));
 assert.equal(eta({}),180);assert.equal(eta({},.5),90);assert.equal(eta({},1),0);
 assert.equal(eta({knownTrafficDelay:null}),0);assert.equal(eta({knownTrafficDelay:100}),0);
 const traffic={sectionType:'TRAFFIC',startPointIndex:0,endPointIndex:1};
 assert.equal(eta({trafficSections:[{...traffic,effectiveSpeedInKmh:30}]}),120);
 assert.equal(eta({trafficSections:[{...traffic,delayInSeconds:60}]}),120);
 assert.equal(eta({trafficSections:[{...traffic,delayInSeconds:60}]},.5),30);
 assert.equal(eta({trafficSections:[{...traffic,simpleCategory:'ROAD_CLOSURE'}]}),0);
 assert.equal(M.remainingDelay(route,rows('smooth'),0),0);assert.equal(M.remainingDelay(route,sections,0,Date.now()+310000),0);
});
test('first-trip sharing needs measured travel on a matched road, an opt-out aborts uploads and leaves area reads enabled',async()=>{
 const w=new EventTarget(),d=new EventTarget(),box=new EventTarget(),button={},notice={},storage=new Map(),calls=[];
 notice.querySelector=()=>button;d.getElementById=()=>box;d.createElement=()=>notice;d.body={append(){}};
 const road={key:'vector-abba',level:'0:surface'};let active=true,resolveSignature,readerRoad=road;
 w.JalanVectorMap={getReportRoad:()=>readerRoad};w.JalanGPS={getState:()=>({active,route})};
 w.JalanRouteTraffic={freeFlowAt:()=>60};w.JalanFlowModel=M;w.JalanReportModel=P;
 let storageReadable=true;
 const localStorage={getItem:k=>{if(!storageReadable)throw Error('blocked storage');return storage.get(k)??null;},
  setItem:(k,v)=>{if(!storageReadable)throw Error('blocked storage');storage.set(k,v);}};
 const src=fs.readFileSync(path.join(__dirname,'../passenger-community-flow.js'),'utf8');
 const setPref=on=>{box.checked=on;box.dispatchEvent(new Event('change'));};
 const next=()=>new Promise(resolve=>setImmediate(resolve));
 const crypto={getRandomValues:b=>b.fill(1),subtle:{importKey:async()=>1,sign:()=>new Promise(resolve=>{resolveSignature=()=>resolve(new Uint8Array(32));})}};
 vm.runInNewContext(src,{window:w,document:d,location:{search:'?mode=passenger'},URLSearchParams,localStorage,crypto,TextEncoder,Uint8Array,Date,Event,AbortController,setTimeout:()=>1,clearTimeout(){},setInterval(){},
  fetch:async(url,options)=>{calls.push([url,JSON.parse(options.body),options.signal]);return {ok:true,json:async()=>({sections:[{segment:M.roadSegment(shape.cells[0],road),expiresAt:Date.now()+60000,type:'heavy',speed:15,normal:60}]})};}});
 const fix=(lon,age=0)=>w.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{matched:true,gpsReliable:true,gpsAccuracy:5,gpsFixAgeMs:age,gpsPosition:[0,lon],heading:90,speedMps:5,speedLimitIndex:0}}));
 assert.equal(box.checked,true);fix(101);assert.equal(calls.length,0);
 w.dispatchEvent(new Event('jalan:journey-start'));await next();
 assert.equal(w.JalanCommunityFlow.sections(route).length,1);
 fix(101,5000);fix(101.0002,1000);await next();assert.ok(resolveSignature);
 setPref(false);resolveSignature();await next();assert.equal(calls.filter(([u])=>u.endsWith('observe')).length,0);
 w.dispatchEvent(new Event('jalan:journey-stop'));w.dispatchEvent(new Event('jalan:journey-start'));await next();
 assert.equal(box.checked,false);assert.ok(calls.filter(([u])=>u.endsWith('read')).length>=2);
 for(const other of [null,{...road,level:'1:bridge'},{...road,level:'-1:tunnel'}]){
  readerRoad=other;w.dispatchEvent(new Event('jalan:journey-stop'));w.dispatchEvent(new Event('jalan:journey-start'));await next();
  assert.equal(w.JalanCommunityFlow.sections(route).length,0);assert.equal(w.JalanCommunityFlow.eta(route,0),0);
 }
 readerRoad=road;setPref(true);fix(101,5000);fix(101.0002,1000);await next();resolveSignature();await next();
 const obs=calls.find(([u])=>u.endsWith('observe'));assert.ok(obs);assert.deepEqual(Object.keys(obs[1]).sort(),['driver','normal','passAgeMs','region','road','segment','speed']);
 assert.equal(obs[1].speed,18);
 // A browser that loses storage access while active must fail closed even if a
 // preference synchronization event arrives with no readable preference.
 storageReadable=false;
 const lost=new Event('storage');lost.key='jalan-traffic-sharing-v1';w.dispatchEvent(lost);
 assert.equal(box.checked,false,'blocked preference reads cannot silently enable sharing');
 const sent=calls.filter(([u])=>u.endsWith('observe')).length;
 fix(101.0004);await next();
 assert.equal(calls.filter(([u])=>u.endsWith('observe')).length,sent);
 setPref(true);assert.equal(box.checked,false,'a failed preference save cannot enable sharing');
 active=false;w.dispatchEvent(new Event('jalan:journey-stop'));fix(101.0004);
});
test('denial of observation token storage prevents uploading even after reliable route-matched travel',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'../passenger-community-flow.js'),'utf8'),w=new EventTarget(),d=new EventTarget(),box=new EventTarget(),button={},notice={querySelector:()=>button};
 d.getElementById=()=>box;d.createElement=()=>notice;d.body={append(){}};
 const road={key:'vector-abba',level:'0:surface'};
 w.JalanVectorMap={getReportRoad:()=>road};w.JalanGPS={getState:()=>({active:true,route})};
 w.JalanRouteTraffic={freeFlowAt:()=>60};w.JalanFlowModel=M;w.JalanReportModel=P;
 const storage=new Map([['jalan-traffic-sharing-v1','on'],['jalan-traffic-notice-v1','1']]);let deniedSeedReads=0,observes=0;
 const localStorage={getItem:k=>{if(k==='jalan-traffic-seed-v1'){deniedSeedReads++;throw Error('token storage denied');}return storage.get(k)??null;},setItem:(k,v)=>storage.set(k,v)};
 const crypto={getRandomValues:b=>b.fill(1),subtle:{importKey:async()=>1,sign:async()=>new Uint8Array(32)}};
 vm.runInNewContext(src,{window:w,document:d,location:{search:'?mode=passenger'},URLSearchParams,localStorage,crypto,TextEncoder,Uint8Array,Date,Event,AbortController,
  setTimeout:()=>1,clearTimeout(){},setInterval(){},fetch:async url=>{if(url.endsWith('observe'))observes++;return {ok:true,json:async()=>({sections:[]})};}});
 assert.equal(box.checked,true);
 const fix=(lon,age)=>w.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{matched:true,gpsReliable:true,gpsAccuracy:5,gpsFixAgeMs:age,gpsPosition:[0,lon],heading:90,speedMps:5,speedLimitIndex:0}}));
 w.dispatchEvent(new Event('jalan:journey-start'));fix(101,5000);fix(101.0002,1000);
 await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
 assert.ok(deniedSeedReads>0,'test reached observation token storage');
 assert.equal(box.checked,false,'denied token storage must turn sharing off');
 assert.equal(observes,0,'no passive traffic observation may leave the browser');
});
test('coincident surface, bridge and tunnel cells have distinct identities; ambiguous grade cannot affect ETA',()=>{
 const cell=shape.cells[0],surface={key:'vector-abba',level:'0:surface'};
 const bridge={...surface,level:'1:bridge'},tunnel={...surface,level:'-1:tunnel'};
 const ids=[surface,bridge,tunnel].map(road=>M.roadSegment(cell,road));assert.equal(new Set(ids).size,3);
 assert.equal(M.roadSegment(cell,null),null);
 assert.equal(M.readRoad(shape,cell,()=>null),null);
 let n=0;assert.equal(M.readRoad(shape,cell,()=>++n===2?bridge:surface),null);
 assert.equal(M.roadSegment(cell,M.readRoad(shape,cell,()=>bridge)),ids[1]);
});

test('storage revoked silently while HMAC signing prevents a late observation upload',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'../passenger-community-flow.js'),'utf8');
 const w=new EventTarget(),d=new EventTarget(),box=new EventTarget(),button={},notice={querySelector:()=>button};
 d.getElementById=()=>box;d.createElement=()=>notice;d.body={append(){}};
 const road={key:'vector-abba',level:'0:surface'};
 w.JalanVectorMap={getReportRoad:()=>road};w.JalanGPS={getState:()=>({active:true,route})};
 w.JalanRouteTraffic={freeFlowAt:()=>60};w.JalanFlowModel=M;w.JalanReportModel=P;
 const data=new Map([['jalan-traffic-sharing-v1','on'],['jalan-traffic-notice-v1','1']]);
 let readable=true,completeSignature,observations=0;
 const localStorage={getItem:k=>{if(!readable)throw Error('storage revoked');return data.get(k)??null;},
  setItem:(k,v)=>{if(!readable)throw Error('storage revoked');data.set(k,v);}};
 const crypto={getRandomValues:b=>b.fill(1),subtle:{importKey:async()=>1,
  sign:()=>new Promise(resolve=>{completeSignature=()=>resolve(new Uint8Array(32));})}};
 vm.runInNewContext(src,{window:w,document:d,location:{search:'?mode=passenger'},URLSearchParams,localStorage,
  crypto,TextEncoder,Uint8Array,Date,Event,AbortController,setTimeout:()=>1,clearTimeout(){},setInterval(){},
  fetch:async url=>{if(url.endsWith('observe'))observations++;return {ok:true,json:async()=>({sections:[]})};}});
 w.dispatchEvent(new Event('jalan:journey-start'));
 const fix=(lon,age)=>w.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{
  matched:true,gpsReliable:true,gpsAccuracy:5,gpsFixAgeMs:age,gpsPosition:[0,lon],
  heading:90,speedMps:5,speedLimitIndex:0}}));
 fix(101,5000);fix(101.0002,1000);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(typeof completeSignature,'function','test reached pending asynchronous HMAC');
 // No storage event is delivered; storage becomes inaccessible during await sign().
 readable=false;completeSignature();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(observations,0,'revocation before POST must prevent the upload');
 assert.equal(box.checked,false,'unreadable live preference must fail closed');
});

test('cross-tab removal, clear or malformed sharing preference cannot silently re-enable uploads',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../passenger-community-flow.js'),'utf8');
 for(const action of ['remove','clear','malformed']){
  const w=new EventTarget(),d=new EventTarget(),box=new EventTarget(),button={},notice={querySelector:()=>button};
  d.getElementById=()=>box;d.createElement=()=>notice;d.body={append(){}};
  w.JalanFlowModel=M;w.JalanReportModel=P;w.JalanGPS={getState:()=>({active:false,route:null})};
  const values=new Map([['jalan-traffic-sharing-v1','off'],['jalan-traffic-notice-v1','1']]);
  const localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  vm.runInNewContext(src,{window:w,document:d,location:{search:'?mode=passenger'},URLSearchParams,localStorage,Date,Event,AbortController,
   setTimeout:()=>1,clearTimeout(){},setInterval(){}});
  assert.equal(box.checked,false,'saved opt-out starts disabled');
  if(action==='remove')values.delete('jalan-traffic-sharing-v1');
  if(action==='clear')values.clear();
  if(action==='malformed')values.set('jalan-traffic-sharing-v1','invalid');
  const changed=new Event('storage');changed.key=action==='clear'?null:'jalan-traffic-sharing-v1';w.dispatchEvent(changed);
  assert.equal(box.checked,false,action+' must not re-enable sharing');
  values.set('jalan-traffic-sharing-v1','on');
  const explicitOn=new Event('storage');explicitOn.key='jalan-traffic-sharing-v1';w.dispatchEvent(explicitOn);
  assert.equal(box.checked,true,'only an explicitly persisted ON may re-enable sharing');
 }
});
test('silent deletion of persisted preference while HMAC awaits prevents a traffic observation',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'../passenger-community-flow.js'),'utf8');
 const w=new EventTarget(),d=new EventTarget(),box=new EventTarget(),button={},notice={querySelector:()=>button};
 d.getElementById=()=>box;d.createElement=()=>notice;d.body={append(){}};
 const road={key:'vector-abba',level:'0:surface'};
 w.JalanVectorMap={getReportRoad:()=>road};w.JalanGPS={getState:()=>({active:true,route})};
 w.JalanRouteTraffic={freeFlowAt:()=>60};w.JalanFlowModel=M;w.JalanReportModel=P;
 const values=new Map([['jalan-traffic-sharing-v1','on'],['jalan-traffic-notice-v1','1']]);
 const localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 let finishSignature,observations=0;
 const crypto={getRandomValues:b=>b.fill(1),subtle:{importKey:async()=>1,
  sign:()=>new Promise(resolve=>{finishSignature=()=>resolve(new Uint8Array(32));})}};
 vm.runInNewContext(src,{window:w,document:d,location:{search:'?mode=passenger'},URLSearchParams,localStorage,
  crypto,TextEncoder,Uint8Array,Date,Event,AbortController,setTimeout:()=>1,clearTimeout(){},setInterval(){},
  fetch:async url=>{if(url.endsWith('observe'))observations++;return {ok:true,json:async()=>({sections:[]})};}});
 w.dispatchEvent(new Event('jalan:journey-start'));
 const fix=(lon,age)=>w.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{
  matched:true,gpsReliable:true,gpsAccuracy:5,gpsFixAgeMs:age,gpsPosition:[0,lon],
  heading:90,speedMps:5,speedLimitIndex:0}}));
 fix(101,5000);fix(101.0002,1000);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(typeof finishSignature,'function','test reached asynchronous HMAC');
 values.delete('jalan-traffic-sharing-v1'); // no storage event, still-readable storage
 finishSignature();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(observations,0,'missing saved preference must not permit the upload');
 assert.equal(box.checked,false,'silent preference deletion fails closed');
});
