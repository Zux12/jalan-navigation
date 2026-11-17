/* Jalan V2: browser-only prototype. Public OSM Nominatim + OSRM demo services are for light testing only. */
const KL=[3.139,101.6869], map=L.map('map',{zoomControl:false}).setView(KL,12);
// Optional perspective preview: a visual tilt of the existing Leaflet map,
// not real 3-D terrain or an authority for driving. Disable map pointer input
// while tilted because Leaflet's 2-D hit testing does not match CSS perspective.
const passengerMode=new URLSearchParams(location.search).get('mode')==='passenger';
const perspectiveButton=document.getElementById('perspective-toggle');
const perspectiveNote=document.getElementById('perspective-note');
let perspectiveActive=false,manual2D=false,passengerLastRoutes=null;
function setPerspective(active){
 perspectiveActive=Boolean(active&&routes.length&&!document.body.classList.contains('nav-active'));
 document.body.classList.toggle('route-perspective',perspectiveActive);
 perspectiveButton.classList.toggle('hidden',!routes.length);
 perspectiveNote.classList.toggle('hidden',!perspectiveActive);
 perspectiveButton.textContent=perspectiveActive?'2D map':'3D-style view';
 perspectiveButton.setAttribute('aria-pressed',String(perspectiveActive));
 perspectiveButton.setAttribute('aria-label',perspectiveActive?'Switch to interactive 2D map':'Switch to tilted route perspective preview');
}
perspectiveButton.addEventListener('click',()=>{
 manual2D=perspectiveActive;
 setPerspective(!perspectiveActive);
});
window.addEventListener('jalan:journey-start',()=>setPerspective(false));

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
L.control.zoom({position:'bottomright'}).addTo(map);
const $=id=>document.getElementById(id), statusEl=$('status'), resultsEl=$('results'), routeEl=$('route-summary');
const reportLayer=L.layerGroup().addTo(map),routeLayer=L.layerGroup().addTo(map),pointLayer=L.layerGroup().addTo(map);
const reportTypes={accident:'🚗',flood:'🌊',hazard:'⚠️',rain:'🌧️'},storageKey='jalan-demo-reports-v1';
let reportMode=null,chooseStart=false, userLocation=null,locationMarker=null,startPoint=null,startMarker=null,destination=null,destinationName='',destinationMarker=null,routes=[],selectedRoute=0,watchId=null;
// A response from an old OSRM request must never supersede a TomTom route,
// a different destination, or an explicit Clear/Reset action.
let osrmAbort=null,osrmEpoch=0;
function cancelOSRMPending(){osrmEpoch++;osrmAbort?.abort();osrmAbort=null;}
const getReports=()=>{try{return JSON.parse(localStorage.getItem(storageKey)||'[]')}catch{return []}};
function showReport(r){const icon=L.divIcon({className:'report-marker',html:reportTypes[r.type]||'⚠️',iconSize:[32,32],iconAnchor:[16,16]});L.marker([r.lat,r.lng],{icon}).addTo(reportLayer).bindPopup(`${reportTypes[r.type]||''} ${r.type.toUpperCase()} (demo)<br>Unverified community report<br>${new Date(r.time).toLocaleString()}`)}
getReports().forEach(showReport);
for(const type of Object.keys(reportTypes)){$('report-'+type).addEventListener('click',()=>{reportMode=type;chooseStart=false;statusEl.textContent=`Tap the map to report ${type}.`})}
map.on('click',e=>{if(reportMode){const r={type:reportMode,lat:e.latlng.lat,lng:e.latlng.lng,time:Date.now()};const all=getReports();all.push(r);let stored=false;try{localStorage.setItem(storageKey,JSON.stringify(all));stored=true}catch{}showReport(r);statusEl.textContent=stored?`Demo ${reportMode} report saved in this browser.`:`Demo ${reportMode} report visible for this page only; browser storage unavailable.`;reportMode=null;return}if(chooseStart){chooseStart=false;setStart([e.latlng.lat,e.latlng.lng],'Chosen starting point');if(destination)calculateRoutes();}});
function setStart(point,label){startPoint=point;if(startMarker)pointLayer.removeLayer(startMarker);startMarker=L.marker(point,{icon:L.divIcon({className:'map-start-pin',html:'🟢',iconSize:[28,28],iconAnchor:[14,24]})}).addTo(pointLayer).bindPopup(label);statusEl.textContent=label+' selected.'}
function updateLocation(point){userLocation=point;if(locationMarker){pointLayer.removeLayer(locationMarker);locationMarker=null;}if(document.body.classList.contains('passenger-guiding'))return;locationMarker=L.circleMarker(point,{radius:8,color:'#fff',weight:3,fillColor:'#2563eb',fillOpacity:1}).addTo(pointLayer).bindPopup('Your location')}
function getGPS(center=false){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error('Location is not supported'));navigator.geolocation.getCurrentPosition(p=>{const point=[p.coords.latitude,p.coords.longitude];updateLocation(point);if(passengerMode)window.dispatchEvent(new CustomEvent('jalan:initial-location',{detail:{point,accuracy:p.coords.accuracy,timestamp:p.timestamp}}));if(center)map.setView(point,passengerMode?17:15);resolve(point)},()=>reject(new Error('Location unavailable. Allow location access or choose a starting point on the map.')),{enableHighAccuracy:true,timeout:14000})})}
$('locate').addEventListener('click',async()=>{statusEl.textContent='Finding your location…';try{await getGPS(true);statusEl.textContent='Location found.'}catch(e){statusEl.textContent=e.message}});
$('start-choice').addEventListener('change',async()=>{if($('start-choice').value==='map'){chooseStart=true;reportMode=null;statusEl.textContent='Tap the map to choose a starting point.'}else{chooseStart=false;statusEl.textContent='Using your current location as the starting point.'}});
function clearRoute(clearDestination=false){manual2D=false;cancelOSRMPending();window.JalanNavigation?.stop();window.JalanGPS?.stop();window.JalanTomTom?.routeCleared();routeLayer.clearLayers();routes=[];passengerLastRoutes=null;window.dispatchEvent(new Event('jalan:route-cleared'));setPerspective(false);routeEl.classList.add('hidden');$('route-options').classList.add('hidden');$('route-steps').classList.add('hidden');$('start-guidance').classList.add('hidden');$('clear-route').classList.add('hidden');if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null;$('start-guidance').textContent='Follow my location'}if(clearDestination){destinationSelectionEpoch++;destination=null;destinationName='';if(destinationMarker){pointLayer.removeLayer(destinationMarker);destinationMarker=null}}}
$('clear-route').addEventListener('click',()=>{setPanelCollapsed(false);clearRoute(true);statusEl.textContent='Route cleared.'});
$('reset').addEventListener('click',()=>{setPanelCollapsed(false);clearRoute(true);map.setView(KL,12);statusEl.textContent='Map reset to Kuala Lumpur.'});
const fmtDist=m=>m>=1000?(m/1000).toFixed(1)+' km':Math.round(m)+' m';
const fmtTime=s=>{const min=Math.max(1,Math.round(s/60));return min>=60?`${Math.floor(min/60)} hr ${min%60} min`:`${min} min`};
// Fetch replacements without discarding the route/GPS session. The caller
// decides whether a response still belongs to the current journey.
async function requestDrivingRoutes(from,to,{signal}={}){
 if($('tt-primary').checked){
  if(!window.JalanTomTom?.enabled())throw Error('TomTom key unavailable');
  return window.JalanTomTom.requestRoutes(from,to,{signal});
 }
 const [a,b]=[from,to].map(p=>`${p[1]},${p[0]}`);
 const url=`https://router.project-osrm.org/route/v1/driving/${a};${b}?overview=full&geometries=geojson&steps=true&alternatives=true`;
 const response=await fetch(url,{signal,cache:'no-store'});
 if(!response.ok)throw Error('Routing service unavailable');
 const data=await response.json();
 if(data.code!=='Ok'||!data.routes?.length)throw Error('No driving route found between these points');
 return data.routes;
}
async function calculateRoutes(){
 if(!destination||!startPoint)return;
 // A selected TomTom primary provider must not silently fall through to OSRM
 // when its key is absent. OSRM is a deliberate manual fallback only.
 if($('tt-primary').checked){
  cancelOSRMPending();
  if(!window.JalanTomTom?.enabled()){
   clearRoute(false);
   statusEl.textContent='TomTom selected but no key available. Enter a TomTom key or uncheck TomTom primary to use OSRM manually.';
   return;
  }
  return window.JalanTomTom.calculate();
 }
 clearRoute(false);
 const from=[...startPoint],to=[...destination],id=++osrmEpoch;
 const controller=new AbortController();osrmAbort=controller;
 const current=()=>id===osrmEpoch&&!controller.signal.aborted&&!$('tt-primary').checked
  &&startPoint?.[0]===from[0]&&startPoint?.[1]===from[1]
  &&destination?.[0]===to[0]&&destination?.[1]===to[1];
 statusEl.textContent='Calculating driving routes…';
 routeEl.textContent='Calculating…';routeEl.classList.remove('hidden');
 try{
  const candidates=await requestDrivingRoutes(from,to,{signal:controller.signal});
  if(!current())return;
  routes=candidates;selectedRoute=0;setPanelCollapsed(true);renderRoutes();
  statusEl.textContent=`Found ${routes.length} driving route${routes.length===1?'':'s'}.`;
 }catch(e){
  if(!current()||e.name==='AbortError')return;
  routeEl.textContent='Could not calculate route: '+e.message;
  statusEl.textContent='Try a different start or destination.';
  console.error(e);
 }finally{if(osrmAbort===controller)osrmAbort=null;}
}
function renderRoutes({preserveGPS=false}={}){
 if(passengerMode&&routes!==passengerLastRoutes){
  // Real provider alternatives only. Sort by finite ETA; never fabricate one.
  routes.sort((a,b)=>(Number.isFinite(a.duration)?a.duration:Infinity)-(Number.isFinite(b.duration)?b.duration:Infinity));
  selectedRoute=0;passengerLastRoutes=routes;
 }
 if(!preserveGPS){window.JalanNavigation?.stop();window.JalanGPS?.stop();}routeLayer.clearLayers();routes.forEach((r,i)=>{const points=r.geometry.coordinates.map(p=>[p[1],p[0]]);L.polyline(points,{color:i===selectedRoute?'#087af5':'#94a3b8',weight:i===selectedRoute?9:5,opacity:preserveGPS?(i===selectedRoute?1:0):(i===selectedRoute?0.95:0.65)}).addTo(routeLayer).on('click',()=>selectRoute(i))});
 const chosen=routes[selectedRoute];
 const bounds=L.latLngBounds(chosen.geometry.coordinates.map(p=>[p[1],p[0]]));
 // Update the panel first; fitBounds runs after the layout has settled.
 const fitSelectedRoute=()=>{
   // Route-overview fit is queued for later paint. Go may have started GPS
   // meanwhile; never zoom back out over the active passenger camera.
   if(document.body.classList.contains('nav-active')||
      document.body.classList.contains('passenger-guiding'))return;
   if(!bounds.isValid())return;
   map.invalidateSize();
   const h=map.getSize().y,w=map.getSize().x;
   const top=Math.min(200,Math.round(h*0.23));
   const bottom=Math.min(140,Math.round(h*0.17));
   const side=Math.min(50,Math.round(w*0.07));
   // Passenger Go can start immediately after a route is selected. Do not let
   // an in-flight overview zoom animation override the trusted GPS camera.
   map.fitBounds(bounds,{paddingTopLeft:[side,top],paddingBottomRight:[side,bottom],maxZoom:15,animate:!passengerMode});
 };
 requestAnimationFrame(()=>requestAnimationFrame(fitSelectedRoute));
 routeEl.innerHTML=`<strong>🚘 ${fmtTime(chosen.duration)} · ${fmtDist(chosen.distance)}</strong><div class="route-warning">${chosen.provider === 'tomtom' ? 'TomTom traffic-aware estimate · route geometry from TomTom. Live traffic can change.' : 'OSRM estimate only — live traffic is not included.'}</div>`;
 const opts=$('route-options');opts.replaceChildren();routes.forEach((r,i)=>{const btn=document.createElement('button');btn.className=i===selectedRoute?'selected':'';btn.textContent=`Route ${i+1} · ${fmtTime(r.duration)} · ${fmtDist(r.distance)}`;btn.onclick=()=>selectRoute(i);opts.appendChild(btn)});opts.classList.remove('hidden');
 const steps=$('route-steps');steps.replaceChildren();const title=document.createElement('strong');title.textContent='Directions (preview)';steps.appendChild(title);const legs=chosen.legs||[];for(const leg of legs){for(const step of leg.steps||[]){if(step.maneuver.type==='arrive')continue;const div=document.createElement('div');const road=step.name||'unnamed road';const maneuver=step.maneuver.modifier||step.maneuver.type||'continue';div.textContent=`${maneuver.replace(/\b\w/g,c=>c.toUpperCase())} onto ${road} · ${fmtDist(step.distance)}`;steps.appendChild(div)}}steps.classList.remove('hidden');$('clear-route').classList.remove('hidden');$('start-guidance').classList.remove('hidden');window.JalanNavigation?.routeReady();window.JalanGPS?.routeReady();
 // First completed selection enters the tilt preview automatically; a manual
 // return to 2D persists across route refreshes until the journey is cleared.
 setPerspective(!passengerMode&&!manual2D);
 window.dispatchEvent(new Event('jalan:routes-rendered'));
}
function selectRoute(i){selectedRoute=i;renderRoutes();window.JalanTomTom?.refreshRouteIncidents()}
$('start-guidance').addEventListener('click',()=>{if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null;$('start-guidance').textContent='Follow my location';statusEl.textContent='Location following stopped.';return}if(!navigator.geolocation){statusEl.textContent='Location is unavailable.';return}watchId=navigator.geolocation.watchPosition(p=>{const pos=[p.coords.latitude,p.coords.longitude];updateLocation(pos);map.panTo(pos);statusEl.textContent='Following your location. This is not turn-by-turn navigation.'},()=>{statusEl.textContent='Unable to follow location. Check browser permission.';navigator.geolocation.clearWatch(watchId);watchId=null;$('start-guidance').textContent='Follow my location'},{enableHighAccuracy:true,maximumAge:3000,timeout:15000});$('start-guidance').textContent='Stop following';});
let lastSearchAt=0,destinationSelectionEpoch=0;
// Both search results and Recent use the exact selected coordinates.
async function selectDestinationPlace(place){
 const point=[Number(place.lat),Number(place.lon)];
 if(!validCoordinates(point))return;
 const id=++destinationSelectionEpoch;
 clearRoute(false);
 destination=point;
 destinationName=String(place.name||place.display_name||'Selected destination').split(',')[0].trim();
 const label=String(place.display_name||destinationName);
 $('destination').value=destinationName;
 if(destinationMarker)pointLayer.removeLayer(destinationMarker);
 const popup=document.createElement('span');popup.textContent='Destination: '+label;
 destinationMarker=L.marker(destination).addTo(pointLayer).bindPopup(popup);
 resultsEl.classList.add('hidden');
 window.dispatchEvent(new CustomEvent('jalan:destination-selected',{detail:{point:[...point],name:destinationName,label}}));
 const current=()=>id===destinationSelectionEpoch&&destination===point;
 if($('start-choice').value==='map'){
  if(!startPoint){chooseStart=true;statusEl.textContent='Tap the map to choose your starting point.';map.setView(destination,12);return;}
 }else{
  try{statusEl.textContent='Finding your starting location…';const origin=await getGPS();
   if(!current())return;setStart(origin,'Your starting location');
  }catch(err){if(current()){statusEl.textContent=err.message+' Select “Choose on map” to continue.';map.setView(destination,13);}return;}
 }
 if(current())await calculateRoutes();
}
$('search-form').addEventListener('submit',async e=>{
 e.preventDefault();const q=$('destination').value.trim();if(!q)return;
 statusEl.textContent='Searching destinations…';resultsEl.classList.add('hidden');
 try{
  const wait=Math.max(0,1100-(Date.now()-lastSearchAt));if(wait)await new Promise(r=>setTimeout(r,wait));lastSearchAt=Date.now();
  const response=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=my&q='+encodeURIComponent(q));
  if(!response.ok)throw Error('Search service unavailable');
  const places=await response.json();resultsEl.replaceChildren();
  if(!places.length){statusEl.textContent='No locations found. Try another search.';return;}
  for(const place of places){const btn=document.createElement('button');btn.textContent=place.display_name;
   btn.onclick=()=>selectDestinationPlace(place);resultsEl.appendChild(btn);}
  resultsEl.classList.remove('hidden');statusEl.textContent='Choose a destination from the results.';
 }catch(err){statusEl.textContent='Search unavailable. Try again later.';console.error(err);}
});

