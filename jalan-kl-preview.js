'use strict';
// Isolated preview overlay. Does not alter app.js routes, TomTom, GPS or simulation.
(function(){
 const API='https://mterm2026-559f9bf571b5.herokuapp.com/api/jalan/kl-preview-v4100';
 const panel=document.getElementById('panel-details');if(!panel||!window.L||typeof map==='undefined')return;
 const card=document.createElement('section');card.className='traffic-card jalan-kl-preview';
 card.innerHTML='<div class="compare-title"><strong>Jalan KL — Own Routing Engine</strong><span class="demo-tag">TEST ONLY</span></div><p class="compare-hint">Choose a starting point and destination using Jalan search, then test our own KL graph. No legal turn restrictions, live traffic or reliable ETA. NOT FOR DRIVING.</p><div class="compare-actions"><button type="button" id="kl-preview-run">Test Jalan KL route</button><button type="button" id="kl-preview-clear">Clear preview</button></div><p id="kl-preview-status" class="compare-hint" role="status">Select start and destination first.</p>';
 const summary=document.getElementById('route-summary');if(summary)summary.insertAdjacentElement('afterend',card);else panel.prepend(card);
 const status=card.querySelector('#kl-preview-status'),button=card.querySelector('#kl-preview-run');
 const layer=L.layerGroup().addTo(map);let busy=false;
 function clear(){layer.clearLayers();status.textContent='Preview cleared. Existing routes remain unchanged.';}
 card.querySelector('#kl-preview-clear').addEventListener('click',clear);
 button.addEventListener('click',async()=>{if(busy)return;
  if(!Array.isArray(startPoint)||!Array.isArray(destination)){status.textContent='First choose a starting point and search for a destination.';return;}
  busy=true;button.disabled=true;status.textContent='Calculating experimental KL graph route…';
  try{const u=new URL(API+'/route');[['startLat',startPoint[0]],['startLng',startPoint[1]],['endLat',destination[0]],['endLng',destination[1]]].forEach(([k,v])=>u.searchParams.set(k,String(v)));
   const r=await fetch(u.toString(),{headers:{Accept:'application/json'}});const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'Routing failed');
   if(!data.geometry?.coordinates?.length)throw Error('No route geometry returned');layer.clearLayers();const latlngs=data.geometry.coordinates.map(([lng,lat])=>[lat,lng]);const line=L.polyline(latlngs,{color:'#7c3aed',weight:7,opacity:.85,dashArray:'10 7'}).addTo(layer);map.fitBounds(line.getBounds(),{padding:[35,35],maxZoom:16});
   status.textContent=`KL graph preview: ${(data.distanceMeters/1000).toFixed(2)} km · ${data.edgeCount} edges · start/end snap ${data.startSnapMeters}/${data.endSnapMeters} m. No traffic ETA. NOT FOR DRIVING.`;
  }catch(e){status.textContent='Preview unavailable: '+e.message;}finally{busy=false;button.disabled=false;}
 });
 window.JalanKLPreview={clear};
})();
