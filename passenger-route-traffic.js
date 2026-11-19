/* JALAN selected-route traffic colours — passenger-only experimental visualization.
   TomTom is still the route authority. Never colour a nearby road using only
   the closest coordinate or invent current flow when the provider fails. */
(() => {
 'use strict';
 if(new URLSearchParams(location.search).get('mode')!=='passenger')return;

 const palette=Object.freeze({
   light:'#ffe68a',moderate:'#f59b24',heavy:'#de3d35',closed:'#801c2a'
 });
 const maxSamples=6, flowTTL=5*60*1000, incidentTTL=10*60*1000;
 const windowMeters=80, maxOffsetMeters=16;
 let route=null,epoch=0,aborters=[],flowAt=0,lastRequestAt=0,refreshId=null,flowMatches=[],
     overlay=L.layerGroup().addTo(map),hasFlow=false;
 let journeySnapshot={route:null,total:0,segments:[]},journeyExpires=Infinity;
 const key=document.getElementById('tt-key');

 const goodPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&
   Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
 const degrees=Math.PI/180;
 function metresBetween(a,b){
   const c=Math.cos(((a[1]+b[1])/2)*degrees);
   return Math.hypot((b[0]-a[0])*111320*c,(b[1]-a[1])*111320);
 }
 function makePath(coords){
   if(!Array.isArray(coords)||coords.length<2||!coords.every(goodPoint))return null;
   const distance=[0];
   for(let i=1;i<coords.length;i++)distance.push(distance[i-1]+metresBetween(coords[i-1],coords[i]));
   return {coords,distance,total:distance.at(-1)};
 }
 function interpolated(path,metres){
   const distance=Math.max(0,Math.min(path.total,metres));
   let i=1;
   while(i<path.distance.length-1&&path.distance[i]<distance)i++;
   const start=path.distance[i-1],span=path.distance[i]-start||1;
   const f=(distance-start)/span,a=path.coords[i-1],b=path.coords[i];
   return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
 }
 // Exact route subpath: include every original TomTom geometry vertex between
 // the two along-route distances. Never replace a bend with one long chord.
 function originalSubpath(path,start,end){
   if(!(end>start))return [];
   const coords=[interpolated(path,start)];
   for(let i=1;i<path.distance.length-1;i++){
     if(path.distance[i]>start+1e-6&&path.distance[i]<end-1e-6)
       coords.push(path.coords[i].slice());
   }
   coords.push(interpolated(path,end));
   return coords;
 }
 function closest(point,line){
   let best=Infinity;
   const origin=point,scale=111320*Math.cos(origin[1]*degrees);
   for(let i=1;i<line.length;i++){
     const a=line[i-1],b=line[i];
     const ax=(a[0]-origin[0])*scale,ay=(a[1]-origin[1])*111320;
     const dx=(b[0]-a[0])*scale,dy=(b[1]-a[1])*111320;
     const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
     best=Math.min(best,Math.hypot(ax+t*dx,ay+t*dy));
   }
   return best;
 }
 // A flow-segment sample is accepted ONLY when TomTom returns road geometry
 // overlapping that local part of the selected route. It still does not prove
 // the correct lane/direction on coincident or stacked carriageways.
 function makeFlowMatch(path,sample,data){
   const speed=data?.currentSpeed,free=data?.freeFlowSpeed;
   if(!Number.isFinite(speed)||!Number.isFinite(free)||free<=0||speed<0||
      !Number.isFinite(data.confidence)||data.confidence<.5)return null;
   const line=data.coordinates?.coordinate;
   if(!Array.isArray(line)||line.length<2)return null;
   const geometry=line.map(p=>[p.longitude,p.latitude]);
   if(!geometry.every(goodPoint))return null;
   const from=Math.max(0,sample-windowMeters),to=Math.min(path.total,sample+windowMeters);
   if(closest(interpolated(path,sample),geometry)>maxOffsetMeters)return null;
   const matching=[];
   for(let m=from;m<to;m+=20){
     const end=Math.min(to,m+20),a=interpolated(path,m),b=interpolated(path,end);
     if(closest(a,geometry)<=maxOffsetMeters&&
        closest(b,geometry)<=maxOffsetMeters)matching.push([m,end]);
   }
   if(!matching.length)return null;
   // Actual flow speed / free-flow ratio; NOT a TomTom-published three-band
   // classification. No slowing = blue, never imply "light congestion".
   const ratio=speed/free;
   const type=ratio>=.90?null:ratio>=.70?'light':ratio>=.45?'moderate':'heavy';
   return {type,ratio,segments:matching,confidence:
     Number.isFinite(data.confidence)?data.confidence:null};
 }
 function severity(section){
   if(section?.simpleCategory==='ROAD_CLOSURE')return 'closed';
   // TomTom magnitude=4 also means other indefinite delays, not proof of closure.
   return section?.magnitudeOfDelay===1?'light':
     section?.magnitudeOfDelay===2?'moderate':
     section?.magnitudeOfDelay===3?'heavy':null;
 }
 const priority={light:1,moderate:2,heavy:3,closed:4};
 function classify(route,flows=[],now=Date.now()){
   const path=makePath(route?.geometry?.coordinates);
   if(!path||route?.provider!=='tomtom'||!Number.isFinite(path.total)||path.total<=0)return [];
   // Render only real route line pieces, subdivided for accurate overlay.
   const pieces=[];
   for(let from=0;from<path.total;from+=20){
     const to=Math.min(path.total,from+20);
     let type=null;
     if(flowAt&&now-flowAt<=flowTTL){
       for(const match of flows){
         if(match.type&&match.segments.some(([a,b])=>Math.min(b,to)-Math.max(a,from)>=10))
           if(!type||priority[match.type]>priority[type])type=match.type;
       }
     }
     if(Array.isArray(route.trafficSections)&&
        now-route.trafficSectionsCheckedAt<=incidentTTL){
       for(const section of route.trafficSections){
         if(section?.sectionType!=='TRAFFIC')continue;
         const a=section.startPointIndex,b=section.endPointIndex;
         if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<=a||
            b>=path.distance.length)continue;
         if(path.distance[a]>=to||path.distance[b]<=from)continue;
         const incident=severity(section);
         if(incident&&(!type||priority[incident]>priority[type]))type=incident;
       }
     }
     if(type){
       const previous=pieces.at(-1);
       if(previous?.type===type&&Math.abs(previous.end-from)<.01)
         previous.end=to;
       else pieces.push({type,start:from,end:to});
     }
   }
   return pieces.map(piece=>({...piece,
     coordinates:originalSubpath(path,piece.start,piece.end)}));
 }
 function cacheJourney(pieces){
   const now=Date.now();
   journeySnapshot={route,total:makePath(route?.geometry?.coordinates)?.total||0,
     segments:pieces.map(({type,start,end})=>({type,start,end}))};
   journeyExpires=Math.min(...[flowAt?flowAt+flowTTL:0,
     (route?.trafficSectionsCheckedAt||0)+incidentTTL].filter(t=>t>=now));
 }
 function draw(){
   overlay.clearLayers();
   const pieces=classify(route,flowMatches);
   cacheJourney(pieces);
   for(const segment of pieces){
     const coordinates=window.JalanRouteDisplay?.spans(window.JalanRouteDisplay.shape(route),segment.start,segment.end)[0]?.coordinates||segment.coordinates;
     L.polyline(coordinates.map(point=>[point[1],point[0]]),{
       jalanRoute:route,jalanFrom:segment.start,jalanTo:segment.end,smoothFactor:0,color:palette[segment.type],weight:9,opacity:.94,
       interactive:false,lineCap:'round',lineJoin:'round',
       className:'jalan-selected-traffic-colour'
     }).addTo(overlay);
   }
 }
 function reset(){
   epoch++;aborters.forEach(a=>a.abort());aborters=[];flowMatches=[];flowAt=0;lastRequestAt=0;hasFlow=false;
   if(refreshId){clearInterval(refreshId);refreshId=null;}
   overlay.clearLayers();route=null;cacheJourney([]);
 }
 function samplesFor(path){
   const count=Math.max(1,Math.min(maxSamples,Math.ceil(path.total/500)));
   return Array.from({length:count},(_,i)=>path.total*(i+.5)/count);
 }
 async function sampleFlow(current){
   const path=makePath(current.geometry.coordinates);
   if(!path||!path.total)return;
   const secret=key?.value?.trim();
   if(!/^[\w-]{8,160}$/.test(secret))return;
   const id=++epoch;
   lastRequestAt=Date.now();
   aborters.forEach(a=>a.abort());aborters=[];flowMatches=[];hasFlow=false;flowAt=0;
   draw();
   const positions=samplesFor(path);
   const outputs=await Promise.all(positions.map(async metres=>{
     const p=interpolated(path,metres),ac=new AbortController();
     aborters.push(ac);
     const url=new URL('https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/15/json');
     url.searchParams.set('key',secret);
     url.searchParams.set('point',p[1].toFixed(6)+','+p[0].toFixed(6));
     try{
       const response=await fetch(url,{signal:ac.signal,cache:'no-store'});
       if(!response.ok)return null;
       const json=await response.json();
       return makeFlowMatch(path,metres,json?.flowSegmentData);
     }catch{return null;}
   }));
   if(epoch!==id||route!==current)return;
   flowAt=Date.now();flowMatches=outputs.filter(Boolean);hasFlow=flowMatches.length>0;
   draw();
 }
 function choose(){
   const candidate=routes?.[selectedRoute];
   if(!candidate||candidate.provider!=='tomtom'){
     reset();return;
   }
   if(candidate!==route){reset();route=candidate;draw();}
   // Bounded point-by-point flow queries only on selected TomTom route and only
   // with an explicitly entered browser-held TomTom key.
   if(!lastRequestAt||Date.now()-lastRequestAt>=flowTTL)sampleFlow(candidate);
   if(!refreshId)refreshId=setInterval(()=>{
     if(!document.hidden&&route===routes?.[selectedRoute])sampleFlow(route);
   },flowTTL);
 }
 // A revoked/replaced browser-held key must invalidate even an abort-ignoring
 // provider response before it can draw stale colours on the selected route.
 key?.addEventListener('input',reset);
 key?.addEventListener('change',reset);
 window.addEventListener('jalan:routes-rendered',choose);
 window.addEventListener('jalan:route-change',choose);
 window.addEventListener('jalan:journey-start',()=>{
   if(route!==routes?.[selectedRoute])choose();
 });
 window.addEventListener('jalan:route-cleared',reset);
 window.addEventListener('jalan:journey-stop',()=>{if(route)draw();});
 window.addEventListener('jalan:traffic-layer-status',event=>{
   if(event.detail?.state==='off'){reset();}
   if(event.detail?.state==='ready'&&!route&&
      routes?.[selectedRoute]?.provider==='tomtom')choose();
 });
 window.addEventListener('jalan:incidents-updated',()=>{if(route)draw();});
 window.JalanRouteTraffic={
   getState:()=>({active:!!route,sampledFlow:hasFlow,overlayCount:overlay.getLayers().length}),
   getJourneySnapshot:()=>{
     if(Date.now()>journeyExpires)cacheJourney(classify(route,flowMatches));
     return {...journeySnapshot,segments:journeySnapshot.segments.map(s=>({...s}))};
   },
   classify,makeFlowMatch,makePath,originalSubpath,samplesFor,severity,reset
 };
})();
