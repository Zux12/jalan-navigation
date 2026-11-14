'use strict';
// Independent KL segment preview: requires explicit per-page consent before
// any route coordinates are sent to the legacy experimental Mterms endpoint.
// This is NOT the owner-authenticated private JALAN Heroku pilot.
(function(){
 const panel=document.getElementById('panel-details');
 if(!panel||!window.L||typeof map==='undefined')return;
 const API='https://mterm2026-559f9bf571b5.herokuapp.com/api/jalan/kl-segment-v4102';
 const card=document.createElement('section');card.className='traffic-card jalan-kl-3c';
 card.innerHTML='<div class="compare-title"><strong>Jalan KL — Segment Route Preview</strong><span class="demo-tag">TEST ONLY</span></div>'+
  '<p class="compare-hint">Experimental only — no traffic, verified turn rules or legal driving approval. This public prototype is separate from the private JALAN pilot.</p>'+
  '<label class="traffic-consent"><input type="checkbox" id="kl3c-consent"> I allow this preview to send the selected start and destination coordinates to the original Mterms experimental Heroku service for this page session. The destination and any one-time GPS coordinates are sent in the request URL; server-side access logs may retain the request. No location is sent by this panel until I opt in.</label>'+
  '<div class="compare-actions"><button type="button" id="kl3c-run">Test segment route</button><button type="button" id="kl3c-gps">Recalculate from GPS (one-time opt-in)</button><button type="button" id="kl3c-clear">Clear preview and consent</button></div>'+
  '<p id="kl3c-status" class="compare-hint" role="status" aria-live="polite">Consent is off. Choose start and destination, then opt in before requesting this experimental route.</p>';
 const old=document.querySelector('.jalan-kl-preview');if(old)old.insertAdjacentElement('afterend',card);else panel.prepend(card);
 const status=card.querySelector('#kl3c-status');
 const consent=card.querySelector('#kl3c-consent');
 const layer=L.layerGroup().addTo(map);
 let pending=null,sequence=0;
 function coords(p){
  return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&
   p[0]>=2.5&&p[0]<=3.8&&p[1]>=100.8&&p[1]<=102.3;
 }
 function authorized(){
  if(consent.checked)return true;
  status.textContent='No coordinates sent. Tick the explicit Mterms experimental endpoint consent checkbox first.';
  return false;
 }
 function cancel(){
  sequence++;
  pending?.abort();
  pending=null;
 }
 consent.onchange=()=>{
  if(!consent.checked){
   cancel();layer.clearLayers();
   status.textContent='Consent revoked. Any outstanding request was cancelled; the experimental route is cleared.';
  }else{
   status.textContent='Consent enabled for this page session. The next preview request will send start/end coordinates to the original Mterms Heroku endpoint.';
  }
 };
 async function run(start,end){
  if(!authorized())return;
  if(pending){status.textContent='A preview request is already running.';return;}
  if(!coords(start)||!coords(end)){status.textContent='Choose valid KL pilot start and destination coordinates first.';return;}
  const controller=new AbortController(),id=++sequence;
  pending=controller;
  status.textContent='Calculating experimental segment route…';
  try{
   const u=new URL(API+'/route');
   [['startLat',start[0]],['startLng',start[1]],['endLat',end[0]],['endLng',end[1]]]
    .forEach(([k,v])=>u.searchParams.set(k,v));
   const response=await fetch(u,{signal:controller.signal,cache:'no-store',referrerPolicy:'no-referrer'});
   const d=await response.json();
   if(!consent.checked||controller.signal.aborted||id!==sequence)return;
   if(!response.ok||!d.ok)throw Error(d.error||'Route unavailable');
   const coordinates=Array.isArray(d.geometry)?d.geometry:d.geometry?.coordinates;
   if(!Array.isArray(coordinates)||coordinates.length<2||
      !coordinates.every(p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite)))
    throw Error('Invalid route geometry');
   const ll=coordinates.map(p=>[p[1],p[0]]);
   layer.clearLayers();
   const line=L.polyline(ll,{color:'#0891b2',weight:7,opacity:.9,dashArray:'12 8'}).addTo(layer);
   map.fitBounds(line.getBounds(),{padding:[35,35],maxZoom:16});
   status.textContent='Segment preview '+(d.distanceMeters/1000).toFixed(2)+
    ' km · '+d.edgeCount+' directed edges · start/end snap '+
    d.startSnapMeters+'/'+d.endSnapMeters+
    ' m · illustrative '+d.illustrativeEtaMinutes+
    ' min at 30 km/h (NOT traffic ETA). NOT FOR DRIVING.';
  }catch(e){
   if(e.name!=='AbortError'&&id===sequence)
    status.textContent='Preview unavailable: '+e.message;
  }finally{
   if(pending===controller)pending=null;
  }
 }
 card.querySelector('#kl3c-run').onclick=()=>run(
  typeof startPoint!=='undefined'?startPoint:null,
  typeof destination!=='undefined'?destination:null
 );
 card.querySelector('#kl3c-gps').onclick=()=>{
  if(!authorized())return;
  const end=typeof destination!=='undefined'?destination:null;
  if(!coords(end)){status.textContent='Search a valid KL pilot destination first.';return;}
  if(!navigator.geolocation){status.textContent='GPS unavailable';return;}
  const id=sequence;
  status.textContent='Requesting one GPS fix (no tracking)…';
  navigator.geolocation.getCurrentPosition(p=>{
   // Revoke/clear cancels pending GPS intention, even when browser permission
   // dialog resolves after consent has been switched off.
   if(!consent.checked||id!==sequence)return;
   if(p.coords.accuracy>70){
    status.textContent='GPS accuracy insufficient ('+Math.round(p.coords.accuracy)+' m). No route changed.';
    return;
   }
   run([p.coords.latitude,p.coords.longitude],end);
  },e=>{
   if(consent.checked&&id===sequence)status.textContent='GPS unavailable: '+e.message;
  },{enableHighAccuracy:true,timeout:12000,maximumAge:0});
 };
 card.querySelector('#kl3c-clear').onclick=()=>{
  cancel();consent.checked=false;layer.clearLayers();
  status.textContent='Preview and consent cleared. No further experimental request will be made without fresh consent.';
 };
})();
