/* JALAN Passenger Preview V1: separate interface over existing public routing/GPS.
   This does NOT certify legal-road turns or real-world driving guidance. */
(() => {
 'use strict';
 const passenger=new URLSearchParams(location.search).get('mode')==='passenger';
 if(!passenger)return;
 document.body.classList.add('passenger-mode');
 const el=id=>document.getElementById(id),overview=el('passenger-overview'),
       list=el('passenger-route-list'),
       navigation=el('passenger-navigation');
 const routeLabels=L.layerGroup().addTo(map);
 const viewModel=window.JalanNavigationView,viewStorage='jalan-navigation-view-v1';
 let viewSettings={...viewModel.defaults},lastTilt=viewModel.defaults.tilt;
 try{viewSettings=viewModel.sanitize(JSON.parse(localStorage.getItem(viewStorage)||'null'));}catch{}
 if(viewSettings.tilt>0)lastTilt=viewSettings.tilt;
 const navigationZoom=()=>Math.min(viewModel.zoomLevel(viewSettings.zoom),window.JalanVectorMap?.active?20:Math.min(20,map.getMaxZoom()));
 const viewAnchor=()=>{
   const barTop=el('passenger-journey-sheet').getBoundingClientRect().top;
   if(document.body.classList.contains('passenger-guiding')){
     const base=0,
       offset=Math.max(base,innerHeight-barTop-(innerHeight<=650?98:108)+12)+'px';
     if(document.body.style.getPropertyValue('--passenger-map-footer-offset')!==offset)
       document.body.style.setProperty('--passenger-map-footer-offset',offset);
   }
   return viewModel.anchor({height:innerHeight,barTop,vehicleSize:el('passenger-vehicle-screen').offsetHeight||84});
 };
 const syncViewMode=()=>{
   const flat=viewSettings.tilt===0;document.body.classList.toggle('passenger-map-flat',flat);
   el('passenger-2d').setAttribute('aria-pressed',String(flat));
   el('passenger-2d').textContent=flat?('2.5D preview'):'2D map';
 };
 const navigationCenter=(position,zoom)=>{
   if(window.JalanVectorMap?.active)return position;
   const offset=viewModel.rasterOffset({height:innerHeight,y:viewAnchor().y,angle:currentCameraAngle(),tilt:viewSettings.tilt}),point=map.project(position,zoom);
   const center=map.unproject(L.point(point.x-offset.x,point.y-offset.y),zoom);return [center.lat,center.lng];
 };
 map.createPane('passenger-travelled');map.getPane('passenger-travelled').style.zIndex='460';
 map.getPane('passenger-travelled').style.pointerEvents='none';
 let travelled=null,travelRoute=null,travelFraction=0;
 const clearTravelled=()=>{if(travelled)map.removeLayer(travelled);travelled=null;travelRoute=null;travelFraction=0;};
 const paintTravelled=()=>{
   const state=window.JalanGPS?.getState(),route=state?.route;
   if(!state?.active||!document.body.classList.contains('passenger-guiding')){clearTravelled();return;}
   if(route!==travelRoute){clearTravelled();travelRoute=route;}
   if(!state.matched||state.accuracy>75||state.fixAgeMs>10000||
      !Number.isFinite(state.remainingMeters)||!(route?.distance>0))return;
   travelFraction=Math.max(travelFraction,Math.min(1,Math.max(0,1-state.remainingMeters/route.distance)));
   const path=window.JalanRouteDisplay.shape(route),end=travelFraction*path.total;
   const coordinates=window.JalanRouteDisplay.section(path,0,end);
   const passed=coordinates.map(p=>L.latLng(p[1],p[0]));
   if(passed.length<2)return;
   if(!travelled)travelled=L.polyline(passed,{jalanRouteScale:1,smoothFactor:0,color:'#8293aa',weight:9,opacity:1,interactive:false,
     pane:'passenger-travelled',className:'jalan-travelled-route'}).addTo(map);
   else travelled.setLatLngs(passed);
 };
 window.addEventListener('jalan:gps-fix',()=>requestAnimationFrame(paintTravelled));
 const previousTrail=L.layerGroup().addTo(map);
 window.addEventListener('jalan:archive-trail',event=>{
   const {reason,previous}=event.detail;
   if(reason==='arrived'&&previous?.pinnedStop&&travelled&&travelRoute===previous){
     const path=window.JalanRouteDisplay.shape(previous),end=path.lengths[previous.pinnedStop.index];
     if(Math.abs(end-path.total*travelFraction)<150)
       travelled.setLatLngs(window.JalanRouteDisplay.section(path,0,end).map(([lon,lat])=>L.latLng(lat,lon)));
   }
   if(travelled){previousTrail.addLayer(travelled);travelled=null;}
 });
 for(const name of ['jalan:journey-start','jalan:journey-stop','jalan:route-cleared'])
   window.addEventListener(name,()=>previousTrail.clearLayers());
 window.addEventListener('jalan:journey-start',clearTravelled);
 window.addEventListener('jalan:journey-stop',clearTravelled);
 window.addEventListener('jalan:route-cleared',clearTravelled);
 // An atomic off-route swap emits route-change before its next GPS fix.
 // Never leave the *old route's* travelled overlay drawn on the new route.
 window.addEventListener('jalan:route-change',clearTravelled);
 // Reuse the existing opt-in page-load one-shot geolocation. A pre-route
 // location triangle represents a measured position, never inferred heading
 // or route-matched driving accuracy.
 const screenVehicle=el('passenger-vehicle-screen');
 const guidedShape=screenVehicle.querySelector('svg');
 const freeShape=guidedShape.cloneNode(true);
 // Local ground coordinates (right, forward is negative Y, height above road).
 // The first three vertices form the footprint, the next three its raised rim.
 const vehicleVertices=[[0,-34,0],[27,23,0],[-27,23,0],
   [0,-34,10],[27,23,6],[-27,23,6],[0,11,20]];
 const vehicleFaces=[
   [[4,3,0,1],[5,4,1,2],[3,5,2,0]], // side walls
   [[3,6,5]], [[3,4,6]], [[4,5,6]] // left, right and tail facets
 ];
 function drawVehicleShape(svg,heading,pitch,centerInHalo=false){
   const degrees=Math.PI/180;
   const turn=(heading%360+360)%360;
   const tilt=pitch;
   if(svg.dataset.heading===String(turn)&&svg.dataset.pitch===String(tilt))return false;
   svg.dataset.heading=turn;svg.dataset.pitch=tilt;
   const c=Math.cos(turn*degrees),s=Math.sin(turn*degrees);
   const cp=Math.cos(tilt*degrees),sp=Math.sin(tilt*degrees);
   const points=vehicleVertices.map(([x,y,z])=>[x*c-y*s,(x*s+y*c)*cp-z*sp]);
   // The startup halo is centered on GPS. Center the visible 3D silhouette
   // inside it as its projected bounds change with heading and camera pitch.
   if(centerInHalo){
     const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
     const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
     svg.setAttribute('viewBox',`${cx-42} ${cy-42} 84 84`);
   }
   function visiblePath(indices){
     const [a,b,c]=indices.map(i=>points[i]);
     if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<=0.01)return '';
     return 'M'+indices.map(i=>points[i].map(n=>n.toFixed(2)).join(' ')).join('L')+'Z';
   }
   const faces=vehicleFaces.map(group=>group.map(visiblePath).join(''));
   svg.children[0].setAttribute('d',faces.join(''));
   faces.forEach((face,i)=>svg.children[i+1].setAttribute('d',face));
   return true;
 }
 const startupPosition={ready:false};
 window.JalanPassengerStartup=startupPosition;
 let startupMarker=null,locationPending=true;
 let startupTimestamp=-Infinity;
 let freeLast=null,freeHeading=null,freeExploring=false,freeReturn=null;
 const drawFreeVehicle=svg=>{
   const vector=window.JalanVectorMap;
   if(svg)drawVehicleShape(svg,(freeHeading||0)-(vector?.active?vector.getBearing():0),
     vector?.active?vector.getPitch():0,true);
 };
 const freeActive=()=>!destination&&!routes.length&&!document.body.classList.contains('passenger-guiding');
 const centerFree=()=>{
   if(!document.body.classList.contains('passenger-pin-open')&&freeActive()&&freeLast&&Date.now()-freeLast.timestamp<=15000&&!document.hidden){
     freeExploring=false;map.panTo(freeLast.point,{animate:false});
   }
 };
 const exploreFree=()=>{if(freeActive()){freeExploring=true;clearTimeout(freeReturn);}};
 const releaseFree=()=>{if(freeActive()&&freeExploring){clearTimeout(freeReturn);freeReturn=setTimeout(centerFree,3000);}};
 map.on('dragstart',exploreFree);map.on('dragend',releaseFree);
 window.addEventListener('jalan:vector-gesture',exploreFree);
 window.addEventListener('jalan:vector-gesture-end',releaseFree);
 window.addEventListener('pointerdown',()=>{if(freeActive())clearTimeout(freeReturn);},{passive:true});
 window.addEventListener('pointerup',releaseFree,{passive:true});
 window.addEventListener('pointercancel',releaseFree,{passive:true});
 const clearStartupMarker=()=>{
   if(startupMarker){map.removeLayer(startupMarker);startupMarker=null;}
 };
 const locationConfidence=detail=>Array.isArray(detail?.point)&&detail.point.length===2&&
   detail.point.every(Number.isFinite)&&Number.isFinite(detail.accuracy)&&
   detail.accuracy>=0&&detail.accuracy<=75&&
   Number.isFinite(detail.timestamp)&&Math.abs(Date.now()-detail.timestamp)<=15000;
 window.addEventListener('jalan:initial-location',event=>{
   const detail=event.detail;
   if(document.body.classList.contains('passenger-guiding')||destination||routes.length)return;
   locationPending=false;
   clearStartupMarker();
   startupPosition.ready=locationConfidence(detail);
   if(startupPosition.ready){startupTimestamp=detail.timestamp;freeLast=detail;}
   // The original public location circle cannot masquerade as a trusted fix.
   if(locationMarker){pointLayer.removeLayer(locationMarker);locationMarker=null;}
   if(!startupPosition.ready){
     return;
   }
   drawFreeVehicle(freeShape);
   const icon=L.divIcon({className:'passenger-startup-pin',html:freeShape.outerHTML,
     iconSize:[84,84],iconAnchor:[42,42]});
   startupMarker=L.marker(detail.point,{icon,interactive:false,keyboard:false,
     title:'GPS location measured; direction not yet verified'}).addTo(map);
 });
 window.addEventListener('jalan:initial-location-error',()=>{
   if(!locationPending)return;
   locationPending=false;
   startupPosition.ready=false;clearStartupMarker();
 });
 window.addEventListener('jalan:free-location',event=>{
   const detail=event.detail;
   if(document.body.classList.contains('passenger-guiding')||destination||routes.length||
      !locationConfidence(detail)||detail.timestamp<startupTimestamp)return;
   const previous=freeLast;
   let heading=null;
   if(Number.isFinite(detail.heading)&&detail.heading>=0&&detail.heading<360&&detail.speed>=1)
     heading=detail.heading;
   else if(previous&&detail.timestamp>previous.timestamp&&detail.timestamp-previous.timestamp<=30000){
     const a=L.latLng(previous.point),b=L.latLng(detail.point);
     if(a.distanceTo(b)>=Math.max(5,Math.min(20,detail.accuracy))){
       const rad=Math.PI/180,p=a.lat*rad,q=b.lat*rad,dl=(b.lng-a.lng)*rad;
       heading=(Math.atan2(Math.sin(dl)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(dl))/rad+360)%360;
     }
   }
   if(heading!==null)freeHeading=heading;
   freeLast=detail;
   startupTimestamp=detail.timestamp;
   if(!startupMarker){
     window.dispatchEvent(new CustomEvent('jalan:initial-location',{detail}));
   }else startupMarker.setLatLng(detail.point);
   scheduleScreenVehicle();
   if(!freeExploring)centerFree();
   // Keep the original blue location circle from duplicating the triangle.
   if(locationMarker){pointLayer.removeLayer(locationMarker);locationMarker=null;}
 });
 window.addEventListener('jalan:routes-rendered',()=>{
   clearStartupMarker();
 });
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
 // Create the vehicle only after receiving an accepted measured position.
 let vehicle=null,accuracyHalo=null,lastValidHeading=null,directionSource='unavailable';
 let routeLineMuted=false;
 let exploring=false,lastGPSDetail=null,returnTimer=null,returnPending=false;
 const mapContacts=new Set();
 const cancelAutoReturn=()=>{clearTimeout(returnTimer);returnTimer=null;returnPending=false;};
 const syncMapAction=()=>{
   const visible=!screenVehicle.classList.contains('hidden');
   document.body.classList.toggle('passenger-following-location',
     document.body.classList.contains('passenger-guiding')&&!exploring&&visible);
 };
 const gestureSurface=el('passenger-map-gestures'),hint=el('passenger-gesture-hint');
 let pendingOverlay=false;
 const syncScreenVehicle=()=>{
   const vector=window.JalanVectorMap;
   const anchor=vehicle?.getElement();
   if(!vehicle||!document.body.classList.contains('passenger-guiding')){
     if(startupMarker){
       const pin=vector?.active?vector.getMarkerElement(startupMarker):startupMarker.getElement();
       drawFreeVehicle(pin?.querySelector('.jalan-vehicle-shape'));
     }
     screenVehicle.classList.add('hidden');syncMapAction();return;
   }
   const bounds=(vector?.active?map.getContainer():anchor)?.getBoundingClientRect();
   const point=vector?.active?vector.project(vehicle.getLatLng()):null;
   let x=bounds&&(bounds.left+(point?point.x:bounds.width/2));
   let y=bounds&&(bounds.top+(point?point.y:bounds.height/2));
   const pitch=vector?.active?vector.getPitch():
     (document.body.classList.contains('passenger-map-flat')?0:17*viewSettings.tilt/100);
   drawVehicleShape(guidedShape,(lastValidHeading||0)+currentCameraAngle(),pitch);
   const maxX=window.innerWidth,maxY=window.innerHeight;
   if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>maxX||
     y<0||y>maxY){
     if(exploring||focusedReport){screenVehicle.classList.add('hidden');syncMapAction();return;}
     // A renderer can briefly lose its projection while the follow camera moves.
     // Keep the triangle visible at its normal follow position for that frame.
     x=maxX/2;y=viewAnchor().y;
   }
   screenVehicle.style.transform='translate3d('+x+'px,'+y+'px,0) translate(-50%,-50%)';
   screenVehicle.classList.remove('hidden');syncMapAction();
 };
 const scheduleScreenVehicle=()=>{
   if(window.JalanVectorMap?.active){window.JalanVectorMap.requestFrame();return;}
   if(pendingOverlay)return;
   pendingOverlay=true;
   requestAnimationFrame(()=>{
     pendingOverlay=false;
     if(!window.JalanVectorMap?.active)syncScreenVehicle();
   });
 };
 // The native camera advances within its own animation frame. Paint the
 // overlay before that frame is presented, including during pinch inertia.
 window.addEventListener('jalan:vector-render',syncScreenVehicle);
 map.on('move zoom zoomend moveend resize',()=>{
   if(!window.JalanVectorMap?.active)scheduleScreenVehicle();
 });
 const currentCameraAngle=()=>window.JalanVectorMap?.active?-window.JalanVectorMap.getBearing():Number.parseFloat(map.getContainer().style.getPropertyValue('--jalan-camera-turn'))||0;
 const applyCameraAngle=degrees=>{
   const angle=((degrees+180)%360+360)%360-180;
   const previous=currentCameraAngle();
   const delta=((angle-previous+540)%360)-180;
   // Avoid retransforming every raster tile on sub-degree GPS heading jitter.
   if(Math.abs(delta)>=1.2||!map.getContainer().style.getPropertyValue('--jalan-camera-turn'))
     map.getContainer().style.setProperty('--jalan-camera-turn',angle+'deg');
   map.getContainer().style.setProperty('--jalan-raster-pitch',(17*viewSettings.tilt/100)+'deg');
   const cameraAnchor=viewAnchor();
   const vector=window.JalanVectorMap;
   if(vector?.active){
     const guiding=document.body.classList.contains('passenger-guiding');
     const flat=document.body.classList.contains('passenger-map-flat');
     vector.setCamera({bearing:-angle,pitch:!guiding||flat||focusedReport?0:exploring?vector.getPitch():viewModel.pitch(viewSettings.tilt),
       padding:guiding?cameraAnchor.padding:
         {top:0,bottom:0,left:0,right:0}});
   }
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
 const setRouteMuted=muted=>{
   if(routeLineMuted===muted)return;
   routeLineMuted=muted;
   if(!document.body.classList.contains('passenger-guiding'))return;
   routeLayer.getLayers().forEach((line,i)=>{
     if(typeof line.setStyle==='function')line.setStyle({
       opacity:i===selectedRoute?(muted?0.25:1):0
     });
   });
 };
 function markVehicleUncertain(){
   if(!vehicle)return;
   vehicle.getElement()?.classList.add('jalan-vehicle-uncertain');
   screenVehicle.classList.add('passenger-vehicle-uncertain');
   accuracyHalo?.setStyle({color:'#8090a0',fillColor:'#8090a0'});
 }
 function discardVehicle(){
   if(vehicle){map.removeLayer(vehicle);vehicle=null;}
   if(accuracyHalo){map.removeLayer(accuracyHalo);accuracyHalo=null;}
   lastValidHeading=null;
   directionSource='unavailable';
   map.getContainer().style.removeProperty('--jalan-camera-turn');
   screenVehicle.classList.add('hidden');syncMapAction();
   screenVehicle.classList.remove('passenger-vehicle-uncertain');
   routeLineMuted=false;
 }
 function updateVehicle(detail){
   const state=window.JalanGPS?.getState();
   // Measured GPS can remain reliable while the old route is NOT matched.
   // No new point is synthesized from the predictor during a wrong turn.
   const valid=state?.active&&detail?.gpsReliable&&
     Number.isFinite(detail.gpsAccuracy)&&detail.gpsAccuracy<=65&&
     Array.isArray(detail.gpsPosition)&&detail.gpsPosition.length===2&&
     detail.gpsPosition.every(Number.isFinite);
   if(!valid){markVehicleUncertain();return false;}
   const position=detail.vehiclePosition||detail.gpsPosition;
   if(!vehicle)vehicle=L.marker(position,{icon:vehicleIcon,interactive:false,
     keyboard:false,zIndexOffset:950}).addTo(map);
   else vehicle.setLatLng(position);
   if(!accuracyHalo)accuracyHalo=L.circle(position,{radius:Math.max(5,detail.gpsAccuracy),
     className:'jalan-vehicle-accuracy',color:'#13a8d1',fillColor:'#13a8d1',fillOpacity:0.08,weight:1,
     interactive:false}).addTo(map);
   else accuracyHalo.setLatLng(position).setRadius(Math.max(5,detail.gpsAccuracy))
     .setStyle({color:'#13a8d1',fillColor:'#13a8d1'});
   vehicle.getElement()?.classList.remove('jalan-vehicle-uncertain');
   screenVehicle.classList.toggle('passenger-vehicle-uncertain',detail.vehicleCertain===false);
   const heading=detail.vehicleHeading??detail.heading,speed=detail.speedMps;
   // GPS heading is meaningful only when actually moving. At low speed use
   // the direction of the selected route segment, explicitly an estimate.
   const gpsHeadingReliable=Number.isFinite(heading)&&heading>=0&&heading<360&&
     (Number.isFinite(detail.vehicleHeading)||(Number.isFinite(speed)&&speed>=2.5));
   const ahead=detail.matched&&!gpsHeadingReliable&&lastValidHeading===null?routeAheadCenter(position,60):position;
   const x=(ahead[1]-position[1])*Math.cos(position[0]*Math.PI/180);
   const y=ahead[0]-position[0];
   const alongMeters=Math.hypot(x,y)*111320;
   const routeBearing=Number.isFinite(alongMeters)&&alongMeters>=12?
     (Math.atan2(x,y)*180/Math.PI+360)%360:null;
   if(gpsHeadingReliable){
     lastValidHeading=heading;
     directionSource='gps';
   }else if(lastValidHeading!==null){
     // At low speed the last reliable bearing is safer than an old route.
     directionSource='held';
   }else if(detail.matched&&routeBearing!==null){
     lastValidHeading=routeBearing;
     directionSource='route';
   }else{
     directionSource='unavailable';
   }
   const symbol=vehicle.getElement()?.querySelector('.jalan-vehicle-symbol');
   if(symbol){symbol.dataset.heading=directionSource;symbol.textContent='▲';}
   const guiding=document.body.classList.contains('passenger-guiding')&&
     !document.body.classList.contains('passenger-map-flat');
   if(!exploring)applyCameraAngle(guiding&&lastValidHeading!==null?-lastValidHeading:0);
   // GPS must not jump the native camera while passenger manually explores.
   scheduleScreenVehicle();
   return true;
 }
 function refreshOverview(){
   routeLabels.clearLayers();
   if(!routes.length||document.body.classList.contains('passenger-guiding')){
     overview.classList.add('hidden');return;
   }
   overview.classList.remove('hidden');
   const valid=routes.filter(r=>Number.isFinite(r.duration));
   const fastest=valid.length?Math.min(...valid.map(r=>r.duration)):null;
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
     const toll=document.createElement('small');
     toll.textContent=r.tolls===true?'Has Tolls':r.tolls===false?'Toll-Free':'Toll info unavailable';
     left.append(bold,small,toll);
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
   document.body.style.removeProperty('--passenger-map-footer-offset');
   window.JalanVectorMap?.setCamera({pitch:0,bearing:0,padding:{top:0,bottom:0,left:0,right:0}});
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
   if(item.source!=='camera')L.circleMarker([item.lat,item.lng],{radius:12,color:'#fff',weight:3,
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
   const cameraCredit=el('passenger-camera-credit');cameraCredit.hidden=true;
   const state=window.JalanGPS?.getState?.(),route=state?.route,
         coords=route?.geometry?.coordinates;
   if(!state?.active||!Array.isArray(coords)){
     reportNote.hidden=false;reportNote.textContent='Choose a route to see reports.';
     return;
   }
   const current=state.matched&&state.fixAgeMs<=10000&&state.accuracy<=75&&Array.isArray(state.position)?
     pointOnRoute(state.position,coords):null;
   const items=window.JalanSpeedCameras?.routeItems(route)||[];
   cameraCredit.hidden=!items.length;
   // Local community reports are demo records, NOT verified incidents.
   for(const report of (typeof getReports==='function'?getReports():[])){
     if(!report||!['accident','flood','hazard','rain'].includes(report.type))continue;
     items.push({lat:Number(report.lat),lng:Number(report.lng),
       title:report.type.toUpperCase()+' · unverified demo report',
       detail:'Local demonstration report',source:'demo',category:report.type});
   }
   for(const report of window.JalanCommunityReports?.routeItems?.()||[]){
     const type=window.JalanReportModel.types[report.type];
     items.push({lat:report.position[1],lng:report.position[0],title:window.JalanReportModel.reportLabel(report.type,report.trafficSeverity)+(report.type==='traffic'?' · '+(report.status==='confirmed'?'Confirmed':'Reported'):'')+' · '+report.contributors+' community report'+(report.contributors===1?'':'s'),detail:'Community report · expires '+new Date(report.expiresAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),routeAlong:report.routeAlong,routeTotal:report.routeTotal,source:'community',icon:type.icon,category:report.trafficSeverity||report.type});
   }
   const freshIncidents=incidentSnapshot.route===route&&
     Date.now()-incidentSnapshot.checkedAt<=10*60*1000?incidentSnapshot.incidents:[];
   for(const incident of freshIncidents){
     items.push({lat:Number(incident.lat),lng:Number(incident.lng),
       title:String(incident.issue||'Traffic Incident').slice(0,80),
       detail:String(incident.detail||incident.description||incident.roadName||'').slice(0,180),
       icon:incident.category,category:incident.trafficSeverity||incident.reportType||'incident',
       routeAlong:incident.routeAlong,routeTotal:incident.routeTotal,source:'tomtom'});
   }
   const positioned=[];
   for(const item of items){
     if(!Number.isFinite(item.lat)||!Number.isFinite(item.lng)||
        Math.abs(item.lat)>90||Math.abs(item.lng)>180)continue;
     // A provider TRAFFIC section is associated with this exact TomTom route.
     // Never re-filter that section with the old 25m corridor.
     // The local unverified demo reports retain their own proximity check.
     if(item.source!=='demo'&&!(Number.isFinite(item.routeAlong)&&
        Number.isFinite(item.routeTotal)&&item.routeTotal>0&&
        item.routeAlong>=0&&item.routeAlong<=item.routeTotal))continue;
     const projected=item.source!=='demo'?
       {along:item.routeAlong,total:item.routeTotal,offset:0}:
       pointOnRoute([item.lat,item.lng],coords);
     if(item.source==='camera'){
       const progress=window.JalanSpeedCameras.currentProgress(route);
       positioned.push({...item,ahead:progress===null?null:Math.max(0,item.routeAlong-progress)});
       continue;
     }
     if(!projected||(item.source==='demo'&&
        projected.offset>window.JalanTomTom.reportRouteTolerance)||
        (current&&projected.along<current.along-30))continue;
     positioned.push({...item,ahead:current?Math.max(0,projected.along-current.along):null,routeAlong:projected.along});
   }
   positioned.sort((a,b)=>a.routeAlong-b.routeAlong);
   for(const item of positioned.slice(0,40)){
     const li=document.createElement('li'),button=document.createElement('button'),
           marker=document.createElement('span'),
           info=document.createElement('div'),title=document.createElement('strong'),
           distances=document.createElement('small'),detail=document.createElement('small');
     marker.className='turn-list-arrow';marker.textContent=item.icon||(item.source==='demo'?'⚠️':'🚧');
     marker.setAttribute('aria-hidden','true');
     button.type='button';button.className='passenger-report-button';button.dataset.category=item.category;
     button.addEventListener('click',()=>focusReport(item,route));
     title.textContent=item.title;
     distances.textContent=item.ahead===null?'Waiting for GPS distance':'In '+fmtDist(item.ahead);
     detail.textContent=item.detail;
     info.append(title,distances);if(item.detail)info.append(detail);button.append(marker,info);
     li.appendChild(button);reportList.appendChild(li);
   }
   reportNote.hidden=positioned.length>0;
   reportNote.textContent=positioned.length?'':'No reports to show on this route.';
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
 const turnIcon=(action,step)=>{
   const direction=window.JalanManeuvers.audioKey(step,action.replace(/^\d+(?:[.,]\d+)?\s*(?:m|km):\s*/i,''));
   if(direction==='uturn')return '↶';
   if(direction==='roundabout')return '⟳';
   if(direction.endsWith('left'))return '↰';
   if(direction.endsWith('right'))return '↱';
   return direction==='arrive'?'⚑':'↑';
 };
 const closeDirections=()=>{
   if(turnList.classList.contains('hidden'))return false;
   turnList.classList.add('hidden');
   turnToggle.setAttribute('aria-expanded','false');
   if(turnList.contains(document.activeElement))turnToggle.focus({preventScroll:true});
   return true;
 };
 window.JalanPassengerRouteInfo={close:closeDirections};
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
     arrow.className='turn-list-arrow';arrow.textContent=step.arrival?'⚑':turnIcon(step.action||'',step.step);
     const english=String(step.action||'Continue');
     window.JalanLanguage.write(name,english,window.JalanManeuvers.action(step.step,english,'ms'));
     distance.textContent='In '+fmtDist(step.distanceMeters);
     info.append(name,distance);li.append(arrow,info);maneuverList.appendChild(li);
   }
 };
 turnToggle.addEventListener('click',()=>{
   window.JalanPassengerMenu?.close();
   const open=turnList.classList.contains('hidden');
   if(open){selectInfoTab('reports');turnList.classList.remove('hidden');}
   else closeDirections();
   turnToggle.setAttribute('aria-expanded',String(open));
 });
 // Consume a map click used to dismiss the panel before it selects a route or marker.
 const dismissOnMapClick=event=>{
   if(event.target.closest('a,.leaflet-control,.maplibregl-ctrl')||!closeDirections())return;
   event.preventDefault();event.stopPropagation();
 };
 map.getContainer().addEventListener('click',dismissOnMapClick,true);
 gestureSurface.addEventListener('click',dismissOnMapClick,true);
 document.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&closeDirections()){event.preventDefault();turnToggle.focus({preventScroll:true});}
 });
  const syncGPS=(fix=null)=>{
   if(!document.body.classList.contains('passenger-guiding'))return;
   const message=el('gps-instruction').textContent||'Acquiring GPS…';
   const malay=window.JalanGPS?.malayInstruction?.(message);
   window.JalanLanguage.write(el('passenger-instruction'),message,malay);
   el('passenger-next').textContent=(el('gps-detail').textContent||'Route preview')
     .replace(/\s*·\s*GPS matched to selected route\s*$/,'');
   el('passenger-eta').textContent=el('gps-eta').textContent||'—';
   el('passenger-distance').textContent=el('gps-distance').textContent||'—';
   const state=window.JalanGPS?.getState();
   const matched=state?.matched&&Number.isFinite(state.accuracy)&&state.accuracy<=75&&state.fixAgeMs<10000;
   const measured=state?.active&&fix?.gpsReliable&&Number.isFinite(fix.gpsAccuracy)&&fix.gpsAccuracy<=65;
   el('passenger-fix').textContent=!measured?
     'GPS uncertain · grey triangle shows last known position only':
     !matched?'GPS measured independently · route alignment pending':
     directionSource==='gps'?'GPS matched · heading-up experimental preview':
     directionSource==='route'?'GPS matched · road direction estimated from route':
     'GPS matched · direction held or unavailable';
   // Before the first GPS callback the chosen route remains clearly visible.
   // Dim it only once a fix shows the old road alignment is unverified.
   if(fix&&(matched||measured))setRouteMuted(!matched);
   const speed=fix?.gpsReliable&&Number.isFinite(fix.speedMps)&&fix.speedMps>=0?
     String(Math.round(fix.speedMps*3.6)):'—';
   el('passenger-speed').textContent=speed;
   el('passenger-speed-floating').firstElementChild.setAttribute('aria-label',speed==='—'?
     'Speed unavailable':speed+' kilometres per hour');
   el('passenger-turn-arrow').textContent=turnIcon(message,window.JalanGPS?.instructionStep?.(message));
   if(!turnList.classList.contains('hidden')){
     if(activeInfoTab==='reports')renderReports();else renderDirections();
   }
   window.JalanLanguage.write(el('passenger-turn-details'),message,malay);
 };
 // Passenger controls mirror the existing engineering GPS buttons; no
 // duplicate voice engine. Explicit Go enables off-route recovery for the trip.
 const voiceControl=el('passenger-voice'),autoControl=el('passenger-auto-reroute'),
       rerouteStatus=el('passenger-reroute-status');
 const syncNavigationSettings=()=>{
   const voiceButton=el('gps-voice'),autoButton=el('gps-auto');
   voiceControl.textContent=voiceButton.textContent.replace('Voice:','Sound:');
   voiceControl.setAttribute('aria-pressed',voiceButton.getAttribute('aria-pressed')||'false');
   autoControl.textContent=autoButton.textContent;
   autoControl.setAttribute('aria-pressed',autoButton.getAttribute('aria-pressed')||'false');
 };
 voiceControl.addEventListener('click',()=>window.JalanPassengerSound?.open());
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
 window.addEventListener('jalan:community-flow',()=>{
   if(!document.body.classList.contains('passenger-guiding'))return;
   el('passenger-eta').textContent=el('gps-eta').textContent||'—';
   el('passenger-next').textContent=(el('gps-detail').textContent||'Route preview').replace(/\s*·\s*GPS matched to selected route\s*$/,'');
 });
 window.addEventListener('jalan:camera-reports',()=>{if(!turnList.classList.contains('hidden')&&activeInfoTab==='reports')renderReports();});
 window.addEventListener('jalan:community-reports',()=>{if(!turnList.classList.contains('hidden')&&activeInfoTab==='reports')renderReports();});
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
 let trafficOptOut=false;
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
   routeLineMuted=false;
   setRouteMuted(!window.JalanGPS?.getState()?.matched);
   hideTrafficOffer();clearLiveEta();clearReportFocus();refreshDemoReportMarkers();
   const state=window.JalanGPS?.getState();
   if(state?.active&&state.vehiclePosition&&lastGPSDetail){
     lastGPSDetail={...lastGPSDetail,vehiclePosition:state.vehiclePosition,vehicleCertain:false,matched:false};
     updateVehicle(lastGPSDetail);followPassengerGPS(lastGPSDetail);
   }
 });
 window.addEventListener('jalan:route-cleared',()=>{clearReportFocus();passengerDemoReports.clearLayers();});
 window.addEventListener('jalan:route-decline',hideTrafficOffer);
 syncTraffic();
 el('passenger-go').addEventListener('click',()=>{
   if(!routes.length||window.JalanTollChoices?.blocked)return;
   trafficOptOut=false;
   // The owner's explicit Go starts normal detour recovery. The menu can
   // disable it during this journey; internal GPS restarts never re-enable it.
   if(el('gps-auto').getAttribute('aria-pressed')!=='true')el('gps-auto').click();
   syncNavigationSettings();
   el('gps-start').click();
   if(!window.JalanGPS?.getState()?.active){
     el('passenger-route-title').textContent='GPS unavailable · check browser permissions';
   }
 });
 window.addEventListener('jalan:journey-start',()=>{
   map.options.zoomSnap=0;
   closeDirections();
   clearReportFocus();
   incidentSnapshot={route:null,incidents:[],checkedAt:0};
   window.JalanPassengerMenu?.close();
   clearLiveEta();
   syncNavigationSettings();
   rerouteStatus.dataset.state='idle';
   rerouteStatus.textContent=autoControl.getAttribute('aria-pressed')==='true'?
     'Auto rerouting enabled · watching for sustained deviation.':
     'Auto rerouting off · manual Recalculate available.';
   cancelAutoReturn();mapContacts.clear();exploring=false;lastGPSDetail=null;hint.textContent='Drag · pinch · twist to explore · Recenter to resume following';
   discardVehicle();
   if(!routes.length)return;
   hidePlannerMarkers();
   map.removeLayer(reportLayer);
   refreshDemoReportMarkers();
   // The selected road remains prominent, while unused grey alternatives
   // are hidden during Go. Route overview regains them after preview exits.
   routeLayer.getLayers().forEach((line,i)=>{
     if(typeof line.setStyle==='function')line.setStyle(i===selectedRoute?
       {color:'#087af5',opacity:1}:{opacity:0});
   });
   routeLabels.clearLayers();
   overview.classList.add('hidden');
   navigation.classList.remove('hidden');
   document.body.classList.add('passenger-guiding');
   routeLineMuted=false;
   syncViewMode();
   syncGPS();
   applyCameraAngle(0);
   scheduleScreenVehicle();
   if(!trafficOptOut)startPassengerTraffic();
 });
 window.addEventListener('jalan:journey-stop',()=>{
   closeDirections();
   clearReportFocus();
   passengerDemoReports.clearLayers();
   if(!map.hasLayer(reportLayer))reportLayer.addTo(map);
   window.JalanPassengerMenu?.close();
   clearLiveEta();
   hideTrafficOffer();
   stopPassengerTraffic();
   cancelAutoReturn();mapContacts.clear();exploring=false;lastGPSDetail=null;
   discardVehicle();
   document.body.classList.remove('passenger-guiding','passenger-map-flat');
   document.body.style.removeProperty('--passenger-map-footer-offset');
   window.JalanVectorMap?.setCamera({pitch:0,bearing:0,padding:{top:0,bottom:0,left:0,right:0}});
   restorePlannerMarkers();
   routeLayer.getLayers().forEach((line,i)=>{
     if(typeof line.setStyle==='function')line.setStyle(i===selectedRoute?
       {color:'#2563eb',opacity:0.95}:
       {color:'#94a3b8',opacity:0.65});
   });
   navigation.classList.add('hidden');
 });
 // Only fresh accepted measured GPS may control the follow camera.
 // Camera offsets and view preferences never supply a GPS measurement
 // or establish legal road, lane or turn evidence.
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
   if(exploring||!document.body.classList.contains('passenger-guiding'))return;
   const state=window.JalanGPS?.getState();
   if(!state?.active||!state.gpsReliable||!Number.isFinite(state.gpsFixAgeMs)||state.gpsFixAgeMs>10000||!detail?.gpsReliable||
      !Number.isFinite(detail.gpsAccuracy)||detail.gpsAccuracy>65||
      !Array.isArray(detail.gpsPosition)||detail.gpsPosition.length!==2||
      !detail.gpsPosition.every(Number.isFinite))return;
   // Centre the native camera on the measured vehicle with viewport padding;
   // invert raster perspective so both renderers leave the triangle above the bar.
   const targetZoom=navigationZoom(),center=navigationCenter(detail.vehiclePosition||detail.gpsPosition,targetZoom);
   // A preceding route-overview fitBounds() may still be animating; cancel
   // it before taking ownership of the passenger camera.
   // The previous update called map.stop() + setView(...zoom17) for *every*
   // matched GPS fix. Safari repeatedly repainted raster tiles and flashed.
   // Respect the current zoom, changing camera only when the vehicle moved.
   const zoom=map.getZoom();
   const camera=map.getCenter(),dx=(camera.lng-center[1])*111320*Math.cos(center[0]*Math.PI/180),
         dy=(camera.lat-center[0])*111320;
   if(!Number.isFinite(zoom)||Math.abs(zoom-targetZoom)>.01)map.setView(center,targetZoom,{animate:false});
   else if(Math.hypot(dx,dy)>8)map.panTo(center,{animate:false});
   scheduleScreenVehicle();
 };
 window.addEventListener('jalan:gps-fix',event=>{
   lastGPSDetail=event.detail;
   if(returnPending&&!mapContacts.size&&!gesture&&!document.hidden)recenterPassenger();
   // The follow camera tracks accepted GPS during route matching and rerouting.
   if(updateVehicle(event.detail))followPassengerGPS(event.detail);
   requestAnimationFrame(()=>syncGPS(event.detail));
 });
 // iOS may suspend geolocation when Safari is backgrounded or the screen
 // locks. An old trusted marker must never continue looking like live GPS.
 const expireStalePassengerGPS=()=>{
   if(!document.body.classList.contains('passenger-guiding'))return;
   const state=window.JalanGPS?.getState();
   if(state?.active&&lastGPSDetail?.gpsReliable&&
      Number.isFinite(state.gpsFixAgeMs)&&state.gpsFixAgeMs<=10000&&!document.hidden)return;
   markVehicleUncertain();
   el('passenger-fix').textContent=document.hidden?
     'Safari in background · last-known position only':
     'GPS stale or unavailable · grey triangle is last-known position only';
   hint.textContent='GPS follow paused · waiting for a fresh location update';
 };
 setInterval(expireStalePassengerGPS,2000);
 document.addEventListener('visibilitychange',expireStalePassengerGPS);
 // Heading-up map: custom touch gestures because Leaflet's 2-D hit-testing
 // does not match a CSS-tilted/rotated perspective. Gesture exploration
 // pauses follow until three seconds after release or an explicit Recenter.
 let gesture=null;
 const snapshot=touches=>{
   const a=touches[0],b=touches[1];
   const x=b?(a.clientX+b.clientX)/2:a.clientX;
   const y=b?(a.clientY+b.clientY)/2:a.clientY;
   return {x,y,n:touches.length,distance:b?Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY):0,
     angle:b?Math.atan2(b.clientY-a.clientY,b.clientX-a.clientX)*180/Math.PI:0};
 };
 const startExplore=(stopCamera=true)=>{
   if(!document.body.classList.contains('passenger-guiding'))return false;
   cancelAutoReturn();clearReportFocus();exploring=true;syncMapAction();
   // A MapLibre gesture is already underway when its start event fires.
   // Calling gl.stop() here would interrupt drag, pinch or rotation.
   if(stopCamera)map.stop();
   hint.textContent='Exploring map · returns to your location 3 seconds after release';
   return true;
 };
 const queueAutoReturn=()=>{
   if(document.body.classList.contains('passenger-pin-open')||returnTimer||!exploring||focusedReport||mapContacts.size||gesture||document.hidden||
      !document.body.classList.contains('passenger-guiding'))return;
   returnTimer=setTimeout(()=>{returnTimer=null;returnPending=true;recenterPassenger();},3000);
 };
 window.addEventListener('jalan:pin-open',()=>{exploreFree();startExplore(false);});
 window.addEventListener('jalan:pin-close',()=>{releaseFree();queueAutoReturn();});
 window.addEventListener('jalan:vector-gesture',()=>{startExplore(false);});
 window.addEventListener('jalan:vector-gesture-end',queueAutoReturn);
 map.getContainer().addEventListener('pointerdown',event=>{
   mapContacts.add(event.pointerId);cancelAutoReturn();
 },true);
 const releaseMapContact=event=>{
   if(mapContacts.delete(event.pointerId)&&!mapContacts.size)queueAutoReturn();
 };
 window.addEventListener('pointerup',releaseMapContact);
 window.addEventListener('pointercancel',releaseMapContact);
 document.addEventListener('visibilitychange',()=>{
   if(document.hidden){cancelAutoReturn();mapContacts.clear();gesture=null;}
   else queueAutoReturn();
 });
 window.addEventListener('pagehide',cancelAutoReturn);

 window.addEventListener('jalan:map-renderer',()=>{
   applyCameraAngle(focusedReport||document.body.classList.contains('passenger-map-flat')?
     0:lastValidHeading===null?0:-lastValidHeading);
   el('passenger-2d').textContent=document.body.classList.contains('passenger-map-flat')?
     ('2.5D preview'):'2D map';
 });
 // The raster gesture surface suppresses synthetic clicks. Recognise a tap
 // here and pass a drag or pinch through to the existing map gesture handling.
 let panelTouch=null;
 gestureSurface.addEventListener('touchstart',event=>{
   panelTouch=null;
   if(!turnList.classList.contains('hidden')&&event.touches.length===1){
     panelTouch=snapshot(event.touches);
     if(event.cancelable)event.preventDefault();
     return;
   }
   if(!startExplore())return;
   if(event.cancelable)event.preventDefault();
   gesture={...snapshot(event.touches),pinchTotal:0};
 },{passive:false});
 gestureSurface.addEventListener('touchmove',event=>{
   if(panelTouch){
     const next=snapshot(event.touches);
     if(next.n===1&&Math.hypot(next.x-panelTouch.x,next.y-panelTouch.y)<10)return;
     const start=panelTouch;panelTouch=null;
     if(!startExplore())return;
     gesture={...start,pinchTotal:0};
   }
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
   if(panelTouch){
     const end=event.changedTouches[0],start=panelTouch;panelTouch=null;
     if(end&&!event.touches.length&&Math.hypot(end.clientX-start.x,end.clientY-start.y)<10)closeDirections();
     return;
   }
   gesture=event.touches.length?{...snapshot(event.touches),pinchTotal:0}:null;
   if(!gesture)queueAutoReturn();
 },{passive:false});
 gestureSurface.addEventListener('touchcancel',()=>{panelTouch=null;gesture=null;queueAutoReturn();});
 // Both 2D and 2.5D views use this gesture surface so rotating the map
 // does not invalidate Leaflet's original hit-testing.
 const recenterPassenger=()=>{
   clearReportFocus();
   clearTimeout(returnTimer);returnTimer=null;returnPending=true;
   if(mapContacts.size||gesture||document.hidden)return;
   hint.textContent='Following GPS · drag, pinch or twist to explore';
   const state=window.JalanGPS?.getState();
   const reliable=state?.active&&state.gpsReliable&&
     Number.isFinite(state.gpsAccuracy)&&state.gpsAccuracy<=65&&
     state.gpsFixAgeMs<=5000&&Array.isArray(state.gpsPosition)&&
     state.gpsPosition.length===2&&state.gpsPosition.every(Number.isFinite);
   if(!reliable||!lastGPSDetail?.gpsReliable){
     hint.textContent='Waiting for reliable GPS · cannot recenter yet';
     return;
   }
   returnPending=false;exploring=false;
   updateVehicle(lastGPSDetail);
   const flat=document.body.classList.contains('passenger-map-flat');
   applyCameraAngle(flat?0:lastValidHeading===null?0:-lastValidHeading);
   const target=state.vehiclePosition||state.gpsPosition;
   map.stop();
   const zoom=navigationZoom();
   map.setView(navigationCenter(target,zoom),zoom,{animate:false,reset:true});
   scheduleScreenVehicle();
 };
 el('passenger-recenter').addEventListener('click',recenterPassenger);
 el('passenger-recenter-floating').addEventListener('click',recenterPassenger);
 const setViewSetting=(key,value)=>{
   if(!['zoom','tilt'].includes(key)||!Number.isFinite(value))return;
   viewSettings=viewModel.sanitize({...viewSettings,[key]:value});if(viewSettings.tilt>0)lastTilt=viewSettings.tilt;
   try{localStorage.setItem(viewStorage,JSON.stringify(viewSettings));}catch{}
   if(document.body.classList.contains('passenger-guiding')){
     syncViewMode();
     applyCameraAngle(viewSettings.tilt===0?0:lastValidHeading===null?0:-lastValidHeading);
     if(lastGPSDetail?.gpsReliable)recenterPassenger();
     scheduleScreenVehicle();
   }
   window.dispatchEvent(new CustomEvent('jalan:navigation-view',{detail:{...viewSettings}}));
 };
 window.JalanPassengerCamera={getSettings:()=>({...viewSettings}),setSetting:setViewSetting};
 el('passenger-2d').addEventListener('click',()=>{gesture=null;setViewSetting('tilt',viewSettings.tilt===0?lastTilt:0);});
 const refreshViewLayout=()=>{
   if(!document.body.classList.contains('passenger-guiding')||exploring)return;
   applyCameraAngle(currentCameraAngle());
   if(lastGPSDetail)followPassengerGPS(lastGPSDetail);
 };
 window.addEventListener('resize',()=>requestAnimationFrame(refreshViewLayout));
 if(window.ResizeObserver)new ResizeObserver(()=>requestAnimationFrame(refreshViewLayout)).observe(el('passenger-journey-sheet'));
 el('passenger-stop').addEventListener('click',()=>window.JalanPassengerJourney?.stop());
 // Keep engineering test panels and private KL coordinate-GET panels untouched.
})();
