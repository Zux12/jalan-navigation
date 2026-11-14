'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','jalan-kl-3c.js'),'utf8');
function scene(){
 const elements={};
 for(const id of ['kl3c-status','kl3c-consent','kl3c-run','kl3c-gps','kl3c-clear'])
  elements[id]={checked:false,disabled:false,textContent:'',onclick:null,onchange:null};
 let fetches=0,gpsCalls=0;
 const card={className:'',innerHTML:'',querySelector(selector){
  return elements[selector.replace('#','')];
 }};
 const document={
  getElementById(id){return id==='panel-details'?{prepend(){}}:null},
  createElement(){return card},
  querySelector(){return null}
 };
 const L={layerGroup(){throw Error('Paused KL3C must not instantiate map layers')}};
 const navigator={geolocation:{getCurrentPosition(){gpsCalls++}}};
 const fetch=()=>{fetches++;throw Error('Paused KL3C must not call original Heroku')};
 const context={window:{L},document,L,map:{},navigator,fetch,URL,Error,
  AbortController,console,startPoint:[3.139,101.686],destination:[3.148,101.695]};
 vm.runInNewContext(src,context,{filename:'jalan-kl-3c.js'});
 return {elements,card,get fetches(){return fetches},get gpsCalls(){return gpsCalls}};
}
test('public KL3C controls are disabled and explain the privacy hold',()=>{
 const s=scene();
 for(const id of ['kl3c-consent','kl3c-run','kl3c-gps','kl3c-clear'])
  assert.equal(s.elements[id].disabled,true);
 assert.match(s.elements['kl3c-status'].textContent,/temporarily paused for location privacy/);
 assert.match(s.elements['kl3c-status'].textContent,/TomTom and OSRM/);
 assert.match(s.elements['kl3c-status'].textContent,/NOT FOR DRIVING/);
});
test('no coordinate submission or GPS permission action is wired while paused',()=>{
 const s=scene();
 assert.equal(s.elements['kl3c-run'].onclick,null);
 assert.equal(s.elements['kl3c-gps'].onclick,null);
 assert.equal(s.elements['kl3c-consent'].onchange,null);
 assert.equal(s.fetches,0);
 assert.equal(s.gpsCalls,0);
});
test('privacy hold does not persist consent or browser storage',()=>{
 assert.doesNotMatch(src,/localStorage|sessionStorage|document\.cookie/);
 assert.match(src,/const privacyHold=true/);
 assert.match(src,/server-side access logs may retain the request/);
});
