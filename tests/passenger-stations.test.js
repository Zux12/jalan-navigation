'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const model=require('../passenger-station-route'),data=require('../passenger-station-data');
test('street coverage is independent of the city cache and follows a visible driver first',()=>{
 const bounds={south:3.10,west:101.62,north:3.19,east:101.74},driver=[3.158,101.711];
 const cells=data.cellsForView(bounds,driver);
 assert.ok(cells.length<=10);
 assert.ok(data.meters(cells[0].center,driver)<cells[0].radius);
 assert.equal(cells[0].size,.01);
 const closer=data.cellsForView({south:3.15,west:101.70,north:3.16,east:101.72},driver);
 assert.equal(closer[0].id,cells[0].id);
 assert.ok(closer.slice(1).some(c=>!cells.some(w=>w.id===c.id)));
});
test('a slow or interrupted second page leaves the first page available',async t=>{
 const results=Array.from({length:100},(_,i)=>({id:String(i),poi:{name:'Petrol '+i,categorySet:[{id:7311}]},position:{lat:3.1,lon:101.7}}));
 const offsets=[],shown=[];
 t.mock.method(globalThis,'fetch',async url=>{
   const offset=Number(url.searchParams.get('ofs'));offsets.push(offset);
   if(offset)return {ok:false};
   return {ok:true,json:async()=>({summary:{totalResults:103},results})};
 });
 const area=data.cellsForView({south:3.1,north:3.11,west:101.7,east:101.71},[3.101,101.701])[0];
 await assert.rejects(data.nearby(area,'fixture',new AbortController().signal,rows=>shown.push(rows.length)),/unavailable/);
 assert.deepEqual(offsets,[0,100]);assert.deepEqual(shown,[100]);
});
const petrol=(id,name,lon,cat)=>data.station({id,poi:{name,categorySet:[{id:cat}]},position:{lat:3.15,lon},
 chargingPark:cat===7309?{connectors:[{connectorType:'IEC62196Type2CCS',currentType:'DC',ratedPowerKW:180}]}:undefined});
test('single forecourt combines charging specifications while separate carriageways stay distinct',()=>{
 const rows=data.merge([petrol('a','Shell northbound',101.7,7311),petrol('b','Shell Recharge HPC northbound',101.70008,7309),
  petrol('c','Shell Recharge southbound',101.70009,7309)]);
 assert.equal(rows.length,2);assert.deepEqual([rows[0].petrol,rows[0].ev,rows[0].hpc],[true,true,true]);
 assert.deepEqual(rows[0].details,['DC · 180 kW · CCS2']);assert.equal(rows[1].hpc,true);
});
test('pins show the highest rating for each available class, including partially known connectors',()=>{
 const site=connectors=>data.station({id:'ev',poi:{name:'Charger',categorySet:[{id:7309}]},
  position:{lat:3.15,lon:101.7},chargingPark:{connectors}});
 const c=(currentType,ratedPowerKW)=>({currentType,ratedPowerKW});
 const fast=site([c('DC',150),c('DC',180),c('DC',50),c('AC1',7.4),c('AC3',22)]);
 assert.deepEqual(data.chargeLabels(fast),['HPC · 180 kW','DC · 50 kW','AC · 22 kW']);
 assert.deepEqual(data.chargeLabels(site([c('DC',149.9),c('AC3',null)])),['DC · 149.9 kW','AC']);
 assert.deepEqual(data.chargeLabels(site([c('',180)])),['EV · 180 kW']);
 assert.deepEqual(data.chargeLabels(site([{connectorType:'IEC62196Type2CCS',ratedPowerKW:160}])),['HPC · 160 kW']);
 assert.deepEqual(data.chargeLabels(site([])),[]);
 const merged=data.merge([petrol('pump','Forecourt',101.7,7311),fast]);
 assert.deepEqual(data.chargeLabels(merged[0]),data.chargeLabels(fast));
});
const regular={kind:'regular',name:'KL Sentral',point:[3,101.69]},station={kind:'station',name:'Shell',point:[3,101.7]};
const direct=async(a,b)=>[0,1].map(i=>({duration:120+i*12,distance:400+i*10,tolls:i===1,delay:8,knownTrafficDelay:8,
 speedLimits:[{start:0,end:2,limit:50}],trafficSections:[{startPointIndex:1,endPointIndex:2}],roadGuidance:[{routeOffsetInMeters:30}],
 legs:[{steps:[{pointIndex:1,routeOffsetInMeters:30,maneuver:{type:'TURN_LEFT'},lanes:[{follow:'LEFT'}]}]}],
 geometry:{coordinates:[a.toReversed(),[(a[1]+b[1])/2,a[0]+.001*i],b.toReversed()]}}));
test('both orders preserve road metadata, independent onward routes, and real alternatives',async()=>{
 for(const list of [[station,regular],[regular,station]]){
  const choices=await model.plan([3,101.68],[3,101.75],list,{},direct);
  assert.equal(choices.length,3);
  const route=choices[0];assert.deepEqual(model.stops(route),list.map(s=>({...s,station:undefined})));
  assert.equal(route.duration,360);assert.equal(route.distance,1200);assert.equal(route.knownTrafficDelay,24);
  assert.deepEqual(route.legs.flatMap(l=>l.steps.map(s=>s.pointIndex)),[1,3,5]);
  assert.deepEqual(route.legs.flatMap(l=>l.steps.map(s=>s.routeOffsetInMeters)),[30,430,830]);
  assert.equal(route.trafficSections.at(-1).endPointIndex,6);assert.equal(route.speedLimits.at(-1).end,6);
  assert.equal(route.pinnedStop.index,2);assert.equal(route.pinnedStop.onward.pinnedStop.index,2);
  assert.equal(model.managed(route.pinnedStop.onward)[0].kind,list[1].kind);
  assert.equal(model.order(route,{...station,name:'Petronas'},true)[0].name,'Petronas');
  assert.deepEqual(model.order(route,regular,true).map(s=>s.kind),['station','regular']);
 }
});
test('an unconnected access road is never joined across carriageways; toll exception stays with the specified leg',async()=>{
 let calls=[];
 await model.plan([3,101.68],[3,101.75],[regular,station],{tollPolicy:{legs:{station:true}}},(a,b,options)=>{calls.push(options.tollPolicy);return direct(a,b);});
 assert.deepEqual(calls,[{},{onward:true},{}]);
 const disconnected=async(a,b)=>direct(a===station.point?[a[0],a[1]+.01]:a,b);
 await assert.rejects(model.plan([3,101.68],[3,101.75],[station],{},disconnected),/connected/);
});

test('Google charger at a listed petrol forecourt yields one combined pin with its details ID',()=>{
 const local=petrol('fuel','Petronas',101.7,7311);
 const additional={id:'g',googleId:'g',point:[3.15,101.70001],ev:true};
 const joined=data.withGoogle([local],[additional]);assert.equal(joined.length,1);
 assert.deepEqual([joined[0].name,joined[0].petrol,joined[0].ev,joined[0].googleId],['Petronas',true,true,'g']);
 assert.equal(local.ev,false);assert.equal(data.withGoogle([local],[{...additional,point:[3.15,101.701]}]).length,2);
});