// Locate the user automatically on each fresh page load, subject to browser permission.
// Never override a route the user has already requested.
window.addEventListener('load',()=>{
  setTimeout(()=>map.invalidateSize(),150);
  getGPS(false).then(point=>{
    if(!destination && !routes.length && !chooseStart && !reportMode){
      if(passengerMode&&!window.JalanPassengerStartup?.ready){
        statusEl.textContent='GPS accuracy is not sufficient to show a verified passenger position.';
        return;
      }
      map.setView(point,passengerMode?17:15,{animate:false});
      statusEl.textContent='Showing your current location. Search for a destination.';
    }
  }).catch(()=>{
    if(passengerMode)window.dispatchEvent(new Event('jalan:initial-location-error'));
    if(!destination && !routes.length)statusEl.textContent='Allow location access to start at your position, or choose a starting point on the map.';
  });
});

// Collapse route details to reveal the map. Tap to expand them.
function setPanelCollapsed(collapsed){
 const panel=$('info-panel'),toggle=$('toggle-panel');
 panel.classList.toggle('collapsed',collapsed);
 toggle.textContent=collapsed?'Show route details ▴':'Hide details ▾';
 toggle.setAttribute('aria-expanded',String(!collapsed));
}
$('toggle-panel').addEventListener('click',()=>{
 const collapse=!$('info-panel').classList.contains('collapsed');
 setPanelCollapsed(collapse);
 if(collapse && routes.length)renderRoutes();
});


