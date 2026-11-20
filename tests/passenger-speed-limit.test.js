'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path'),source=fs.readFileSync(path.join(__dirname,'../passenger-speed-limit.js'),'utf8');
const event=(target,name,detail)=>target.dispatchEvent(new CustomEvent(name,{detail}));
function scene(){
 const win=new EventTarget(),doc=new EventTarget(),primary=Object.assign(new EventTarget(),{checked:true});
 const key=Object.assign(new EventTarget(),{value:'fixture-only'}),remove=new EventTarget();
 const badge={hidden:true,setAttribute(){},removeAttribute(){}},timers=new Map(),requests=[];
 let now=1700000000000,id=0;
 const tick=ms=>{now+=ms;for(const [id,t] of timers)if(t.at<=now){timers.delete(id);t.fn();}};
 Object.assign(doc,{hidden:false,querySelectorAll:()=>[badge],getElementById:id=>({'tt-key':key,'tt-primary':primary,'tt-remove-key':remove})[id]});
 let sharing=false;
 Object.assign(win,{JalanPinnedRoute:require('../passenger-pin-route.js'),JalanPredictiveGPS:{streetAt:()=>null},
  JalanPostedSpeedSharing:{allowed:()=>sharing}});
 vm.runInNewContext(source,{location:{search:'?mode=passenger'},window:win,document:doc,URLSearchParams,URL,AbortController,
  Date:{now:()=>now},setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),
  fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))});
 const fix=(point,overrides={})=>event(win,'jalan:free-location',{point,accuracy:5,timestamp:now,...overrides});
 const finish=async (index,point,limit)=>{
  requests[index].resolve({ok:true,json:async()=>({addresses:[{position:point.join(','),address:{speedLimit:limit}}]})});
  await new Promise(resolve=>setImmediate(resolve));
 };
 return {win,doc,key,badge,requests,tick,fix,finish,
  allow(value){sharing=value;event(win,'jalan:posted-speed-sharing-change',{allowed:value});}};
}
test('free-driving drops the old street immediately and ignores a late lookup after turning',async()=>{
 const s=scene(),a=[3,101],b=[3,101.001];
 s.allow(true);s.fix(a);s.tick(4000);s.fix(b);
 assert.equal(s.requests[0].options.signal.aborted,true);
 await s.finish(1,b,'50.00KPH');await s.finish(0,a,'80.00KPH');
 assert.equal(s.badge.textContent,'50');assert.equal(s.badge.hidden,false);
 s.tick(1000);s.fix(b);assert.equal(s.requests.length,2);
 s.fix([3.0003,101.001]);assert.equal(s.badge.hidden,true);
});
test('unknown and distant limits stay hidden, and stale GPS clears the badge while stationary',async()=>{
 const s=scene(),p=[3,101];
 s.allow(true);s.fix(p);await s.finish(0,p,undefined);assert.equal(s.badge.hidden,true);
 s.tick(16000);s.fix(p);await s.finish(1,[4,101],'80.00KPH');assert.equal(s.badge.hidden,true);
 s.tick(16000);s.fix(p);await s.finish(2,p,'30.00MPH');assert.equal(s.badge.textContent,'48');
 s.tick(10001);assert.equal(s.badge.hidden,true);
 s.fix(p,{accuracy:90});assert.equal(s.requests.length,3);
});
test('no reverse lookup with disabled key, denied location, or GPS matched to an unknown route section',()=>{
 const s=scene();s.allow(true);s.key.value='';s.fix([3,101]);assert.equal(s.requests.length,0);
 s.key.value='fixture-key';s.win.JalanGPS={getState:()=>({route:{speedLimits:[]}})};
 event(s.win,'jalan:journey-start');
 event(s.win,'jalan:gps-fix',{gpsReliable:true,matched:true,gpsAccuracy:4,gpsFixAgeMs:0,gpsPosition:[3,101],speedLimitIndex:2});
 event(s.win,'jalan:location-quality',{error:true});
 assert.equal(s.badge.hidden,true);assert.equal(s.requests.length,0);
});

test('precise GPS reverse lookup needs separate passenger opt-in; revoking aborts and ignores late response',async()=>{
 const s=scene(),p=[3,101];
 s.fix(p);assert.equal(s.requests.length,0,'GPS permission alone is not third-party lookup consent');
 s.allow(true);s.fix(p);assert.equal(s.requests.length,1);
 s.allow(false);assert.equal(s.requests[0].options.signal.aborted,true);
 await s.finish(0,p,'90.00KPH');
 assert.equal(s.badge.hidden,true,'revoked request never paints a limit');
 s.fix(p);assert.equal(s.requests.length,1,'off continues to suppress requests');
 s.allow(true);s.fix(p);assert.equal(s.requests.length,2,'new opt-in allows a fresh request');
 await s.finish(1,p,'60.00KPH');assert.equal(s.badge.textContent,'60');
 s.allow(false);assert.equal(s.badge.hidden,true);
});
test('matched TomTom route speed sections do not require additional GPS-sharing opt-in',()=>{
 const s=scene();s.win.JalanGPS={getState:()=>({route:{speedLimits:[{start:0,end:2,limit:50}]}})};
 event(s.win,'jalan:journey-start');
 event(s.win,'jalan:gps-fix',{gpsReliable:true,matched:true,gpsAccuracy:4,gpsFixAgeMs:0,
  gpsPosition:[3,101],speedLimitIndex:1,speedMps:4});
 assert.equal(s.badge.textContent,'50');assert.equal(s.requests.length,0);
});
