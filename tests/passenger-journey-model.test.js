'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {longestRoad,createViaTracker,remainingSegments}=require('../passenger-journey-model.js');
test('via road is ranked by total travelled distance, not instruction count or longest single step',()=>{
 const r={legs:[{steps:[{name:'Short road',distance:30},{name:'Short road',distance:30},
  {name:'Maju Expressway',distance:900},{name:'Jalan Tun Razak',distance:1500},
  {name:' Maju   Expressway ',distance:900},{name:'False arrival',distance:9000,maneuver:{type:'arrive'}}]}]};
 assert.equal(longestRoad(r),'Maju Expressway');
});
test('TomTom offsets count the road followed after each instruction and do not carry names into unnamed gaps',()=>{
 const r={provider:'tomtom',distance:10000,roadGuidance:[
  {street:'Local road',routeOffsetInMeters:0},
  {street:'Maju Expressway',routeOffsetInMeters:1000},
  {street:'',routeOffsetInMeters:3500},
  {street:'Jalan Ampang',routeOffsetInMeters:8000},
  {street:'KLCC',routeOffsetInMeters:10000,maneuver:'ARRIVE'}]};
 assert.equal(longestRoad(r),'Maju Expressway');
});
test('all TomTom road boundaries beyond spoken-step limit participate, including final section',()=>{
 const steps=Array.from({length:121},(_,i)=>({street:'Local street',routeOffsetInMeters:i*10}));
 steps.push({street:'Long highway',routeOffsetInMeters:1210});
 assert.equal(longestRoad({provider:'tomtom',distance:10000,roadGuidance:steps}),'Long highway');
});
test('missing or invalid road evidence returns no fabricated via name',()=>{
 assert.equal(longestRoad({provider:'tomtom',distance:100,roadGuidance:[{name:'Turn toward KLCC',routeOffsetInMeters:0}]}),null);
 assert.equal(longestRoad({legs:[{steps:[{name:'Bad',distance:NaN},{name:'Other',distance:-3}]}]}),null);
 assert.equal(longestRoad({provider:'tomtom',distance:100,roadGuidance:[{street:'Bad',routeOffsetInMeters:200}]}),null);
 assert.equal(longestRoad({provider:'tomtom',distance:100,roadGuidance:[{roadNumbers:['E20'],routeOffsetInMeters:0}]}),'E20');
});
test('Via holds on approach and on the named road, then switches at each exit',()=>{
 const via=createViaTracker({provider:'tomtom',distance:11000,roadGuidance:[
  {street:'Local approach',routeOffsetInMeters:0},{roadNumbers:['E2'],routeOffsetInMeters:500},
  {roadNumbers:['E2'],routeOffsetInMeters:6000},{roadNumbers:['E26'],routeOffsetInMeters:6500},
  {street:'Arrival road',routeOffsetInMeters:10000}]});
 for(const meters of [0,499,5500,6000,6499])assert.equal(via(meters),'E2');
 for(const meters of [6500,9999])assert.equal(via(meters),'E26');
 assert.equal(via(10000),'Arrival road');
 assert.equal(via(11000),null);
});
test('leaving and later rejoining a road counts only the stretches still ahead',()=>{
 const via=createViaTracker({legs:[
  {steps:[{name:'Highway',distance:4000},{name:'',distance:200}]},
  {steps:[{name:'Middle road',distance:3000},{name:'Highway',distance:1500}]}]});
 assert.equal(via(3999),'Highway');
 assert.equal(via(4000),'Middle road');
 assert.equal(via(4200),'Middle road');
 assert.equal(via(7200),'Highway');
 assert.equal(via(8700),null);
});
test('a GPS gap can skip an entire road and comparisons clip the partially driven road',()=>{
 const via=createViaTracker({legs:[{steps:[{name:'A',distance:8000},{name:'B',distance:5500},
  {ref:'E26',distance:3000},{name:'Local',distance:300}]}]});
 assert.equal(via(0),'A');
 assert.equal(via(11500),'E26');
 assert.equal(via(16400),'E26');
 assert.equal(via(16500),'Local');
});
test('traffic positions and widths use the remaining distance, clipping passed and overlapping pieces',()=>{
 const s={total:1000,segments:[{type:'light',start:0,end:100},{type:'moderate',start:100,end:400},
  {type:'heavy',start:600,end:800},{type:'closed',start:950,end:1100}]};
 assert.deepEqual(remainingSegments(s,200),[
  {type:'moderate',left:0,width:25,from:0,to:200},
  {type:'heavy',left:50,width:25,from:400,to:600},
  {type:'closed',left:93.75,width:6.25,from:750,to:800}]);
 assert.deepEqual(remainingSegments(s,1000),[]);
 assert.equal(s.segments.length,4,'does not mutate source traffic');
});
test('unknown/invalid traffic does not become light or stretch to fill an unobserved gap',()=>{
 assert.deepEqual(remainingSegments({total:0,segments:[{type:'heavy',start:0,end:10}]}),[]);
 assert.deepEqual(remainingSegments({total:100,segments:[{type:'unknown',start:0,end:100},
  {type:'heavy',start:NaN,end:100},{type:'light',start:50,end:40}]}),[]);
});
