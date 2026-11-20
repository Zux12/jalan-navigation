'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','passenger-route-traffic.js'),'utf8');
const point=(east,north=0)=>[101.68+east/(111320*Math.cos(3.14*Math.PI/180)),3.14+north/111320];
const geometry=[point(0),point(100),point(200),point(300)];
function scene({flow=null,clock=null}={}){
 const handlers=new Map(),keyListeners=new Map(),all=[],urls=[];
 const layerGroup=()=>{const layers=[];const group={
  addTo(){return group;},clearLayers(){layers.length=0;},getLayers(){return layers;}
 };return group;};
 const L={layerGroup,polyline(points,options){return {points,options,addTo(group){
  group.getLayers().push(this);all.push(this);return this;}}}};
 const key={value:'TEST_RESTRICTED_KEY_1234',addEventListener(name,fn){
  const listeners=keyListeners.get(name)||[];listeners.push(fn);keyListeners.set(name,listeners);
 }};
 const status={textContent:'',setAttribute(){}};
 const document={hidden:false,createElement:()=>status,
  getElementById:id=>id==='tt-key'?key:null,body:{append(){}}};
 const window={addEventListener(name,fn){const listeners=handlers.get(name)||[];
  listeners.push(fn);handlers.set(name,listeners);}};
 let routes=[],selectedRoute=0;
 const ctx={window,document,map:{},L,location:{search:'?mode=passenger'},
  URL,URLSearchParams,AbortController,Date:clock?class extends Date{static now(){return clock.now}}:Date,Math,Number,Array,console,
  setInterval:()=>1,clearInterval:()=>{},routes,selectedRoute,
  fetch:async(url)=>{
   urls.push(String(url));
   return {ok:flow!==null,json:async()=>({flowSegmentData:flow})};
  }};
 vm.runInNewContext(code,ctx,{filename:'passenger-route-traffic.js'});
 const dispatch=(name,detail)=>{for(const fn of handlers.get(name)||[])fn({detail});};
 const tick=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));};
 const setKey=value=>{key.value=value;
  for(const fn of keyListeners.get('input')||[])fn();
 };
 return {api:window.JalanRouteTraffic,ctx,status,all,urls,dispatch,tick,setKey};
}
const route=(sections)=>({provider:'tomtom',geometry:{type:'LineString',coordinates:geometry},
 trafficSections:sections,trafficSectionsCheckedAt:Date.now(),legs:[{steps:[]} ]});
