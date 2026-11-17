'use strict';
// Actual matcher, GPS controller and provider adapters, with synthetic GPS,
// a controlled clock and intercepted requests. No real positions or API key.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
function scene({tomtom=true,auto=true}={}){
 let now=1700000000000,watch=null,watchError=null,watchStarts=0,watchClears=0,renders=0,clears=0;
 const nodes=new Map(),events=[],requests=[],timers=new Map(),documentEvents={};let timerId=0;
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{value:'',checked:false,textContent:'',attrs:{},listeners:{},
   classList:{add(){},remove(){},toggle(){},contains(){return false}},
   setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){(this.listeners[k]??=[]).push(fn)},
   fire(k){for(const fn of this.listeners[k]||[])fn()}});
  return nodes.get(id);
 };
 const original={provider:tomtom?'tomtom':'osrm',duration:600,distance:1110,legs:[],
   geometry:{type:'LineString',coordinates:[[101.6,3],[101.61,3]]}};
 const destination=[3,101.61],layer={addTo(){return this},clearLayers(){},setLatLng(){}};
 const context={window:{JalanNavigation:{stop(){}},dispatchEvent:e=>events.push(e),
    JalanVoice:{reset(){},label(){return 'Muted'},announce(){},alert(){}}},
  document:{hidden:false,getElementById:node,body:{classList:{add(){},remove(){},contains(){return false}}},
    addEventListener(k,fn){documentEvents[k]=fn}},
  navigator:{geolocation:{watchPosition(success,error){watch=success;watchError=error;return ++watchStarts},clearWatch(){watchClears++}}},
  L:{circleMarker:()=>layer,layerGroup:()=>layer},map:{panTo(){},removeLayer(){},invalidateSize(){}},
  routes:[original],selectedRoute:0,startPoint:[3,101.6],destination,
  renderRoutes({preserveGPS=false}={}){renders++;if(!preserveGPS)context.window.JalanGPS.stop()}, 
  clearRoute(){clears++;context.window.JalanGPS?.stop();context.window.JalanTomTom?.routeCleared();context.routes=[]},
  updateLocation(){},fmtDist:String,fmtTime:String,statusEl:{textContent:''},setPanelCollapsed(){},
  localStorage:{getItem(){return null},removeItem(){},setItem(){}},
  sessionStorage:{removeItem(){}},
  fetch(url,options){return new Promise(resolve=>requests.push({url:new URL(url),options,resolve}))},
  Date:class extends Date{static now(){return now}},Math,URL,AbortController,console,
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},
  setTimeout(fn,ms){timers.set(++timerId,{fn,ms});return timerId},clearTimeout:id=>timers.delete(id),
  setInterval(){return 1},clearInterval(){},$:node};
 vm.createContext(context);
 for(const name of ['predictive-gps.js','tomtom-live.js','gps-navigation.js'])vm.runInContext(source(name),context,{filename:name});
 const app=source('app.js');
 vm.runInContext(app.slice(app.indexOf('async function requestDrivingRoutes('),app.indexOf('async function calculateRoutes(')),context);
 node('tt-primary').checked=tomtom;node('tt-key').value='syntheticTestKey123';
 if(auto)node('gps-auto').onclick();node('gps-start').onclick();
 const feed=(position,delta=3000,accuracy=8,stamp=null)=>{
  now+=delta;watch({timestamp:stamp??now,coords:{latitude:position[0],longitude:position[1],accuracy,speed:5,heading:90}});
 };
 const detour=(cold=false)=>{if(!cold)feed([3,101.6],0);for(let i=1;i<=6;i++)feed([3.0008,101.6+i*.0001]);};
 const flush=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));};
 const finish=async({ok=true,invalid=false}={})=>{
  const request=requests.at(-1),url=request.url;
  let from,to;
  if(url.hostname==='api.tomtom.com'){
   [from,to]=url.pathname.split('/calculateRoute/')[1].split('/json')[0].split(':').map(x=>x.split(',').map(Number));
  }else [from,to]=url.pathname.split('/driving/')[1].split(';').map(x=>x.split(',').map(Number).reverse());
  const coords=[[from[1],from[0]],[to[1],to[0]]];
  const routes=[300,200].map(duration=>tomtom?{
   legs:[{points:coords.map(p=>({latitude:p[1],longitude:p[0]}))}],
   summary:{travelTimeInSeconds:invalid?-1:duration,lengthInMeters:1200,trafficDelayInSeconds:10},
   guidance:{instructions:[]},sections:[]
  }:{geometry:{type:'LineString',coordinates:invalid?[[0,0],[0,0]]:coords},duration,distance:1200,legs:[]});
  request.resolve({ok,status:ok?200:503,json:async()=>({code:'Ok',routes})});await flush();
 };
 return {context,node,events,requests,feed,detour,finish,flush,original,destination,
  state:()=>context.window.JalanGPS.getState(),
  get watches(){return watchStarts},get watchClears(){return watchClears},get renders(){return renders},get clears(){return clears},
  failGPS(){watchError({code:2,message:"Position unavailable in fixture"})},
  expireRequest(){for(const t of timers.values())if(t.ms===20000){t.fn();break}},
  background(){context.document.hidden=true;documentEvents.visibilitychange()},
  advance(ms){now+=ms}};
}
for(const tomtom of [true,false])test(`sustained detour replaces ${tomtom?'TomTom':'explicit OSRM'} route from actual GPS to the same destination`,async()=>{
 const s=scene({tomtom});s.detour();
 assert.equal(s.requests.length,1,'one request after confirmed deviation, not each GPS callback');
 assert.equal(s.state().matched,false,'off-route location must not claim a match to the old road');
 assert.equal(s.state().deviationConfirmed,true);
 assert.equal(s.state().route,s.original);assert.equal(s.state().active,true);
 assert.equal(s.watches,1);assert.equal(s.watchClears,0);assert.equal(s.clears,0);
 const request=s.requests[0].url;
 assert.equal(request.hostname,tomtom?'api.tomtom.com':'router.project-osrm.org');
 if(tomtom){assert.match(request.pathname,/3\.000800,101\.600[0-9]+:3\.000000,101\.610000/);assert.equal(request.searchParams.get('sectionType'),'traffic');}
 else assert.match(request.pathname,/101\.600[0-9]+,3\.0008;101\.61,3/);
 await s.finish();
 assert.notEqual(s.state().route,s.original);assert.equal(s.state().route.duration,200);
 assert.equal(s.context.destination,s.destination);assert.equal(s.state().active,true);
 assert.equal(s.watches,1,'detour replacement must retain the original geolocation watch');
 assert.equal(s.watchClears,0,'successful route swap does not clear GPS');
 assert.equal(s.renders,1);assert.equal(s.clears,0);
 assert.equal(s.events.filter(e=>e.type==='jalan:route-change').length,1);
});
test('first accurate GPS already away from the planned road can recover without an initial route match',async()=>{
 const s=scene();s.detour(true);assert.equal(s.requests.length,1);
 assert.equal(s.state().deviationConfirmed,true);await s.finish();assert.equal(s.renders,1);
});
test('single jump, poor accuracy, stale readings and auto Off cannot trigger route replacement',async()=>{
 for(const scenario of ['jump','poor','stale','off']){
  const s=scene({auto:scenario!=='off'});s.feed([3,101.6],0);
  if(scenario==='jump'){s.feed([3.02,101.7],1000);s.feed([3,101.6001],1000);}
  if(scenario==='poor')for(let i=0;i<8;i++)s.feed([3.0008,101.6002],3000,150);
  if(scenario==='stale')for(let i=0;i<8;i++)s.feed([3.0008,101.6002],3000,8,1);
  if(scenario==='off')s.detour();
  await s.flush();assert.equal(s.requests.length,0,scenario);assert.equal(s.state().route,s.original);
 }
});
test('repeated impossible GPS teleports never relocate the vehicle or trigger a route request',async()=>{
 const s=scene();s.feed([3,101.6],0);
 const accepted=s.state().gpsPosition;
 // Several good-accuracy samples at a location >10km away in seconds
 // must not become a trusted measured position or a reroute origin.
 for(let i=0;i<8;i++)s.feed([3.02,101.7],3000);
 await s.flush();
 assert.deepEqual(s.state().gpsPosition,accepted);
 assert.equal(s.requests.length,0,'no TomTom request from rejected teleport');
 assert.equal(s.state().route,s.original);
 assert.equal(s.state().active,true);
 assert.equal(s.watches,1);
});
test('HTTP and invalid-route failures retain the route/GPS, throttle retries, then recover',async()=>{
 for(const failure of [{ok:false},{invalid:true}]){
  const s=scene();s.detour();await s.finish(failure);
  assert.equal(s.state().route,s.original);assert.equal(s.state().active,true);
  assert.equal(s.renders,0);assert.equal(s.watchClears,0);assert.equal(s.clears,0);
  s.feed([3.0008,101.6006],1000);assert.equal(s.requests.length,1);
  s.feed([3.0008,101.6006],30000);assert.equal(s.requests.length,2);
  await s.finish();assert.equal(s.renders,1);
 }
});
test('revoked, moved or superseded requests cannot resurrect or replace the journey',async()=>{
 for(const reason of ['stop','auto-off','destination','key','provider','background','gps-error','poor-gps','back-on-route','moved']){
  const s=scene();s.detour();assert.equal(s.requests.length,1);
  if(reason==='stop')s.context.window.JalanGPS.stop();
  if(reason==='auto-off')s.node('gps-auto').onclick();
  if(reason==='destination')s.context.destination=[3.1,101.7];
  if(reason==='key')s.node('tt-key').value='differentTestKey';
  if(reason==='provider')s.node('tt-primary').checked=false;
  if(reason==='background')s.background();
  if(reason==='gps-error')s.failGPS();
  if(reason==='poor-gps')s.feed([3.0008,101.6006],1000,150);
  if(reason==='back-on-route')s.feed([3,101.6006],3000);
  if(reason==='moved')s.feed([3.0008,101.603],10000);
  await s.finish();assert.equal(s.renders,0,reason);assert.equal(s.watches,1,reason);
  assert.equal(s.state().route,s.original,reason);
 }
});
test('timeout retains the journey and ignores a late response even when fetch ignores abort',async()=>{
 const s=scene();s.detour();s.expireRequest();
 assert.equal(s.requests[0].options.signal.aborted,true);assert.equal(s.state().rerouting,false);
 await s.finish();assert.equal(s.renders,0);assert.equal(s.state().active,true);
 assert.equal(s.state().route,s.original);
});
test('TomTom missing key never silently falls back, while manual recalculation rejects stale GPS',async()=>{
 const s=scene();s.node('tt-key').value='';s.detour();await s.flush();
 assert.equal(s.requests.length,0);assert.equal(s.state().route,s.original);
 const manual=scene({auto:false});manual.feed([3,101.6],0);manual.advance(11000);
 await manual.node('gps-reroute').onclick();assert.equal(manual.requests.length,0);
});
