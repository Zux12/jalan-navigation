/* Run in the head, before map markup can paint. Never gate startup on GPS. */
(() => {
 'use strict';
 const params=new URLSearchParams(location.search);
 if(params.get('mode')!=='passenger')return;
 const root=document.documentElement;
 // Let lists scroll and let the map renderer handle its own two-finger zoom.
 root.style.touchAction='pan-x pan-y';
 if(params.has('ios')||matchMedia('(display-mode: standalone)').matches){
  const viewport=document.querySelector('meta[name="viewport"]');
  viewport.content+=', minimum-scale=1, maximum-scale=1, user-scalable=no';
 }
 root.classList.add('passenger-launching');
 let done=false,basicOnly=params.get('renderer')==='raster',deadline,showMain;
 const mainScreenReady=new Promise(resolve=>{showMain=resolve;});
 // Count foreground time on the main map only. Sheet changes never restart this interval.
 function showMapCredits(){
  const credits=document.getElementById('jalan-home-credits');
  credits.classList.add('show-map-credits');
  credits.hidden=false;
  let remaining=5000,startedAt=null,timer;
  function expire(){
   credits.classList.remove('show-map-credits');
   document.removeEventListener('visibilitychange',sync);
  }
  function sync(){
   const now=performance.now();
   if(startedAt!==null){
    remaining-=now-startedAt;
    clearTimeout(timer);
    startedAt=null;
   }
   if(remaining<=0){expire();return;}
   if(!document.hidden){
    startedAt=now;
    timer=setTimeout(expire,remaining);
   }
  }
  document.addEventListener('visibilitychange',sync);
  sync();
 }
 function finish(){
  if(done)return;done=true;clearTimeout(deadline);
  // Allow the renderer's canvas and latest layer changes to paint first.
  setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
   const splash=document.getElementById('jalan-launch');
   root.classList.remove('passenger-launching');
   if(splash){splash.setAttribute('aria-hidden','true');splash.classList.add('jalan-launch-finished');}
   setTimeout(()=>{
    splash?.remove();
    showMapCredits();
    showMain(performance.now());
   },200);
  })),4000);
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
 window.JalanLaunch=Object.freeze({mainScreenReady,get basicOnly(){return basicOnly;}});
 window.addEventListener('jalan:map-renderer',finish);
 document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('jalan-launch-retry')?.addEventListener('click',()=>location.reload());
  if(basicOnly||window.JalanVectorMap?.active)finish();
 });
 // A delayed/failed script must not leave the owner trapped behind branding.
 deadline=setTimeout(timedOut,22000);
})();
