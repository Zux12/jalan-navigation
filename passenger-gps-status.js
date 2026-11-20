/* Passenger location quality and shared pre-route measured-position feed.
 * Browsers provide accuracy/fix age, not satellite signal-strength readings.
 */
(() => {
 'use strict';
 if(new URLSearchParams(location.search).get('mode')!=='passenger')return;
 const button=document.createElement('button'),detail=document.createElement('div');
 button.id='passenger-gps-status';button.type='button';button.dataset.quality='yellow';
 button.setAttribute('aria-controls','passenger-gps-status-detail');button.setAttribute('aria-expanded','false');
 button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7a12 12 0 0 0 12 12L5 7Z"/>'+
  '<path d="m11 13 5-5M9 17l-1 4M4 21h10M15 3a6 6 0 0 1 6 6M15 6a3 3 0 0 1 3 3"/></svg>';
 detail.id='passenger-gps-status-detail';detail.hidden=true;detail.setAttribute('role','status');
 document.body.append(button,detail);
 let lastFix=null,failure='',permitted=false,guiding=false,watch=null,timer=null;
 const started=Date.now(),geo=navigator.geolocation;
 function paint(){
  const age=lastFix?Date.now()-lastFix.timestamp:Infinity;
  let quality='yellow',message='GPS acquiring location';
  if(!geo){quality='red';message='Location is unavailable in this browser';}
  else if(document.hidden){message='GPS updates paused while the page is hidden';}
  else if(failure){quality='red';message=failure;}
  else if(lastFix){
   if(!lastFix.valid||!Number.isFinite(lastFix.accuracy)||lastFix.accuracy<0||
      !Number.isFinite(age)||age< -5000||age>30000){quality='red';message='GPS location is unavailable or stale';}
   else if(lastFix.accuracy>100){quality='red';message='GPS location is poor · accuracy about '+Math.round(lastFix.accuracy)+' m';}
   else if(age>10000){message='GPS waiting for a fresh reading';}
   else if(lastFix.accuracy>35){message='GPS accuracy reduced · about '+Math.round(lastFix.accuracy)+' m';}
   else{quality='green';message='GPS good · accuracy about '+Math.round(lastFix.accuracy)+' m';}
  }else if(Date.now()-started>30000){quality='red';message='GPS location is unavailable · check location access';}
  button.dataset.quality=quality;button.setAttribute('aria-label',message);button.title=message;
  detail.textContent=message;
 }
 function observe(data){
  if(data?.error){failure='GPS location is unavailable · check location access';paint();return;}
  // An older cached sample cannot replace a more recent measured reading.
  if(lastFix&&Number.isFinite(lastFix.timestamp)&&lastFix.timestamp<=Date.now()+5000&&
     Number.isFinite(data?.timestamp)&&data.timestamp<lastFix.timestamp)return;
  lastFix={accuracy:data?.accuracy,timestamp:data?.timestamp,valid:data?.valid===true};
  failure='';paint();
 }
 function stopWatch(){
  if(watch!==null&&watch!==-1)geo?.clearWatch(watch);
  watch=null;
 }
 function syncWatch(){
  if(!geo||!permitted||guiding||document.hidden){stopWatch();return;}
  if(watch!==null)return;
  watch=-1; // Guard browsers/test fixtures that invoke callbacks synchronously.
  try{
   const id=geo.watchPosition(fix=>{
    const c=fix.coords;
    observe({accuracy:c?.accuracy,timestamp:fix.timestamp,
     valid:!!c&&Number.isFinite(c.latitude)&&Number.isFinite(c.longitude)&&
       Math.abs(c.latitude)<=90&&Math.abs(c.longitude)<=180});
    window.dispatchEvent(new CustomEvent('jalan:free-location',{detail:{
     point:[c?.latitude,c?.longitude],accuracy:c?.accuracy,timestamp:fix.timestamp,
     heading:c?.heading,speed:c?.speed}}));
   },error=>{
    failure=error.code===1?'GPS location permission denied':'GPS location is unavailable · waiting for a new reading';
    if(error.code===1){permitted=false;stopWatch();}
    window.dispatchEvent(new CustomEvent('jalan:free-location-error',{detail:{error:true}}));paint();
   },{enableHighAccuracy:true,maximumAge:1500,timeout:15000});
   if(watch===null||!permitted||guiding||document.hidden)geo.clearWatch(id);else watch=id;
  }catch{watch=null;failure='GPS location is unavailable';paint();}
 }
 window.addEventListener('jalan:initial-location',event=>{
  const d=event.detail;permitted=true;
  observe({accuracy:d?.accuracy,timestamp:d?.timestamp,
   valid:Array.isArray(d?.point)&&d.point.length===2&&d.point.every(Number.isFinite)&&
     Math.abs(d.point[0])<=90&&Math.abs(d.point[1])<=180});
  syncWatch();
 });
 window.addEventListener('jalan:initial-location-error',()=>{
  failure='GPS location is unavailable · check location access';paint();
 });
 window.addEventListener('jalan:location-quality',event=>{
  if(!event.detail?.error)permitted=true;
  observe(event.detail);
 });
 window.addEventListener('jalan:journey-start',()=>{guiding=true;stopWatch();});
 window.addEventListener('jalan:journey-stop',()=>{
  guiding=false;queueMicrotask(syncWatch);
 });
 document.addEventListener('visibilitychange',()=>{syncWatch();paint();});
 function startTimer(){if(timer===null)timer=setInterval(paint,1000);}
 window.addEventListener('pagehide',()=>{stopWatch();clearInterval(timer);timer=null;});
 window.addEventListener('pageshow',()=>{startTimer();syncWatch();paint();});
 const close=()=>{detail.hidden=true;button.setAttribute('aria-expanded','false');};
 button.addEventListener('click',()=>{detail.hidden=!detail.hidden;button.setAttribute('aria-expanded',String(!detail.hidden));});
 document.addEventListener('pointerdown',event=>{
  if(!button.contains(event.target)&&!detail.contains(event.target))close();
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
 startTimer();paint();
})();
