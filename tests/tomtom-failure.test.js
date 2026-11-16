'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'..','tomtom-live.js'),'utf8');
function scene({defer=false,response=null,handler=null}={}){
 const nodes={},store=new Map(),sessions=new Map();
 for(const id of ['tt-key','tt-remember','tt-primary','tt-status','tt-route','tt-connect','tt-hide',
  'tt-incident-toggle','tt-eta','tt-toggle-key','tt-remove-key']){
  nodes[id]={value:'',checked:false,textContent:'',onclick:null,onchange:null,
   listeners:{},addEventListener(type,handler){this.listeners[type]=handler;},
   classList:{add(){},remove(){}}};
 }
 nodes['tt-primary'].checked=true;
 nodes['tt-incident-toggle'].checked=false;
 nodes['tt-key'].value='testKey12345';
 let calls=[],pendingResolve,aborted=0,renders=0,clearCount=0,clock=Date.now(),timerId=0;
 const timers=new Map(),intervals=[],events=[],listeners={},markers=[],lines=[];
 const objects={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 sessionStorage:{getItem:k=>sessions.get(k)||null,setItem:(k,v)=>sessions.set(k,v),removeItem:k=>sessions.delete(k)}};
 const fake={
  routes:[{legs:[{points:[{latitude:3.14,longitude:101.68},{latitude:3.141,longitude:101.681}]}],
   summary:{travelTimeInSeconds:130,lengthInMeters:700,trafficDelayInSeconds:12},guidance:{instructions:[]}}]
 };
 const fetch=(url,opts)=>{
  calls.push({url:String(url),opts});
  if(opts.signal)opts.signal.addEventListener('abort',()=>aborted++);
  if(handler)return handler(url,opts);
  if(defer)return new Promise(resolve=>{pendingResolve=()=>resolve({ok:true,json:async()=>response||fake})});
  return Promise.resolve({ok:true,json:async()=>response||fake});
 };
 const layer={addTo(){return this},clearLayers(){markers.length=0;lines.length=0},removeLayer(){}};
 const L={layerGroup:()=>layer,divIcon:options=>options,
  marker:(position)=>({bindPopup(){return this},addTo(){markers.push(position);return this}}),
  polyline:(positions)=>({addTo(){lines.push(positions);return this}})};
 let ctx={window:{addEventListener(type,fn){(listeners[type]||=[]).push(fn)},
  dispatchEvent(event){events.push(event);for(const fn of listeners[event.type]||[])fn(event)}},
  CustomEvent:class{constructor(type,{detail}={}){this.type=type;this.detail=detail}},
  Date:class extends Date{static now(){return clock}},
  document:{getElementById:id=>nodes[id],createElement:()=>({append(){}}),
   body:{classList:{contains:()=>true}}},map:{removeLayer(){}},L,
  localStorage:objects.localStorage,sessionStorage:objects.sessionStorage,
  startPoint:[3.14,101.68],destination:[3.141,101.681],
  routes:[],selectedRoute:0,routeEl:{textContent:'',classList:{add(){},remove(){}}},
  statusEl:{textContent:''},setPanelCollapsed(){},renderRoutes(){renders++},
  clearRoute(){clearCount++;ctx.window.JalanTomTom?.routeCleared();ctx.routes=[]},
  fetch,URL,AbortController,setTimeout(fn){timers.set(++timerId,fn);return timerId},
  clearTimeout(id){timers.delete(id)},setInterval(fn){intervals.push(fn);return intervals.length},
  clearInterval(){},console};
 vm.runInNewContext(code,ctx,{filename:'tomtom-live.js'});
 // The actual UI is populated after module initialization or from storage.
 // Set our user-entered key AFTER initialization, which itself loads storage.
 nodes['tt-key'].value='testKey12345';
 const tick=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r))};
 return {nodes,ctx,store,sessions,calls,tick,events,markers,lines,
  advance:ms=>{clock+=ms},expire:()=>intervals[0](),
  flush:async()=>{const tasks=[...timers.values()];timers.clear();for(const fn of tasks)await fn();await tick()},
  get renders(){return renders},get aborted(){return aborted},
  get clears(){return clearCount},resolve:()=>pendingResolve?.()};
}
test('clear TomTom key immediately invalidates pending route and both browser stores',async()=>{
 const s=scene({defer:true}),n=s.nodes;
 n['tt-key'].value='testKey12345';
 n['tt-route'].onclick();await s.tick();
 assert.equal(s.calls.length,1);
 assert.equal(s.sessions.has('jalan-tomtom-key'),false,'unchecked key must not enter sessionStorage');
 assert.equal(s.store.has('jalan-tomtom-key'),false,'unchecked key must not persist in localStorage');
 n['tt-remove-key'].onclick();assert.equal(s.aborted,1);
 assert.equal(n['tt-key'].value,'');
 assert.equal(s.store.has('jalan-tomtom-key'),false);
 assert.equal(s.sessions.has('jalan-tomtom-key'),false);
 assert.ok(s.clears>=1);
 s.resolve();await s.tick();
 assert.equal(s.renders,0,'stale response must never redraw revoked route');
});
test('switching to OSRM cancels pending TomTom result but never auto-requests OSRM',async()=>{
 const s=scene({defer:true}),n=s.nodes;
 n['tt-route'].onclick();await s.tick();
 n['tt-primary'].checked=false;n['tt-primary'].onchange();
 assert.equal(s.aborted,1);
 assert.equal(s.calls.length,1);
 s.resolve();await s.tick();
 assert.equal(s.renders,0);
 assert.match(n['tt-status'].textContent,/Search again to apply/);
});
test('invalid TomTom summary fails closed rather than drawing NaN distance',async()=>{
 const invalid={routes:[{legs:[{points:[{latitude:3.14,longitude:101.68},
  {latitude:3.141,longitude:101.681}]}],summary:{lengthInMeters:-5,
   travelTimeInSeconds:130},guidance:{instructions:[]}}]};
 const s=scene({response:invalid}),n=s.nodes;
 await n['tt-route'].onclick();await s.tick();
 assert.equal(s.renders,0);
 assert.match(n['tt-status'].textContent,/Uncheck TomTom primary routing to use OSRM/);
 assert.equal(s.calls.length,1,'manual fallback must not silently fetch OSRM');
});
test('valid traffic-aware TomTom route remains primary on successful response',async()=>{
 const s=scene(),n=s.nodes;
 await n['tt-route'].onclick();await s.tick();
 assert.equal(s.renders,1);
 assert.equal(s.ctx.routes[0].provider,'tomtom');
 assert.match(n['tt-eta'].textContent,/Traffic delay/);
 assert.equal(s.calls.length,1);
});
test('missing or invalid key fails before any outbound TomTom request',async()=>{
 const s=scene(),n=s.nodes;
 n['tt-key'].value='bad key';
 await n['tt-route'].onclick();await s.tick();
 assert.equal(s.calls.length,0);
 assert.match(n['tt-status'].textContent,/valid TomTom key/);
});

