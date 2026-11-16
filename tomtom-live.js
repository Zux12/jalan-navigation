/* Jalan V3.6 TomTom routes and direction-specific route traffic. */
(() => {
'use strict';
const el=id=>document.getElementById(id), input=el('tt-key');
const status=s=>el('tt-status').textContent=s;
// Default is page-memory only: do not silently keep an unchecked key across
// reloads in sessionStorage. Clear previously persisted legacy session values.
// Some Safari/private and enterprise contexts deny storage getter access outright.
// The TomTom key must remain usable in this page, but never claim persistence
// when the browser refuses it. No key values are logged or sent to JALAN.
const STORAGE_KEY='jalan-tomtom-key';
const keyStorage={
 read(){try{return localStorage.getItem(STORAGE_KEY)||''}catch{return ''}},
 remember(value){try{localStorage.setItem(STORAGE_KEY,value);return true}catch{return false}},
 forget(){try{localStorage.removeItem(STORAGE_KEY)}catch{};
  try{sessionStorage.removeItem(STORAGE_KEY)}catch{}}
};
try{sessionStorage.removeItem(STORAGE_KEY)}catch{}
const rememberedKey=keyStorage.read();
window.JalanTomTomKeyStorage=Object.freeze({remember:keyStorage.remember,forget:keyStorage.forget});
input.value=rememberedKey;
el('tt-remember').checked=!!rememberedKey;
const enabled=()=>el('tt-primary').checked && !!input.value.trim();
let keyEdited=false;
function key(){const k=input.value.trim();if(!/^[\w-]{8,160}$/.test(k))throw Error('Enter a valid TomTom key.');if(el('tt-remember').checked){
 if(!keyStorage.remember(k)){
  el('tt-remember').checked=false;
  status('Browser storage blocked. Key remains available on this page only.');
 }
}else keyStorage.forget();keyEdited=false;return k;}
let tiles=null,active=false,timer=null,routeAbort=null,incidentAbort=null,token=0,lastIncidents=0,debounce=null,incidentEpoch=0;
const incidentLayer=L.layerGroup().addTo(map);
let reportSnapshot={route:null,incidents:[],checkedAt:0},requestedRoute=null,drawnReports='';
const publishIncidents=detail=>window.dispatchEvent?.(new CustomEvent('jalan:incidents-updated',{detail}));
const trafficState=(state,message,route=routes[selectedRoute]||null)=>{
 window.dispatchEvent?.(new CustomEvent('jalan:traffic-layer-status',{detail:{state,message,route}}));
};
function invalidateIncidents(){incidentEpoch++;incidentAbort?.abort();incidentAbort=null;requestedRoute=null;lastIncidents=0;drawnReports='';incidentLayer.clearLayers();reportSnapshot={route:null,incidents:[],checkedAt:0};publishIncidents(reportSnapshot);}
function routeCleared(){token++;routeAbort?.abort();routeAbort=null;invalidateIncidents();}
function hide(){active=false;clearInterval(timer);clearTimeout(debounce);invalidateIncidents();if(tiles)map.removeLayer(tiles);tiles=null;trafficState('off','Traffic off');}
function normal(r){const coords=[];for(const leg of r.legs||[])for(const p of leg.points||[]){if(Number.isFinite(p.latitude)&&Number.isFinite(p.longitude))coords.push([p.longitude,p.latitude]);}if(coords.length<2)throw Error('TomTom returned no usable route geometry.');if(!Number.isFinite(r.summary?.travelTimeInSeconds)||r.summary.travelTimeInSeconds<0||!Number.isFinite(r.summary?.lengthInMeters)||r.summary.lengthInMeters<=0||!Number.isFinite(r.summary?.trafficDelayInSeconds??0)||r.summary.trafficDelayInSeconds<0)throw Error('TomTom returned invalid route measurements.');const steps=(r.guidance?.instructions||[]).slice(0,120).map(x=>({name:x.street||x.roadNumber||x.message||'road',distance:0,location:x.point&&Number.isFinite(x.point.latitude)&&Number.isFinite(x.point.longitude)?[x.point.longitude,x.point.latitude]:null,routeOffsetInMeters:Number.isFinite(x.routeOffsetInMeters)?x.routeOffsetInMeters:null,message:x.message||'',maneuver:{type:x.maneuver||'continue',modifier:x.message||''}}));return {provider:'tomtom',geometry:{type:'LineString',coordinates:coords},duration:r.summary.travelTimeInSeconds,distance:r.summary.lengthInMeters,delay:r.summary.trafficDelayInSeconds||0,legs:[{steps}]};}
async function calculate(){if(!startPoint||!destination){status('Search for a destination first.');return;}let k;try{k=key();}catch(e){status(e.message);return;}clearRoute(false);const id=++token;routeAbort=new AbortController();statusEl.textContent='Calculating TomTom traffic-aware route…';routeEl.textContent='Loading TomTom routes…';routeEl.classList.remove('hidden');const path=[startPoint,destination].map(p=>p.map(x=>x.toFixed(6)).join(',')).join(':');const url=new URL('https://api.tomtom.com/routing/1/calculateRoute/'+path+'/json');for(const [a,b] of Object.entries({key:k,traffic:'true',departAt:'now',travelMode:'car',routeType:'fastest',maxAlternatives:'2',instructionsType:'text',language:'en-GB'}))url.searchParams.set(a,b);try{const response=await fetch(url,{signal:routeAbort.signal,cache:'no-store'});if(!response.ok)throw Error('TomTom routing HTTP '+response.status);const data=await response.json();if(id!==token)return;if(!data.routes?.length)throw Error('No routes returned');routes=data.routes.map(normal);selectedRoute=0;setPanelCollapsed(true);renderRoutes();const r=routes[0];el('tt-eta').textContent=`TomTom: ${Math.round(r.duration/60)} min · ${(r.distance/1000).toFixed(1)} km · Traffic delay ${Math.round(r.delay/60)} min · ${routes.length} route(s).`;statusEl.textContent='TomTom traffic-aware route active.';refreshRouteIncidents(true);}catch(e){if(e.name==='AbortError'||id!==token)return;routeEl.textContent='TomTom route unavailable: '+e.message;status('Uncheck TomTom primary routing to use OSRM. '+e.message);}}
// Projection is only for distance from the vehicle. Report eligibility comes
// exclusively from TomTom TRAFFIC sections on the reconstructed selected path.
const routeMatchers=new WeakMap();
const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&
 Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
function reportRouteMatcher(coords){
 if(!Array.isArray(coords)||coords.length<2)return null;
 if(routeMatchers.has(coords))return routeMatchers.get(coords);
 if(!coords.every(validPoint))return null;
 const origin=coords[0],sx=111320*Math.cos(origin[1]*Math.PI/180),sy=111320;
 const xy=p=>[(p[0]-origin[0])*sx,(p[1]-origin[1])*sy];
 const segments=[];let total=0;
 for(let i=1;i<coords.length;i++){
  const a=xy(coords[i-1]),b=xy(coords[i]),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(length>0)segments.push({a,b,dx,dy,length,along:total});
  total+=length;
 }
 if(!segments.length)return null;
 const project=p=>{
  if(!validPoint(p))return null;
  const [x,y]=xy(p);let best={offset:Infinity,along:0,total};
  for(const s of segments){
   const t=Math.max(0,Math.min(1,((x-s.a[0])*s.dx+(y-s.a[1])*s.dy)/(s.length*s.length)));
   const offset=Math.hypot(x-s.a[0]-t*s.dx,y-s.a[1]-t*s.dy);
   if(offset<best.offset)best={offset,along:s.along+t*s.length,total};
  }
  return best;
 };
 const matcher={project};routeMatchers.set(coords,matcher);return matcher;
}
const projectReportPoint=(point,coords)=>reportRouteMatcher(coords)?.project(point)||null;
// Never guess carriageway from distance, a GeoJSON vertex order, or TMC
// positive/negative (which requires the associated location table). Ask the
// routing service for traffic on the selected ordered path instead.
function routeTrafficReports(route,response){
 const selected=route?.geometry?.coordinates;
 if(route?.provider!=='tomtom'||!Array.isArray(selected)||selected.length<2||
    !selected.every(validPoint))throw Error('Selected TomTom route unavailable');
 const returned=[];
 for(const leg of response?.legs||[])for(const p of leg.points||[])
  returned.push([p.longitude,p.latitude]);
 // update mode aims to retain geometry, but is not a guarantee. Require the
 // same ordered points to within decimal rounding (~1 cm), not a road corridor.
 // Changed, reversed, resampled or malformed geometry is withheld, never snapped.
 if(returned.length!==selected.length||!returned.every((p,i)=>validPoint(p)&&
    Math.abs(p[0]-selected[i][0])<=1e-7&&Math.abs(p[1]-selected[i][1])<=1e-7))
  throw Error('TomTom could not confirm traffic on the unchanged selected route');
 if(response.sections!==undefined&&!Array.isArray(response.sections))
  throw Error('Invalid route traffic sections');
 const cumulative=[0];
 for(let i=1;i<selected.length;i++){
  const a=selected[i-1],b=selected[i],sx=111320*Math.cos((a[1]+b[1])*Math.PI/360);
  cumulative.push(cumulative[i-1]+Math.hypot((b[0]-a[0])*sx,(b[1]-a[1])*111320));
 }
 const total=cumulative[cumulative.length-1];
 if(total<1)throw Error('Invalid route traffic geometry');
 const labels={JAM:['Traffic congestion','🚗'],ROAD_WORK:['Roadworks','🚧'],
  ROAD_CLOSURE:['Road closed','⛔'],OTHER:['Traffic incident','⚠️']};
 const reports=[],seen=new Set();
 for(const section of response.sections||[]){
  if(section?.sectionType!=='TRAFFIC')continue;
  const start=section.startPointIndex,end=section.endPointIndex;
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>=selected.length)
   throw Error('Invalid traffic section position');
  const id=String(section.eventId||'')+':'+start+':'+end;
  if(seen.has(id))continue;
  seen.add(id);
  const [title,category]=labels[section.simpleCategory]||labels.OTHER;
  const detail=['On your route toward destination'];
  if(Number.isFinite(section.delayInSeconds)&&section.delayInSeconds>0)
   detail.push('Delay '+Math.max(1,Math.round(section.delayInSeconds/60))+' min');
  if(Number.isFinite(section.effectiveSpeedInKmh)&&section.effectiveSpeedInKmh>=0)
   detail.push('Traffic speed '+Math.round(section.effectiveSpeedInKmh)+' km/h');
  reports.push({id,title,category,description:detail.join(' · '),
   lat:selected[start][1],lng:selected[start][0],startPointIndex:start,endPointIndex:end,
   along:cumulative[start],endAlong:cumulative[end],total,
   color:section.simpleCategory==='ROAD_CLOSURE'?'#991b1b':
    section.magnitudeOfDelay>=3?'#dc2626':'#d85800'});
 }
 return reports.sort((a,b)=>a.along-b.along);
}
function reportProgress(route){
 const state=window.JalanGPS?.getState?.();
 return state?.active&&state.route===route&&state.matched&&
  Number.isFinite(state.fixAgeMs)&&state.fixAgeMs>=0&&state.fixAgeMs<=10000&&
  Number.isFinite(state.accuracy)&&state.accuracy>=0&&state.accuracy<=75&&Array.isArray(state.position)?
  projectReportPoint([state.position[1],state.position[0]],route.geometry.coordinates):null;
}
function hasRouteTraffic(route){
 const age=Date.now()-reportSnapshot.checkedAt;
 return !!route&&active&&el('tt-incident-toggle').checked&&route===routes[selectedRoute]&&
    reportSnapshot.route===route&&age>=0&&age<=600000;
}
function getRouteReports(route){
 if(!hasRouteTraffic(route))return [];
 const current=reportProgress(route);
 return reportSnapshot.incidents.filter(item=>!current||item.endAlong>=current.along-30)
  .map(item=>({...item,ahead:current?Math.max(0,item.along-current.along):null}));
}
function drawRouteReports(){
 const r=reportSnapshot.route,items=getRouteReports(r);
 const signature=reportSnapshot.checkedAt+':'+items.map(item=>item.id).join('|');
 if(signature===drawnReports)return;
 drawnReports=signature;incidentLayer.clearLayers();
 for(const item of items){
  const popup=document.createElement('div'),head=document.createElement('strong'),desc=document.createElement('p');
  head.textContent='TomTom · '+item.title;desc.textContent=item.description;popup.append(head,desc);
  const points=r.geometry.coordinates.slice(item.startPointIndex,item.endPointIndex+1).map(p=>[p[1],p[0]]);
  if(points.length>1)L.polyline(points,{color:item.color,weight:5,opacity:.95,
    interactive:false,className:'jalan-route-traffic-section'}).addTo(incidentLayer);
  L.marker([item.lat,item.lng],{icon:L.divIcon({className:'report-marker',html:item.category,
    iconSize:[28,28],iconAnchor:[14,14]})}).bindPopup(popup).addTo(incidentLayer);
 }
}
window.addEventListener?.('jalan:gps-fix',drawRouteReports);
// Expire map markings as well as list data after a suspended/offline tab.
setInterval(()=>{
 if(active&&reportSnapshot.checkedAt&&Date.now()-reportSnapshot.checkedAt>600000){
  invalidateIncidents();trafficState('error','Route traffic expired · refresh to check again');
 }
},30000);
async function incidents(force=false){
 if(!active||!el('tt-incident-toggle').checked||routes[selectedRoute]?.provider!=='tomtom'){
  invalidateIncidents();return;
 }
 if(!force&&Date.now()-lastIncidents<300000)return;
 incidentAbort?.abort();incidentAbort=new AbortController();
 const id=++incidentEpoch,r=routes[selectedRoute];requestedRoute=r;
 trafficState('loading','Loading route traffic…',r);
 try{
  const coordinates=r.geometry.coordinates;
  if(!Array.isArray(coordinates)||coordinates.length<2||!coordinates.every(validPoint))
   throw Error('Invalid selected route');
  const path=[coordinates[0],coordinates[coordinates.length-1]].map(p=>p[1]+','+p[0]).join(':');
  const url=new URL('https://api.tomtom.com/routing/1/calculateRoute/'+path+'/json');
  for(const [name,value] of Object.entries({key:key(),traffic:'true',departAt:'now',travelMode:'car',
   routeType:'fastest',maxAlternatives:'0',reconstructionMode:'update',sectionType:'traffic',
   routeRepresentation:'polyline'}))url.searchParams.set(name,value);
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({supportingPoints:coordinates.map(p=>({latitude:p[1],longitude:p[0]}))}),
   signal:incidentAbort.signal,cache:'no-store'});
  if(!response.ok)throw Error('Route traffic HTTP '+response.status);
  const data=await response.json();
  if(id!==incidentEpoch||!active||!el('tt-incident-toggle').checked||routes[selectedRoute]!==r)return;
  if(!Array.isArray(data.routes)||data.routes.length!==1)throw Error('Invalid route traffic response');
  const reportItems=routeTrafficReports(r,data.routes[0]);
  lastIncidents=Date.now();
  reportSnapshot={route:r,incidents:reportItems,checkedAt:lastIncidents};
  drawRouteReports();publishIncidents(reportSnapshot);
  const stamp=new Date(lastIncidents).toLocaleTimeString('en-MY',{hour:'numeric',minute:'2-digit'});
  trafficState('ready','Route reports: '+getRouteReports(r).length+' · '+stamp,r);
  status('TomTom traffic affects your selected route toward destination. Checked '+stamp+'.');
 }catch(e){
  if(e.name!=='AbortError'&&id===incidentEpoch&&active){
   invalidateIncidents();
   trafficState('error','Traffic reports unavailable · retrying in 5 min',r);
   status('Traffic active; incidents unavailable: '+e.message);
  }
 }
}
function refreshRouteIncidents(force=false){
 if(!active)return;
 if(requestedRoute!==routes[selectedRoute]){invalidateIncidents();force=true;}
 clearTimeout(debounce);debounce=setTimeout(()=>incidents(force),400);
}
function connect(){
 try{
  const k=key();hide();active=true;trafficState('loading','Loading route traffic…');
  // Passenger map contains route-associated markings only. Area-wide tiles
  // remain an explicit engineering overview, not evidence for report inclusion.
  if(!document.body.classList.contains('passenger-mode')){
   tiles=L.tileLayer('https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key='+encodeURIComponent(k),
    {opacity:.82,maxZoom:19,maxNativeZoom:18,attribution:'Traffic © TomTom',updateWhenIdle:true}).addTo(map);
   let errors=0;
   tiles.on('tileerror',()=>{if(++errors===3)status('Traffic tiles failed. Check key, domain restriction and quota.');});
  }
  status('Loading traffic for your selected route and direction…');refreshRouteIncidents(true);
  timer=setInterval(()=>{
   if(!active||document.hidden)return;
   tiles?.setUrl('https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key='+encodeURIComponent(k)+'&v='+Math.floor(Date.now()/300000));
   incidents();
  },300000);
  return true;
 }catch(e){status(e.message);trafficState('error','Traffic unavailable · check TomTom key');return false;}
}
/* Replacing a browser key revokes previously remembered credentials and
   cancels pending traffic/route work before any further Connect/Calculate. */
