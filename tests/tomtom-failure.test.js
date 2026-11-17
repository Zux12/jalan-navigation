'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'..','tomtom-live.js'),'utf8');
function scene({defer=false,response=null}={}){
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
 let calls=[],pendingResolve,aborted=0,renders=0,clearCount=0;
 const objects={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 sessionStorage:{getItem:k=>sessions.get(k)||null,setItem:(k,v)=>sessions.set(k,v),removeItem:k=>sessions.delete(k)}};
 const fake={
  routes:[{legs:[{points:[{latitude:3.14,longitude:101.68},{latitude:3.141,longitude:101.681}]}],
   summary:{travelTimeInSeconds:130,lengthInMeters:700,trafficDelayInSeconds:12},guidance:{instructions:[]}}]
 };
 const fetch=(url,opts)=>{
  calls.push({url:String(url),opts});
  if(opts.signal)opts.signal.addEventListener('abort',()=>aborted++);
  if(defer)return new Promise(resolve=>{pendingResolve=()=>resolve({ok:true,json:async()=>response||fake})});
  return Promise.resolve({ok:true,json:async()=>response||fake});
 };
 const layer={addTo(){return this},clearLayers(){},removeLayer(){}};
 const L={layerGroup:()=>layer,latLngBounds:()=>({pad(){return this},getWest(){return 101},getEast(){return 102},getNorth(){return 4},getSouth(){return 3}})};
 let ctx={window:{},document:{getElementById:id=>nodes[id]},map:{removeLayer(){}},L,
  localStorage:objects.localStorage,sessionStorage:objects.sessionStorage,
  startPoint:[3.14,101.68],destination:[3.141,101.681],
  routes:[],selectedRoute:0,routeEl:{textContent:'',classList:{add(){},remove(){}}},
  statusEl:{textContent:''},setPanelCollapsed(){},renderRoutes(){renders++},
  clearRoute(){clearCount++;ctx.window.JalanTomTom?.routeCleared();ctx.routes=[]},
  fetch,URL,AbortController,setTimeout(){return 1},clearTimeout(){},setInterval(){return 1},clearInterval(){},console};
 vm.runInNewContext(code,ctx,{filename:'tomtom-live.js'});
 // The actual UI is populated after module initialization or from storage.
 // Set our user-entered key AFTER initialization, which itself loads storage.
 nodes['tt-key'].value='testKey12345';
 const tick=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r))};
 return {nodes,ctx,store,sessions,calls,tick,get renders(){return renders},get aborted(){return aborted},
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
test('route calculation requests TomTom-native route TRAFFIC sections',async()=>{
 const s=scene();
 await s.nodes['tt-route'].onclick();await s.tick();
 assert.equal(s.calls.length,1);
 assert.equal(new URL(s.calls[0].url).searchParams.get('sectionType'),'traffic');
});
test('route-linked sections use road metadata and route point indices, not a 25m incident radius',()=>{
 const api=scene().ctx.window.JalanTomTom;
 const coords=[coordinate(0,0),coordinate(100,0),coordinate(200,0),coordinate(300,0)];
 const route={provider:'tomtom',geometry:{type:'LineString',coordinates:coords},
  trafficSectionsCheckedAt:Date.now(),
  trafficSections:[{sectionType:'TRAFFIC',startPointIndex:1,endPointIndex:3,
   simpleCategory:'JAM',delayInSeconds:145,effectiveSpeedInKmh:16},
   {sectionType:'TRAFFIC',startPointIndex:1,endPointIndex:3,
    simpleCategory:'JAM',delayInSeconds:145},
   {sectionType:'TRAFFIC',startPointIndex:6,endPointIndex:7,simpleCategory:'OTHER'},
   {sectionType:'TUNNEL',startPointIndex:0,endPointIndex:1}],
  legs:[{steps:[{pointIndex:0,street:'Jalan Example',roadNumbers:['E2']},
   {pointIndex:3,street:'Jalan Elsewhere',roadNumbers:['E9']}]}]};
 const result=api.trafficSectionsForRoute(route);
 assert.equal(result.length,1,'invalid, duplicate and non-TRAFFIC sections are excluded');
 assert.equal(result[0].roadName,'Jalan Example');
 assert.equal(result[0].roadNumbers[0],'E2');
 assert.equal(result[0].startPointIndex,1);
 assert.equal(result[0].endPointIndex,3);
 assert.equal(result[0].delaySeconds,145);
 assert.equal(result[0].effectiveSpeedKmh,16);
 assert.equal(result[0].routeAlong>0,true);
 assert.equal(result[0].routeAlong<result[0].routeTotal,true);
 assert.equal(api.trafficSectionsForRoute({...route,provider:'osrm'}).length,0,
  'OSRM cannot fabricate TomTom route-linked traffic sections');
 assert.equal(api.trafficSectionsForRoute({...route,trafficSections:[]}).length,0,
  'missing provider traffic sections never fall back to nearby unverified incidents');
});
test('valid traffic-aware TomTom route remains primary on successful response',async()=>{
 const s=scene(),n=s.nodes;
 await n['tt-route'].onclick();await s.tick();
 assert.equal(s.renders,1);
 assert.equal(s.ctx.routes[0].provider,'tomtom');
 assert.equal(s.ctx.routes[0].trafficSections,null,
  'absent provider sections must remain unknown, not be presented as clear roads');
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

// Coordinates derived from independent metre offsets make nearby-road cases
// reproducible without provider calls or a real user position.
const coordinate=(east,north)=>[101.68+east/(111320*Math.cos(3.14*Math.PI/180)),3.14+north/111320];
const straightRoute=[coordinate(0,0),coordinate(1000,0)];
test('route report points exclude nearby streets and retain actual coordinates',()=>{
 const api=scene().ctx.window.JalanTomTom;
 const point=coordinate(400,12),match=api.matchReportGeometry({type:'Point',coordinates:point},straightRoute);
 assert.ok(match);assert.equal(match.lng,point[0]);assert.equal(match.lat,point[1]);
 assert.ok(Math.abs(match.offset-12)<.01);assert.ok(Math.abs(match.along-400)<.01);
 for(const offset of [26,80,299,900])assert.equal(api.matchReportGeometry(
   {type:'Point',coordinates:coordinate(400,offset)},straightRoute),null);
});
test('parallel and crossing incident roads do not count as affected route segments',()=>{
 const api=scene().ctx.window.JalanTomTom;
 for(const points of [
  [coordinate(100,50),coordinate(700,50)],
  [coordinate(400,-200),coordinate(400,200)],
  [coordinate(400,0),coordinate(400,200)],
  [coordinate(1000,0),coordinate(1300,0)]
 ])assert.equal(api.matchReportGeometry({type:'LineString',coordinates:points},straightRoute),null);
});
test('long incident is anchored in its overlapping section, not its off-route first point',()=>{
 const api=scene().ctx.window.JalanTomTom;
 const points=[coordinate(-500,0),coordinate(600,0)];
 const match=api.matchReportGeometry({type:'LineString',coordinates:points},straightRoute);
 assert.ok(match);assert.ok(Math.abs(match.along-300)<.01);assert.ok(match.offset<.01);
 assert.ok(match.lng>straightRoute[0][0]&&match.lng<straightRoute[1][0]);
 // Geometry order is not evidence of traffic direction; reversing it still
 // identifies the same overlap without inventing a carriageway claim.
 const reversed=api.matchReportGeometry({type:'LineString',coordinates:points.slice().reverse()},straightRoute);
 assert.ok(reversed);assert.ok(Math.abs(reversed.lng-match.lng)<1e-9);
});
test('continuous incident overlap spans short route segments and bends',()=>{
 const api=scene().ctx.window.JalanTomTom;
 const route=[coordinate(0,0),coordinate(10,0),coordinate(20,0),coordinate(40,0),coordinate(40,40)];
 const match=api.matchReportGeometry({type:'LineString',coordinates:[coordinate(5,0),coordinate(40,0),coordinate(40,35)]},route);
 assert.ok(match);assert.ok(match.offset<.01);assert.ok(match.along>=5&&match.along<=75);
});
test('invalid or degenerate incident and route geometry cannot produce a report match',()=>{
 const api=scene().ctx.window.JalanTomTom;
 for(const geometry of [null,{type:'Point',coordinates:[101,91]},
  {type:'Point',coordinates:[NaN,3]}, {type:'LineString',coordinates:[]},
  {type:'LineString',coordinates:[coordinate(10,0)]},
  {type:'LineString',coordinates:[coordinate(10,0),coordinate(10,0)]},
  {type:'LineString',coordinates:[coordinate(10,0),[null,3]]},
  {type:'Polygon',coordinates:[straightRoute]}])
  assert.equal(api.matchReportGeometry(geometry,straightRoute),null);
 assert.equal(api.matchReportGeometry({type:'Point',coordinates:coordinate(10,0)},[coordinate(0,0),coordinate(0,0)]),null);
 assert.equal(api.projectReportPoint(coordinate(10,0),[[101,3],[181,3]]),null);
});
