'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {osrm,tomtom,observe}=require('../passenger-pin-route.js');
const stop={point:[3,101],access:[3,101.0001]};
function drive(samples){
 const state={};return samples.map(([t,metres,speed,accuracy=5])=>observe(state,{
  gpsReliable:true,gpsFixAgeMs:0,gpsAccuracy:accuracy,gpsPosition:[3+metres/111320,101],speedMps:speed
 },stop,t*1000));
}
test('approach and sustained stop consume the waypoint once the vehicle stops',()=>{
 assert.deepEqual(drive([[1,-70,12],[4,-20,8],[5,4,0],[9,3,0],[10,2,0]]),
  [undefined,undefined,undefined,undefined,'arrived']);
});
test('moving past requires approach and sustained departure, and rejects drift, gaps and distant flybys',()=>{
 assert.equal(drive([[1,-70,18],[3,-17,18],[4,0,18],[6,35,18],[8,70,18]]).at(-1),'passed');
 for(const samples of [[[1,5,14],[2,100,14,90]],[[1,5,14],[16,80,14],[18,115,14]],
   [[1,70,14],[3,100,14],[5,140,14]],[[1,4,0],[3,11,0],[5,4,0]]])
   assert.ok(drive(samples).every(result=>!result));
});
test('OSRM chooses the second occurrence when a route visits the waypoint twice',()=>{
 const c=[[101,3],[101.001,3],[101.002,3],[101.001,3],[101,3.005]];
 const r=osrm({geometry:{coordinates:c},legs:[{distance:333},{distance:600,duration:90,steps:[]}]},stop.point,c[1]);
 assert.equal(r.pinnedStop.index,3);assert.deepEqual(r.pinnedStop.onward.geometry.coordinates,c.slice(3));
 assert.deepEqual(r.pinnedStop.point,stop.point);assert.deepEqual(r.pinnedStop.access,[3,101.001]);
});
test('TomTom carries onward instructions and traffic relative to its second leg',()=>{
 const p=i=>({longitude:101+i*.001,latitude:3}),leg=(i,d)=>({points:[p(i),p(i+1)],summary:{lengthInMeters:d}});
 const raw={legs:[leg(0,110),leg(1,120)],summary:{lengthInMeters:230},guidance:{instructions:[
  {routeOffsetInMeters:10},{routeOffsetInMeters:180}]},sections:[{startPointIndex:1,endPointIndex:2}]};
 const normalize=r=>({geometry:{coordinates:r.legs.flatMap(l=>l.points.map(p=>[p.longitude,p.latitude]))},
  distance:r.summary.lengthInMeters,steps:r.guidance.instructions,sections:r.sections});
 const r=tomtom(raw,stop.point,normalize);
 assert.equal(r.pinnedStop.index,1);assert.equal(r.pinnedStop.onward.steps[0].routeOffsetInMeters,70);
 assert.deepEqual(r.pinnedStop.onward.sections,[{startPointIndex:0,endPointIndex:1}]);
});
