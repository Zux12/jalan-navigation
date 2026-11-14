'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

function control(){return {disabled:false,checked:false,textContent:'',onclick:null,addEventListener(){throw Error('Paused control must not have an event handler')}};}

test('legacy KL3A GET route panel renders a fail-closed privacy hold',()=>{
 const parts=Object.fromEntries(['kl-preview-run','kl-preview-clear','kl-preview-status'].map(id=>[id,control()]));
 let fetches=0,layerCalls=0;
 const card={className:'',innerHTML:'',querySelector(sel){return parts[sel.slice(1)];}};
 const document={getElementById(id){return id==='panel-details'?{prepend(){}}:id==='route-summary'?{insertAdjacentElement(){}}:null;},
  createElement(){return card;}};
 const L={layerGroup(){layerCalls++;throw Error('Paused KL3A must not create a route layer')}};
 const window={L};
 vm.runInNewContext(source('jalan-kl-preview.js'),{window,document,L,map:{},startPoint:[3.139,101.687],
  destination:[3.148,101.695],fetch(){fetches++;throw Error('No external GET allowed')},URL,console});
 assert.equal(parts['kl-preview-run'].disabled,true);
 assert.equal(parts['kl-preview-clear'].disabled,true);
 assert.match(parts['kl-preview-status'].textContent,/paused for location privacy/);
 assert.match(parts['kl-preview-status'].textContent,/TomTom and OSRM/);
 assert.equal(fetches,0);
 assert.equal(layerCalls,0);
 assert.equal(typeof window.JalanKLPreview.clear,'function');
 assert.match(source('jalan-kl-preview.js'),/const privacyHold=true/);
});

test('legacy KL3B snap and GPS GET controls cannot send coordinates or watch GPS',()=>{
 const ids=['kl3b-check','kl3b-gps','kl3b-stop','kl3b-status'];
 const parts=Object.fromEntries(ids.map(id=>[id,control()]));
 let fetches=0,watches=0,events=0;
 const box={className:'',innerHTML:'',querySelector(sel){return parts[sel.slice(1)];}};
 const card={appendChild(){}};
 const document={querySelector(sel){return sel==='.jalan-kl-preview'?card:null;},createElement(){return box;}};
 const L={};
 const window={L,addEventListener(){events++;}};
 const navigator={geolocation:{watchPosition(){watches++;}}};
 vm.runInNewContext(source('jalan-kl-3b.js'),{window,document,L,map:{},navigator,
  startPoint:[3.139,101.687],destination:[3.148,101.695],
  fetch(){fetches++;throw Error('No coordinate GET allowed')},URL,console});
 for(const id of ids.filter(id=>id!=='kl3b-status'))assert.equal(parts[id].disabled,true,id);
 assert.match(parts['kl3b-status'].textContent,/paused for location privacy/);
 assert.equal(fetches,0);
 assert.equal(watches,0);
 assert.equal(events,0);
 assert.match(source('jalan-kl-3b.js'),/const privacyHold=true/);
});

test('shared traffic nearby GET is paused, but default-off opt-in POST remains separate',()=>{
 const ids=['shared-start','shared-stop','shared-check','shared-status'];
 const parts=Object.fromEntries(ids.map(id=>[id,control()]));
 let fetches=0;
 const document={getElementById(id){return parts[id]||null;},hidden:false};
 const window={isSecureContext:true,addEventListener(){}};
 vm.runInNewContext(source('shared-traffic.js'),{window,document,Date,Math,console,
  fetch(){fetches++;throw Error('No initial upload or nearby GET allowed')},
  crypto:{getRandomValues(){throw Error('Sharing is not auto-enabled')}},
  AbortSignal:{timeout(){throw Error('No request allowed on load')}}
 });
 assert.equal(parts['shared-check'].disabled,true);
 assert.equal(parts['shared-check'].onclick,null);
 assert.match(parts['shared-check'].textContent,/Nearby lookup paused/);
 assert.equal(typeof parts['shared-start'].onclick,'function');
 assert.equal(fetches,0);
 const html=source('index.html');
 assert.match(html,/Nearby traffic lookup is paused for location privacy/);
 assert.match(html,/id="shared-stop"[^>]*disabled/);
 assert.match(source('shared-traffic.js'),/const nearbyLookupPrivacyHold=true/);
});

test('opt-in observation cancels in-flight POST on Stop, journey stop and pagehide',async()=>{
 for(const stopEvent of ['button','jalan:journey-stop','pagehide']){
  const ids=['shared-start','shared-stop','shared-check','shared-status'];
  const parts=Object.fromEntries(ids.map(id=>[id,control()]));
  const listeners={};let started=0,aborted=0,randomCounter=0;
  const document={hidden:false,getElementById(id){return parts[id];}};
  const window={isSecureContext:true,addEventListener(name,handler){listeners[name]=handler;}};
  const fetch=(url,options)=>{
   assert.match(url,/\/observations$/);
   assert.equal(options.method,'POST');
   started++;
   return new Promise((resolve,reject)=>{
    options.signal.addEventListener('abort',()=>{
     aborted++;
     // Delay completion to expose races with a freshly opted-in session.
     queueMicrotask(()=>reject(new Error('aborted')));
    },{once:true});
   });
  };
  vm.runInNewContext(source('shared-traffic.js'),{
   window,document,fetch,Date,Math,console,AbortController,setTimeout,clearTimeout,queueMicrotask,
   crypto:{getRandomValues(buf){buf.fill(++randomCounter);return buf;}}
  });
  parts['shared-start'].onclick();
  const fix={detail:{matched:true,matchedPosition:[3.139,101.6869],
   accuracy:4,speedMps:3,heading:90}};
  const first=listeners['jalan:gps-fix'](fix);
  assert.equal(started,1,'initial opted-in POST');
  if(stopEvent==='button')parts['shared-stop'].onclick();
  else listeners[stopEvent]();
  assert.equal(aborted,1,stopEvent+' must abort the pending request');
  assert.equal(parts['shared-start'].disabled,false);
  assert.match(parts['shared-status'].textContent,/already accepted observation is not recalled/);
  // A fresh explicit opt-in must not be blocked by the old aborted request.
  parts['shared-start'].onclick();
  const second=listeners['jalan:gps-fix'](fix);
  assert.equal(started,2);
  await first; // stale first session finishes after second one has started
  listeners['jalan:gps-fix'](fix);
  assert.equal(started,2,'stale completion must not clear the new pending guard');
  parts['shared-stop'].onclick();
  assert.equal(aborted,2);
  await second;
  assert.equal(parts['shared-check'].disabled,true,'nearby-coordinate GET remains held');
 }
});
