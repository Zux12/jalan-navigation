// A camera belongs to a particular road and directed approach, including on looping routes.
(() => {
 'use strict';
 function normalize(value){
   return String(value||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 }
 function roadSpans(route){
   if(route.provider==='tomtom'){
     return (route.roadGuidance||[]).filter(step=>Number.isFinite(step.routeOffsetInMeters))
       .map(step=>({at:step.routeOffsetInMeters,name:step.street,refs:step.roadNumbers||[]}));
   }
   const spans=[];
   let offset=0;
   for(const leg of route.legs||[])for(const step of leg.steps||[]){
     if(!Number.isFinite(step.distance)||step.distance<=0)continue;
     spans.push({at:offset,name:step.name,refs:String(step.ref||'').split(/[;,/]/)});
     offset+=step.distance;
   }
   return spans;
 }
 function sameRoad(camera,span){
   if(!span)return false;
   const ref=value=>normalize(value).replace(/^ft(?=\s*\d)/,'').replace(/\s/g,'');
   const refs=span.refs.map(ref).filter(Boolean);
   if(refs.includes(ref(camera.ref)))return true;
   // A different expressway number disambiguates colocated ramps and elevated roads.
   if(refs.some(code=>/^e\d+$/.test(code)))return false;
   const name=normalize(span.name);
   return name!==''&&[camera.road,...camera.aliases,camera.ref].some(value=>normalize(value)===name);
 }
 function matchRoute(route,cameras,shape,geo){
   const line=route?.geometry?.coordinates;
   if(!line?.length||!(route.distance>0))return [];
   const path=shape(route),spans=roadSpans(route),items=[];
   if(!(path.total>0)||!spans.length)return [];
   for(const camera of cameras){
     const {position,approach,exit}=camera;
     const heading=geo.bearing(approach,exit);
     const matches=[];
     for(let i=1;i<line.length;i++){
       const a=line[i-1],b=line[i];
       // Cheap envelope test before projecting onto a directed route segment.
       if(position[0]<Math.min(a[0],b[0])-.00015||position[0]>Math.max(a[0],b[0])+.00015||
          position[1]<Math.min(a[1],b[1])-.00015||position[1]>Math.max(a[1],b[1])+.00015)continue;
       const match=geo.project(position,[a,b]);
       if(!match||match.offset>12||geo.delta(match.heading,heading)>30)continue;
       const along=path.lengths[i-1]+(path.lengths[i]-path.lengths[i-1])*match.along/match.total;
       // Projection clamps to endpoints. Exclude devices longitudinally beyond the trip.
       if((along===0||along===path.total)&&match.offset>0.5){
         const endpoint=along===0?a:b;
         const outward=along===0?(match.heading+180)%360:match.heading;
         if(geo.delta(geo.bearing(endpoint,position),outward)<75)continue;
       }
       const providerOffset=route.distance*along/path.total;
       if(!sameRoad(camera,spans.findLast(s=>s.at<=providerOffset)))continue;
       // Check the approach and departure against the actual mapped carriageway.
       // At the end of a route, only the portion we drive must overlap.
       let samples=0;
       const aligned=[[-1,approach],[1,exit]].every(([sign,anchor])=>{
         const span=geo.distance(position,anchor);
         const distance=Math.min(span,sign<0?along:path.total-along);
         if(distance<5)return true;
         samples++;
         const expected=position.map((v,j)=>v+(anchor[j]-v)*distance/span);
         const at=along+sign*distance;
         let edge=i;
         while(edge>1&&path.lengths[edge-1]>at)edge--;
         while(edge<line.length-1&&path.lengths[edge]<at)edge++;
         const frac=(at-path.lengths[edge-1])/(path.lengths[edge]-path.lengths[edge-1]||1);
         const actual=line[edge-1].map((v,j)=>v+(line[edge][j]-v)*frac);
         return geo.distance(expected,actual)<=12;
       });
       if(!samples||!aligned)continue;
       const candidate={along,offset:match.offset,point:match.point};
       const previous=matches.at(-1);
       if(previous&&along-previous.along<35){
         if(candidate.offset<previous.offset)matches[matches.length-1]=candidate;
       }else matches.push(candidate);
     }
     matches.forEach((m,visit)=>items.push({
       key:camera.id+'/'+visit,id:camera.id,source:'camera',category:'speed-camera',icon:'📷',
       title:'Speed camera',detail:camera.road+' · '+camera.ref,lat:m.point[1],lng:m.point[0],
       routeAlong:m.along,routeTotal:path.total
     }));
   }
   return items.sort((a,b)=>a.routeAlong-b.routeAlong);
 }
 if(typeof module==='object'&&module.exports){module.exports={matchRoute};return;}
 if(new URLSearchParams(location.search).get('mode')!=='passenger')return;

 const banner=document.getElementById('passenger-camera-alert'),distanceLabel=document.getElementById('passenger-camera-distance');
 const turn=document.getElementById('passenger-turn-toggle'),markers=new Map(),announced=new Set();
 const layer=L.layerGroup().addTo(map);
 const icon=L.divIcon({className:'passenger-camera-pin',html:'📷',iconSize:[28,28],iconAnchor:[14,14]});
 let route=null,indexedRoute=null,catalog=null,loading=null,matches=[],progress=null,fresh=false,expiry=0,retryAfter=0;
 const routeItems=current=>route===current?matches.filter(item=>progress===null||item.routeAlong>progress):[];
 function notifyReports(){window.dispatchEvent(new Event('jalan:camera-reports'));}
 function hide(){
   clearTimeout(expiry);banner.hidden=true;
   if(fresh){fresh=false;notifyReports();}
 }
 function reset(){
   layer.clearLayers();markers.clear();route=null;indexedRoute=null;matches=[];progress=null;hide();
 }
 function positionBanner(){banner.style.top=turn.getBoundingClientRect().bottom+'px';}
 new ResizeObserver(()=>{if(!banner.hidden)positionBanner();}).observe(turn);
 function paint(){
   const items=routeItems(route),ahead=new Set(items.map(item=>item.id));
   for(const [id,pin] of markers)if(!ahead.has(id)){layer.removeLayer(pin);markers.delete(id);}
   for(const item of items)if(!markers.has(item.id)){
     markers.set(item.id,L.marker([item.lat,item.lng],{icon,interactive:false,keyboard:false,alt:'Speed camera'}).addTo(layer));
   }
   const next=items[0],distance=next&&progress!==null?next.routeAlong-progress:Infinity;
   banner.hidden=!fresh||document.hidden||distance>300;
   if(banner.hidden)return;
   positionBanner();
   distanceLabel.textContent=Math.max(1,Math.round(distance))+' m';
   const voice=window.JalanVoice;
   if(!announced.has(next.key)&&voice?.alert(voice.getMode(),distance>=275?'Speed camera ahead in 300 metres.':'Speed camera ahead.')){
     announced.add(next.key);
   }
 }
 function select(){
   const state=window.JalanGPS?.getState(),current=state?.active?state.route:null;
   if(current!==route){reset();route=current;}
   if(!route)return;
   if(catalog){
     if(indexedRoute!==route){
       matches=matchRoute(route,catalog,window.JalanRouteDisplay.shape,window.JalanReportModel);
       indexedRoute=route;paint();notifyReports();
     }
     return;
   }
   if(loading||Date.now()<retryAfter)return;
   loading=fetch('data/my-fixed-speed-cameras.json?v=1').then(response=>{
     if(!response.ok)throw Error('Camera data unavailable');
     return response.json();
   }).then(data=>{
     catalog=data.cameras;
     select();
   }).catch(()=>{retryAfter=Date.now()+30000;}).finally(()=>{loading=null;});
 }
 function update(){
   const state=window.JalanGPS?.getState();
   if(state?.route!==route||!catalog)select();
   if(!route||state?.route!==route||!state.active||document.hidden||!state.matched||!state.gpsReliable||
      !(state.gpsAccuracy>=0&&state.gpsAccuracy<=35)||!(state.gpsFixAgeMs>=0&&state.gpsFixAgeMs<10000)||
      !Number.isFinite(state.remainingMeters)||state.remainingMeters<0||state.remainingMeters>route.distance){
     hide();return;
   }
   const path=window.JalanRouteDisplay.shape(route);
   progress=Math.max(progress??0,path.total*(1-state.remainingMeters/route.distance));
   clearTimeout(expiry);fresh=true;
   expiry=setTimeout(hide,10000-state.gpsFixAgeMs);paint();
 }
 window.JalanSpeedCameras={routeItems,currentProgress:current=>current===route&&fresh?progress:null};
 window.addEventListener('jalan:journey-start',()=>{announced.clear();reset();select();});
 window.addEventListener('jalan:route-change',select);
 window.addEventListener('jalan:routes-rendered',select);
 // GPS updates turn guidance synchronously. Give a due turn first use of the voice channel.
 window.addEventListener('jalan:gps-fix',()=>requestAnimationFrame(update));
 window.addEventListener('jalan:location-quality',event=>{if(event.detail?.error)hide();});
 window.addEventListener('jalan:journey-stop',reset);
 window.addEventListener('jalan:route-cleared',reset);
 window.addEventListener('pagehide',reset);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();else update();});
})();
