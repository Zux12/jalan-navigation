/* Jalan V3.6 TomTom routes, tiles and near-route incidents. */
(() => {
'use strict';
const el=id=>document.getElementById(id), input=el('tt-key');
const status=s=>el('tt-status').textContent=s;
// Managed test builds use the site configuration; other builds retain device overrides.
// Configured and entered keys work even when browser storage is denied.
const STORAGE_KEY='jalan-tomtom-key',DISABLED_KEY='jalan-tomtom-config-disabled';
const keyStorage={
 read(){try{return localStorage.getItem(STORAGE_KEY)||''}catch{return ''}},
 remember(value){try{localStorage.setItem(STORAGE_KEY,value);localStorage.removeItem(DISABLED_KEY);return true}catch{return false}},
 forget(){try{localStorage.removeItem(STORAGE_KEY)}catch{};
  try{sessionStorage.removeItem(STORAGE_KEY)}catch{}},
 disableConfigured(){try{localStorage.setItem(DISABLED_KEY,'1');return true}catch{return false}}
};
try{sessionStorage.removeItem(STORAGE_KEY)}catch{}
let configDisabled=false;
try{configDisabled=localStorage.getItem(DISABLED_KEY)==='1';}catch{}
const configuredKey=String(window.JalanPublicConfig?.tomtomBrowserKey||'').trim();
const validKey=value=>/^[\w-]{8,160}$/.test(value);
const rememberedKey=keyStorage.read();
const managed=window.JalanPublicConfig?.managedTomTom===true&&validKey(configuredKey);
const usableConfiguredKey=(managed||!configDisabled)&&validKey(configuredKey)?configuredKey:'';
input.value=managed?usableConfiguredKey:validKey(rememberedKey)?rememberedKey:usableConfiguredKey;
el('tt-remember').checked=!managed&&validKey(rememberedKey);
window.JalanTomTomKeyStorage=Object.freeze({remember:keyStorage.remember,forget:keyStorage.forget,
 configured:!!usableConfiguredKey});
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
const publishIncidents=detail=>window.dispatchEvent?.(new CustomEvent('jalan:incidents-updated',{detail}));
const trafficState=(state,message,route=routes[selectedRoute]||null)=>{
 window.dispatchEvent?.(new CustomEvent('jalan:traffic-layer-status',{detail:{state,message,route}}));
};
function invalidateIncidents(){incidentEpoch++;incidentAbort?.abort();incidentAbort=null;incidentLayer.clearLayers();publishIncidents({route:null,incidents:[],checkedAt:0});}
function routeCleared(){token++;routeAbort?.abort();routeAbort=null;invalidateIncidents();}
function hide(){active=false;clearInterval(timer);clearTimeout(debounce);invalidateIncidents();if(tiles)map.removeLayer(tiles);tiles=null;trafficState('off','Traffic off');}
function normal(r){const coords=[];for(const leg of r.legs||[])for(const p of leg.points||[]){if(Number.isFinite(p.latitude)&&Number.isFinite(p.longitude))coords.push([p.longitude,p.latitude]);}if(coords.length<2)throw Error('TomTom returned no usable route geometry.');if(!Number.isFinite(r.summary?.travelTimeInSeconds)||r.summary.travelTimeInSeconds<0||!Number.isFinite(r.summary?.lengthInMeters)||r.summary.lengthInMeters<=0||!Number.isFinite(r.summary?.trafficDelayInSeconds??0)||r.summary.trafficDelayInSeconds<0)throw Error('TomTom returned invalid route measurements.');const steps=(r.guidance?.instructions||[]).slice(0,120).map(x=>({name:x.street||x.roadNumbers?.[0]||x.message||'road',street:x.street||'',roadNumbers:Array.isArray(x.roadNumbers)?x.roadNumbers.filter(v=>typeof v==='string').slice(0,6):[],pointIndex:Number.isInteger(x.pointIndex)?x.pointIndex:null,distance:0,location:x.point&&Number.isFinite(x.point.latitude)&&Number.isFinite(x.point.longitude)?[x.point.longitude,x.point.latitude]:null,routeOffsetInMeters:Number.isFinite(x.routeOffsetInMeters)?x.routeOffsetInMeters:null,message:x.message||'',maneuver:{type:x.maneuver||'continue',modifier:x.message||''}}));return {provider:'tomtom',roadGuidance:(r.guidance?.instructions||[]).map(x=>({street:x.street||'',roadNumbers:Array.isArray(x.roadNumbers)?x.roadNumbers.filter(v=>typeof v==='string').slice(0,6):[],routeOffsetInMeters:x.routeOffsetInMeters,maneuver:x.maneuver})),geometry:{type:'LineString',coordinates:coords},duration:r.summary.travelTimeInSeconds,distance:r.summary.lengthInMeters,delay:r.summary.trafficDelayInSeconds||0,trafficSections:Array.isArray(r.sections)?r.sections.filter(s=>s.sectionType==='TRAFFIC').slice(0,120):null,trafficSectionsCheckedAt:Date.now(),legs:[{steps}]};}
// Request candidates without clearing the active journey. Both initial route
// selection and off-route recovery use the same provider normalization/options.
async function requestRoutes(from,to,{signal}={}){
 const k=key();
 const path=[from,to].map(p=>p.map(x=>x.toFixed(6)).join(',')).join(':');
 const url=new URL('https://api.tomtom.com/routing/1/calculateRoute/'+path+'/json');
 for(const [a,b] of Object.entries({key:k,traffic:'true',departAt:'now',travelMode:'car',routeType:'fastest',maxAlternatives:'2',instructionsType:'text',sectionType:'traffic',language:'en-GB'}))url.searchParams.set(a,b);
 const response=await fetch(url,{signal,cache:'no-store'});
 if(!response.ok)throw Error('TomTom routing HTTP '+response.status);
 const data=await response.json();
 if(!data.routes?.length)throw Error('No routes returned');
 return data.routes.map(normal);
}
async function calculate(){
 if(!startPoint||!destination){status('Search for a destination first.');return;}
 try{key();}catch(e){status(e.message);return;}
 clearRoute(false);const id=++token;routeAbort=new AbortController();
 statusEl.textContent='Calculating TomTom traffic-aware route…';
 routeEl.textContent='Loading TomTom routes…';routeEl.classList.remove('hidden');
 try{
  const candidates=await requestRoutes([...startPoint],[...destination],{signal:routeAbort.signal});
  if(id!==token)return;
  routes=candidates;selectedRoute=0;setPanelCollapsed(true);renderRoutes();
  const r=routes[0];el('tt-eta').textContent=`TomTom: ${Math.round(r.duration/60)} min · ${(r.distance/1000).toFixed(1)} km · Traffic delay ${Math.round(r.delay/60)} min · ${routes.length} route(s).`;
  statusEl.textContent='TomTom traffic-aware route active.';refreshRouteIncidents(true);
 }catch(e){
  if(e.name==='AbortError'||id!==token)return;
  routeEl.textContent='TomTom route unavailable: '+e.message;
  status('Uncheck TomTom primary routing to use OSRM. '+e.message);
 }
}
// Incident Details returns an area, not a route match. Use one narrow spatial
// filter for map pins and the Passenger list. This is not road-ID, direction
// or level matching: very close parallel/stacked roads remain ambiguous.
const reportRouteTolerance=25,routeMatchers=new WeakMap();
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
 const match=geometry=>{
  const points=geometry?.type==='Point'?[geometry.coordinates]:
   geometry?.type==='LineString'?geometry.coordinates:null;
  if(!Array.isArray(points)||!points.length||!points.every(validPoint))return null;
  if(geometry.type==='Point'){
   const p=points[0],projection=project(p);
   return projection.offset<=reportRouteTolerance?{...projection,lng:p[0],lat:p[1]}:null;
  }
  if(points.length<2)return null;
  const pieces=[],intervals=[];let incidentLength=0;
  for(let i=1;i<points.length;i++){
   const a=xy(points[i-1]),b=xy(points[i]),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
   if(!length)continue;
   pieces.push({start:incidentLength,length,a:points[i-1],b:points[i]});
   for(const s of segments){
    if(Math.max(a[0],b[0])+reportRouteTolerance<Math.min(s.a[0],s.b[0])||
       Math.min(a[0],b[0])-reportRouteTolerance>Math.max(s.a[0],s.b[0])||
       Math.max(a[1],b[1])+reportRouteTolerance<Math.min(s.a[1],s.b[1])||
       Math.min(a[1],b[1])-reportRouteTolerance>Math.max(s.a[1],s.b[1]))continue;
    // A crossing road alone is not an affected route segment. Geometry order
    // is not documented as travel direction, so do not infer it from sign.
    if(Math.abs(dx*s.dx+dy*s.dy)/(length*s.length)<Math.cos(Math.PI/6))continue;
    const ax=a[0]-s.a[0],ay=a[1]-s.a[1];
    let lo=0,hi=1;
    const clip=(start,change,min,max)=>{
     if(Math.abs(change)<1e-9)return start>=min&&start<=max;
     const t1=(min-start)/change,t2=(max-start)/change;
     lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));return hi>lo;
    };
    if(clip((ax*s.dx+ay*s.dy)/s.length,(dx*s.dx+dy*s.dy)/s.length,0,s.length)&&
       clip((ax*s.dy-ay*s.dx)/s.length,(dx*s.dy-dy*s.dx)/s.length,-reportRouteTolerance,reportRouteTolerance))
     intervals.push([incidentLength+lo*length,incidentLength+hi*length]);
   }
   incidentLength+=length;
  }
  if(incidentLength<1||!intervals.length)return null;
  intervals.sort((a,b)=>a[0]-b[0]);
  const merged=[];
  for(const interval of intervals){
   const last=merged[merged.length-1];
   if(last&&interval[0]<=last[1]+0.01)last[1]=Math.max(last[1],interval[1]);
   else merged.push(interval.slice());
  }
  const overlap=merged.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]))[0];
  // Require sustained overlap, rather than one incident endpoint being close.
  if(overlap[1]-overlap[0]<Math.min(30,incidentLength*.6))return null;
  const halfway=(overlap[0]+overlap[1])/2;
  const piece=pieces.find(p=>halfway>=p.start&&halfway<=p.start+p.length);
  if(!piece)return null;
  const t=(halfway-piece.start)/piece.length;
  const p=[piece.a[0]+t*(piece.b[0]-piece.a[0]),piece.a[1]+t*(piece.b[1]-piece.a[1])];
  const projection=project(p);
  // Anchor remains on the provider's incident geometry, never snapped from
  // another road onto the blue line merely to make it look relevant.
  return projection.offset<=reportRouteTolerance?{...projection,lng:p[0],lat:p[1]}:null;
 };
 const matcher={project,match};routeMatchers.set(coords,matcher);return matcher;
}
const projectReportPoint=(point,coords)=>reportRouteMatcher(coords)?.project(point)||null;
const matchReportGeometry=(geometry,coords)=>reportRouteMatcher(coords)?.match(geometry)||null;
// TomTom Routing associates TRAFFIC sections with the exact selected route
// using point indices. Do not apply an independent 25m Incident Details corridor.
// Incident Details "from/to" are location labels; TMC sign is not a compass
// heading without a proper reference table.
const trafficSectionsForRoute=r=>{
 if(r?.provider!=='tomtom'||!Array.isArray(r.geometry?.coordinates))return [];
 const coords=r.geometry.coordinates,steps=(r.legs||[]).flatMap(x=>x.steps||[])
  .filter(x=>Number.isInteger(x.pointIndex)&&x.pointIndex>=0&&x.pointIndex<coords.length)
  .sort((a,b)=>a.pointIndex-b.pointIndex);
 // Keep along-route distance in provider point-index order. Projecting a
 // location onto the nearest polyline segment is ambiguous at flyovers,
 // self-crossings, loops and repeated coordinates.
 const origin=coords[0],sx=111320*Math.cos(origin[1]*Math.PI/180),sy=111320;
 const cumulative=[0];
 for(let i=1;i<coords.length;i++){
  if(!validPoint(coords[i-1])||!validPoint(coords[i]))return [];
  const dx=(coords[i][0]-coords[i-1][0])*sx,dy=(coords[i][1]-coords[i-1][1])*sy;
  cumulative.push(cumulative[i-1]+Math.hypot(dx,dy));
 }
 const total=cumulative.at(-1);
 if(!Number.isFinite(total)||total<=0)return [];
 const output=[],seen=new Set();
 for(const section of r.trafficSections||[]){
  if(section?.sectionType!=='TRAFFIC')continue;
  const start=section.startPointIndex,end=section.endPointIndex;
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||
     end>=coords.length)continue;
  const middle=Math.floor((start+end)/2),point=coords[middle];
  if(!validPoint(point))continue;
  const id=start+':'+end+':'+String(section.simpleCategory||'OTHER');
  if(seen.has(id))continue;seen.add(id);
  const instruction=steps.filter(x=>x.pointIndex<=middle).at(-1);
  const name=String(instruction?.street||instruction?.roadNumbers?.[0]||
    instruction?.name||'Road on selected route').slice(0,100);
  const category=String(section.simpleCategory||'OTHER').replace(/_/g,' ');
  const delay=Number.isFinite(section.delayInSeconds)&&section.delayInSeconds>=0?
    Math.round(section.delayInSeconds):null;
  const speed=Number.isFinite(section.effectiveSpeedInKmh)&&section.effectiveSpeedInKmh>=0?
    Math.round(section.effectiveSpeedInKmh):null;
  const routeAlong=cumulative[middle];
  if(!Number.isFinite(routeAlong))continue;
  output.push({lat:point[1],lng:point[0],startPointIndex:start,endPointIndex:end,
   roadName:name,roadNumbers:instruction?.roadNumbers||[],category,delaySeconds:delay,
   trafficSeverity:category==='JAM'?window.JalanRouteTraffic?.severity?.(section)||null:null,
   effectiveSpeedKmh:speed,routeAlong,routeTotal:total});
 }
 return output.sort((a,b)=>a.startPointIndex-b.startPointIndex).slice(0,60);
};
function incidents(force=false){
 if(!active||!el('tt-incident-toggle').checked||routes[selectedRoute]?.provider!=='tomtom'){
  invalidateIncidents();return;
 }
 const r=routes[selectedRoute],checkedAt=r.trafficSectionsCheckedAt;
 incidentLayer.clearLayers();
 // Missing sections are not proof that no traffic exists. Distinguish an
 // unavailable provider response from an explicitly empty section array.
 if(!Array.isArray(r.trafficSections)){
  publishIncidents({route:r,incidents:[],checkedAt:0});
  trafficState('error','Route traffic sections unavailable · Recalculate route',r);
  status('TomTom did not supply route-linked traffic sections; no incident match was asserted.');
  return;
 }
 // No fresh Incident Details request is made here. Sections are a route
 // snapshot and must not masquerade as continuously updated incident data.
 if(!Number.isFinite(checkedAt)||Date.now()-checkedAt>10*60*1000){
  publishIncidents({route:r,incidents:[],checkedAt:0});
  trafficState('stale','Route traffic snapshot expired · Recalculate route',r);
  status('TomTom traffic overlay active; route incidents need a fresh route calculation.');
  return;
 }
 const sections=trafficSectionsForRoute(r),reportItems=[];
 for(const section of sections){
  const emoji=section.category==='JAM'?'🚗':
    ['ROAD WORK','ROAD CLOSURE'].includes(section.category)?'🚧':'⚠️';
  const reportType=({'JAM':'traffic','ROAD WORK':'roadworks','ROAD CLOSURE':'closure'})[section.category]||'incident';
  const issue=reportType==='traffic'?(window.JalanReportModel?.reportLabel('traffic',section.trafficSeverity)||'Traffic Jam'):
    section.category==='OTHER'?'Traffic Incident':
    section.category.toLowerCase().replace(/\b[a-z]/g,letter=>letter.toUpperCase());
  const detail=section.roadName+
    (section.delaySeconds===null?'':' · delay '+Math.round(section.delaySeconds/60)+' min')+
    (section.effectiveSpeedKmh===null?'':' · '+section.effectiveSpeedKmh+' km/h');
  const popup=document.createElement('div'),heading=document.createElement('strong'),desc=document.createElement('p');
  heading.textContent=issue;desc.textContent=detail;
  popup.append(heading,desc);
  L.marker([section.lat,section.lng],{icon:L.divIcon({
    className:'report-marker',html:emoji,iconSize:[28,28],iconAnchor:[14,14]})})
   .bindPopup(popup).addTo(incidentLayer);
  reportItems.push({...section,reportType,issue,detail,description:issue+' · '+detail,category:emoji,source:'tomtom-route-section'});
 }
 lastIncidents=checkedAt;
 publishIncidents({route:r,incidents:reportItems,checkedAt:lastIncidents});
 trafficState('ready','Route-linked traffic: '+sections.length+' · from last route calculation',r);
 status('TomTom route-linked traffic · '+sections.length+
   ' affected section(s) from the selected route. No 25m incident corridor applied.');
}
function refreshRouteIncidents(force=false){if(!active)return;clearTimeout(debounce);debounce=setTimeout(()=>incidents(force),400);}
function connect(){try{const k=key();hide();active=true;trafficState('loading','Loading route traffic…');const passenger=/(?:[?&])mode=passenger(?:&|$)/.test(window.location?.search||'');if(!passenger)tiles=L.tileLayer('https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key='+encodeURIComponent(k),{opacity:.82,maxZoom:19,maxNativeZoom:18,attribution:'Traffic © TomTom',updateWhenIdle:true}).addTo(map);let errors=0;tiles?.on('tileerror',()=>{if(++errors===3){status('Traffic tiles failed. Check key, domain restriction and quota.');trafficState('error','Traffic map unavailable · check connection or key');}});status(passenger?'Selected-route TomTom traffic enabled. General traffic tiles hidden to avoid off-route colour confusion.':'Live traffic enabled. Route reports use provider-linked TRAFFIC sections.');refreshRouteIncidents(true);timer=setInterval(()=>{if(!active||document.hidden)return;tiles?.setUrl('https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key='+encodeURIComponent(k)+'&v='+Math.floor(Date.now()/300000));incidents();},300000);return true;}catch(e){status(e.message);trafficState('error','Traffic unavailable · check TomTom key');return false;}}
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
el('tt-connect').onclick=connect;el('tt-hide').onclick=()=>{hide();status('Traffic overlay hidden.');};el('tt-route').onclick=calculate;el('tt-primary').onchange=()=>{routeCleared();clearRoute(false);status(enabled()?'TomTom routing selected. Search again to apply.':'OSRM routing selected. Search again to apply.');};el('tt-incident-toggle').onchange=()=>{if(!el('tt-incident-toggle').checked)invalidateIncidents();else refreshRouteIncidents(true);};el('tt-toggle-key').onclick=()=>{const show=input.type==='password';input.type=show?'text':'password';el('tt-toggle-key').textContent=show?'Hide':'Show';};el('tt-remove-key').onclick=()=>{routeCleared();hide();clearRoute(false);input.value='';keyStorage.forget();const disabled=keyStorage.disableConfigured();el('tt-remember').checked=false;status(disabled?'Key cleared from browser. Site key disabled here; pending TomTom requests cancelled.':'Key cleared for this page. Browser storage blocked; a configured site key may return on reload.');};
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
window.JalanTomTom={enabled,calculate,requestRoutes,routeCleared,refreshRouteIncidents,
 startPassengerTraffic,stopPassengerTraffic:hide,reportRouteTolerance,projectReportPoint,matchReportGeometry,trafficSectionsForRoute};
})();