test('Remember explicitly persists only localStorage and clears old session key on reload',async()=>{
 const s=scene(),n=s.nodes;
 n['tt-remember'].checked=true;
 await n['tt-route'].onclick();await s.tick();
 assert.equal(s.store.get('jalan-tomtom-key'),'testKey12345');
 assert.equal(s.sessions.has('jalan-tomtom-key'),false);
});
test('unchecking Remember at next request removes previously remembered key',async()=>{
 const s=scene(),n=s.nodes;
 n['tt-remember'].checked=true;
 await n['tt-route'].onclick();await s.tick();
 assert.equal(s.store.get('jalan-tomtom-key'),'testKey12345');
 n['tt-remember'].checked=false;
 n['tt-remember'].onchange();
 assert.equal(s.store.has('jalan-tomtom-key'),false,'uncheck must immediately revoke persistent storage');
 await n['tt-route'].onclick();await s.tick();
 assert.equal(s.store.has('jalan-tomtom-key'),false);
 assert.equal(s.sessions.has('jalan-tomtom-key'),false);
});

test('editing an active remembered TomTom key revokes storage and prevents stale render',async()=>{
 const s=scene({defer:true}),n=s.nodes;
 n['tt-remember'].checked=true;
 n['tt-route'].onclick();await s.tick();
 assert.equal(s.calls.length,1);
 assert.equal(s.store.get('jalan-tomtom-key'),'testKey12345');
 n['tt-key'].value='ReplacementFakeKey123';
 n['tt-key'].listeners.input();
 assert.ok(s.aborted>=1,'prior route request must be aborted');
 assert.equal(s.store.has('jalan-tomtom-key'),false);
 assert.equal(s.sessions.has('jalan-tomtom-key'),false);
 s.resolve();await s.tick();
 assert.equal(s.renders,0,'replaced key must never revive old route');
 assert.match(n['tt-status'].textContent,/Old stored key removed/);
});