input.addEventListener('input',()=>{
 if(keyEdited)return;
 keyEdited=true;
 keyStorage.forget();
 routeCleared();hide();
 if(routes[selectedRoute]?.provider==='tomtom')clearRoute(false);
 status('Key changed. Old stored key removed; reconnect to use live traffic.');
});
el('tt-remember').onchange=()=>{if(!el('tt-remember').checked){keyStorage.forget();status('Key will be kept only for this open page.');}};
el('tt-connect').onclick=connect;el('tt-hide').onclick=()=>{hide();status('Traffic overlay hidden.');};el('tt-route').onclick=calculate;el('tt-primary').onchange=()=>{routeCleared();clearRoute(false);status(enabled()?'TomTom routing selected. Search again to apply.':'OSRM routing selected. Search again to apply.');};el('tt-incident-toggle').onchange=()=>{if(!el('tt-incident-toggle').checked)invalidateIncidents();else refreshRouteIncidents(true);};el('tt-toggle-key').onclick=()=>{const show=input.type==='password';input.type=show?'text':'password';el('tt-toggle-key').textContent=show?'Hide':'Show';};el('tt-remove-key').onclick=()=>{routeCleared();hide();clearRoute(false);input.value='';keyStorage.forget();el('tt-remember').checked=false;status('Key cleared from browser. Active route and pending TomTom requests cancelled.');};
function startPassengerTraffic(){
 if(!el('tt-primary').checked||routes[selectedRoute]?.provider!=='tomtom'){
  trafficState('error','Live traffic unavailable · OSRM route');return false;
 }
 if(!/^[\w-]{8,160}$/.test(input.value.trim())){
  trafficState('error','Live traffic unavailable · add a TomTom key');return false;
 }
 el('tt-incident-toggle').checked=true;
 return connect();
}
window.JalanTomTom={enabled,calculate,routeCleared,refreshRouteIncidents,
 startPassengerTraffic,stopPassengerTraffic:hide,projectReportPoint,routeTrafficReports,getRouteReports,hasRouteTraffic};
})();
