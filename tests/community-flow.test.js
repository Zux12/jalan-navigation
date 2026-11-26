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
test('first trip ignores legacy auto-on sharing, requires explicit consent, and opt-out aborts uploads while reads remain enabled',async()=>{
 const w=new EventTarget(),d=new EventTarget(),box=new EventTarget(),button={},notice={},storage=new Map([['jalan-traffic-sharing-v1','on']]),calls=[];
 notice.querySelector=()=>button;d.getElementById=()=>box;d.createElement=()=>notice;d.body={append(){}};
 const road={key:'vector-abba',level:'0:surface'};let active=true,resolveSignature,readerRoad=road;
 w.JalanVectorMap={getReportRoad:()=>readerRoad};w.JalanGPS={getState:()=>({active,route})};
 w.JalanRouteTraffic={freeFlowAt:()=>60};w.JalanFlowModel=M;w.JalanReportModel=P;
 let storageReadable=true,clock=Date.now();
 class TestDate extends Date{static now(){return clock;}}
 const localStorage={getItem:k=>{if(!storageReadable)throw Error('blocked storage');return storage.get(k)??null;},
  setItem:(k,v)=>{if(!storageReadable)throw Error('blocked storage');storage.set(k,v);}};
 const src=fs.readFileSync(path.join(__dirname,'../passenger-community-flow.js'),'utf8');
 const setPref=on=>{box.checked=on;box.dispatchEvent(new Event('change'));};
 const next=()=>new Promise(resolve=>setImmediate(resolve));
 const crypto={getRandomValues:b=>b.fill(1),subtle:{importKey:async()=>1,sign:()=>new Promise(resolve=>{resolveSignature=()=>resolve(new Uint8Array(32));})}};
 vm.runInNewContext(src,{window:w,document:d,location:{search:'?mode=passenger'},URLSearchParams,localStorage,crypto,TextEncoder,Uint8Array,Date:TestDate,Event,AbortController,setTimeout:()=>1,clearTimeout(){},setInterval(){},
  fetch:async(url,options)=>{calls.push([url,JSON.parse(options.body),options.signal]);return {ok:true,json:async()=>({sections:[{segment:M.roadSegment(shape.cells[0],road),expiresAt:Date.now()+60000,type:'heavy',speed:15,normal:60}]})};}});
 const fix=(lon,age=0)=>w.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{matched:true,gpsReliable:true,gpsAccuracy:5,gpsFixAgeMs:age,gpsPosition:[0,lon],heading:90,speedMps:5,speedLimitIndex:0}}));
 assert.equal(box.checked,false,'legacy v1 ON must not grant v2 sharing permission');
 fix(101);assert.equal(calls.length,0);
 w.dispatchEvent(new Event('jalan:journey-start'));await next();
 assert.equal(w.JalanCommunityFlow.sections(route).length,1);
 fix(101,5000);fix(101.0002,1000);await next();
 assert.equal(resolveSignature,undefined,'pre-consent matched driving cannot start observation');
 setPref(true);
 fix(101.0003,1000);await next();assert.equal(resolveSignature,undefined,'a stale pre-consent fix must not initiate an upload');
 clock+=6000;
 fix(101.0004,5000);await next();assert.equal(resolveSignature,undefined,'first post-consent fix must not reuse the earlier movement');
 fix(101.0006,1000);await next();assert.ok(resolveSignature,'fresh post-consent movement may initiate an upload');
 setPref(false);resolveSignature();await next();assert.equal(calls.filter(([u])=>u.endsWith('observe')).length,0);
 w.dispatchEvent(new Event('jalan:journey-stop'));w.dispatchEvent(new Event('jalan:journey-start'));await next();
 assert.equal(box.checked,false);assert.ok(calls.filter(([u])=>u.endsWith('read')).length>=2);
 for(const other of [null,{...road,level:'1:bridge'},{...road,level:'-1:tunnel'}]){
  readerRoad=other;w.dispatchEvent(new Event('jalan:journey-stop'));w.dispatchEvent(new Event('jalan:journey-start'));await next();
  assert.equal(w.JalanCommunityFlow.sections(route).length,0);assert.equal(w.JalanCommunityFlow.eta(route,0),0);
 }
 readerRoad=road;setPref(true);clock+=6000;fix(101,5000);fix(101.0002,1000);await next();resolveSignature();await next();
 const obs=calls.find(([u])=>u.endsWith('observe'));assert.ok(obs);assert.deepEqual(Object.keys(obs[1]).sort(),['driver','normal','passAgeMs','region','road','segment','speed']);
 assert.equal(obs[1].speed,18);
 // A browser that loses storage access while active must fail closed even if a
 // preference synchronization event arrives with no readable preference.
 storageReadable=false;
 const lost=new Event('storage');lost.key='jalan-traffic-sharing-v2';w.dispatchEvent(lost);
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
 const storage=new Map([['jalan-traffic-sharing-v2','on'],['jalan-traffic-notice-v1','1']]);let deniedSeedReads=0,observes=0;
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
 const data=new Map([['jalan-traffic-sharing-v2','on'],['jalan-traffic-notice-v1','1']]);
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
  const values=new Map([['jalan-traffic-sharing-v2','off'],['jalan-traffic-notice-v1','1']]);
  const localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  vm.runInNewContext(src,{window:w,document:d,location:{search:'?mode=passenger'},URLSearchParams,localStorage,Date,Event,AbortController,
   setTimeout:()=>1,clearTimeout(){},setInterval(){}});
  assert.equal(box.checked,false,'saved opt-out starts disabled');
  if(action==='remove')values.delete('jalan-traffic-sharing-v2');
  if(action==='clear')values.clear();
  if(action==='malformed')values.set('jalan-traffic-sharing-v2','invalid');
  const changed=new Event('storage');changed.key=action==='clear'?null:'jalan-traffic-sharing-v2';w.dispatchEvent(changed);
  assert.equal(box.checked,false,action+' must not re-enable sharing');
  values.set('jalan-traffic-sharing-v2','on');
  const explicitOn=new Event('storage');explicitOn.key='jalan-traffic-sharing-v2';w.dispatchEvent(explicitOn);
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
 const values=new Map([['jalan-traffic-sharing-v2','on'],['jalan-traffic-notice-v1','1']]);
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
 values.delete('jalan-traffic-sharing-v2'); // no storage event, still-readable storage
 finishSignature();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(observations,0,'missing saved preference must not permit the upload');
 assert.equal(box.checked,false,'silent preference deletion fails closed');
});

