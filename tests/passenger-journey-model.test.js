'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {longestRoad,remainingSegments}=require('../passenger-journey-model.js');
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
