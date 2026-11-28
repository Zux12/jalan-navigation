/* Community reports and nearby lookups during active passenger journeys. */
(()=>{
 'use strict';if(new URLSearchParams(location.search).get('mode')!=='passenger')return;
 const P=window.JalanReportModel,$=id=>document.getElementById(id),base='https://mterm2026-559f9bf571b5.herokuapp.com/api/jalan/reports';
 const icons={traffic:'<path d="M4 10h16v8H4zM6 10l2-5h8l2 5M7 18v2m10-2v2M7 14h2m6 0h2"/>',accident:'<path d="m3 15 5-3 3 6-5 3zM14 12l5-3 3 6-5 3zM10 3l1 4m5-4-2 4m7 0-4 2"/>',roadworks:'<path d="M3 8h18v9H3zM7 8l-4 6m11-6-6 9m13-7-5 7M6 17v4m12-4v4"/>',closure:'<circle cx="12" cy="12" r="9"/><path d="M6 12h12"/>',hazard:'<path d="m12 3 10 18H2zM12 9v5m0 3v1"/>',police:'<path d="m4 5 8-3 8 3v7c0 5-8 10-8 10S4 17 4 12zM8 10h8m-4-4v8"/>',rain:'<path d="M6 14a4 4 0 1 1 1-8 5 5 0 0 1 10 0 4 4 0 1 1 1 8zM7 17l-2 4m8-4-2 4m8-4-2 4"/>',flood:'<path d="M2 14q3-3 6 0t6 0t6 0M2 20q3-3 6 0t6 0t6 0M5 10V5h12v5M9 5V2h4v3"/>',visibility:'<path d="M3 8h18M1 12h15m3 0h4M4 16h17M8 20h8M7 4h10"/>'};
 const icon=type=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+icons[type]+'</svg>';
 const random=()=>{const b=new Uint8Array(24);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');};
 let actor;try{actor=localStorage.getItem('jalan-report-actor-v1');}catch{}if(!/^[a-zA-Z0-9_-]{20,80}$/.test(actor||'')){actor=random();try{localStorage.setItem('jalan-report-actor-v1',actor);}catch{}}
 let nearbyEnabledForTrip=true;
 let nearbyActive=false,submissionId=random(),journey=random(),selected=null,events=[],own=new Set(),asked=new Set(),lastFix=null,prompt=null,promptTimer=null,pending=false,pollAt=0,inflight=null,requestEpoch=0;
 const layer=L.layerGroup().addTo(map),dialog=document.createElement('dialog');dialog.id='passenger-report-dialog';dialog.className='jalan-menu-dialog jalan-report-dialog';dialog.setAttribute('aria-labelledby','passenger-report-title');
 dialog.innerHTML='<h2 id="passenger-report-title">Report road event</h2><div id="passenger-report-categories" class="jalan-report-categories"></div><p id="passenger-report-status" role="status"></p><div class="jalan-report-actions"><button type="button" id="passenger-report-cancel">Cancel</button><button type="button" id="passenger-report-submit" class="jalan-dialog-ok" disabled>Submit</button></div>';
 const card=document.createElement('section');card.id='passenger-report-confirm';card.hidden=true;card.setAttribute('aria-label','Confirm road report');card.innerHTML='<div id="passenger-report-confirm-title" role="status"></div><p>Can you see it?</p><div class="jalan-report-actions"><button type="button" data-answer="still">Still there</button><button type="button" data-answer="cleared">Cleared</button></div><button type="button" id="passenger-report-dismiss" aria-label="Dismiss report confirmation">✕</button>';
 const toast=document.createElement('p');toast.id='passenger-report-toast';toast.setAttribute('role','status');toast.hidden=true;
 document.body.append(dialog,card,toast);
 const status=$('passenger-report-status'),submit=$('passenger-report-submit'),nearbyToggle=$('passenger-nearby-consent');let toastTimer;
 function tell(message){toast.textContent=message;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.hidden=true,5000);}
 const groups={main:['traffic','accident','roadworks','closure','hazard','police','weather'],weather:['rain','flood','visibility'],traffic:P.trafficLevels};
 function categories(group='main'){
  const node=$('passenger-report-categories');
  node.replaceChildren();selected=null;submit.disabled=true;status.textContent='';
  for(const choice of groups[group]){
   const isGroup=group==='main'&&(choice==='traffic'||choice==='weather');
   const type=group==='traffic'?'traffic':choice;
   const button=document.createElement('button');
   button.type='button';button.dataset.type=choice;
   button.innerHTML=icon(type==='weather'?'rain':type)+'<span></span>';
   button.querySelector('span').textContent=group==='traffic'?P.reportLabel(type,choice):
    type==='weather'?'Bad weather':P.types[type].label;
   if(!isGroup)button.setAttribute('aria-pressed','false');
   button.onclick=()=>{
    if(pending)return;
    if(isGroup){categories(choice);node.firstElementChild.focus();return;}
    selected=group==='traffic'?{type,trafficSeverity:choice}:{type};
    submit.disabled=false;status.textContent='';
    for(const sibling of node.querySelectorAll('[aria-pressed]'))sibling.setAttribute('aria-pressed',String(sibling===button));
   };
   node.append(button);
  }
  if(group==='main')return;
  const back=document.createElement('button');back.type='button';back.textContent='Back';
  back.onclick=()=>{if(pending)return;categories();node.querySelector('[data-type="'+group+'"]').focus();};
  node.append(back);
 }
 const modal=()=>document.body.classList.toggle('passenger-modal-open',!!document.querySelector('dialog[open]'));
 $('jalan-home-report').setAttribute('aria-label','Report road event');$('jalan-home-report').setAttribute('aria-haspopup','dialog');
 $('jalan-home-report').addEventListener('click',()=>{if(dialog.open)return;hideCard();submissionId=random();selected=null;status.textContent='';submit.disabled=true;categories();dialog.showModal();modal();});
 dialog.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation();});
 dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
 dialog.addEventListener('close',()=>{modal();$('jalan-home-report').focus({preventScroll:true});});
 $('passenger-report-cancel').onclick=()=>{if(!pending)dialog.close();};
 async function api(path,body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const response=await fetch(base+path,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});const data=await response.json();if(!response.ok)throw Error(data.error||'Reporting service unavailable.');return data;}catch(e){if(e.name==='AbortError')throw Error('Connection timed out. Report was not confirmed; please retry.');throw e;}finally{clearTimeout(timer);}}
 function capture(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(Error('Location access is needed to report.'));const at=Date.now();navigator.geolocation.getCurrentPosition(fix=>{const c=fix.coords,position=[c.longitude,c.latitude];if(!P.coord(position)||!Number.isFinite(c.accuracy)||c.accuracy<0||c.accuracy>35||!Number.isFinite(fix.timestamp)||fix.timestamp<at-1000||fix.timestamp>Date.now()+5000)return reject(Error('GPS is not accurate enough. Wait for a fresh location and retry.'));
  const gps=window.JalanGPS?.getState?.(),previous=gps?.gpsFixAgeMs<=10000&&gps.gpsPosition?[gps.gpsPosition[1],gps.gpsPosition[0]]:lastFix?.position;
  if(previous&&P.distance(previous,position)>150)return reject(Error('GPS jumped away from your recent position. Wait for it to settle and retry.'));
  let heading=P.heading(c.heading)?c.heading:null;if(heading===null&&lastFix&&Date.now()-lastFix.at<15000&&P.distance(lastFix.position,position)>=5)heading=P.bearing(lastFix.position,position);
  if(heading===null&&P.heading(gps?.vehicleHeading)&&gps.gpsFixAgeMs<=10000)heading=gps.vehicleHeading;
  resolve({position,accuracy:c.accuracy,heading,fixAt:fix.timestamp,road:window.JalanVectorMap?.getReportRoad?.(position,heading)||null});
 },()=>reject(Error('Could not get your location. Allow location access and retry.')),{enableHighAccuracy:true,maximumAge:0,timeout:10000});});}
 async function sendReport(choice,id,fix){
  const segment=choice.type==='traffic'?window.JalanCommunityFlow?.match(fix.position,fix.road):null;
  const result=await api('/submit',{...choice,actor,submissionId:id,...fix,...(segment?{segment}:{})});
  if(!result.event||!P.alive(result.event))throw Error('Report was not confirmed by the server.');
  own.add(result.event.id);upsert(result.event);return result;
 }
 let slowdownPending=false;
 async function reportSlowdown(){
  if(slowdownPending||!window.JalanGPS?.getState?.().active||document.hidden)return;
  slowdownPending=true;
  try{const trip=journey,fix=await capture();
   if(!window.JalanGPS.getState().active||journey!==trip||document.hidden)return;
   const flow=window.JalanCommunityFlow?.condition();
   await sendReport({type:'traffic',...(P.trafficLevels.includes(flow?.type)?{trafficSeverity:flow.type}:{})},random(),fix);
   tell('Traffic report sent.');
  }catch{tell('Traffic report could not be confirmed. Please try again from Report.');}
  finally{slowdownPending=false;}
 }
 submit.onclick=async()=>{if(pending||!selected)return;pending=true;submit.disabled=true;$('passenger-report-cancel').disabled=true;status.textContent='Getting your current location…';try{const fix=await capture();status.textContent='Submitting report…';const result=await sendReport(selected,submissionId,fix);dialog.close();tell(result.merged?'Added your report to the existing event.':'Report submitted. Icon placed at your location.');}catch(e){status.textContent='Could not confirm submission: '+(e.message||'Please try again.');}finally{pending=false;submit.disabled=!selected;$('passenger-report-cancel').disabled=false;}};
 function upsert(event){events=events.filter(e=>e.id!==event.id);if(P.alive(event))events.push(event);paint();window.dispatchEvent(new Event('jalan:community-reports'));}
 function paint(){events=events.filter(e=>P.alive(e));layer.clearLayers();for(const e of events){if(!P.types[e.type]||!P.coord(e.position))continue;const marker=L.marker([e.position[1],e.position[0]],{icon:L.divIcon({className:'jalan-community-report-pin',html:icon(e.type),iconSize:[36,36],iconAnchor:[18,18]}),title:P.reportLabel(e.type,e.trafficSeverity)+' · reported by '+e.contributors+' user'+(e.contributors===1?'':'s')}).addTo(layer);const label=document.createElement('span');label.textContent=P.reportLabel(e.type,e.trafficSeverity)+' · '+e.contributors+' report'+(e.contributors===1?'':'s');marker.bindTooltip(label);}}
 function hideCard(){card.hidden=true;prompt=null;clearTimeout(promptTimer);}
 $('passenger-report-dismiss').onclick=hideCard;
 for(const button of card.querySelectorAll('[data-answer]'))button.onclick=async()=>{if(!prompt)return;const event=prompt;hideCard();try{const fix=await capture();const result=await api('/respond',{id:event.id,actor,journey,answer:button.dataset.answer,...fix});upsert(result.event);tell(button.dataset.answer==='cleared'?'Thanks. Your cleared response was recorded.':'Thanks. The report timer was refreshed.');}catch(e){tell('Response not saved: '+e.message);}};
 function routeItems(){const state=window.JalanGPS?.getState?.(),line=state?.route?.geometry?.coordinates;if(!line)return [];return events.filter(e=>P.alive(e)).flatMap(e=>{const match=P.routeMatch(e,line);
   if(match&&e.type==='traffic'){
    const shape=window.JalanFlowModel.layout(state.route);
    if(e.segment){
     const cell=shape.edges[match.index-1]?.find(c=>window.JalanFlowModel.roadSegment(c,e.road)===e.segment);
     const resolve=window.JalanVectorMap?.getReportRoad;
     const road=cell&&resolve&&window.JalanFlowModel.readRoad(shape,cell,resolve);
     if(!P.sameRoad(road,e.road))return [];
    }
    if(!e.segment){
     const road=window.JalanVectorMap?.getReportRoad?.(match.point,match.heading);
     if(road&&e.road&&!P.sameRoad(road,e.road)||(!road||!e.road)&&match.offset>10)return [];
    }
   }
   return match?[{...e,routeAlong:match.along,routeTotal:match.total}]:[];});}
 function checkCard(fix){if(!nearbyActive){hideCard();return;}if(prompt){if(!P.alive(prompt)||!fix||!P.sameRoad(prompt.road,fix.road)||P.delta(prompt.heading,fix.heading)>40||P.distance(prompt.position,fix.position)>150)hideCard();return;}
  if(!fix||document.hidden||dialog.open||document.body.classList.contains('passenger-modal-open')||!$('jalan-home-menu-panel').classList.contains('hidden')||!window.JalanGPS?.getState?.().active||Date.now()-fix.at>10000||!P.heading(fix.heading)||!P.road(fix.road))return;
  const line=window.JalanGPS.getState().route?.geometry?.coordinates,current=P.project(fix.position,line);if(!current||current.offset>25||P.delta(current.heading,fix.heading)>40)return;
  const candidate=routeItems().filter(e=>!own.has(e.id)&&!asked.has(e.id)&&P.sameRoad(e.road,fix.road)).map(e=>({...e,ahead:e.routeAlong-current.along})).filter(e=>e.ahead>=0&&e.ahead<=50).sort((a,b)=>a.ahead-b.ahead)[0];
  if(!candidate)return;asked.add(candidate.id);prompt=candidate;toast.hidden=true;clearTimeout(toastTimer);$('passenger-report-confirm-title').innerHTML=icon(candidate.type)+'<span></span>';$('passenger-report-confirm-title').querySelector('span').textContent=P.reportLabel(candidate.type,candidate.trafficSeverity)+' · '+candidate.contributors+' report'+(candidate.contributors===1?'':'s')+' · '+Math.round(candidate.ahead)+' m ahead';card.hidden=false;
  window.dispatchEvent(new Event('jalan:nearby-report-prompt'));
  promptTimer=setTimeout(hideCard,10000);
 }
 async function poll(){if(!nearbyActive||!window.JalanGPS?.getState?.().active||document.hidden||inflight||!lastFix||Date.now()-lastFix.at>10000||Date.now()-pollAt<30000)return;pollAt=Date.now();const epoch=requestEpoch;inflight=api('/nearby',{position:lastFix.position});try{const result=await inflight;if(epoch!==requestEpoch||!nearbyActive||!window.JalanGPS?.getState?.().active)return;const localOwn=events.filter(e=>own.has(e.id)&&P.alive(e)&&P.distance(e.position,lastFix.position)>20000);events=Array.isArray(result.events)?result.events.filter(e=>P.alive(e)&&P.types[e.type]&&P.coord(e.position)):[];for(const e of localOwn)if(!events.some(x=>x.id===e.id))events.push(e);paint();window.dispatchEvent(new Event('jalan:community-reports'));checkCard(lastFix);}catch{ /* Reading failures never invent an empty/cleared confirmation. Expiry remains local. */ }finally{inflight=null;}}
 function setNearbyActive(enabled){
  nearbyActive=enabled;
  nearbyToggle.checked=enabled;
  requestEpoch++;
  if(enabled){
   pollAt=0;
   poll();
  }else{
   hideCard();
   events=events.filter(e=>own.has(e.id));
   paint();
   window.dispatchEvent(new Event('jalan:community-reports'));
  }
 }
 nearbyToggle.addEventListener('change',()=>{
  nearbyEnabledForTrip=nearbyToggle.checked;
  setNearbyActive(nearbyEnabledForTrip && window.JalanGPS?.getState?.().active === true);
 });
 window.addEventListener('jalan:gps-fix',event=>{const d=event.detail||{};if(!d.gpsReliable||!Array.isArray(d.gpsPosition)||d.gpsAccuracy>35||d.gpsFixAgeMs>10000){hideCard();return;}const position=[d.gpsPosition[1],d.gpsPosition[0]],heading=P.heading(d.heading)?d.heading:P.heading(d.vehicleHeading)?d.vehicleHeading:lastFix&&P.distance(lastFix.position,position)>=5?P.bearing(lastFix.position,position):null;
  lastFix={position,heading,accuracy:d.gpsAccuracy,at:Date.now(),road:window.JalanVectorMap?.getReportRoad?.(position,heading)||null};checkCard(lastFix);poll();});
 $('passenger-go').addEventListener('click',()=>{if(!window.JalanGPS?.getState?.().active){journey=random();asked=new Set();}},{capture:true});
 window.addEventListener('jalan:journey-start',()=>{
  hideCard();
  lastFix=null;
  setNearbyActive(nearbyEnabledForTrip);
 });
 // GPS can stop and restart when the route changes during the same trip.
 // Clearing the itinerary is what resets the driver's choice for their next trip.
 window.addEventListener('jalan:route-cleared',()=>{nearbyEnabledForTrip=true;});
 window.addEventListener('jalan:free-location',event=>{const d=event.detail||{},position=Array.isArray(d.point)?[d.point[1],d.point[0]]:null;if(!P.coord(position)||!Number.isFinite(d.accuracy)||d.accuracy>35||Date.now()-d.timestamp>10000)return;lastFix={position,heading:P.heading(d.heading)?d.heading:null,accuracy:d.accuracy,at:d.timestamp,road:null};poll();});
 window.addEventListener('jalan:journey-stop',()=>{lastFix=null;setNearbyActive(false);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)hideCard();});
 setInterval(()=>{if(events.some(e=>!P.alive(e))){paint();window.dispatchEvent(new Event('jalan:community-reports'));}if(prompt&&!P.alive(prompt))hideCard();if(lastFix&&Date.now()-lastFix.at>10000)hideCard();poll();},5000);
 window.JalanCommunityReports={reportSlowdown,getEvents:()=>events.filter(e=>P.alive(e)).map(e=>({...e})),routeItems,icon};
})();
