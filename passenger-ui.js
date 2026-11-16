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
   if(symbol){
     // Counter-rotate the *georeferenced* triangle against the camera rotation.
     // The vehicle points up; the map follows available direction instead.
     symbol.dataset.heading=directionSource;
     symbol.textContent='▲';
     symbol.style.setProperty('--jalan-vehicle-heading',
       lastValidHeading===null?'0deg':lastValidHeading+'deg');
   }
   const guiding=document.body.classList.contains('passenger-guiding')&&
     !document.body.classList.contains('passenger-map-flat');
   map.getContainer().style.setProperty('--jalan-camera-turn',
     guiding&&lastValidHeading!==null?(-lastValidHeading)+'deg':'0deg');
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
   sharedRemember.checked=remember;
   if(remember){
     localStorage.setItem('jalan-tomtom-key',value);
   }else{
     localStorage.removeItem('jalan-tomtom-key');
     sessionStorage.removeItem('jalan-tomtom-key');
   }
   const toggle=el('tt-primary');
   if(!toggle.checked){toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));}
   el('passenger-provider-status').textContent=remember?
     'TomTom ready. Key saved on this browser only.':
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
   routeLabels.clearLayers();overview.classList.add('hidden');
   document.body.classList.remove('passenger-guiding','passenger-map-flat');
   navigation.classList.add('hidden');
 });
 const syncGPS=(fix=null)=>{
   if(!document.body.classList.contains('passenger-guiding'))return;
   el('passenger-instruction').textContent=el('gps-instruction').textContent||'Acquiring GPS…';
   el('passenger-next').textContent=el('gps-detail').textContent||'Route preview';
   el('passenger-eta').textContent=el('gps-eta').textContent||'—';
   el('passenger-distance').textContent=el('gps-distance').textContent||'—';
   const state=window.JalanGPS?.getState();
   const matched=state?.matched&&Number.isFinite(state.accuracy)&&state.accuracy<=75&&state.fixAgeMs<10000;
   el('passenger-fix').textContent=!matched?
     'GPS uncertain or unavailable · vehicle position not verified':
     directionSource==='gps'?'GPS matched · heading-up experimental preview':
     directionSource==='route'?'GPS matched · road direction estimated from route':
     'GPS matched · direction unavailable; north-up preview';
   const speed=fix?.matched&&Number.isFinite(fix.speedMps)&&fix.speedMps>=0?
     Math.round(fix.speedMps*3.6)+' km/h':'— km/h';
   el('passenger-speed').textContent=speed;
   const message=el('passenger-instruction').textContent;
   el('passenger-turn-arrow').textContent=/left/i.test(message)?'↰':/right/i.test(message)?'↱':'↑';
 };
 el('passenger-go').addEventListener('click',()=>{
   if(!routes.length)return;
   hideSettings();
   el('gps-start').click();
   if(!window.JalanGPS?.getState()?.active){
     el('passenger-route-provider').textContent='GPS preview could not start. Check browser permissions or use Engineering tests.';
   }
 });
 window.addEventListener('jalan:journey-start',()=>{
   discardVehicle();
   if(!routes.length)return;
   hidePlannerMarkers();
   routeLabels.clearLayers();
   overview.classList.add('hidden');
   navigation.classList.remove('hidden');
   document.body.classList.add('passenger-guiding');
   document.body.classList.remove('passenger-map-flat');
   el('passenger-2d').setAttribute('aria-pressed','false');
   el('passenger-2d').textContent='2D map';
   syncGPS();
 });
 window.addEventListener('jalan:journey-stop',()=>{
   discardVehicle();
   document.body.classList.remove('passenger-guiding','passenger-map-flat');
   restorePlannerMarkers();
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
   if(!document.body.classList.contains('passenger-guiding')||
      document.body.classList.contains('passenger-map-flat'))return;
   const state=window.JalanGPS?.getState();
   if(!state?.active||!state.matched||!Number.isFinite(state.accuracy)||
      state.accuracy>75||state.fixAgeMs>10000||
      !detail?.matched||!Array.isArray(detail.matchedPosition)||
      detail.matchedPosition.length!==2||
      !detail.matchedPosition.every(Number.isFinite))return;
   const center=routeAheadCenter(detail.matchedPosition);
   // A preceding route-overview fitBounds() may still be animating; cancel
   // it before taking ownership of the passenger camera.
   map.stop();
   if(map.getZoom()<17)map.setView(center,17,{animate:false,reset:true});
   else map.panTo(center,{animate:false});
 };
 window.addEventListener('jalan:gps-fix',event=>{
   // Never move the vehicle or camera on an unmatched, stale, or inaccurate
   // reading. The GPS module emits its trust result before this listener.
   if(updateVehicle(event.detail))followPassengerGPS(event.detail);
   requestAnimationFrame(()=>syncGPS(event.detail));
 });
 el('passenger-recenter').addEventListener('click',()=>el('gps-recenter').click());
 el('passenger-2d').addEventListener('click',()=>{
   const flat=document.body.classList.toggle('passenger-map-flat');
   map.getContainer().style.setProperty('--jalan-camera-turn',
     flat||lastValidHeading===null?'0deg':(-lastValidHeading)+'deg');
   el('passenger-2d').textContent=flat?'2.5D preview':'2D map';
   el('passenger-2d').setAttribute('aria-pressed',String(flat));
 });
 el('passenger-stop').addEventListener('click',()=>el('gps-exit').click());
 // Keep engineering test panels and private KL coordinate-GET panels untouched.
})();
