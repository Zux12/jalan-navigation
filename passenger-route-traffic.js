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
     overlay=L.layerGroup().addTo(map),hasFlow=false,trafficSamplingAllowed=false,trafficSamplingRoute=null;
  // Used by the passenger journey sheet; preserve the public snapshot contract.
  let journeySnapshot={route:null,total:0,segments:[]},journeyExpires=Infinity;
 // Do not recreate the map-covering legacy traffic banner. The published
 // passenger journey sheet presents traffic with the preserved snapshot API.
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
 // Clip actual projected segment overlap, never the radius around its ends.
 // Coordinates describe display geometry; their order is NOT treated as a
 // documented traffic-direction contract. Absolute alignment only rejects
 // crossing roads; close parallel/opposite/stacked roads remain unresolved.
 function flowOverlap(path,geometry,from,to){
   const intervals=[],cosLimit=Math.cos(30*degrees),epsilon=1e-6;
   for(let i=1;i<path.coords.length;i++){
     const start=Math.max(from,path.distance[i-1]),end=Math.min(to,path.distance[i]);
     if(end-start<=epsilon)continue;
     const a=interpolated(path,start),b=interpolated(path,end);
     const scale=111320*Math.cos((a[1]+b[1])/2*degrees);
     const rx=(b[0]-a[0])*scale,ry=(b[1]-a[1])*111320,len=Math.hypot(rx,ry);
     if(len<=epsilon)continue;
     const ux=rx/len,uy=ry/len;
     for(let j=1;j<geometry.length;j++){
       const c=geometry[j-1],d=geometry[j];
       const cx=(c[0]-a[0])*scale,cy=(c[1]-a[1])*111320;
       const dx=(d[0]-c[0])*scale,dy=(d[1]-c[1])*111320;
       const flowLength=Math.hypot(dx,dy),along=dx*ux+dy*uy;
       if(flowLength<=epsilon||Math.abs(along)/flowLength<cosLimit)continue;
       const x=cx*ux+cy*uy,y=-cx*uy+cy*ux,lateral=-dx*uy+dy*ux;
       let lo=0,hi=1;
       for(const [origin,delta,min,max] of [[x,along,0,len],[y,lateral,-maxOffsetMeters,maxOffsetMeters]]){
         if(Math.abs(delta)<=epsilon){
           if(origin<min-epsilon||origin>max+epsilon){hi=-1;break;}
         }else{
           const t1=(min-origin)/delta,t2=(max-origin)/delta;
           lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));
         }
       }
       if(hi<=lo)continue;
       const p=Math.max(0,Math.min(len,x+along*lo));
       const q=Math.max(0,Math.min(len,x+along*hi));
       const factor=(end-start)/len;
       intervals.push([start+Math.min(p,q)*factor,start+Math.max(p,q)*factor]);
     }
   }
   intervals.sort((a,b)=>a[0]-b[0]);
   const merged=[];
   for(const [start,end] of intervals){
     const last=merged.at(-1);
     if(last&&start<=last[1]+epsilon)last[1]=Math.max(last[1],end);
     else merged.push([start,end]);
   }
   return merged;
 }
 // A flow-segment sample is accepted ONLY when TomTom returns road geometry
 // overlapping that local part of the selected route. It still does not prove
 // the correct lane/direction on coincident or stacked carriageways.
 function makeFlowMatch(path,sample,data){
   const speed=data?.currentSpeed,free=data?.freeFlowSpeed;
   if(!Number.isFinite(speed)||!Number.isFinite(free)||free<=0||speed<0||
      !Number.isFinite(data.confidence)||data.confidence<.5||data.confidence>1||
      !Number.isFinite(sample)||sample<0||sample>path.total)return null;
   const line=data.coordinates?.coordinate;
   if(!Array.isArray(line)||line.length<2)return null;
   const geometry=line.map(p=>[p.longitude,p.latitude]);
   if(!geometry.every(goodPoint))return null;
   const from=Math.max(0,sample-windowMeters),to=Math.min(path.total,sample+windowMeters);
   // Require >=40m of continuous aligned overlap containing the queried point.
   // Disjoint touches cannot add up to a trusted stretch. Short/ambiguous
   // geometry stays unclassified; provider route-indexed incidents still work.
   const matching=flowOverlap(path,geometry,from,to).filter(([a,b])=>
     b-a>=40-1e-6&&a<=sample+1e-6&&b>=sample-1e-6);
   if(!matching.length)return null;
   // Actual flow speed / free-flow ratio; NOT a TomTom-published three-band
   // classification. No slowing = blue, never imply "light congestion".
   const ratio=speed/free;
   const type=ratio>=.90?null:ratio>=.70?'light':ratio>=.45?'moderate':'heavy';
   return {type,ratio,segments:matching,confidence:data.confidence,
     directionVerified:false,gradeVerified:false};
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
   // Sweep evidence boundaries rather than rounding them to 20m cells. A
   // colour must not leak past a provider point index or matched flow endpoint.
   const events=[];
   function add(start,end,type){
     if(!priority[type]||!Number.isFinite(start)||!Number.isFinite(end))return;
     start=Math.max(0,start);end=Math.min(path.total,end);
     if(end<=start)return;
     events.push({at:start,type,delta:1},{at:end,type,delta:-1});
   }
   if(flowAt&&now-flowAt<=flowTTL){
     for(const match of flows)for(const [start,end] of match.segments||[])
       add(start,end,match.type);
   }
   if(Array.isArray(route.trafficSections)&&now-route.trafficSectionsCheckedAt<=incidentTTL){
     for(const section of route.trafficSections){
       if(section?.sectionType!=='TRAFFIC')continue;
       const a=section.startPointIndex,b=section.endPointIndex;
       if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<=a||b>=path.distance.length)continue;
       add(path.distance[a],path.distance[b],severity(section));
     }
   }
   events.sort((a,b)=>a.at-b.at);
   const pieces=[],active={light:0,moderate:0,heavy:0,closed:0};
   let from=0;
   for(let i=0;i<events.length;){
     const to=events[i].at;
     const type=['closed','heavy','moderate','light'].find(t=>active[t]>0);
     if(type&&to>from){
       const previous=pieces.at(-1);
       if(previous?.type===type&&previous.end===from)previous.end=to;
       else pieces.push({type,start:from,end:to});
     }
     while(i<events.length&&events[i].at===to){
       active[events[i].type]+=events[i].delta;i++;
     }
     from=to;
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
     const coordinates=window.JalanRouteDisplay?.section(window.JalanRouteDisplay.shape(route),segment.start,segment.end)||segment.coordinates;
     L.polyline(coordinates.map(point=>[point[1],point[0]]),{
       jalanRouteScale:1,smoothFactor:0,color:palette[segment.type],weight:9,opacity:.94,
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
   // Route-indexed TRAFFIC sections can render from calculateRoute without
   // additional Flow Segment requests. Only sample after passenger opt-in.
   if(!trafficSamplingAllowed)return;
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
   if(epoch!==id||route!==current||!trafficSamplingAllowed)return;
   // Reject an abort-ignoring response when a script silently replaces the
   // browser key without an input/change event.
   if(key?.value?.trim()!==secret){trafficSamplingAllowed=false;reset();return;}
   flowAt=Date.now();flowMatches=outputs.filter(Boolean);hasFlow=flowMatches.length>0;
   draw();
 }
 function choose(){
   const candidate=routes?.[selectedRoute];
   if(!candidate||candidate.provider!=='tomtom'){
     trafficSamplingAllowed=false;trafficSamplingRoute=null;reset();return;
   }
   if(candidate!==route){
     // Selecting a different alternative cannot inherit permission for key-bearing
     // Flow Segment requests. Wait for the new route's actual traffic status.
     if(trafficSamplingRoute!==candidate){trafficSamplingAllowed=false;trafficSamplingRoute=null;}
     reset();route=candidate;draw();
   }
   // Bounded point-by-point flow queries only on selected TomTom route and only
   // with an explicitly entered browser-held TomTom key.
   if(trafficSamplingAllowed&&(!lastRequestAt||Date.now()-lastRequestAt>=flowTTL))sampleFlow(candidate);
   if(trafficSamplingAllowed&&!refreshId)refreshId=setInterval(()=>{
     if(!document.hidden&&route===routes?.[selectedRoute])sampleFlow(route);
   },flowTTL);
 }
 // A revoked/replaced browser-held key must invalidate even an abort-ignoring
 // provider response before it can draw stale colours on the selected route.
 function revokeKey(){trafficSamplingAllowed=false;trafficSamplingRoute=null;reset();}
 key?.addEventListener('input',revokeKey);
 key?.addEventListener('change',revokeKey);
 window.addEventListener('jalan:routes-rendered',choose);
 window.addEventListener('jalan:route-change',choose);
 window.addEventListener('jalan:journey-start',()=>{
   if(route!==routes?.[selectedRoute])choose();
 });
 window.addEventListener('jalan:route-cleared',()=>{trafficSamplingAllowed=false;trafficSamplingRoute=null;reset();});
 window.addEventListener('jalan:journey-stop',()=>{if(route)draw();});
 window.addEventListener('jalan:traffic-layer-status',event=>{
   const state=event.detail?.state;
   if(state==='off'||state==='error'){
     trafficSamplingAllowed=false;trafficSamplingRoute=null;reset();return;
   }
   // Only an event for the currently selected route can authorize extra
   // key-bearing samples. Late status for a superseded route fails closed.
   const candidate=routes?.[selectedRoute];
   if((state==='loading'||state==='ready')&&candidate?.provider==='tomtom'&&
      event.detail?.route===candidate){
     trafficSamplingRoute=candidate;trafficSamplingAllowed=true;choose();
   }
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

