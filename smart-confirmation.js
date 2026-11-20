// Passenger confirmation submits one explicit report. The engineering demo stays local.
(() => {
 'use strict';
 const el=id=>document.getElementById(id);
 const passenger=new URLSearchParams(location.search).get('mode')==='passenger';
 const prompt=document.createElement('div');
 prompt.id='smart-prompt';
 prompt.className='smart-prompt hidden';
 prompt.setAttribute('role','status');
 prompt.innerHTML='<strong>Are you stuck in traffic?</strong><div class="smart-prompt-actions">'+
  '<button type="button" id="smart-yes">'+(passenger?'Yes, report traffic':'Yes')+'</button><button type="button" id="smart-no">No</button>'+
  '<button type="button" id="smart-close" aria-label="Dismiss traffic question">×</button></div>';
 document.body.append(prompt);
 const status=el('smart-status'),enable=el('smart-enable');
 const cooldown=15*60*1000;
 let timer,lastAsked=-Infinity,slowSince=null,lastFix=null,previousRoute=null;

 function dismiss(answer){
  clearTimeout(timer);
  prompt.classList.add('hidden');
  status.textContent=answer==='yes'?'Local response: Yes, stuck in traffic. Not shared.':
   answer==='no'?'Local response: No, not in traffic. Not shared.':'Question dismissed or expired. No response recorded.';
 }
 function reset(){
  slowSince=null;lastFix=null;previousRoute=null;
  if(!prompt.classList.contains('hidden'))dismiss();
 }
 function show(demo=false){
  lastAsked=Date.now();
  prompt.classList.remove('hidden');
  status.textContent='Question shown. Auto-dismiss in 8 seconds.';
  clearTimeout(timer);
  timer=setTimeout(dismiss,8000);
  // Keep the engineering preview's voice option. Passenger turn guidance owns audio during a trip.
  if(!passenger&&!demo&&!document.hidden&&'speechSynthesis' in window&&!el('gps-voice').textContent.includes('Mute')){
   try{const phrase=new SpeechSynthesisUtterance('Are you stuck in traffic?');phrase.lang='en-GB';speechSynthesis.speak(phrase);}catch{}
  }
 }
 el('smart-yes').onclick=()=>{
  if(prompt.classList.contains('hidden'))return;
  if(!passenger){dismiss('yes');return;}
  dismiss();window.JalanCommunityReports?.reportSlowdown();
 };
 el('smart-no').onclick=()=>dismiss('no');
 el('smart-close').onclick=()=>dismiss();
 el('smart-demo').onclick=()=>show(true);
 el('smart-dismiss').onclick=()=>dismiss();
 enable.onchange=()=>{
  reset();
  status.textContent=enable.checked?'Enabled for active GPS navigation; local processing only.':'Off. No GPS data collected by this feature.';
 };

 function passengerBusy(){
  return el('passenger-report-confirm')?.hidden===false||
   document.body.classList.contains('passenger-journey-open')||document.querySelector('dialog[open]')||
   !el('jalan-home-menu-panel')?.classList.contains('hidden')||!el('passenger-turn-list')?.classList.contains('hidden');
 }
 function evaluate(fix){
  if(!passenger&&!enable.checked)return;
  if(document.hidden||!document.body.classList.contains('nav-active')||!fix?.matched||fix.nearDestination||
     !Number.isFinite(fix.accuracy)||fix.accuracy<0||fix.accuracy>25||!Number.isFinite(fix.speedMps)||
     fix.speedMps<0||(!passenger&&fix.speedMps*3.6<4)||fix.speedMps*3.6>25){reset();return;}
  let ceiling,requiredMs=75000;
  let at=Date.now();
  if(passenger){
   const state=window.JalanGPS.getState(),route=state.route,index=fix.speedLimitIndex;
   if(!state.active||!route||!fix.gpsReliable||!Number.isInteger(index)||index<0||
      index+1>=(route.geometry?.coordinates?.length??0)||!Array.isArray(fix.gpsPosition)||
      !Number.isFinite(fix.gpsFixAgeMs)||fix.gpsFixAgeMs<0||fix.gpsFixAgeMs>10000||passengerBusy()){reset();return;}
   const community=window.JalanCommunityFlow?.condition();
   if(community?.type==='smooth'){reset();return;}
   if(community){if(Date.now()-lastAsked>=cooldown)show();return;}
   if(fix.speedMps*3.6<4){reset();return;}
   if(route!==previousRoute){reset();previousRoute=route;}
   at-=fix.gpsFixAgeMs;
   const [lat,lon]=fix.gpsPosition;
   const normal=window.JalanRouteTraffic?.freeFlowAt(route,index,[lon,lat]);
   if(Number.isFinite(normal)){
    if(normal<25){reset();return;}
    ceiling=Math.min(25,normal*0.4);
   }else{
    // Without a usual speed for this stretch, ask only after a longer period of crawling.
    // A posted limit alone never establishes congestion.
    const limit=route.speedLimits?.find(s=>s.start<=index&&index<s.end)?.limit;
    if(Number.isFinite(limit)&&limit<25){reset();return;}
    ceiling=Number.isFinite(limit)?Math.min(12,limit*0.4):12;
    requiredMs=120000;
   }
  }else{
   const segment=el('hs-segment').value.trim(),bucket=window.JalanHistoricalSpeed.bucket();
   const profile=window.JalanHistoricalSpeed.profile(segment,bucket.day,bucket.period);
   if(!profile.confident||profile.normal<25){reset();return;}
   ceiling=Math.min(25,profile.normal*0.4);
  }
  if(fix.speedMps*3.6>ceiling){reset();return;}
  if(lastFix!==null&&at<=lastFix)return;
  if(lastFix===null||at-lastFix>10000)slowSince=at;
  lastFix=at;
  if(at-slowSince>=requiredMs&&Date.now()-lastAsked>=cooldown)show();
 }

 window.addEventListener('jalan:gps-fix',event=>evaluate(event.detail));
 for(const name of ['jalan:journey-start','jalan:journey-stop','jalan:route-cleared','jalan:route-change','jalan:nearby-report-prompt','pagehide'])
  window.addEventListener(name,reset);
 document.addEventListener('visibilitychange',reset);
 if(passenger){
  window.addEventListener('jalan:location-quality',event=>{if(event.detail?.error)reset();});
  document.addEventListener('click',()=>{if(!prompt.classList.contains('hidden')&&passengerBusy())reset();});
 }
})();