const section=(a,b,magnitudeOfDelay,extra={})=>({
 sectionType:'TRAFFIC',startPointIndex:a,endPointIndex:b,
 magnitudeOfDelay,...extra
});
test('light yellow, moderate orange, heavy red and closure on exact provider route intervals',()=>{
 const s=scene(),r=route([
  section(0,1,1),section(1,2,2),section(2,3,3)
 ]);
 const pieces=s.api.classify(r);
 const types=new Set(pieces.map(p=>p.type));
 assert.deepEqual([...types].sort(),['heavy','light','moderate']);
 assert.ok(pieces.every(p=>p.coordinates.every(v=>Array.isArray(v)&&v.length===2)));
 const closed=s.api.classify(route([section(0,1,4,{simpleCategory:'ROAD_CLOSURE'})]));
 assert.equal(closed[0].type,'closed');
 assert.equal(s.api.severity({magnitudeOfDelay:0}),null,'unknown is not light traffic');
 assert.equal(s.api.severity({simpleCategory:'OTHER',magnitudeOfDelay:4}),null,
  'undefined delay is not necessarily a road closure');
});
test('coloured section uses exact original route vertices through bends and never an offset line',()=>{
 const s=scene();
 const bent=[point(0,0),point(130,0),point(130,90),point(250,90),point(280,120)];
 const path=s.api.makePath(bent);
 const coords=s.api.originalSubpath(path,20,path.total-15);
 assert.ok(coords.length>=5,'internal bend vertices are preserved');
 for(const original of bent.slice(1,-1)){
  assert.ok(coords.some(p=>Math.abs(p[0]-original[0])<1e-12&&
    Math.abs(p[1]-original[1])<1e-12),
   'every original TomTom route vertex is retained, not replaced by 20m straight chords');
 }
 const r={provider:'tomtom',geometry:{type:'LineString',coordinates:bent},
  trafficSectionsCheckedAt:Date.now(),trafficSections:[
   {sectionType:'TRAFFIC',startPointIndex:0,endPointIndex:4,magnitudeOfDelay:1}]};
 const yellow=s.api.classify(r).filter(p=>p.type==='light');
 assert.equal(yellow.length,1,'continuous affected segment stays continuous');
 assert.ok(yellow[0].coordinates.some(p=>Math.abs(p[0]-bent[2][0])<1e-12&&
   Math.abs(p[1]-bent[2][1])<1e-12),
  'classification overlays exactly the authoritative route geometry through bends');
});
test('unclassified route gaps stay blue, never connected by same-colour overlay',()=>{
 const s=scene(),r=route([section(0,1,1),section(2,3,1)]);
 const pieces=s.api.classify(r);
 assert.equal(pieces.length,2,'two separate yellow intervals remain separate');
 assert.equal(pieces[0].type,'light');assert.equal(pieces[1].type,'light');
 const last=pieces[0].coordinates.at(-1),first=pieces[1].coordinates[0];
 assert.ok(Math.abs(last[0]-first[0])>0.0002,'gap is kept uncoloured');
 assert.equal(s.api.classify({...r,provider:'osrm'}).length,0,'OSRM has no TomTom traffic');
});
test('flow speed ratios use explicit heuristic; unknown and uncertain samples fail closed',()=>{
 const s=scene(),p=s.api.makePath(geometry);
 const response=(currentSpeed,confidence=.9,offset=0)=>({
  currentSpeed,freeFlowSpeed:80,confidence,
  coordinates:{coordinate:[point(0,offset),point(100,offset),point(200,offset),point(300,offset)]
    .map(([longitude,latitude])=>({longitude,latitude}))}});
 assert.equal(s.api.makeFlowMatch(p,150,response(77)).type,null,'free-flow is not automatically light congestion');
 assert.equal(s.api.makeFlowMatch(p,150,response(65)).type,'light');
 assert.equal(s.api.makeFlowMatch(p,150,response(48)).type,'moderate');
 assert.equal(s.api.makeFlowMatch(p,150,response(20)).type,'heavy');
 assert.equal(s.api.makeFlowMatch(p,150,response(20,.2)),null,'low confidence is rejected');
 assert.equal(s.api.makeFlowMatch(p,150,(()=>{const x=response(20);delete x.confidence;return x;})()),null,
  'missing confidence must fail closed');
 assert.equal(s.api.makeFlowMatch(p,150,response(20,.9,80)),null,'unrelated adjacent road is rejected');
});
test('selected TomTom route requests bounded flow samples only; no nearby road overlay or OSRM flow',async()=>{
 const flow={currentSpeed:55,freeFlowSpeed:80,confidence:.9,
  coordinates:{coordinate:geometry.map(([longitude,latitude])=>({longitude,latitude}))}};
 const s=scene({flow}),r=route([section(0,1,3)]);
 s.ctx.routes=[r];s.dispatch('jalan:routes-rendered');await s.tick();
 const requests=s.urls.length;
 s.dispatch('jalan:routes-rendered');await s.tick();
 assert.equal(s.urls.length,requests,'repaint must not spend more key-bearing flow requests');
 assert.ok(s.urls.length>0&&s.urls.length<=6,'bounded segment queries');
 assert.ok(s.urls.every(u=>u.startsWith('https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/15/json')));
 assert.equal(s.api.getState().active,true);
 assert.ok(s.api.getState().overlayCount>0,'colours draw on selected route geometry');
 assert.ok(s.all.some(x=>x.options.color==='#ffe68a')||s.all.some(x=>x.options.color==='#f59b24'));
 const count=s.urls.length;
 s.ctx.routes=[{provider:'osrm',geometry:r.geometry}];
 s.dispatch('jalan:routes-rendered');await s.tick();
 assert.equal(s.api.getState().overlayCount,0);
 assert.equal(s.urls.length,count,'OSRM never invokes TomTom flow sampling');
 s.dispatch('jalan:route-cleared');
 assert.equal(s.api.getState().active,false);
});

