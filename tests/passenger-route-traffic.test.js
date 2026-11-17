'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','passenger-route-traffic.js'),'utf8');
const point=(east,north=0)=>[101.68+east/(111320*Math.cos(3.14*Math.PI/180)),3.14+north/111320];
const geometry=[point(0),point(100),point(200),point(300)];
function scene({flow=null}={}){
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
  URL,URLSearchParams,AbortController,Date,Math,Number,Array,console,
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
 assert.equal(s.urls.length,0,'route preview must not make extra flow calls before live traffic opt-in');
 assert.ok(s.api.getState().overlayCount>0,'route-indexed snapshot remains visible before Go');
 s.dispatch('jalan:traffic-layer-status',{state:'loading'});await s.tick();
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

test('revoking TomTom key while provider response is pending prevents stale flow redraw',async()=>{
 const flow={currentSpeed:15,freeFlowSpeed:80,confidence:.9,
  coordinates:{coordinate:geometry.map(([longitude,latitude])=>({longitude,latitude}))}};
 const s=scene({flow}),r=route([]);
 s.ctx.routes=[r];s.dispatch('jalan:routes-rendered');
 s.dispatch('jalan:traffic-layer-status',{state:'loading'});
 assert.ok(s.urls.length>0,'request begins only after live traffic opt-in');
 s.setKey('');await s.tick();
 assert.equal(s.api.getState().active,false,'key revocation clears selected traffic layer');
 assert.equal(s.api.getState().overlayCount,0,'late provider response cannot recolour route');
});


// These are synthetic geometry controls, never independent road acceptance.
const flowOn=coords=>({currentSpeed:20,freeFlowSpeed:80,confidence:.9,
 coordinates:{coordinate:coords.map(([longitude,latitude])=>({longitude,latitude}))}});
test('a crossing flow segment must not paint selected-route traffic',()=>{
 const s=scene(),p=s.api.makePath(geometry);
 for(const angle of [45,60,90]){
  const a=angle*Math.PI/180;
  const flow=flowOn([point(150-100*Math.cos(a),-100*Math.sin(a)),
   point(150+100*Math.cos(a),100*Math.sin(a))]);
  assert.equal(s.api.makeFlowMatch(p,150,flow),null,`crossing at ${angle} degrees`);
 }
});
test('degenerate flow and a short endpoint touch are not a road-stretch match',()=>{
 const s=scene(),p=s.api.makePath(geometry);
 assert.equal(s.api.makeFlowMatch(p,150,flowOn([point(150),point(150)])),null);
 assert.equal(s.api.makeFlowMatch(p,150,flowOn([point(150),point(155)])),null);
 assert.equal(s.api.makeFlowMatch(p,150,flowOn([point(160),point(260,100)])),null);
});

test('continuous exact bends and dense short segments retain sampled flow',()=>{
 const s=scene();
 const dense=Array.from({length:17},(_,i)=>point(i*10));
 assert.ok(s.api.makeFlowMatch(s.api.makePath(dense),80,flowOn(dense)));
 const bent=[point(0),point(100),point(100,100),point(200,100)];
 const result=s.api.makeFlowMatch(s.api.makePath(bent),150,flowOn(bent));
 assert.ok(result,'connected geometry through bends is not a crossing');
 assert.ok(result.segments[0][1]-result.segments[0][0]>150);
});
test('disconnected parallel touches cannot accumulate a flow match',()=>{
 const s=scene(),p=s.api.makePath(geometry);
 const touches=[point(80),point(100),point(100,100),point(140,100),
  point(140),point(160),point(160,100),point(200,100),point(200),point(220)];
 assert.equal(s.api.makeFlowMatch(p,150,flowOn(touches)),null);
});
test('short flow is bounded to actual overlap and cannot extend beyond its endpoints',()=>{
 const s=scene(),p=s.api.makePath(geometry);
 const match=s.api.makeFlowMatch(p,150,flowOn([point(125),point(175)]));
 assert.ok(match);
 assert.ok(Math.abs(match.segments[0][0]-125)<.001);
 assert.ok(Math.abs(match.segments[0][1]-175)<.001);
 assert.equal(s.api.makeFlowMatch(p,110,flowOn([point(125),point(175)])),null,
  'being near a provider endpoint is not being on its affected stretch');
});
test('parallel/opposite/coincident geometry remains explicitly unverified, never direction proof',()=>{
 const s=scene(),p=s.api.makePath(geometry);
 for(const coords of [geometry,[...geometry].reverse(),geometry.map(([x,y])=>[x,y+8/111320])]){
  const match=s.api.makeFlowMatch(p,150,flowOn(coords));
  assert.ok(match,'geometry alone cannot identify travel direction or grade');
  assert.equal(match.directionVerified,false);
  assert.equal(match.gradeVerified,false);
 }
 const tooFar=geometry.map(([x,y])=>[x,y+20/111320]);
 assert.equal(s.api.makeFlowMatch(p,150,flowOn(tooFar)),null);
 const invalid=flowOn(geometry);invalid.confidence=1.5;
 assert.equal(s.api.makeFlowMatch(p,150,invalid),null);
});
test('rejected crossing flow does not reach coloured overlays while route incidents remain',async()=>{
 const s=scene({flow:flowOn([point(150,-100),point(150,100)])}),r=route([]);
 s.ctx.routes=[r];s.dispatch('jalan:routes-rendered');
 s.dispatch('jalan:traffic-layer-status',{state:'loading'});await s.tick();
 assert.equal(s.api.getState().sampledFlow,false);
 assert.equal(s.api.getState().overlayCount,0);
 r.trafficSections=[section(0,1,2)];s.dispatch('jalan:incidents-updated');
 assert.ok(s.api.getState().overlayCount>0,'authoritative route-indexed incident survives');
});

test('rendered flow and incidents end at exact evidence boundaries, without 20m cell expansion',async()=>{
 const s=scene({flow:flowOn([point(125),point(175)])}),r=route([]);
 s.ctx.routes=[r];s.dispatch('jalan:routes-rendered');
 s.dispatch('jalan:traffic-layer-status',{state:'loading'});await s.tick();
 const line=s.all.at(-1);
 assert.ok(line);
 assert.ok(Math.abs(line.points[0][1]-point(125)[0])<1e-9);
 assert.ok(Math.abs(line.points.at(-1)[1]-point(175)[0])<1e-9);
 const irregular=[point(0),point(73),point(137),point(300)];
 const incident=s.api.classify({...route([section(1,2,3)]),
  geometry:{type:'LineString',coordinates:irregular}});
 assert.equal(incident.length,1);
 assert.ok(Math.abs(incident[0].start-73)<.001);
 assert.ok(Math.abs(incident[0].end-137)<.001);
});

test('exact boundary sweep keeps strongest overlapping incident and preserves unknown gaps',()=>{
 const s=scene();
 const r={...route([section(0,3,1),section(1,2,3)]),
  geometry:{type:'LineString',coordinates:[point(0),point(73),point(137),point(251),point(300)]}};
 const pieces=s.api.classify(r);
 assert.deepEqual(Array.from(pieces,p=>p.type),['light','heavy','light']);
 for(const [i,start,end] of [[0,0,73],[1,73,137],[2,137,251]]){
  assert.ok(Math.abs(pieces[i].start-start)<.001);
  assert.ok(Math.abs(pieces[i].end-end)<.001);
 }
 assert.equal(s.api.classify({...r,trafficSectionsCheckedAt:Date.now()-11*60*1000}).length,0);
});

test('traffic Off stays opted out after later route repaints while route-indexed colour survives',async()=>{
 const s=scene({flow:flowOn(geometry)}),r=route([section(0,1,1)]);
 s.ctx.routes=[r];s.dispatch('jalan:routes-rendered');await s.tick();
 assert.equal(s.urls.length,0,'planning alone must not request Flow Segment');
 s.dispatch('jalan:traffic-layer-status',{state:'loading'});await s.tick();
 assert.ok(s.urls.length>0,'explicit activation permits bounded Flow Segment');
 const requestCount=s.urls.length;
 s.dispatch('jalan:traffic-layer-status',{state:'off'});
 s.dispatch('jalan:routes-rendered');await s.tick();
 assert.equal(s.urls.length,requestCount,'repaint cannot restart opted-out sampling');
 assert.equal(s.api.getState().sampledFlow,false);
 assert.ok(s.api.getState().overlayCount>0,'TomTom route-indexed snapshot remains');
});
test('silent key replacement prevents pending abort-ignoring flow response from painting',async()=>{
 const s=scene({flow:flowOn(geometry)}),r=route([]);
 s.ctx.routes=[r];s.dispatch('jalan:routes-rendered');
 s.dispatch('jalan:traffic-layer-status',{state:'loading'});
 assert.ok(s.urls.length>0,'sampling begins after opt-in');
 s.ctx.document.getElementById('tt-key').value='REPLACED_TEST_KEY_1234';
 await s.tick();
 assert.equal(s.api.getState().active,false,'silent replacement invalidates pending flow');
 assert.equal(s.api.getState().overlayCount,0);
});
