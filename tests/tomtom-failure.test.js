'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'..','tomtom-live.js'),'utf8');
function scene({defer=false,response=null,configKey='',managed=false,stored=new Map(),userKey='testKey12345'}={}){
 const nodes={},store=stored,sessions=new Map();
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
 let ctx={window:{JalanPublicConfig:{tomtomBrowserKey:configKey,managedTomTom:managed}},document:{getElementById:id=>nodes[id]},map:{removeLayer(){}},L,
  localStorage:objects.localStorage,sessionStorage:objects.sessionStorage,
  startPoint:[3.14,101.68],destination:[3.141,101.681],
  routes:[],selectedRoute:0,routeEl:{textContent:'',classList:{add(){},remove(){}}},
  statusEl:{textContent:''},setPanelCollapsed(){},renderRoutes(){renders++},
  clearRoute(){clearCount++;ctx.window.JalanTomTom?.routeCleared();ctx.routes=[]},
  fetch,URL,AbortController,setTimeout(){return 1},clearTimeout(){},setInterval(){return 1},clearInterval(){},console};
 vm.runInNewContext(code,ctx,{filename:'tomtom-live.js'});
 // The actual UI is populated after module initialization or from storage.
 // Set our user-entered key AFTER initialization, which itself loads storage.
 if(userKey!==null)nodes['tt-key'].value=userKey;
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
 assert.deepEqual(new URL(s.calls[0].url).searchParams.getAll('sectionType'),['traffic','speedLimit','toll','tollRoad','travelMode']);
});
test('a rejected optional field preserves the base TomTom route and keeps toll status unknown',async()=>{
 const s=scene(),calls=[];
 s.ctx.fetch=async url=>{
  calls.push(new URL(url).searchParams.getAll('sectionType'));
  if(calls.length===1)return {ok:false,status:400,json:async()=>({detailedError:{message:'Unsupported sectionType speedLimit'}})};
  return {ok:true,json:async()=>({routes:[{sections:[{sectionType:'TRAVEL_MODE'}]}]})};
 };
 const data=await s.ctx.window.JalanTomTom.fetchRouteData(new URL('https://example.test/?sectionType=traffic'));
 assert.deepEqual(calls[1],['traffic']);assert.equal(data.routes[0].sections.length,0);
});
test('toll-free needs a complete response and speed limits apply only to their segments',()=>{
 const {roadDetails}=scene().ctx.window.JalanTomTom;
 const mode={sectionType:'TRAVEL_MODE',startPointIndex:0,endPointIndex:4};
 const toll={sectionType:'TOLL',startPointIndex:2,endPointIndex:2};
 const speed={sectionType:'SPEED_LIMIT',startPointIndex:1,endPointIndex:3,maxSpeedLimitInKmh:80};
 assert.equal(roadDetails([mode,toll,speed],5).tolls,true);
 assert.equal(roadDetails([mode,speed],5).tolls,false);
 for(const sections of [null,[],[speed],[{...mode,startPointIndex:1}],[mode,{...toll,endPointIndex:30}]]){
  assert.equal(roadDetails(sections,5).tolls,null);
 }
 const road=roadDetails([speed,{...speed,maxSpeedLimitInKmh:0},{...speed,endPointIndex:6}],5);
 assert.deepEqual(Array.from(road.speedLimits,s=>[s.start,s.end,s.limit]),[[1,3,80]]);
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
test('route-linked section distance follows point index when the route revisits identical coordinates',()=>{
 const api=scene().ctx.window.JalanTomTom;
 const coords=[coordinate(0,0),coordinate(100,0),coordinate(200,0),
  coordinate(200,100),coordinate(100,0),coordinate(0,0),coordinate(100,0)];
 const route={provider:'tomtom',geometry:{type:'LineString',coordinates:coords},
  trafficSections:[{sectionType:'TRAFFIC',startPointIndex:5,endPointIndex:6,
    simpleCategory:'JAM',delayInSeconds:60}],legs:[{steps:[]}]};
 const [matched]=api.trafficSectionsForRoute(route);
 assert.ok(matched,'a valid later-section index remains eligible');
 assert.equal(matched.startPointIndex,5);
 assert.ok(matched.routeAlong>500,'later pass at repeated coordinates must not snap to first road segment');
 assert.ok(matched.routeAlong<matched.routeTotal);
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

test('public configured key routes without entry; saved device override wins',async()=>{
 const configured=scene({configKey:'CONFIGURED_TEST_KEY_1234',userKey:null});
 assert.equal(configured.nodes['tt-key'].value,'CONFIGURED_TEST_KEY_1234');
 assert.equal(configured.ctx.window.JalanTomTom.enabled(),true);
 await configured.nodes['tt-route'].onclick();await configured.tick();
 assert.equal(new URL(configured.calls[0].url).searchParams.get('key'),'CONFIGURED_TEST_KEY_1234');
 const stored=new Map([['jalan-tomtom-key','DEVICE_TEST_KEY_5678']]);
 const override=scene({configKey:'CONFIGURED_TEST_KEY_1234',stored,userKey:null});
 assert.equal(override.nodes['tt-key'].value,'DEVICE_TEST_KEY_5678');
 assert.equal(override.nodes['tt-remember'].checked,true);
});
test('forget suppresses public configured key on reload; a saved replacement re-enables it',()=>{
 const configKey='CONFIGURED_TEST_KEY_1234',s=scene({configKey,userKey:null});
 s.nodes['tt-remove-key'].onclick();
 assert.equal(s.nodes['tt-key'].value,'');
 const after=scene({configKey,stored:s.store,userKey:null});
 assert.equal(after.nodes['tt-key'].value,'');assert.equal(after.ctx.window.JalanTomTom.enabled(),false);
 after.ctx.window.JalanTomTomKeyStorage.remember('DEVICE_TEST_KEY_5678');
 const next=scene({configKey,stored:s.store,userKey:null});
 assert.equal(next.nodes['tt-key'].value,'DEVICE_TEST_KEY_5678');
 assert.equal(s.store.has('jalan-tomtom-config-disabled'),false);
});
test('invalid configured key is not injected into routing',()=>{
 const s=scene({configKey:'invalid key value',userKey:null});
 assert.equal(s.nodes['tt-key'].value,'');assert.equal(s.ctx.window.JalanTomTom.enabled(),false);
});

test('normalization retains all road-distance boundaries for journey via summary',async()=>{
 const instructions=Array.from({length:122},(_,i)=>({street:i===121?'Long highway':'Local road',
  routeOffsetInMeters:i*10,maneuver:'CONTINUE'}));
 const s=scene({response:{routes:[{legs:[{points:[{latitude:3.14,longitude:101.68},
  {latitude:3.15,longitude:101.69}]}],summary:{travelTimeInSeconds:600,lengthInMeters:10000,trafficDelayInSeconds:0},
  guidance:{instructions}}]}});
 await s.nodes['tt-route'].onclick();await s.tick();
 assert.equal(s.ctx.routes[0].legs[0].steps.length,120,'spoken-step limit unchanged');
 assert.equal(s.ctx.routes[0].roadGuidance.length,122,'longest-road summary sees every boundary');
 assert.equal(require('../passenger-journey-model.js').longestRoad(s.ctx.routes[0]),'Long highway');
});

test('managed testing configuration overrides old saved key and disabled flag',()=>{
 const configured='SYNTHETIC_MANAGED_TEST_KEY';
 const s=scene({configKey:configured,managed:true,userKey:null,stored:new Map([
 ['jalan-tomtom-key','OLD_SYNTHETIC_KEY'],['jalan-tomtom-config-disabled','1']])});
 assert.equal(s.nodes['tt-key'].value,configured);
 assert.equal(s.nodes['tt-primary'].checked,true);
 assert.equal(s.nodes['tt-remember'].checked,false);
 assert.equal(s.calls.length,0,'initialization does not contact provider');
});