test('traffic observations never inherit endpoint road identity across an ambiguous or different-grade intervening cell',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'../passenger-community-flow.js'),'utf8');
 const surface={key:'vector-abba',level:'0:surface'},bridge={...surface,level:'1:bridge'};
 for(const interior of [surface,bridge,null]){
  const w=new EventTarget(),d=new EventTarget(),box=new EventTarget(),observations=[];
  d.getElementById=()=>box;
  const middle=shape.cells[1];
  const lon=m=>101+m/111320;
  w.JalanVectorMap={getReportRoad:point=>{
   const m=(point[0]-101)*111320;
   return m>middle.start&&m<middle.end?interior:surface;
  }};
  w.JalanGPS={getState:()=>({active:true,route})};
  w.JalanRouteTraffic={freeFlowAt:()=>60};w.JalanFlowModel=M;w.JalanReportModel=P;
  const data=new Map([['jalan-traffic-sharing-v2','on']]);
  const localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  const crypto={getRandomValues:b=>b.fill(1),subtle:{importKey:async()=>1,sign:async()=>new Uint8Array(32)}};
  let clock=Date.now();class TestDate extends Date{static now(){return clock;}}
  vm.runInNewContext(src,{window:w,document:d,location:{search:'?mode=passenger'},URLSearchParams,localStorage,crypto,TextEncoder,Uint8Array,Date:TestDate,Event,AbortController,
   setTimeout:()=>1,clearTimeout(){},setInterval(){},fetch:async(url,options)=>{
    if(url.endsWith('observe'))observations.push(JSON.parse(options.body));
    return {ok:true,json:async()=>({sections:[]})};
   }});
  const fix=m=>w.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{matched:true,gpsReliable:true,gpsAccuracy:5,gpsFixAgeMs:0,gpsPosition:[0,lon(m)],heading:90,speedMps:5,speedLimitIndex:0}}));
  w.dispatchEvent(new Event('jalan:journey-start'));fix(10);clock+=5000;fix(40);
  await new Promise(resolve=>setImmediate(resolve));clock+=5000;fix(260);
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(observations.some(o=>o.segment===M.roadSegment(shape.cells[0],surface)),'verified surface cell must remain eligible');
  assert.ok(observations.some(o=>o.segment===M.roadSegment(shape.cells[2],surface)),'verified destination cell must remain eligible');
  const middleId=M.roadSegment(middle,surface);
  assert.equal(observations.some(o=>o.segment===middleId),interior===surface,'only independently matched middle cell may inherit surface identity');
  if(interior===bridge)assert.ok(!observations.some(o=>o.segment===M.roadSegment(middle,bridge)),'do not manufacture a bridge observation from surface endpoint fixes');
 }
});

