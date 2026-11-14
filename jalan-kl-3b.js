'use strict';
// Optional Batch 3B diagnostics; does not modify app.js, TomTom or GPS-navigation.js.
(function(){
 const card=document.querySelector('.jalan-kl-preview');
 if(!card||!window.L||typeof map==='undefined')return;
 const API='https://mterm2026-559f9bf571b5.herokuapp.com/api/jalan/kl-preview-v4101';
 const box=document.createElement('div');box.className='jalan-kl-3b';
 box.innerHTML='<div class="compare-title"><strong>KL Preview — Snap & ETA Diagnostics</strong><span class="demo-tag">EXPERIMENTAL</span></div><p id="kl3b-status" class="compare-hint">Select both points, then run the diagnostic.</p><div class="compare-actions"><button type="button" id="kl3b-check">Check road snapping</button><button type="button" id="kl3b-gps">GPS reroute test: Off</button><button type="button" id="kl3b-stop">Stop test</button></div><p class="compare-hint">ETA uses an illustrative fixed 30 km/h, NOT traffic. GPS reroute test requires explicit permission, two consecutive off-route fixes, and does not replace the selected OSRM/TomTom route. Stationary/passenger testing only.</p>';
 card.appendChild(box);
 const status=box.querySelector('#kl3b-status'),gps=box.querySelector('#kl3b-gps');
 // 3B snap/GPS diagnostics send precise coordinates in GET query strings to
 // the same shared-Mterms router without verified query-log suppression.
 // Disable all panel actions before wiring handlers or geolocation watches.
 const privacyHold=true;
 if(privacyHold){
  for(const selector of ['#kl3b-check','#kl3b-gps','#kl3b-stop'])box.querySelector(selector).disabled=true;
  status.textContent='KL snap and GPS diagnostics paused for location privacy. No coordinate request or GPS watch will start from this panel. TomTom and OSRM remain separate. NOT FOR DRIVING.';
  return;
 }
 let watch=null,off=0,last=null,active=false;
 function coords(){if(!Array.isArray(startPoint)||!Array.isArray(destination))throw Error('Choose a start and destination first');return [startPoint,destination];}
 async function snap(p){const u=new URL(API+'/snap');u.searchParams.set('lat',p[0]);u.searchParams.set('lng',p[1]);const r=await fetch(u);const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Snap failed');return d;}
 box.querySelector('#kl3b-check').onclick=async()=>{try{status.textContent='Checking nearest road segments…';const [a,b]=coords();const [s,t]=await Promise.all([snap(a),snap(b)]);status.textContent=`Geometric road snap: start ${s.segmentSnapMeters} m, destination ${t.segmentSnapMeters} m. This does not alter route endpoints. No validated traffic ETA is available.`;}catch(e){status.textContent=e.message;}};
 function stop(){if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;active=false;off=0;last=null;gps.textContent='GPS reroute test: Off';status.textContent='GPS reroute test stopped.';}
 box.querySelector('#kl3b-stop').onclick=stop;
 gps.onclick=()=>{if(active){stop();return;}if(!navigator.geolocation){status.textContent='GPS not available';return;}active=true;gps.textContent='GPS reroute test: On';status.textContent='Waiting for GPS permission…';
  watch=navigator.geolocation.watchPosition(async pos=>{
   if(!active||last)return;
   const p=[pos.coords.latitude,pos.coords.longitude];
   if(pos.coords.accuracy>35){off=0;status.textContent='GPS accuracy too low for test';return;}
   last=true;
   try{const s=await snap(p);off=s.segmentSnapMeters>60?off+1:0;
    status.textContent=`GPS-to-road distance ${s.segmentSnapMeters} m; consecutive off-road fixes ${off}/2.`;
    if(off>=2){off=0;status.textContent='Possible deviation detected. This prototype does NOT automatically replace your current route. Use the KL preview button to recalculate manually.';}
   }catch(e){status.textContent='GPS diagnostic: '+e.message;}finally{last=null;}
  },e=>{status.textContent='GPS unavailable: '+e.message;stop();},{enableHighAccuracy:true,maximumAge:2000,timeout:15000});
 };
 window.addEventListener('pagehide',stop,{once:true});
})();
