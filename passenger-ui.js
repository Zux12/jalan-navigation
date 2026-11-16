/* JALAN Passenger Preview V1: separate interface over existing public routing/GPS.
   This does NOT certify legal-road turns or real-world driving guidance. */
(() => {
 'use strict';
 const passenger=new URLSearchParams(location.search).get('mode')==='passenger';
 if(!passenger)return;
 document.body.classList.add('passenger-mode');
 const el=id=>document.getElementById(id),overview=el('passenger-overview'),
       list=el('passenger-route-list'),settings=el('passenger-setup'),
       navigation=el('passenger-navigation');
 const routeLabels=L.layerGroup().addTo(map);
 // Route-planning markers are useful before Go but misleading when a separate
 // GPS-matched vehicle marker owns passenger guidance.
 const hidePlannerMarkers=()=>{
   if(startMarker&&pointLayer.hasLayer(startMarker))pointLayer.removeLayer(startMarker);
   if(locationMarker&&pointLayer.hasLayer(locationMarker)){
     pointLayer.removeLayer(locationMarker);
     locationMarker=null;
   }
 };
 const restorePlannerMarkers=()=>{
   if(startMarker&&!pointLayer.hasLayer(startMarker))startMarker.addTo(pointLayer);
 };
 // Vehicle icon is georeferenced. Never show a fixed screen arrow implying
 // a valid position before the GPS predictor has actually matched a route.
 let vehicle=null,lastValidHeading=null,directionSource='unavailable';
 let exploring=false,lastGPSDetail=null;
 const gestureSurface=el('passenger-map-gestures'),hint=el('passenger-gesture-hint');
 const screenVehicle=el('passenger-vehicle-screen');
 let pendingOverlay=false;
 const syncScreenVehicle=()=>{
   pendingOverlay=false;
   const anchor=vehicle?.getElement();
   if(!anchor||!document.body.classList.contains('passenger-guiding')){
     screenVehicle.classList.add('hidden');return;
   }
   const bounds=anchor.getBoundingClientRect();
   const x=bounds.left+bounds.width/2,y=bounds.top+bounds.height/2;
   const maxX=window.innerWidth,maxY=window.innerHeight;
   if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>maxX||
     y<0||y>maxY){screenVehicle.classList.add('hidden');return;}
   screenVehicle.style.left=x+'px';
   screenVehicle.style.top=y+'px';
   screenVehicle.classList.remove('hidden');
 };
 const scheduleScreenVehicle=()=>{
   if(pendingOverlay)return;
   pendingOverlay=true;
   requestAnimationFrame(syncScreenVehicle);
 };
 map.on('move zoom zoomend moveend resize',scheduleScreenVehicle);
 const currentCameraAngle=()=>Number.parseFloat(map.getContainer().style.getPropertyValue('--jalan-camera-turn'))||0;
 const applyCameraAngle=degrees=>{
   const angle=((degrees+180)%360+360)%360-180;
   const previous=currentCameraAngle();
   const delta=((angle-previous+540)%360)-180;
   // Avoid retransforming every raster tile on sub-degree GPS heading jitter.
   if(Math.abs(delta)>=1.2||!map.getContainer().style.getPropertyValue('--jalan-camera-turn'))
     map.getContainer().style.setProperty('--jalan-camera-turn',angle+'deg');
   scheduleScreenVehicle();
   const symbol=vehicle?.getElement()?.querySelector('.jalan-vehicle-symbol');
   if(symbol)symbol.style.setProperty('--jalan-vehicle-heading',
     document.body.classList.contains('passenger-map-flat')?
       (lastValidHeading===null?'0deg':lastValidHeading+'deg'):(-angle)+'deg');
 };
 const vehicleIcon=L.divIcon({
   className:'jalan-vehicle-marker',
   html:'<span class="jalan-vehicle-symbol" data-heading="unavailable">▲</span>',
   iconSize:[40,40],iconAnchor:[20,20]
 });
 function discardVehicle(){
   if(vehicle){map.removeLayer(vehicle);vehicle=null;}
   lastValidHeading=null;
   directionSource='unavailable';
   map.getContainer().style.removeProperty('--jalan-camera-turn');
   screenVehicle.classList.add('hidden');
 }
 function updateVehicle(detail){
   const state=window.JalanGPS?.getState();
   const valid=state?.active&&state.matched&&Number.isFinite(state.accuracy)&&
     state.accuracy<=65&&state.fixAgeMs<=5000&&detail?.matched&&
     Array.isArray(detail.matchedPosition)&&detail.matchedPosition.length===2&&
     detail.matchedPosition.every(Number.isFinite);
   if(!valid){discardVehicle();return false;}
   const position=detail.matchedPosition;
   if(!vehicle)vehicle=L.marker(position,{icon:vehicleIcon,interactive:false,
     keyboard:false,zIndexOffset:950}).addTo(map);
   else vehicle.setLatLng(position);
   const heading=detail.heading,speed=detail.speedMps;
   // GPS heading is meaningful only when actually moving. At low speed use
   // the direction of the selected route segment, explicitly an estimate.
   const gpsHeadingReliable=Number.isFinite(heading)&&heading>=0&&heading<360&&
     Number.isFinite(speed)&&speed>=2.5;
   const ahead=routeAheadCenter(position,60);
   const x=(ahead[1]-position[1])*Math.cos(position[0]*Math.PI/180);
   const y=ahead[0]-position[0];
   const alongMeters=Math.hypot(x,y)*111320;
   const routeBearing=Number.isFinite(alongMeters)&&alongMeters>=12?
     (Math.atan2(x,y)*180/Math.PI+360)%360:null;
   if(gpsHeadingReliable){
     lastValidHeading=heading;
     directionSource='gps';
   }else if(routeBearing!==null){
     lastValidHeading=routeBearing;
     directionSource='route';
   }else{
     lastValidHeading=null;
     directionSource='unavailable';
   }
   const symbol=vehicle.getElement()?.querySelector('.jalan-vehicle-symbol');
   if(symbol){symbol.dataset.heading=directionSource;symbol.textContent='▲';}
   const guiding=document.body.classList.contains('passenger-guiding')&&
     !document.body.classList.contains('passenger-map-flat');
   if(!exploring)applyCameraAngle(guiding&&lastValidHeading!==null?-lastValidHeading:0);
   else applyCameraAngle(currentCameraAngle());
   scheduleScreenVehicle();
   return true;
 }
 const hideSettings=()=>settings.classList.add('hidden');
 const showSettings=()=>settings.classList.remove('hidden');
 el('passenger-settings-top').addEventListener('click',showSettings);
 el('passenger-settings').addEventListener('click',showSettings);
 el('passenger-setup-close').addEventListener('click',hideSettings);
 el('passenger-use-osrm').addEventListener('click',()=>{
   const toggle=el('tt-primary');
   if(toggle.checked){toggle.checked=false;toggle.dispatchEvent(new Event('change',{bubbles:true}));}
   el('passenger-provider-status').textContent='OSRM manually selected — no live traffic ETA.';
   hideSettings();
 });
 // The engineering and passenger screens share one browser origin and key policy.
 // Never copy the key into source code, URLs, logs or a remote database.
 const sharedKeyInput=el('tt-key'), sharedRemember=el('tt-remember'),
       passengerRemember=el('passenger-remember');
 const validKey=value=>/^[\w-]{8,160}$/.test(value);
 passengerRemember.checked=sharedRemember.checked;
 if(validKey(sharedKeyInput.value.trim())){
   el('passenger-provider-status').textContent=sharedRemember.checked?
     'Saved TomTom key available on this device — no re-entry needed.':
     'TomTom key available for this open page.';
 }
 el('passenger-use-tomtom').addEventListener('click',()=>{
   const input=el('passenger-key'),entered=input.value.trim();
   const value=entered||sharedKeyInput.value.trim();
   if(!validKey(value)){
     el('passenger-provider-status').textContent='No saved key found. Enter a restricted TomTom key once.';
     return;
   }
   // A changed key invalidates old provider requests and old browser storage.
   if(entered&&entered!==sharedKeyInput.value){
     sharedKeyInput.value=entered;
     sharedKeyInput.dispatchEvent(new Event('input',{bubbles:true}));
   }
   const remember=passengerRemember.checked;
   // The common TomTom module guards browsers that deny storage access.
   // A failed remember request must not be presented as a saved key.
   const storage=window.JalanTomTomKeyStorage;
   let saved=false;
   if(remember){saved=storage?.remember(value)===true;}
   else storage?.forget();
   sharedRemember.checked=remember&&saved;
   passengerRemember.checked=remember&&saved;
   const toggle=el('tt-primary');
   if(!toggle.checked){toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));}
   el('passenger-provider-status').textContent=remember&&saved?
     'TomTom ready. Key saved on this browser only.':
     remember?'TomTom ready for this page. Browser storage blocked; key not saved.':
     'TomTom ready for this page. Key not saved.';
   input.value='';
   hideSettings();
 });
 el('passenger-forget-key').addEventListener('click',()=>{
   el('tt-remove-key').click();
   passengerRemember.checked=false;
   el('passenger-key').value='';
   el('passenger-provider-status').textContent='Saved TomTom key cleared from this browser.';
 });
 function refreshOverview(){
   routeLabels.clearLayers();
   if(!routes.length||document.body.classList.contains('passenger-guiding')){
     overview.classList.add('hidden');return;
   }
   overview.classList.remove('hidden');
   const chosen=routes[selectedRoute],valid=routes.filter(r=>Number.isFinite(r.duration));
   const fastest=valid.length?Math.min(...valid.map(r=>r.duration)):null;
   const name=chosen?.provider==='tomtom'?'TomTom · traffic-aware ETA':'OSRM · no live traffic';
   el('passenger-route-provider').textContent=name+' · experimental, not approved for driving';
   list.replaceChildren();
   routes.forEach((r,i)=>{
     if(!r?.geometry?.coordinates?.length||!Number.isFinite(r.duration))return;
     const delta=fastest===null?null:Math.max(0,Math.round((r.duration-fastest)/60));
     const label=delta===0?'Fastest':'+'+delta+' min';
     const button=document.createElement('button');
     button.type='button';
     button.setAttribute('aria-pressed',String(i===selectedRoute));
     const left=document.createElement('span'),bold=document.createElement('b'),small=document.createElement('small');
     bold.textContent=i===0?'Fastest route':'Alternative '+i;
     small.textContent=fmtDist(r.distance)+' · '+(r.provider==='tomtom'?'Traffic estimate':'No traffic');
     left.append(bold,small);
     const time=document.createElement('span');
     time.className='route-time';
     time.textContent=fmtTime(r.duration)+(delta>0?' · '+label:'');
     button.append(left,time);
     button.addEventListener('click',()=>selectRoute(i));
     list.appendChild(button);
     if(i>0&&delta!==null){
       const coords=r.geometry.coordinates;
       const mid=coords[Math.min(coords.length-1,Math.floor(coords.length*0.55))];
       if(Array.isArray(mid)&&mid.length>=2&&mid.every(Number.isFinite)){
         const marker=L.marker([mid[1],mid[0]],{
           icon:L.divIcon({className:'',html:'<span class="passenger-delta-pin">+'+delta+' min</span>',iconSize:[75,28],iconAnchor:[37,14]})
         }).addTo(routeLabels);
         marker.on('click',()=>selectRoute(i));
       }
     }
   });
   el('passenger-route-title').textContent=routes.length>1?
     routes.length+' available routes':'Your route';
 }
 window.addEventListener('jalan:routes-rendered',refreshOverview);
 window.addEventListener('jalan:route-cleared',()=>{
   discardVehicle();
   closeDirections();
   routeLabels.clearLayers();overview.classList.add('hidden');
   document.body.classList.remove('passenger-guiding','passenger-map-flat');
   navigation.classList.add('hidden');
 });
 const turnToggle=el('passenger-turn-toggle'),
       turnList=el('passenger-turn-list'),
       maneuverList=el('passenger-maneuver-list');
 const reportsTab=el('passenger-tab-reports'),directionsTab=el('passenger-tab-directions'),
       reportsPanel=el('passenger-reports-panel'),directionsPanel=el('passenger-directions-panel'),
       reportList=el('passenger-report-list'),reportNote=el('passenger-report-note');
 let activeInfoTab='reports',incidentSnapshot={route:null,incidents:[],checkedAt:0};
 const reportFocus=L.layerGroup().addTo(map);
 const passengerDemoReports=L.layerGroup().addTo(map);
 const refreshDemoReportMarkers=()=>{
   passengerDemoReports.clearLayers();
   const coords=window.JalanGPS?.getState?.()?.route?.geometry?.coordinates;
   if(!coords)return;
   for(const report of (typeof getReports==='function'?getReports():[])){
     if(!report||!['accident','flood','hazard','rain'].includes(report.type))continue;
     const match=window.JalanTomTom?.matchReportGeometry(
       {type:'Point',coordinates:[Number(report.lng),Number(report.lat)]},coords);
     if(!match)continue;
     L.marker([match.lat,match.lng],{icon:L.divIcon({className:'report-marker passenger-demo-report-marker',
       html:'⚠️',iconSize:[28,28],iconAnchor:[14,14]}),
       title:report.type.toUpperCase()+' · unverified demo report'}).addTo(passengerDemoReports);
   }
 };
 let focusedReport=null;
 const clearReportFocus=()=>{reportFocus.clearLayers();focusedReport=null;};
 const focusReport=(item,route)=>{
   const state=window.JalanGPS?.getState?.();
   if(!state?.active||state.route!==route||!Number.isFinite(item.lat)||
      !Number.isFinite(item.lng)||Math.abs(item.lat)>90||Math.abs(item.lng)>180||
      !startExplore())return;
   gesture=null;
   closeDirections();
   clearReportFocus();
   focusedReport={route,source:item.source};
   const label=document.createElement('span');
   label.textContent=item.title;
   L.circleMarker([item.lat,item.lng],{radius:12,color:'#fff',weight:3,
     fillColor:'#d85800',fillOpacity:1,interactive:false,
     className:'jalan-report-focus-marker'}).addTo(reportFocus)
     .bindTooltip(label,{permanent:true,direction:'top',offset:[0,-14],
       className:'jalan-report-focus-label'});
   applyCameraAngle(0);
   map.setView([item.lat,item.lng],18,{animate:false});
   hint.textContent='Viewing report · tap Recenter to follow GPS again';
   scheduleScreenVehicle();
   el('passenger-recenter-floating').focus({preventScroll:true});
 };
 // Share the same projection and 25m corridor with provider map pins.
 const pointOnRoute=(position,coords)=>Array.isArray(position)?
   window.JalanTomTom?.projectReportPoint([position[1],position[0]],coords):null;
 const renderReports=()=>{
   reportList.replaceChildren();
   const state=window.JalanGPS?.getState?.(),route=state?.route,
         coords=route?.geometry?.coordinates;
   if(!state?.active||!Array.isArray(coords)){
     reportNote.textContent='Choose a route to see traffic reports.';
     return;
   }
   const current=state.matched&&state.fixAgeMs<=10000&&state.accuracy<=75&&Array.isArray(state.position)?
     pointOnRoute(state.position,coords):null;
   const items=[];
   // Local community reports are demo records, NOT verified incidents.
   for(const report of (typeof getReports==='function'?getReports():[])){
     if(!report||!['accident','flood','hazard','rain'].includes(report.type))continue;
     items.push({lat:Number(report.lat),lng:Number(report.lng),
       title:report.type.toUpperCase()+' · unverified demo report',
       detail:'Local demonstration report',source:'demo'});
   }
   const freshIncidents=incidentSnapshot.route===route&&
     Date.now()-incidentSnapshot.checkedAt<=10*60*1000?incidentSnapshot.incidents:[];
   for(const incident of freshIncidents){
     items.push({lat:Number(incident.lat),lng:Number(incident.lng),
       title:'TomTom traffic incident',detail:String(incident.description||'Traffic event').slice(0,160),
       source:'tomtom'});
   }
   const positioned=[];
   for(const item of items){
     if(!Number.isFinite(item.lat)||!Number.isFinite(item.lng)||
        Math.abs(item.lat)>90||Math.abs(item.lng)>180)continue;
     const projected=pointOnRoute([item.lat,item.lng],coords);
     if(!projected||projected.offset>window.JalanTomTom.reportRouteTolerance||
        (current&&projected.along<current.along-30))continue;
     positioned.push({...item,ahead:current?Math.max(0,projected.along-current.along):null,routeAlong:projected.along,
       fromReportToDestination:Math.max(0,projected.total-projected.along)});
   }
   positioned.sort((a,b)=>a.routeAlong-b.routeAlong);
   for(const item of positioned.slice(0,40)){
     const li=document.createElement('li'),button=document.createElement('button'),
           marker=document.createElement('span'),
           info=document.createElement('div'),title=document.createElement('strong'),
           distances=document.createElement('small'),detail=document.createElement('small');
     marker.className='turn-list-arrow';marker.textContent=item.source==='demo'?'⚠️':'🚧';
     marker.setAttribute('aria-hidden','true');
     button.type='button';button.className='passenger-report-button';
     button.setAttribute('aria-label','View report on map: '+item.title+' · '+item.detail);
     button.addEventListener('click',()=>focusReport(item,route));
     title.textContent=item.title;
     distances.textContent=(item.ahead===null?'Distance from you pending GPS':'In '+fmtDist(item.ahead))+
       ' · '+fmtDist(item.fromReportToDestination)+' from report to destination';
     detail.textContent=item.detail;
     info.append(title,distances,detail);button.append(marker,info);
     li.appendChild(button);reportList.appendChild(li);
   }
   const hasIncidents=incidentSnapshot.route===route&&
     Date.now()-incidentSnapshot.checkedAt<=10*60*1000;
   reportNote.textContent=positioned.length?
     'Reports closely match the blue route. Traffic colours also show surrounding roads. Demo reports are unverified. '+
       (current?'Distances are approximate along-route values.':'Showing the selected route; distance from you awaits verified GPS.'):
     'No applicable reports ahead on this selected route.'+
       (hasIncidents?' TomTom incident check returned no applicable items.':
        ' '+el('passenger-traffic-summary').textContent);
 };
 const selectInfoTab=tab=>{
   activeInfoTab=tab==='directions'?'directions':'reports';
   const reports=activeInfoTab==='reports';
   reportsTab.setAttribute('aria-selected',String(reports));
   directionsTab.setAttribute('aria-selected',String(!reports));
   reportsPanel.classList.toggle('hidden',!reports);
   directionsPanel.classList.toggle('hidden',reports);
   if(reports)renderReports();else renderDirections();
 };
 reportsTab.addEventListener('click',()=>selectInfoTab('reports'));
 directionsTab.addEventListener('click',()=>selectInfoTab('directions'));
 window.addEventListener('jalan:incidents-updated',event=>{
   const detail=event.detail||{};
   if(focusedReport?.source==='tomtom')clearReportFocus();
   incidentSnapshot={route:detail.route||null,incidents:Array.isArray(detail.incidents)?detail.incidents:[],
     checkedAt:Number(detail.checkedAt)||0};
   if(!turnList.classList.contains('hidden')&&activeInfoTab==='reports')renderReports();
 });
 const turnIcon=action=>/roundabout/i.test(action)?'⟳':
   /left/i.test(action)?'↰':/right/i.test(action)?'↱':
   /u.turn|u-turn/i.test(action)?'↶':'↑';
 const closeDirections=()=>{
   turnList.classList.add('hidden');
   turnToggle.setAttribute('aria-expanded','false');
 };
 const renderDirections=()=>{
   if(!document.body.classList.contains('passenger-guiding'))return;
   const steps=window.JalanGPS?.getDirections?.()||[];
   maneuverList.replaceChildren();
   if(!steps.length){
     const li=document.createElement('li');
     li.textContent='Route instructions unavailable. Follow the selected route preview only.';
     maneuverList.appendChild(li);return;
   }
   for(const step of steps){
     if(!Number.isFinite(step.distanceMeters)||step.distanceMeters<0)continue;
     const li=document.createElement('li'),arrow=document.createElement('span'),
           info=document.createElement('div'),name=document.createElement('strong'),
           distance=document.createElement('small');
     arrow.className='turn-list-arrow';arrow.textContent=step.arrival?'⚑':turnIcon(step.action||'');
     name.textContent=String(step.action||'Continue');
     distance.textContent='In '+fmtDist(step.distanceMeters);
     info.append(name,distance);li.append(arrow,info);maneuverList.appendChild(li);
   }
 };
 turnToggle.addEventListener('click',()=>{
   const open=turnList.classList.contains('hidden');
   if(open){selectInfoTab('reports');turnList.classList.remove('hidden');}
   else closeDirections();
   turnToggle.setAttribute('aria-expanded',String(open));
 });
 el('passenger-turn-close').addEventListener('click',closeDirections);
  const syncGPS=(fix=null)=>{
   if(!document.body.classList.contains('passenger-guiding'))return;
   el('passenger-instruction').textContent=el('gps-instruction').textContent||'Acquiring GPS…';
   el('passenger-next').textContent=el('gps-detail').textContent||'Route preview';
   el('passenger-eta').textContent=el('gps-eta').textContent||'—';
   el('passenger-distance').textContent=el('gps-distance').textContent||'—';
   const state=window.JalanGPS?.getState();
   const matched=state?.matched&&Number.isFinite(state.accuracy)&&state.accuracy<=75&&state.fixAgeMs<10000;
   const alert=el('passenger-signal-alert');
   alert.classList.toggle('hidden',!!matched);
   alert.textContent=matched?'':'GPS uncertain · wait for a verified position';
   el('passenger-fix').textContent=!matched?
     'GPS uncertain or unavailable · vehicle position not verified':
     directionSource==='gps'?'GPS matched · heading-up experimental preview':
     directionSource==='route'?'GPS matched · road direction estimated from route':
     'GPS matched · direction unavailable; north-up preview';
   const speed=fix?.matched&&Number.isFinite(fix.speedMps)&&fix.speedMps>=0?
     Math.round(fix.speedMps*3.6)+' km/h':'— km/h';
   el('passenger-speed').textContent=speed;
   const message=el('passenger-instruction').textContent;
   el('passenger-turn-arrow').textContent=turnIcon(message);
   if(!turnList.classList.contains('hidden')){
     if(activeInfoTab==='reports')renderReports();else renderDirections();
   }
   el('passenger-turn-details').textContent=message;
 };
 // Passenger controls mirror the existing engineering GPS buttons; no
 // duplicate voice engine, no accidental opt-in to automatic rerouting.
 const voiceControl=el('passenger-voice'),autoControl=el('passenger-auto-reroute'),
       rerouteStatus=el('passenger-reroute-status');
 const syncNavigationSettings=()=>{
   const voiceButton=el('gps-voice'),autoButton=el('gps-auto');
   voiceControl.textContent=voiceButton.textContent;
   voiceControl.setAttribute('aria-pressed',voiceButton.getAttribute('aria-pressed')||'false');
   autoControl.textContent=autoButton.textContent;
   autoControl.setAttribute('aria-pressed',autoButton.getAttribute('aria-pressed')||'false');
 };
 voiceControl.addEventListener('click',()=>{el('gps-voice').click();syncNavigationSettings();});
 autoControl.addEventListener('click',()=>{
   el('gps-auto').click();syncNavigationSettings();
   rerouteStatus.dataset.state='idle';
   rerouteStatus.textContent=autoControl.getAttribute('aria-pressed')==='true'?
     'Auto rerouting enabled · sustained off-route confirmation required.':
     'Auto rerouting off · use Recalculate to check manually.';
 });
 el('passenger-reroute-now').addEventListener('click',()=>{
   el('gps-reroute').click();
 });
 window.addEventListener('jalan:navigation-settings',syncNavigationSettings);
 window.addEventListener('jalan:reroute-status',event=>{
   if(!document.body.classList.contains('passenger-guiding'))return;
   const detail=event.detail||{};
   rerouteStatus.dataset.state=detail.state||'idle';
   rerouteStatus.textContent=String(detail.message||'Route status unavailable.');
 });
 syncNavigationSettings();
 // Go starts the existing traffic layers/checker for this passenger session.
 // Keep automatic route switching separate from loading traffic information.
 const trafficToggle=el('passenger-traffic-toggle'),
       trafficStatus=el('passenger-traffic-status'),
       trafficOffer=el('passenger-traffic-offer');
 const trafficSummary=el('passenger-traffic-summary');
 let trafficOptOut=false;
 window.addEventListener('jalan:traffic-layer-status',event=>{
   if(!document.body.classList.contains('passenger-guiding'))return;
   const detail=event.detail||{},state=window.JalanGPS?.getState?.();
   if(detail.route&&detail.route!==state?.route)return;
   trafficSummary.dataset.state=detail.state||'off';
   trafficSummary.textContent=String(detail.message||'Traffic unavailable');
   if(!turnList.classList.contains('hidden')&&activeInfoTab==='reports')renderReports();
 });
 const liveEta=el('passenger-live-eta');
 const clearLiveEta=()=>{
   liveEta.textContent='No recent TomTom estimate. Selected-route minutes remain the active guidance estimate.';
   liveEta.removeAttribute('data-checked-at');
 };
 window.addEventListener('jalan:traffic-estimate',event=>{
   const info=event.detail,state=window.JalanGPS?.getState?.();
   if(!document.body.classList.contains('passenger-guiding')||
      !state?.active||!state.matched||state.fixAgeMs>10000||
      info?.provider!=='tomtom'||state.route!==info.route||
      state.route?.provider!=='tomtom'||!el('tt-primary')?.checked||!el('tt-key')?.value.trim()||
      !Number.isFinite(info.seconds)||info.seconds<=0||
      !Number.isFinite(info.checkedAt)||Math.abs(Date.now()-info.checkedAt)>30000)return;
   const minutes=Math.max(1,Math.round(info.seconds/60));
   const stamp=new Date(info.checkedAt).toLocaleTimeString('en-MY',{hour:'numeric',minute:'2-digit'});
   liveEta.textContent='TomTom live fastest-route estimate: '+minutes+
     ' min · checked '+stamp+'. This is an alternative, not a change to your selected road.';
   liveEta.dataset.checkedAt=String(info.checkedAt);
 });
 setInterval(()=>{
   const checked=Number(liveEta.dataset.checkedAt);
   if(checked&&Date.now()-checked>10*60*1000)clearLiveEta();
 },30000);
 const hideTrafficOffer=()=>trafficOffer.classList.add('hidden');
 const syncTraffic=()=>{
   const on=el('proactive-toggle').getAttribute('aria-pressed')==='true';
   trafficToggle.setAttribute('aria-pressed',String(on));
   trafficToggle.textContent='Live traffic: '+(on?'On':'Off');
 };
 const stopPassengerTraffic=()=>{
   window.JalanTraffic?.stop();
   window.JalanTomTom?.stopPassengerTraffic();
   syncTraffic();
 };
 const startPassengerTraffic=()=>{
   if(!window.JalanTomTom?.startPassengerTraffic()){
     window.JalanTraffic?.stop();
     trafficStatus.textContent='Auto traffic checks need an active TomTom route and a restricted key.';
     syncTraffic();return;
   }
   window.JalanTraffic?.start();
   syncTraffic();
 };
 trafficToggle.addEventListener('click',()=>{
   trafficOptOut=trafficToggle.getAttribute('aria-pressed')==='true';
   if(trafficOptOut)stopPassengerTraffic();else startPassengerTraffic();
 });
 el('passenger-traffic-check').addEventListener('click',()=>{
   window.JalanTomTom?.refreshRouteIncidents(true);
   el('proactive-check').click();
 });
 window.addEventListener('jalan:gps-fix',()=>{
   if(document.body.classList.contains('passenger-guiding'))window.JalanTraffic?.check();
 });
 el('passenger-traffic-accept').addEventListener('click',()=>el('proactive-accept').click());
 el('passenger-traffic-keep').addEventListener('click',()=>el('proactive-decline').click());
 window.addEventListener('jalan:traffic-status',event=>{
   trafficStatus.textContent=String(event.detail?.message||'Traffic check unavailable.');
   syncTraffic();
   // Do not leave an old proposal visible after a failed or cancelled check.
   if(/failed|changed|removed|unavailable|waiting|off|expired|kept|selected/i.test(trafficStatus.textContent)){
     hideTrafficOffer();
     if(/changed|removed|off|selected/i.test(trafficStatus.textContent))clearLiveEta();
   }
 });
 window.addEventListener('jalan:route-offer',event=>{
   if(!document.body.classList.contains('passenger-guiding')||
      window.JalanGPS?.getState?.()?.route?.provider!=='tomtom')return;
   const seconds=event.detail?.estimatedSavingSeconds;
   if(!Number.isFinite(seconds)||seconds<=0)return;
   el('passenger-traffic-offer-text').textContent=
     'TomTom suggests saving about '+Math.round(seconds/60)+' min. Confirm before switching.';
   trafficOffer.classList.remove('hidden');
 });
 window.addEventListener('jalan:route-change',()=>{
   hideTrafficOffer();clearLiveEta();clearReportFocus();refreshDemoReportMarkers();
 });
 window.addEventListener('jalan:route-cleared',()=>{clearReportFocus();passengerDemoReports.clearLayers();});
 window.addEventListener('jalan:route-decline',hideTrafficOffer);
 syncTraffic();
 el('passenger-go').addEventListener('click',()=>{
   if(!routes.length)return;
   trafficOptOut=false;
   hideSettings();
   el('gps-start').click();
   if(!window.JalanGPS?.getState()?.active){
     el('passenger-route-provider').textContent='GPS preview could not start. Check browser permissions or use Engineering tests.';
   }
 });
 window.addEventListener('jalan:journey-start',()=>{
   closeDirections();
   clearReportFocus();
   incidentSnapshot={route:null,incidents:[],checkedAt:0};
   el('passenger-options').open=false;
   clearLiveEta();
   el('passenger-signal-alert').classList.remove('hidden');
   el('passenger-signal-alert').textContent='Waiting for verified GPS';
   syncNavigationSettings();
   rerouteStatus.dataset.state='idle';
   rerouteStatus.textContent=autoControl.getAttribute('aria-pressed')==='true'?
     'Auto rerouting enabled · watching for sustained deviation.':
     'Auto rerouting off · manual Recalculate available.';
   exploring=false;lastGPSDetail=null;hint.textContent='Drag · pinch · twist to explore · Recenter to resume following';
   discardVehicle();
   if(!routes.length)return;
   hidePlannerMarkers();
   map.removeLayer(reportLayer);
   refreshDemoReportMarkers();
   // The selected road remains prominent, while unused grey alternatives
   // are hidden during Go. Route overview regains them after preview exits.
   routeLayer.getLayers().forEach((line,i)=>{
     if(typeof line.setStyle==='function')line.setStyle(i===selectedRoute?
       {color:'#087af5',weight:9,opacity:1}:{opacity:0});
   });
   routeLabels.clearLayers();
   overview.classList.add('hidden');
   navigation.classList.remove('hidden');
   document.body.classList.add('passenger-guiding');
   document.body.classList.remove('passenger-map-flat');
   el('passenger-2d').setAttribute('aria-pressed','false');
   el('passenger-2d').textContent='2D map';
   syncGPS();
   scheduleScreenVehicle();
   if(!trafficOptOut)startPassengerTraffic();
 });
 window.addEventListener('jalan:journey-stop',()=>{
   closeDirections();
   clearReportFocus();
   passengerDemoReports.clearLayers();
   if(!map.hasLayer(reportLayer))reportLayer.addTo(map);
   el('passenger-options').open=false;
   clearLiveEta();
   el('passenger-signal-alert').classList.add('hidden');
   hideTrafficOffer();
   stopPassengerTraffic();
   exploring=false;lastGPSDetail=null;
   discardVehicle();
   document.body.classList.remove('passenger-guiding','passenger-map-flat');
   restorePlannerMarkers();
   routeLayer.getLayers().forEach((line,i)=>{
     if(typeof line.setStyle==='function')line.setStyle(i===selectedRoute?
       {color:'#2563eb',weight:7,opacity:0.95}:
       {color:'#94a3b8',weight:5,opacity:0.65});
   });
   navigation.classList.add('hidden');
 });
 // The old passenger view retained the full-route zoom (often 15) after Go,
 // leaving the vehicle in a distant map overview. Only a predictor-matched,
 // fresh, bounded-accuracy GPS fix may control the passenger camera.
 // This follows the route ahead in north-up 2.5D; it DOES NOT rotate to road
 // bearing or certify lane-level placement/turn legality.
 const routeAheadCenter=(position,metresAhead=90)=>{
   const coordinates=routes[selectedRoute]?.geometry?.coordinates;
   if(!Array.isArray(coordinates)||coordinates.length<2)return position;
   const sx=111320*Math.cos(position[0]*Math.PI/180),sy=111320;
   let closest={distance:Infinity,segment:-1,ratio:0};
   const points=coordinates.filter(p=>Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite))
     .map(p=>[p[1],p[0]]);
   for(let i=1;i<points.length;i++){
     const a=points[i-1],b=points[i],dx=(b[1]-a[1])*sx,dy=(b[0]-a[0])*sy;
     const ax=(a[1]-position[1])*sx,ay=(a[0]-position[0])*sy;
     const ratio=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
     const distance=Math.hypot(ax+ratio*dx,ay+ratio*dy);
     if(distance<closest.distance)closest={distance,segment:i,ratio};
   }
   // Don't bias the camera toward an unrelated road if map-matching is unclear.
   if(closest.segment<0||closest.distance>75)return position;
   let remaining=metresAhead;
   for(let i=closest.segment;i<points.length;i++){
     const a=points[i-1],b=points[i],fraction=i===closest.segment?closest.ratio:0;
     const length=Math.hypot((b[1]-a[1])*sx,(b[0]-a[0])*sy);
     const available=length*(1-fraction);
     if(remaining<=available&&length>0){
       const t=fraction+remaining/length;
       return [a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
     }
     remaining-=available;
   }
   return points[points.length-1]||position;
 };
 const followPassengerGPS=detail=>{
   if(exploring||!document.body.classList.contains('passenger-guiding')||
      document.body.classList.contains('passenger-map-flat'))return;
   const state=window.JalanGPS?.getState();
   if(!state?.active||!state.matched||!Number.isFinite(state.accuracy)||
      state.accuracy>75||state.fixAgeMs>10000||
      !detail?.matched||!Array.isArray(detail.matchedPosition)||
      detail.matchedPosition.length!==2||
      !detail.matchedPosition.every(Number.isFinite))return;
   // Keeping the trusted vehicle at camera centre avoids the off-screen
   // triangle seen on Safari when 125m look-ahead met a tilted, rotating map.
   const center=detail.matchedPosition;
   // A preceding route-overview fitBounds() may still be animating; cancel
   // it before taking ownership of the passenger camera.
   // The previous update called map.stop() + setView(...zoom17) for *every*
   // matched GPS fix. Safari repeatedly repainted raster tiles and flashed.
   // Respect the current zoom, changing camera only when the vehicle moved.
   const zoom=map.getZoom();
   const camera=map.getCenter(),dx=(camera.lng-center[1])*111320*Math.cos(center[0]*Math.PI/180),
         dy=(camera.lat-center[0])*111320;
   if(!Number.isFinite(zoom)||zoom<17)map.setView(center,17,{animate:false});
   else if(Math.hypot(dx,dy)>8)map.panTo(center,{animate:false});
   scheduleScreenVehicle();
 };
 window.addEventListener('jalan:gps-fix',event=>{
   lastGPSDetail=event.detail;
   // Never move the camera on an unmatched, stale, or inaccurate fix.
   if(updateVehicle(event.detail))followPassengerGPS(event.detail);
   requestAnimationFrame(()=>syncGPS(event.detail));
 });
 // iOS may suspend geolocation when Safari is backgrounded or the screen
 // locks. An old trusted marker must never continue looking like live GPS.
 const expireStalePassengerGPS=()=>{
   if(!document.body.classList.contains('passenger-guiding'))return;
   const state=window.JalanGPS?.getState();
   if(state?.active&&state.matched&&Number.isFinite(state.fixAgeMs)&&
      state.fixAgeMs<=10000&&!document.hidden)return;
   discardVehicle();
   el('passenger-signal-alert').classList.remove('hidden');
   el('passenger-signal-alert').textContent=document.hidden?
     'Safari backgrounded · position unverified':'GPS signal stale · position unverified';
   el('passenger-fix').textContent=document.hidden?
     'Safari in background · GPS cannot be verified':
     'GPS signal stale or unavailable · waiting for fresh position';
   hint.textContent='GPS follow paused · Recenter after a fresh location update';
 };
 setInterval(expireStalePassengerGPS,2000);
 document.addEventListener('visibilitychange',expireStalePassengerGPS);
 // Heading-up map: custom touch gestures because Leaflet's 2-D hit-testing
 // does not match a CSS-tilted/rotated perspective. Gesture exploration
 // deliberately suspends automatic follow until Recenter is pressed.
 let gesture=null;
 const snapshot=touches=>{
   const a=touches[0],b=touches[1];
   const x=b?(a.clientX+b.clientX)/2:a.clientX;
   const y=b?(a.clientY+b.clientY)/2:a.clientY;
   return {x,y,n:touches.length,distance:b?Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY):0,
     angle:b?Math.atan2(b.clientY-a.clientY,b.clientX-a.clientX)*180/Math.PI:0};
 };
 const startExplore=()=>{
   if(!document.body.classList.contains('passenger-guiding'))return false;
   exploring=true;map.stop();
   hint.textContent='Exploring map · tap Recenter to follow GPS again';
   return true;
 };
 gestureSurface.addEventListener('touchstart',event=>{
   if(!startExplore())return;
   if(event.cancelable)event.preventDefault();
   gesture={...snapshot(event.touches),pinchTotal:0};
 },{passive:false});
 gestureSurface.addEventListener('touchmove',event=>{
   if(!gesture||!document.body.classList.contains('passenger-guiding'))return;
   if(event.cancelable)event.preventDefault();
   const next=snapshot(event.touches);
   if(next.n!==gesture.n){gesture={...next,pinchTotal:0};return;}
   const dx=next.x-gesture.x,dy=next.y-gesture.y;
   const turn=currentCameraAngle()*Math.PI/180;
   const scale=document.body.classList.contains('passenger-map-flat')?1:1.85;
   const tx=(dx*Math.cos(turn)+dy*Math.sin(turn))/scale;
   const ty=(-dx*Math.sin(turn)+dy*Math.cos(turn))/scale;
   // Limited per-frame movement avoids GPS-like jumps during a finger switch.
   if(Math.hypot(dx,dy)<150)map.panBy([-tx,-ty],{animate:false});
   if(next.n>=2){
     const rotation=((next.angle-gesture.angle+540)%360)-180;
     if(Math.abs(rotation)<45&&Math.abs(rotation)>0.15)
       applyCameraAngle(currentCameraAngle()+rotation);
     if(gesture.distance>0&&next.distance>0){
       // Accumulate incremental Safari touchmove changes. The old per-frame
       // 23% threshold never triggered for ordinary slow pinch gestures.
       const factor=next.distance/gesture.distance;
       let cumulative=(gesture.pinchTotal||0)+Math.log(factor);
       const threshold=Math.log(1.12);
       const direction=cumulative>=threshold?1:cumulative<=-threshold?-1:0;
       if(direction){
         const oldZoom=map.getZoom();
         const desired=Math.max(map.getMinZoom(),Math.min(map.getMaxZoom(),oldZoom+direction));
         if(desired!==oldZoom)map.setZoom(desired,{animate:false});
         cumulative=0;
       }
       next.pinchTotal=cumulative;
     }
   }
   gesture=next;
 },{passive:false});
 gestureSurface.addEventListener('touchend',event=>{
   if(event.cancelable)event.preventDefault();
   gesture=event.touches.length?{...snapshot(event.touches),pinchTotal:0}:null;
 },{passive:false});
 gestureSurface.addEventListener('touchcancel',()=>{gesture=null;});
 // Both 2D and 2.5D views use this gesture surface so rotating the map
 // does not invalidate Leaflet's original hit-testing.
 const recenterPassenger=()=>{
   clearReportFocus();
   gesture=null;exploring=false;
   hint.textContent='Following GPS · drag, pinch or twist to explore';
   const state=window.JalanGPS?.getState();
   const reliable=state?.active&&state.matched&&
     Number.isFinite(state.accuracy)&&state.accuracy<=65&&
     state.fixAgeMs<=5000&&Array.isArray(state.position);
   if(!reliable||!lastGPSDetail?.matched){
     hint.textContent='Waiting for reliable GPS · cannot recenter yet';
     return;
   }
   updateVehicle(lastGPSDetail);
   const flat=document.body.classList.contains('passenger-map-flat');
   applyCameraAngle(flat?0:lastValidHeading===null?0:-lastValidHeading);
   const target=state.position;
   map.stop();
   map.setView(target,17,{animate:false,reset:true});
   scheduleScreenVehicle();
 };
 el('passenger-recenter').addEventListener('click',recenterPassenger);
 el('passenger-recenter-floating').addEventListener('click',recenterPassenger);
 el('passenger-2d').addEventListener('click',()=>{
   gesture=null;
   const flat=document.body.classList.toggle('passenger-map-flat');
   applyCameraAngle(flat?0:exploring?currentCameraAngle():lastValidHeading===null?0:-lastValidHeading);
   map.invalidateSize();
   scheduleScreenVehicle();
   el('passenger-2d').textContent=flat?'2.5D preview':'2D map';
   el('passenger-2d').setAttribute('aria-pressed',String(flat));
 });
 el('passenger-stop').addEventListener('click',()=>el('gps-exit').click());
 // Keep engineering test panels and private KL coordinate-GET panels untouched.
})();
