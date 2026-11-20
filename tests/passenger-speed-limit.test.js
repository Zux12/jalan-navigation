'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path'),source=fs.readFileSync(path.join(__dirname,'../passenger-speed-limit.js'),'utf8');
const event=(target,name,detail)=>target.dispatchEvent(new CustomEvent(name,{detail}));

function scene(t){
 t.mock.timers.enable({apis:['setTimeout']});
 const win=new EventTarget(),doc=new EventTarget(),primary=Object.assign(new EventTarget(),{checked:true});
 const key=Object.assign(new EventTarget(),{value:'fixture-key'}),remove=new EventTarget();
 const badge={hidden:true,setAttribute(){},removeAttribute(){}};
 const route={provider:'tomtom',speedLimits:[{start:0,end:2,limit:80},{start:2,end:3,limit:50}]};
 const state={active:false,route},requests=[];
 Object.assign(doc,{hidden:false,querySelectorAll:()=>[badge],getElementById:id=>({'tt-key':key,'tt-primary':primary,'tt-remove-key':remove})[id]});
 win.JalanGPS={getState:()=>state};
 vm.runInNewContext(source,{location:{search:'?mode=passenger'},window:win,document:doc,URLSearchParams,
  setTimeout,clearTimeout,fetch:(...args)=>requests.push(args)});
 t.after(()=>assert.equal(requests.length,0,'speed limits must use only the existing route'));
 const fix=(overrides={})=>event(win,'jalan:gps-fix',{gpsReliable:true,matched:true,gpsPosition:[3,101],
  gpsAccuracy:4,gpsFixAgeMs:0,speedLimitIndex:1,speedMps:8,...overrides});
 return {win,doc,primary,key,badge,route,state,fix};
}

test('only an active TomTom route supplies limits, with the new limit starting at the shared index',t=>{
 const s=scene(t);
 event(s.win,'jalan:initial-location',{point:[3,101],accuracy:5,timestamp:Date.now()});
 event(s.win,'jalan:free-location',{point:[3,101],accuracy:5,timestamp:Date.now()});
 s.fix();assert.equal(s.badge.hidden,true);
 s.state.active=true;s.fix();assert.equal(s.badge.textContent,'80');assert.equal(s.badge.hidden,false);
 s.fix({speedLimitIndex:2});assert.equal(s.badge.textContent,'50');
 s.fix({speedLimitIndex:3});assert.equal(s.badge.hidden,true);
 s.route.provider='osrm';s.fix();assert.equal(s.badge.hidden,true);
});

test('losing a reliable match or receiving no limit clears the previous limit',t=>{
 const s=scene(t);s.state.active=true;
 for(const invalid of [{matched:false},{gpsReliable:false},{gpsAccuracy:26},{gpsFixAgeMs:10000},
     {gpsFixAgeMs:NaN},{speedLimitIndex:null}]){
  s.fix();assert.equal(s.badge.hidden,false);
  s.fix(invalid);assert.equal(s.badge.hidden,true);
 }
 s.fix();s.route.speedLimits=undefined;s.fix();assert.equal(s.badge.hidden,true);
});

test('the displayed limit expires ten seconds after the measured fix',t=>{
 const s=scene(t);s.state.active=true;s.fix({gpsFixAgeMs:9500});
 t.mock.timers.tick(499);assert.equal(s.badge.textContent,'80');
 t.mock.timers.tick(1);assert.equal(s.badge.hidden,true);
 s.fix();t.mock.timers.tick(8000);s.fix({speedLimitIndex:2});
 t.mock.timers.tick(2001);assert.equal(s.badge.textContent,'50');
});

test('route, journey, location permission and visibility changes clear the limit immediately',t=>{
 const s=scene(t);s.state.active=true;
 for(const name of ['jalan:route-change','jalan:route-cleared','jalan:journey-stop','jalan:location-quality','pagehide']){
  s.fix();assert.equal(s.badge.hidden,false);
  event(s.win,name,{error:true});assert.equal(s.badge.hidden,true);
 }
 s.fix();s.doc.hidden=true;event(s.doc,'visibilitychange');s.fix();assert.equal(s.badge.hidden,true);
 s.doc.hidden=false;s.fix();assert.equal(s.badge.hidden,false);
 s.primary.checked=false;event(s.primary,'change');s.fix();assert.equal(s.badge.hidden,true);
});
