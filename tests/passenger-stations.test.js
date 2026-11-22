'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const model=require('../passenger-station-route'),data=require('../passenger-station-data');
const petrol=(id,name,lon,cat)=>data.station({id,poi:{name,categorySet:[{id:cat}]},position:{lat:3.15,lon},
 chargingPark:cat===7309?{connectors:[{connectorType:'IEC62196Type2CCS',currentType:'DC',ratedPowerKW:180}]}:undefined});
test('single forecourt combines charging specifications while separate carriageways stay distinct',()=>{
 const rows=data.merge([petrol('a','Shell northbound',101.7,7311),petrol('b','Shell Recharge HPC northbound',101.70008,7309),
  petrol('c','Shell Recharge southbound',101.70009,7309)]);
 assert.equal(rows.length,2);assert.deepEqual([rows[0].petrol,rows[0].ev,rows[0].hpc],[true,true,true]);
 assert.deepEqual(rows[0].details,['DC · 180 kW · CCS2']);assert.equal(rows[1].hpc,false);
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
