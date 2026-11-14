'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'..','tomtom-live.js'),'utf8');
function scene({defer=false,response=null}={}){
 const nodes={},store=new Map(),sessions=new Map();
 for(const id of ['tt-key','tt-remember','tt-primary','tt-status','tt-route','tt-connect','tt-hide',
  'tt-incident-toggle','tt-eta','tt-toggle-key','tt-remove-key']){
  nodes[id]={value:'',checked:false,textContent:'',onclick:null,onchange:null,classList:{add(){},remove(){}}};
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
 const tick=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r))};
 return {nodes,ctx,store,sessions,calls,tick,get renders(){return renders},get aborted(){return aborted},
  get clears(){return clearCount},resolve:()=>pendingResolve?.()};
}
test('clear TomTom key immediately invalidates pending route and both browser stores',async()=>{
 const s=scene({defer:true}),n=s.nodes;
 n['tt-key'].value='testKey12345';
 n['tt-route'].onclick();await s.tick();
 assert.equal(s.calls.length,1);
 assert.equal(s.sessions.get('jalan-tomtom-key'),'testKey12345');
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
