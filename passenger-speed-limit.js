// Posted speed limits are independent of measured vehicle speed and traffic flow.
(() => {
 'use strict';
 if(new URLSearchParams(location.search).get('mode')!=='passenger')return;
 const badges=document.querySelectorAll('.passenger-speed-limit');
 const primary=document.getElementById('tt-primary'),key=document.getElementById('tt-key');
 let guiding=false,lastTime=0,expiry,request=null,lookup=null,nextLookup=0,shown=null;
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
 function discardLookup(){
  request?.abort();request=null;lookup=null;
 }
 function clear(){
  clearTimeout(expiry);discardLookup();show(null);
 }
 function reset(){clear();lastTime=0;nextLookup=0;}
 function sameRoad(a,b){
  if(a.street!==b.street)return false;
  if(a.heading!==null&&b.heading!==null&&Math.abs((a.heading-b.heading+540)%360-180)>35)return false;
  // Without a visible road to match, use a lookup only very near its GPS fix.
  return window.JalanPinnedRoute.meters(a.point,b.point)<=(a.street?80:8);
 }
 function parseLimit(data,point){
  const hit=data?.addresses?.[0];
  const value=/^(\d+(?:\.\d+)?)\s*(KPH|MPH)$/i.exec(hit?.address?.speedLimit||'');
  if(!value||typeof hit.position!=='string')return null;
  const position=hit.position.split(',').map(Number);
  if(position.length!==2||!position.every(Number.isFinite)||window.JalanPinnedRoute.meters(point,position)>18)return null;
  const kmh=Math.round(Number(value[1])*(value[2].toUpperCase()==='MPH'?1.609344:1));
  return kmh>0?kmh:null;
 }
 async function lookupRoad(fix){
  const controller=new AbortController(),record={...fix,at:Date.now(),limit:null};
  request=controller;lookup=record;nextLookup=record.at+3000;
  const url=new URL('https://api.tomtom.com/search/2/reverseGeocode/'+fix.point.map(n=>n.toFixed(6)).join(',')+'.json');
  url.searchParams.set('key',key.value.trim());
  url.searchParams.set('returnSpeedLimit','true');url.searchParams.set('radius','18');
  if(fix.heading!==null)url.searchParams.set('heading',String(Math.round(fix.heading)));
  const timeout=setTimeout(()=>controller.abort(),6000);
  try{
   const response=await fetch(url,{signal:controller.signal,cache:'no-store',credentials:'omit'});
   if(lookup!==record)return;
   if(!response.ok){nextLookup=Date.now()+(response.status===429?60000:15000);return;}
   const data=await response.json();
   if(lookup!==record||controller.signal.aborted||document.hidden||Date.now()-lastTime>=freshMs)return;
   record.limit=parseLimit(data,fix.point);show(record.limit);
  }catch{/* Leave the badge hidden when the service cannot confirm a limit. */}
  finally{clearTimeout(timeout);if(request===controller)request=null;}
 }
 function measured({point,accuracy,timestamp,heading,speed},onRoute){
  if(Number.isFinite(timestamp)&&timestamp<lastTime)return;
  const now=Date.now();
  if(!primary.checked||!key.value.trim()||document.hidden||
     !Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||
     Math.abs(point[0])>90||Math.abs(point[1])>180||!Number.isFinite(accuracy)||accuracy<0||accuracy>25||
     !Number.isFinite(timestamp)||timestamp<now-freshMs||timestamp>now+5000){clear();return;}
  lastTime=Math.min(now,timestamp);clearTimeout(expiry);
  expiry=setTimeout(clear,Math.max(0,lastTime+freshMs-now));
  if(onRoute){
   discardLookup();
   const i=onRoute.index;
   const section=Number.isInteger(i)?onRoute.route?.speedLimits?.find(s=>s.start<=i&&i<s.end):null;
   show(section?.limit??null);return;
  }
  // Browsing with GPS enabled is not consent for an extra third-party GET
  // containing the device's precise coordinates. Only route sections are
  // shown until the passenger expressly enables this separate session choice.
  if(window.JalanPostedSpeedSharing?.allowed?.()!==true){clear();return;}
  const course=Number.isFinite(heading)&&heading>=0&&heading<360&&speed>=1?heading:null;
  const roads=window.JalanVectorMap?.nearbyRoads?.(point);
  const street=window.JalanPredictiveGPS.streetAt(point,roads,accuracy,course);
  if(street===''){discardLookup();show(null);return;}
  const fix={point,heading:course,street};
  if(lookup&&sameRoad(lookup,fix)&&now-lookup.at<(lookup.limit===null?15000:60000)){show(lookup.limit);return;}
  discardLookup();show(null);
  if(now>=nextLookup)lookupRoad(fix);
 }
 const free=event=>{if(!guiding)measured(event.detail);};
 window.addEventListener('jalan:initial-location',free);
 window.addEventListener('jalan:free-location',free);
 window.addEventListener('jalan:gps-fix',event=>{
  if(!guiding)return;
  const d=event.detail;
  if(!d?.gpsReliable){clear();return;}
  const state=window.JalanGPS.getState();
  measured({point:d.gpsPosition,accuracy:d.gpsAccuracy,timestamp:Date.now()-d.gpsFixAgeMs,
    heading:d.vehicleHeading??d.heading,speed:d.speedMps},d.matched?{index:d.speedLimitIndex,route:state.route}:null);
 });
 window.addEventListener('jalan:posted-speed-sharing-change',reset);
 window.addEventListener('jalan:journey-start',()=>{guiding=true;reset();});
 window.addEventListener('jalan:journey-stop',()=>{guiding=false;reset();});
 for(const event of ['jalan:free-location-error','jalan:initial-location-error','jalan:route-change','jalan:route-cleared','pagehide'])
  window.addEventListener(event,reset);
 window.addEventListener('jalan:location-quality',e=>{if(e.detail?.error)clear();});
 document.addEventListener('visibilitychange',reset);
 key.addEventListener('input',reset);primary.addEventListener('change',reset);
 document.getElementById('tt-remove-key').addEventListener('click',reset);
})();
