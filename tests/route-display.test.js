'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),vm=require('node:vm');
const ctx={window:{}};vm.runInNewContext(readFileSync(__dirname+'/../passenger-route-display.js','utf8'),ctx);
const {shape,section,widthAtZoom}=ctx.window.JalanRouteDisplay;
const coords=[[101,3],[101.001,3],[101.002,3.0006],[101.003,3.002]];
const route=steps=>({geometry:{coordinates:coords},legs:[{steps}]});
test('gentle bends curve locally, preserve endpoints and share colour boundaries',()=>{
 const path=shape(route([]));assert.ok(path.points.length>coords.length);
 assert.deepEqual(path.points[0],coords[0]);assert.deepEqual(path.points.at(-1),coords.at(-1));
 const at=path.total*.35;
 assert.deepEqual(section(path,0,at).at(-1),section(path,at)[0]);
 assert.ok(shape(route([{pointIndex:1}])).points.includes(coords[1]));
});
test('route thickness changes continuously with zoom',()=>{
 assert.equal(widthAtZoom(12),5);
 assert.equal(widthAtZoom(16),8);
 assert.equal(widthAtZoom(18),11);
 assert.equal(widthAtZoom(18.5),11.75);
 assert.equal(widthAtZoom(20),14);
});
