/* Jalan V3.6 TomTom routes, tiles and near-route incidents. */
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
const publishIncidents=detail=>window.dispatchEvent?.(new CustomEvent('jalan:incidents-updated',{detail}));
const trafficState=(state,message,route=routes[selectedRoute]||null)=>{
 window.dispatchEvent?.(new CustomEvent('jalan:traffic-layer-status',{detail:{state,message,route}}));
};
function invalidateIncidents(){incidentEpoch++;incidentAbort?.abort();incidentAbort=null;incidentLayer.clearLayers();publishIncidents({route:null,incidents:[],checkedAt:0});}
function routeCleared(){token++;routeAbort?.abort();routeAbort=null;invalidateIncidents();}
function hide(){active=false;clearInterval(timer);clearTimeout(debounce);invalidateIncidents();if(tiles)map.removeLayer(tiles);tiles=null;trafficState('off','Traffic off');}
function normal(r){const coords=[];for(const leg of r.legs||[])for(const p of leg.points||[]){if(Number.isFinite(p.latitude)&&Number.isFinite(p.longitude))coords.push([p.longitude,p.latitude]);}if(coords.length<2)throw Error('TomTom returned no usable route geometry.');if(!Number.isFinite(r.summary?.travelTimeInSeconds)||r.summary.travelTimeInSeconds<0||!Number.isFinite(r.summary?.lengthInMeters)||r.summary.lengthInMeters<=0||!Number.isFinite(r.summary?.trafficDelayInSeconds??0)||r.summary.trafficDelayInSeconds<0)throw Error('TomTom returned invalid route measurements.');const steps=(r.guidance?.instructions||[]).slice(0,120).map(x=>({name:x.street||x.roadNumber||x.message||'road',distance:0,location:x.point&&Number.isFinite(x.point.latitude)&&Number.isFinite(x.point.longitude)?[x.point.longitude,x.point.latitude]:null,routeOffsetInMeters:Number.isFinite(x.routeOffsetInMeters)?x.routeOffsetInMeters:null,message:x.message||'',maneuver:{type:x.maneuver||'continue',modifier:x.message||''}}));return {provider:'tomtom',geometry:{type:'LineString',coordinates:coords},duration:r.summary.travelTimeInSeconds,distance:r.summary.lengthInMeters,delay:r.summary.trafficDelayInSeconds||0,legs:[{steps}]};}
async function calculate(){if(!startPoint||!destination){status('Search for a destination first.');return;}let k;try{k=key();}catch(e){status(e.message);return;}clearRoute(false);const id=++token;routeAbort=new AbortController();statusEl.textContent='Calculating TomTom traffic-aware route…';routeEl.textContent='Loading TomTom routes…';routeEl.classList.remove('hidden');const path=[startPoint,destination].map(p=>p.map(x=>x.toFixed(6)).join(',')).join(':');const url=new URL('https://api.tomtom.com/routing/1/calculateRoute/'+path+'/json');for(const [a,b] of Object.entries({key:k,traffic:'true',departAt:'now',travelMode:'car',routeType:'fastest',maxAlternatives:'2',instructionsType:'text',language:'en-GB'}))url.searchParams.set(a,b);try{const response=await fetch(url,{signal:routeAbort.signal,cache:'no-store'});if(!response.ok)throw Error('TomTom routing HTTP '+response.status);const data=await response.json();if(id!==token)return;if(!data.routes?.length)throw Error('No routes returned');routes=data.routes.map(normal);selectedRoute=0;setPanelCollapsed(true);renderRoutes();const r=routes[0];el('tt-eta').textContent=`TomTom: ${Math.round(r.duration/60)} min · ${(r.distance/1000).toFixed(1)} km · Traffic delay ${Math.round(r.delay/60)} min · ${routes.length} route(s).`;statusEl.textContent='TomTom traffic-aware route active.';refreshRouteIncidents(true);}catch(e){if(e.name==='AbortError'||id!==token)return;routeEl.textContent='TomTom route unavailable: '+e.message;status('Uncheck TomTom primary routing to use OSRM. '+e.message);}}
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
async function incidents(force=false){
 if(!active||!el('tt-incident-toggle').checked||routes[selectedRoute]?.provider!=='tomtom'){
  invalidateIncidents();return;
 }
 if(!force&&Date.now()-lastIncidents<300000)return;
 incidentAbort?.abort();incidentAbort=new AbortController();
 const id=++incidentEpoch,r=routes[selectedRoute];
 trafficState('loading','Loading route traffic…',r);
 try{
  const b=L.latLngBounds(r.geometry.coordinates.map(p=>[p[1],p[0]])).pad(.15);
  const bbox=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].map(x=>x.toFixed(5)).join(',');
  const url=new URL('https://api.tomtom.com/traffic/services/5/incidentDetails');
  url.searchParams.set('key',key());url.searchParams.set('bbox',bbox);
  url.searchParams.set('fields','{incidents{type,geometry{type,coordinates},properties{iconCategory,events{description}}}}');
  url.searchParams.set('language','en-GB');
  const response=await fetch(url,{signal:incidentAbort.signal,cache:'no-store'});
  if(!response.ok)throw Error('Incident API HTTP '+response.status);
  const data=await response.json();
  if(id!==incidentEpoch||!active||!el('tt-incident-toggle').checked||routes[selectedRoute]!==r)return;
  if(!Array.isArray(data.incidents))throw Error('Invalid incident response');
  incidentLayer.clearLayers();const reportItems=[];let n=0;
  for(const item of data.incidents){
   if(n>=60)break;
   const match=matchReportGeometry(item?.geometry,r.geometry.coordinates);
   if(!match)continue;
   const loc=[match.lat,match.lng];
   const props=item.properties||{},cat=Number(props.iconCategory),emoji=[6,7].includes(cat)?'🚧':[1,2].includes(cat)?'🚗':'⚠️';
   const popup=document.createElement('div'),head=document.createElement('strong'),desc=document.createElement('p');
   head.textContent='TomTom incident along selected route';desc.textContent=String(props.events?.[0]?.description||'Traffic incident').slice(0,180);
   popup.append(head,desc);
   L.marker(loc,{icon:L.divIcon({className:'report-marker',html:emoji,iconSize:[28,28],iconAnchor:[14,14]})}).bindPopup(popup).addTo(incidentLayer);
   reportItems.push({lat:loc[0],lng:loc[1],category:emoji,description:desc.textContent});n++;
  }
  lastIncidents=Date.now();publishIncidents({route:r,incidents:reportItems,checkedAt:lastIncidents});
  const stamp=new Date(lastIncidents).toLocaleTimeString('en-MY',{hour:'numeric',minute:'2-digit'});
  trafficState('ready','Route reports: '+n+' · '+stamp,r);
  status(`TomTom traffic active · ${n} incident(s) closely matching the selected route. Traffic colours also cover surrounding roads.`);
 }catch(e){
  if(e.name!=='AbortError'&&id===incidentEpoch&&active){
   incidentLayer.clearLayers();publishIncidents({route:null,incidents:[],checkedAt:0});
   trafficState('error','Traffic reports unavailable · retrying in 5 min',r);
   status('Traffic active; incidents unavailable: '+e.message);
  }
 }
}
function refreshRouteIncidents(force=false){if(!active)return;clearTimeout(debounce);debounce=setTimeout(()=>incidents(force),400);}
function connect(){try{const k=key();hide();active=true;trafficState('loading','Loading route traffic…');tiles=L.tileLayer('https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key='+encodeURIComponent(k),{opacity:.82,maxZoom:19,maxNativeZoom:18,attribution:'Traffic © TomTom',updateWhenIdle:true}).addTo(map);let errors=0;tiles.on('tileerror',()=>{if(++errors===3){status('Traffic tiles failed. Check key, domain restriction and quota.');trafficState('error','Traffic map unavailable · check connection or key');}});status('Live traffic enabled. Incidents appear near a TomTom route.');refreshRouteIncidents(true);timer=setInterval(()=>{if(!active||document.hidden)return;tiles?.setUrl('https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key='+encodeURIComponent(k)+'&v='+Math.floor(Date.now()/300000));incidents();},300000);return true;}catch(e){status(e.message);trafficState('error','Traffic unavailable · check TomTom key');return false;}}
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
 startPassengerTraffic,stopPassengerTraffic:hide,reportRouteTolerance,projectReportPoint,matchReportGeometry};
})();