test('resetting the persisted traffic seed rotates the open-tab identifier and rejects a signature from an obsolete seed',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'../passenger-community-flow.js'),'utf8');
 const w=new EventTarget(),d=new EventTarget(),box=new EventTarget(),observations=[];
 d.getElementById=()=>box;
 const road={key:'vector-abba',level:'0:surface'};
 w.JalanVectorMap={getReportRoad:()=>road};w.JalanGPS={getState:()=>({active:true,route})};
 w.JalanRouteTraffic={freeFlowAt:()=>60};w.JalanFlowModel=M;w.JalanReportModel=P;
 const pref='jalan-traffic-sharing-v2',seed='jalan-traffic-seed-v1';
 const values=new Map([[pref,'on'],[seed,'11'.repeat(32)]]);
 const localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 let finishSignature,clock=Date.now();class TestDate extends Date{static now(){return clock;}}
 const crypto={getRandomValues:b=>b.fill(2),subtle:{
  importKey:async(_format,bytes)=>String.fromCharCode(...bytes),
  sign:(_algo,key)=>new Promise(resolve=>{finishSignature=()=>resolve(new Uint8Array(32).fill(parseInt(key.slice(0,2),16)));})}};
 vm.runInNewContext(src,{window:w,document:d,location:{search:'?mode=passenger'},URLSearchParams,localStorage,crypto,TextEncoder,Uint8Array,Date:TestDate,Event,AbortController,
  setTimeout:()=>1,clearTimeout(){},setInterval(){},fetch:async(url,options)=>{
   if(url.endsWith('observe'))observations.push(JSON.parse(options.body));
   return {ok:true,json:async()=>({sections:[]})};
  }});
 const next=()=>new Promise(resolve=>setImmediate(resolve));
 const fix=(lon,age)=>w.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{
  matched:true,gpsReliable:true,gpsAccuracy:5,gpsFixAgeMs:age,gpsPosition:[0,lon],
  heading:90,speedMps:5,speedLimitIndex:0}}));
 const movement=async()=>{finishSignature=undefined;fix(101,5000);fix(101.0002,1000);await next();assert.equal(typeof finishSignature,'function','movement reached signing');};
 w.dispatchEvent(new Event('jalan:journey-start'));
 await movement();finishSignature();await next();
 assert.equal(observations.length,1);
 assert.equal(observations[0].driver,'11'.repeat(32));
 values.clear();
 const cleared=new Event('storage');cleared.key=null;w.dispatchEvent(cleared);
 assert.equal(box.checked,false);
 box.checked=true;box.dispatchEvent(new Event('change'));
 clock+=6000;
 await movement();finishSignature();await next();
 assert.equal(observations.length,2);
 assert.equal(observations[1].segment,observations[0].segment);
 assert.equal(observations[1].driver,'02'.repeat(32),'cleared seed cannot be reused after explicit opt-in');
 clock+=24000;
 await movement();
 values.set(seed,'33'.repeat(32)); // no storage event: changed while signing
 finishSignature();await next();
 assert.equal(observations.length,2,'an obsolete in-flight signature must not be posted');
});
