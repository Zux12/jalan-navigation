'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {visual}=require('../passenger-lane-guidance.js');
const lanes=[
 {directions:['SLIGHT_LEFT'],follow:'SLIGHT_LEFT'},{directions:['SLIGHT_LEFT','STRAIGHT'],follow:'SLIGHT_LEFT'},
 {directions:['STRAIGHT']},{directions:['STRAIGHT']}
];
const step={maneuver:{type:'TAKE_EXIT'},turnAngleInDecimalDegrees:-45,lanes};

test('progression toward a signed exit uses provider directions and the near diagram',()=>{
 assert.equal(visual(step,801),null);
 assert.deepEqual(visual(step,800).lanes.map(l=>l.follow),['SLIGHT_LEFT','SLIGHT_LEFT',undefined,undefined]);
 assert.ok(visual(step,201).lanes);assert.deepEqual(visual(step,200),{fork:{side:'left',exit:true}});
 assert.equal(visual(step,-1),null);
 assert.deepEqual(visual({...step,turnAngleInDecimalDegrees:45},50).fork,{side:'right',exit:true});
});
test('ambiguity and gaps never invent a lane, exit side, or ordinary-turn fork',()=>{
 for(const bad of [undefined,[],[{directions:['STRAIGHT']}],lanes.map(l=>({...l,follow:null})),
  [lanes[0],{directions:['FUTURE']}],[lanes[0],{directions:['STRAIGHT'],follow:'RIGHT'}]])
  assert.equal(visual({...step,lanes:bad},300),null);
 for(const angle of [undefined,null,0,NaN])
  assert.equal(visual({...step,turnAngleInDecimalDegrees:angle},100).fork,undefined);
 assert.equal(visual({maneuver:{type:'TURN_LEFT'},turnAngleInDecimalDegrees:-90},100),null);
 assert.equal(visual({maneuver:{type:'KEEP_LEFT'},turnAngleInDecimalDegrees:45},100),null);
 assert.equal(visual({maneuver:{type:'KEEP_RIGHT'},junctionType:'ROUNDABOUT'},100),null);
 assert.deepEqual(visual({maneuver:{type:'KEEP_RIGHT'},junctionType:'BIFURCATION'},100).fork,{side:'right',exit:false});
});
test('OSRM lane indications apply only at the maneuver and retain left-to-right order',()=>{
 const location=[101,3],intersection={location,lanes:[
  {valid:false,indications:['straight']},{valid:true,indications:['straight','slight right']}]};
 const fork={maneuver:{type:'fork',location,modifier:'slight right'},intersections:[intersection]};
 assert.deepEqual(visual(fork,300).lanes.map(l=>l.follow),[null,'SLIGHT_RIGHT']);
 assert.equal(visual({...fork,intersections:[{location:[101,4]},intersection]},300),null);
 assert.equal(visual({...fork,intersections:[{...intersection,location:[101,4]}]},300),null);
 assert.deepEqual(visual(fork,100).fork,{side:'right',exit:false});
});