// V3.2: Experimental Waze Live Map URL containing BOTH endpoints.
// The /live-map/directions URL is observed in Waze's UI, not a documented API.
// Waze may ignore these parameters, require a manual click, or change its URL format.
function validCoordinates(p) {
  return Array.isArray(p) && p.length === 2 &&
    Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;
}
function openExternal(url) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
$('open-waze').addEventListener('click', () => {
  if (!validCoordinates(startPoint) || !validCoordinates(destination)) {
    statusEl.textContent = 'Select both a starting point and destination in Jalan first.';
    return;
  }
  const point = p => `ll.${p[0].toFixed(7)},${p[1].toFixed(7)}`;
  const params = new URLSearchParams({
    navigate: 'yes',
    to: point(destination),
    from: point(startPoint)
  });
  const url = `https://www.waze.com/live-map/directions?${params.toString()}`;
  openExternal(url);
  statusEl.textContent = 'Testing both coordinates in Waze Live Map. Verify the origin, destination, and Leave now selection.';
});
// Official Waze deep link fallback: destination only.
$('open-waze-official').addEventListener('click', () => {
  if (!validCoordinates(destination)) {
    statusEl.textContent = 'Select a destination in Jalan first.';
    return;
  }
  const coords = `${destination[0].toFixed(6)},${destination[1].toFixed(6)}`;
  openExternal(`https://waze.com/ul?ll=${encodeURIComponent(coords)}&navigate=yes`);
  statusEl.textContent = 'Opening destination with the official Waze deep link.';
});
$('copy-route').addEventListener('click', async () => {
  if (!startPoint || !destination) {
    statusEl.textContent = 'Choose a starting point and destination first.';
    return;
  }
  const text = `Jalan route comparison\nStart: ${startPoint[0].toFixed(6)}, ${startPoint[1].toFixed(6)}\nDestination: ${destination[0].toFixed(6)}, ${destination[1].toFixed(6)}\nJalan route: ${routes.length ? fmtDist(routes[selectedRoute].distance) + ', ' + fmtTime(routes[selectedRoute].duration) : 'Not calculated'}\nWaze: enter the same places in Waze Live Map and compare manually.`;
  try {
    await navigator.clipboard.writeText(text);
    statusEl.textContent = 'Route comparison details copied.';
  } catch {
    statusEl.textContent = 'Clipboard unavailable. Use Waze Live Map to compare manually.';
  }
});
