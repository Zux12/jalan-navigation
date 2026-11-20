'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {check}=require('../passenger-toll-policy.js');
const via=(inbound,outbound)=>({pinnedStop:{inboundTolls:inbound,onward:{tolls:outbound}}});
test('only confirmed free choices qualify; incomplete evidence is distinct from confirmed tolls',()=>{
 const free={tolls:false};
 assert.deepEqual(check([{tolls:true},{tolls:null},free],{}),[free]);
 assert.throws(()=>check([{tolls:true}],{}),e=>e.tollConflict==='onward');
 for(const choices of [[],[{tolls:true},{tolls:null}],[{}]])
  assert.throws(()=>check(choices,{}),e=>!e.tollConflict);
});
test('each stop permission is limited to its leg and consuming a stop drops the inbound exception',()=>{
 const both=via(true,true);
 assert.throws(()=>check([both],{}),e=>e.tollConflict==='toStop');
 assert.throws(()=>check([both],{toStop:true}),e=>e.tollConflict==='onward');
 assert.throws(()=>check([via(true,null)],{toStop:true}),e=>!e.tollConflict);
 const [approved]=check([via(true,false)],{toStop:true});
 assert.deepEqual(approved.tollPolicy,{toStop:true});
 assert.deepEqual(approved.pinnedStop.onward.tollPolicy,{});
 assert.throws(()=>check([{tolls:true}],approved.pinnedStop.onward.tollPolicy),e=>e.tollConflict==='onward');
 assert.throws(()=>check([both],{onward:true}),e=>e.tollConflict==='toStop');
});
