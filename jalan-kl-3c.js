'use strict';
// Independent KL segment-route overlay. Existing OSRM, TomTom and GPS are not modified.
(function(){
 const panel=document.getElementById('panel-details');
 if(!panel||!window.L||typeof map==='undefined')return;
 const API='https://mterm2026-559f9bf571b5.herokuapp.com/api/jalan/kl-segment-v4102';
 const card=document.createElement('section');card.className='traffic-card jalan-kl-3c';
 card.innerHTML='<div class="compare-title"><strong>Jalan KL — Segment Route Preview</strong><span class="demo-tag">TEST ONLY</span></div><p class="compare-hint">Direction-aware road-segment snapping, illustrative fixed-speed ETA and manual GPS-origin route recalculation. No turn-rule enforcement or live traffic. NOT FOR DRIVING.</p><div class="compare-actions"><button type="button" id="kl3c-run">Test segment route</button><button type="button" id="kl3c-gps">Recalculate from GPS (opt-in)</button><button type="button" id="kl3c-clear">Clear preview</button></div><p id="kl3c-status" class="compare-hint" role="status">Choose start and destination first.</p>';
 const old=document.querySelector('.jalan-kl-preview');if(old)old.insertAdjacentElement('afterend',card);else panel.prepend(card);
 const status=card.querySelector('#kl3c-status'),layer=L.layerGroup().addTo(map);let busy=false;
 function coords(p){return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);}
 async function run(start,end){if(busy)return;if(!coords(start)||!coords(end)){status.textContent='Choose both start and destination first.';return;}busy=true;status.textContent='Calculating segment-snapped KL route…';try{const u=new URL(API+'/route');[['startLat',start[0]],['startLng',start[1]],['endLat',end[0]],['endLng',end[1]]].forEach(([k,v])=>u.searchParams.set(k,v));const response=await fetch(u);const d=await response.json();if(!response.ok||!d.ok)throw Error(d.error||'Route unavailable');layer.clearLayers();const coordinates = Array.isArray(d.geometry)
  ? d.geometry
  : d.geometry?.coordinates;

if (!Array.isArray(coordinates) || coordinates.length < 2) {
  throw new Error('Invalid route geometry');
}

const ll = coordinates.map(p => [p[1], p[0]]);if(ll.length<2)throw Error('Empty geometry');const line=L.polyline(ll,{color:'#0891b2',weight:7,opacity:.9,dashArray:'12 8'}).addTo(layer);map.fitBounds(line.getBounds(),{padding:[35,35],maxZoom:16});status.textContent=`Segment preview ${(d.distanceMeters/1000).toFixed(2)} km · ${d.edgeCount} directed edges · start/end snap ${d.startSnapMeters}/${d.endSnapMeters} m · illustrative ${d.illustrativeEtaMinutes} min at 30 km/h (NOT traffic ETA). NOT FOR DRIVING.`;}catch(e){status.textContent='Preview unavailable: '+e.message;}finally{busy=false;}}
 card.querySelector('#kl3c-run').onclick=()=>run(typeof startPoint!=='undefined'?startPoint:null,typeof destination!=='undefined'?destination:null);
 card.querySelector('#kl3c-gps').onclick=()=>{if(!coords(typeof destination!=='undefined'?destination:null)){status.textContent='Search a destination first.';return;}if(!navigator.geolocation){status.textContent='GPS unavailable';return;}status.textContent='Requesting one GPS fix (no tracking)…';navigator.geolocation.getCurrentPosition(p=>{if(p.coords.accuracy>70){status.textContent='GPS accuracy insufficient ('+Math.round(p.coords.accuracy)+' m). No route changed.';return;}run([p.coords.latitude,p.coords.longitude],destination);},e=>{status.textContent='GPS unavailable: '+e.message;},{enableHighAccuracy:true,timeout:12000,maximumAge:0});};
 card.querySelector('#kl3c-clear').onclick=()=>{layer.clearLayers();status.textContent='Segment preview cleared.';};
})();
