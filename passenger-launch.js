/* Run in the head, before map markup can paint. Never gate startup on GPS. */
(() => {
 'use strict';
 const params=new URLSearchParams(location.search);
 if(params.get('mode')!=='passenger')return;
 const root=document.documentElement;
 root.classList.add('passenger-launching');
 let done=false,basicOnly=params.get('renderer')==='raster',deadline;
 function finish(){
  if(done)return;done=true;clearTimeout(deadline);
  // Allow the renderer's canvas and latest layer changes to paint first.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   const splash=document.getElementById('jalan-launch');
   root.classList.remove('passenger-launching');
   if(splash){splash.setAttribute('aria-hidden','true');splash.classList.add('jalan-launch-finished');setTimeout(()=>splash.remove(),200);}
  }));
 }
 function timedOut(){
  basicOnly=true;
  if(window.JalanVectorMap?.active){finish();return;}
  if(window.JalanVectorMap?.useBasicMap)window.JalanVectorMap.useBasicMap();
  if(document.getElementById('map')?._leaflet_id){finish();return;}
  const status=document.getElementById('jalan-launch-status'),retry=document.getElementById('jalan-launch-retry');
  if(status)status.textContent='The map could not load. Please try again.';
  if(retry){retry.hidden=false;retry.focus({preventScroll:true});}
 }
 window.JalanLaunch=Object.freeze({get basicOnly(){return basicOnly;}});
 window.addEventListener('jalan:map-renderer',finish);
 document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('jalan-launch-retry')?.addEventListener('click',()=>location.reload());
  if(basicOnly||window.JalanVectorMap?.active)finish();
 });
 // A delayed/failed script must not leave the owner trapped behind branding.
 deadline=setTimeout(timedOut,22000);
})();