test('the local slowdown question reads only recent free-flow data on the matched stretch',async()=>{
 const clock={now:Date.now()},flow={currentSpeed:25,freeFlowSpeed:70,confidence:.9,
  coordinates:{coordinate:geometry.map(([longitude,latitude])=>({longitude,latitude}))}};
 const s=scene({flow,clock}),r=route([]);
 s.ctx.routes=[r];s.dispatch('jalan:routes-rendered');await s.tick();
 const count=s.urls.length;
 assert.equal(s.api.freeFlowAt(r,1,point(150)),70);
 assert.equal(s.api.freeFlowAt(r,0,point(0)),null);
 assert.equal(s.api.freeFlowAt({...r},1,point(150)),null);
 clock.now+=300001;
 assert.equal(s.api.freeFlowAt(r,1,point(150)),null);
 assert.equal(s.urls.length,count);
});

test('revoking TomTom key while provider response is pending prevents stale flow redraw',async()=>{
 const flow={currentSpeed:15,freeFlowSpeed:80,confidence:.9,
  coordinates:{coordinate:geometry.map(([longitude,latitude])=>({longitude,latitude}))}};
 const s=scene({flow}),r=route([]);
 s.ctx.routes=[r];s.dispatch('jalan:routes-rendered');
 assert.ok(s.urls.length>0,'request begins for explicitly configured key');
 s.setKey('');await s.tick();
 assert.equal(s.api.getState().active,false,'key revocation clears selected traffic layer');
 assert.equal(s.api.getState().overlayCount,0,'late provider response cannot recolour route');
});

test('journey traffic snapshot reuses existing evidence, expires and clears on key revocation',async()=>{
 const clock={now:Date.now()},s=scene({clock}),r=route([section(1,2,2)]);
 r.trafficSectionsCheckedAt=clock.now;s.ctx.routes=[r];s.dispatch('jalan:routes-rendered');await s.tick();
 const count=s.urls.length,a=s.api.getJourneySnapshot();
 assert.equal(a.route,r);assert.ok(a.total>290);assert.equal(a.segments[0].type,'moderate');
 a.segments[0].type='heavy';assert.equal(s.api.getJourneySnapshot().segments[0].type,'moderate');
 clock.now+=10*60*1000+1;
 assert.equal(s.api.getJourneySnapshot().segments.length,0,'expired colour evidence is removed without new requests');
 assert.equal(s.urls.length,count);
 s.setKey('');assert.equal(s.api.getJourneySnapshot().route,null);
});

test('community colours cover exact cell boundaries, preserve closures, and restore provider colour on recovery',()=>{
 const s=scene(),r=route([section(0,1,1),section(1,2,3,{simpleCategory:'ROAD_CLOSURE'})]);
 let observed=[{start:52,end:152,type:'heavy'}];s.ctx.window.JalanCommunityFlow={sections:()=>observed};
 const types=()=>s.api.classify(r).map(x=>[Math.round(x.start),Math.round(x.end),x.type]);
 assert.deepEqual(Array.from(types(),x=>Array.from(x)),[[0,52,'light'],[52,100,'heavy'],[100,200,'closed']]);
 observed=[{start:52,end:152,type:'smooth'}];
 assert.deepEqual(Array.from(types(),x=>Array.from(x)),[[0,100,'light'],[100,200,'closed']]);
});
