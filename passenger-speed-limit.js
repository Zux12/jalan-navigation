// Posted speed limits are independent of measured vehicle speed and traffic flow.
(() => {
 'use strict';
 if(new URLSearchParams(location.search).get('mode')!=='passenger')return;
 const badges=document.querySelectorAll('.passenger-speed-limit');
 const primary=document.getElementById('tt-primary'),key=document.getElementById('tt-key');
 let expiry,shown=null;
 const freshMs=10000;
 function show(limit){
  if(limit===shown)return;
  shown=limit;
  for(const badge of badges){
   badge.hidden=limit===null;
   badge.textContent=limit===null?'':String(limit);
   if(limit===null)badge.removeAttribute('aria-label');
   else badge.setAttribute('aria-label','Posted speed limit '+limit+' kilometres per hour');
  }
 }
 function clear(){
  clearTimeout(expiry);
  show(null);
 }
 window.addEventListener('jalan:gps-fix',event=>{
  clearTimeout(expiry);
  const fix=event.detail;
  const state=window.JalanGPS.getState();
  if(!state.active||state.route?.provider!=='tomtom'||!primary.checked||!key.value.trim()||
     document.hidden||!fix?.gpsReliable||!fix.matched||!Number.isInteger(fix.speedLimitIndex)||
     !Number.isFinite(fix.gpsAccuracy)||fix.gpsAccuracy<0||fix.gpsAccuracy>25||
     !Number.isFinite(fix.gpsFixAgeMs)||fix.gpsFixAgeMs<0||fix.gpsFixAgeMs>=freshMs){
   show(null);return;
  }
  // The GPS matcher supplies a geometry segment index into this route's speed sections.
  const index=fix.speedLimitIndex;
  const section=state.route.speedLimits?.find(s=>s.start<=index&&index<s.end);
  const limit=section?.limit;
  if(!Number.isInteger(limit)||limit<=0){show(null);return;}
  show(limit);
  expiry=setTimeout(clear,freshMs-fix.gpsFixAgeMs);
 });
 for(const event of ['jalan:journey-start','jalan:journey-stop','jalan:route-change','jalan:route-cleared','pagehide'])
  window.addEventListener(event,clear);
 window.addEventListener('jalan:location-quality',event=>{if(event.detail?.error)clear();});
 document.addEventListener('visibilitychange',clear);
 key.addEventListener('input',clear);primary.addEventListener('change',clear);
 document.getElementById('tt-remove-key').addEventListener('click',clear);
})();