// Provider route associations replace area/proximity guesses. These fixtures
// deliberately include the reverse direction and a carriageway only 2m away.
const coordinates=[[101.68,3.14],[101.681,3.14],[101.682,3.14],[101.683,3.14]];
const selected=()=>({provider:'tomtom',geometry:{type:'LineString',coordinates:coordinates.map(p=>p.slice())}});
const responseFor=(points=coordinates,sections=[])=>({legs:[{points:points.map(p=>({longitude:p[0],latitude:p[1]}))}],sections});
const section=(start=1,end=2,extra={})=>({sectionType:'TRAFFIC',startPointIndex:start,endPointIndex:end,
 simpleCategory:'JAM',delayInSeconds:180,effectiveSpeedInKmh:15,eventId:'correct-direction',...extra});
test('reports use provider route section indexes and exclude unrelated area incidents',()=>{
 const api=scene().ctx.window.JalanTomTom,r=selected();
 const response=responseFor(coordinates,[section(),{sectionType:'TUNNEL',startPointIndex:0,endPointIndex:3}]);
 response.incidents=[{geometry:{type:'LineString',coordinates:coordinates.slice().reverse()},
  properties:{id:'opposite-direction',iconCategory:6}}];
 const reports=api.routeTrafficReports(r,response);
 assert.equal(reports.length,1);assert.equal(reports[0].lat,coordinates[1][1]);
 assert.equal(reports[0].lng,coordinates[1][0]);assert.equal(reports[0].title,'Traffic congestion');
 assert.match(reports[0].description,/Delay 3 min/);assert.match(reports[0].description,/15 km\/h/);
 assert.ok(reports[0].along>100&&reports[0].endAlong>200);
});
test('opposite, adjacent, different and resampled paths are withheld, never snapped',()=>{
 const api=scene().ctx.window.JalanTomTom;
 for(const points of [coordinates.slice().reverse(),coordinates.map(p=>[p[0],p[1]+2/111320]),
  [coordinates[0],[101.681,3.15],coordinates[2],coordinates[3]],
  [coordinates[0],coordinates[3]],[[NaN,3.14],...coordinates.slice(1)]])
  assert.throws(()=>api.routeTrafficReports(selected(),responseFor(points,[section()])),/unchanged selected route/);
 assert.throws(()=>api.routeTrafficReports({...selected(),provider:'osrm'},responseFor()),/TomTom route unavailable/);
});
test('invalid or ambiguous section ranges cannot create traffic markers',()=>{
 const api=scene().ctx.window.JalanTomTom;
 for(const [start,end] of [[-1,2],[1,4],[2,1],[1.5,2],['1',2],[1,null]])
  assert.throws(()=>api.routeTrafficReports(selected(),responseFor(coordinates,[section(start,end)])),/section position/);
 assert.throws(()=>api.routeTrafficReports(selected(),responseFor(coordinates,{})),/Invalid route traffic sections/);
 assert.equal(api.routeTrafficReports(selected(),responseFor()).length,0);
 assert.equal(api.routeTrafficReports(selected(),responseFor(coordinates,[section(),section()])).length,1);
});
async function startTraffic(s){
 s.ctx.routes=[selected()];assert.equal(s.ctx.window.JalanTomTom.startPassengerTraffic(),true);
 await s.flush();return s.ctx.routes[0];
}
test('Go reconstructs the entire ordered selected route with no alternatives and route-native sections',async()=>{
 const s=scene({response:{routes:[responseFor(coordinates,[section()])]}}),r=await startTraffic(s);
 assert.equal(s.calls.length,1);
 const {url,opts}=s.calls[0],query=new URL(url).searchParams;
 assert.equal(opts.method,'POST');assert.equal(query.get('reconstructionMode'),'update');
 assert.equal(query.get('sectionType'),'traffic');assert.equal(query.get('maxAlternatives'),'0');
 assert.deepEqual(JSON.parse(opts.body).supportingPoints,coordinates.map(p=>({longitude:p[0],latitude:p[1]})));
 assert.equal(s.ctx.window.JalanTomTom.getRouteReports(r).length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(s.markers)),[[3.14,101.681]]);
 assert.equal(s.lines.length,1);assert.equal(s.ctx.routes[0],r,'traffic refresh must not replace selected route');
});
test('missing key never requests directional traffic',async()=>{
 const s=scene();s.ctx.routes=[selected()];s.nodes['tt-key'].value='';
 assert.equal(s.ctx.window.JalanTomTom.startPassengerTraffic(),false);await s.flush();
 assert.equal(s.calls.length,0);
});
test('traffic failure or changed reconstruction removes previous report data and map markings',async()=>{
 let fail=false;
 const s=scene({handler:async()=>({ok:true,json:async()=>({routes:[responseFor(fail?
  coordinates.slice().reverse():coordinates,[section()])]})})}),r=await startTraffic(s);
 assert.equal(s.markers.length,1);fail=true;
 s.ctx.window.JalanTomTom.refreshRouteIncidents(true);await s.flush();
 assert.equal(s.ctx.window.JalanTomTom.getRouteReports(r).length,0);assert.equal(s.markers.length,0);
 assert.match(s.nodes['tt-status'].textContent,/unchanged selected route/);
});
test('route switches revoke old traffic immediately and bypass the five minute throttle',async()=>{
 const s=scene({response:{routes:[responseFor(coordinates,[section()])]}}),r=await startTraffic(s);
 s.ctx.routes=[selected()];s.ctx.window.JalanTomTom.refreshRouteIncidents();
 assert.equal(s.markers.length,0);assert.equal(s.ctx.window.JalanTomTom.getRouteReports(r).length,0);
 await s.flush();assert.equal(s.calls.length,2);
 assert.equal(s.ctx.window.JalanTomTom.getRouteReports(s.ctx.routes[0]).length,1);
});
test('late responses after route change or traffic Off cannot restore reports',async()=>{
 for(const stop of [false,true]){
  let resolve;
  const s=scene({handler:()=>new Promise(r=>{resolve=r})});
  s.ctx.routes=[selected()];const r=s.ctx.routes[0];s.ctx.window.JalanTomTom.startPassengerTraffic();
  const pending=s.flush();await s.tick();
  if(stop)s.ctx.window.JalanTomTom.stopPassengerTraffic();else s.ctx.routes=[selected()];
  resolve({ok:true,json:async()=>({routes:[responseFor(coordinates,[section()])]})});await pending;
  assert.equal(s.markers.length,0);assert.equal(s.ctx.window.JalanTomTom.getRouteReports(r).length,0);
 }
});
test('passed traffic is excluded from list and map while an ongoing affected section remains',async()=>{
 const s=scene({response:{routes:[responseFor(coordinates,[section(0,1),section(1,3)])]}}),r=await startTraffic(s);
 s.ctx.window.JalanGPS={getState:()=>({active:true,route:r,matched:true,fixAgeMs:0,accuracy:8,position:[3.14,101.682]})};
 s.ctx.window.dispatchEvent(new s.ctx.CustomEvent('jalan:gps-fix'));
 const reports=s.ctx.window.JalanTomTom.getRouteReports(r);
 assert.equal(reports.length,1);assert.equal(reports[0].endPointIndex,3);assert.equal(reports[0].ahead,0);
 assert.equal(s.markers.length,1);
});
test('expired traffic clears both map and list and is not reported as a clear road',async()=>{
 const s=scene({response:{routes:[responseFor(coordinates,[section()])]}}),r=await startTraffic(s);
 s.advance(600001);s.expire();
 assert.equal(s.ctx.window.JalanTomTom.getRouteReports(r).length,0);assert.equal(s.markers.length,0);
 const state=s.events.filter(e=>e.type==='jalan:traffic-layer-status').at(-1).detail;
 assert.equal(state.state,'error');assert.match(state.message,/expired/);
});
