/* Shared observations contain a directed stretch, rounded speed and stretch-specific token. */
(()=>{
 'use strict';
 if(new URLSearchParams(location.search).get('mode')!=='passenger')return;
 const model=window.JalanFlowModel,P=window.JalanReportModel;
 const base='https://mterm2026-559f9bf571b5.herokuapp.com/api/jalan/reports/flow/';
 const box=document.getElementById('passenger-share-speed'),pref='jalan-traffic-sharing-v1';
 let storageAvailable=true;
 const get=k=>{try{return localStorage.getItem(k);}catch{storageAvailable=false;return null;}};
 const set=(k,v)=>{try{localStorage.setItem(k,v);}catch{storageAvailable=false;}};
 const saved=get(pref);if(storageAvailable&&saved===null){set(pref,'on');}
 let enabled=storageAvailable&&saved!=='off',active=false,route=null,sections=[],lookup=new Map(),cacheUntil=0,previous=null,matched=null,readCell=null;
 let seedKey=null,seedPromise=null,epoch=0,reader=null,lastRead=0,regionOffset=0;
 const writes=new Set(),lastSent=new Map(),verifiedRoads=new Map();
 box.checked=enabled;
 function resetWrites(){epoch++;for(const c of writes)c.abort();writes.clear();previous=null;matched=null;readCell=null;lastSent.clear();}
 function setting(on,persist){enabled=on;box.checked=on;if(persist)set(pref,on?'on':'off');if(!on)resetWrites();}
 box.addEventListener('change',()=>setting(box.checked,true));
 window.addEventListener('storage',e=>{if(e.key===pref||e.key===null)setting(get(pref)!=='off',false);});
 function stop(){active=false;resetWrites();reader?.abort();reader=null;route=null;sections=[];lookup.clear();verifiedRoads.clear();cacheUntil=0;changed();}
 function changed(){window.dispatchEvent(new Event('jalan:community-flow'));}
 function useRoute(r){if(r===route)return;resetWrites();reader?.abort();reader=null;route=r;sections=[];lookup=new Map();verifiedRoads.clear();cacheUntil=0;lastRead=0;regionOffset=0;changed();}
 async function post(name,body,controller){
  const timeout=setTimeout(()=>controller.abort(),10000);
  try{const r=await fetch(base+name,{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
   if(!r.ok)throw Error('Traffic service unavailable');return await r.json();}
  finally{clearTimeout(timeout);}
 }
 async function read(){
  if(!active||document.hidden||reader)return;
  const r=window.JalanGPS?.getState?.().route;if(!r)return;
  useRoute(r);if(Date.now()-lastRead<30000)return;
  const path=model.layout(r);if(!path?.regions.length)return;
  // Regional reads carry no installation ID, measured speed or precise position.
  const regions=path.regions.slice(regionOffset,regionOffset+64);regionOffset=(regionOffset+regions.length)%path.regions.length;
  const c=new AbortController();reader=c;lastRead=Date.now();
  try{const data=await post('read',{regions},c);if(c.signal.aborted||r!==route||!Array.isArray(data.sections))return;
   const values=new Map(data.sections.filter(s=>['smooth','light','moderate','heavy'].includes(s.type)&&s.expiresAt>Date.now()&&s.normal>0&&s.speed>0).map(s=>[s.segment,s]));
   const prefixes=new Set([...values.keys()].map(id=>id.slice(0,9)));
   for(const cell of path.cells)if(regions.includes(cell.region)){
    lookup.delete(cell.segment);
    if(!prefixes.has(cell.segment.slice(0,9)))continue;
    const renderer=window.JalanVectorMap;
    // A basic map can reuse a grade verified earlier on this same route.
    // Unloaded, uncertain and stacked roads have no community colour or ETA.
    let road=verifiedRoads.get(cell.segment);
    if(renderer?.active!==false&&renderer?.getReportRoad){
     road=model.readRoad(path,cell,renderer.getReportRoad);
     if(road)verifiedRoads.set(cell.segment,road);else verifiedRoads.delete(cell.segment);
    }
    const fullId=model.roadSegment(cell,road),summary=values.get(fullId);
    if(summary)lookup.set(cell.segment,{...summary,road,segment:cell.segment});
   }
   refresh();
  }catch{}finally{if(reader===c)reader=null;}
 }
 function refresh(){const at=Date.now();for(const [k,v]of lookup)if(v.expiresAt<=at)lookup.delete(k);
  const next=(model.layout(route)?.cells||[]).filter(c=>lookup.has(c.segment)).map(c=>({...c,...lookup.get(c.segment)}));
  const dirty=next.length!==sections.length||next.some((s,i)=>s.segment!==sections[i].segment||s.type!==sections[i].type||s.speed!==sections[i].speed||s.normal!==sections[i].normal);
  sections=next;cacheUntil=sections.reduce((v,s)=>Math.min(v,s.expiresAt),Infinity);if(dirty)changed();}
 function current(r){if(!r||r!==route)return [];if(cacheUntil&&Date.now()>=cacheUntil)refresh();return sections;}
 function secret(){
  if(seedPromise)return seedPromise;
  let seed=get('jalan-traffic-seed-v1');
  if(!/^[a-f0-9]{64}$/.test(seed||'')){seed=hex(crypto.getRandomValues(new Uint8Array(32)));set('jalan-traffic-seed-v1',seed);}
  seedPromise=crypto.subtle.importKey('raw',new TextEncoder().encode(seed),{name:'HMAC',hash:'SHA-256'},false,['sign']);return seedPromise;
 }
 const hex=bytes=>Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
 async function send(cell,road,speed,normal,passAgeMs=null){
  const segment=model.roadSegment(cell,road);if(!segment)return;
  const passed=passAgeMs!==null;
  const before=epoch,at=Date.now(),last=lastSent.get(cell.segment);
  if(last&&at-last.at<20000&&(!passed||last.passed))return;
  lastSent.set(cell.segment,{at,passed});
  const c=new AbortController();writes.add(c);
  try{seedKey=await secret();const driver=hex(new Uint8Array(await crypto.subtle.sign('HMAC',seedKey,new TextEncoder().encode(segment))));
   if(before!==epoch||!active||!enabled||document.hidden||!window.JalanGPS.getState().active)return;
   await post('observe',{segment,region:cell.region,driver,road,speed:Math.round(speed),normal:Number.isFinite(normal)&&normal>=15&&normal<=180?Math.round(normal):null,passAgeMs},c);
  }catch{}finally{writes.delete(c);}
 }
 function fix(d){
  if(!active||document.hidden)return;
  const gps=window.JalanGPS.getState();if(!gps.active||!gps.route)return;
  useRoute(gps.route);read();readCell=null;const i=d.speedLimitIndex;
  if(!d.matched||!d.gpsReliable||d.nearDestination||!(d.gpsAccuracy>=0&&d.gpsAccuracy<=20)||!(d.gpsFixAgeMs>=0&&d.gpsFixAgeMs<=10000)||
     !Number.isInteger(i)||!Array.isArray(d.gpsPosition)||!Number.isFinite(d.speedMps)||d.speedMps<0||d.speedMps>55){previous=null;matched=null;return;}
  const path=model.layout(route),line=path.coords.slice(i,i+2),point=[d.gpsPosition[1],d.gpsPosition[0]];
  const p=P.project(point,line),heading=P.heading(d.heading)?d.heading:d.vehicleHeading;
  if(!p||p.offset>10||!P.heading(heading)||P.delta(heading,p.heading)>30){previous=null;matched=null;return;}
  const where=model.locate(path,i,p.along/p.total);if(!where){previous=null;matched=null;return;}
  readCell={segment:where.cell.segment,at:Date.now()-d.gpsFixAgeMs};
  const road=window.JalanVectorMap?.getReportRoad?.(point,heading,d.gpsAccuracy,true);
  if(!P.sameRoad(road,window.JalanVectorMap?.getReportRoad?.(p.point,p.heading,d.gpsAccuracy,true))){previous=null;matched=null;return;}
  const at=Date.now()-d.gpsFixAgeMs,old=previous,now={...where,road,point,at,anchor:where.along,verified:false};
  previous=now;matched=null;
  if(!old||at<=old.at||at-old.at>12000||!P.sameRoad(old.road,road)||where.along<old.along-4)return;
  const movement=where.along-old.along,elapsed=(at-old.at)/1000,speed=d.speedMps*3.6;
  if(movement>elapsed*60+10||(P.distance(old.point,point)>8&&P.delta(P.bearing(old.point,point),heading)>38))return;
  now.anchor=old.anchor;
  now.verified=old.verified||where.along-old.anchor>=6;
  now.entry=old.cell===where.cell?(old.entry||{along:old.along,at:old.at}):
   {along:where.cell.start,at:at-(where.along-where.cell.start)*1000/(movement/elapsed)};
  if(!now.verified)return;
  matched=now;
  if(!enabled)return;
  const normal=window.JalanRouteTraffic?.freeFlowAt(route,i,point);
  // Mean speed across the measured traversal, including time spent stopped.
  for(let n=old.cell.order;n<=where.cell.order&&n<=old.cell.order+10;n++){
   const c=path.cells[n],length=c.end-c.start,exit=c.end-length*.2;
   const entry=c===old.cell?(old.entry||{along:old.along,at:old.at}):
    {along:c.start,at:old.at+(c.start-old.along)*1000/(movement/elapsed)};
   const crossed=length>=6&&entry.along<=c.start+length*.2&&old.along<exit&&where.along>=exit;
   if(crossed){
    const exitTime=old.at+(exit-old.along)*1000/(movement/elapsed);
    const mean=(exit-entry.along)*3600/(exitTime-entry.at);
    if(mean>=0&&mean<=200&&at-entry.at<290000){
     const baseline=c===where.cell?normal:window.JalanRouteTraffic?.freeFlowAt(route,c.index,path.coords[c.index]);
     send(c,road,Math.min(speed,mean),baseline,Math.ceil(Date.now()-entry.at));continue;
    }
   }
   if(c===where.cell)send(c,road,speed,normal);
  }
  for(const [k,v]of lastSent)if(at-v.at>300000)lastSent.delete(k);
 }
 window.addEventListener('jalan:journey-start',()=>{active=true;read();});
 window.addEventListener('jalan:journey-stop',stop);window.addEventListener('pagehide',stop);
 window.addEventListener('jalan:route-cleared',stop);
 window.addEventListener('jalan:gps-fix',e=>fix(e.detail||{}),{capture:true});
 document.addEventListener('visibilitychange',()=>{resetWrites();if(document.hidden){reader?.abort();}else if(active)read();});
 setInterval(()=>{if(!active||document.hidden)return;if(cacheUntil&&cacheUntil<=Date.now())refresh();read();},5000);
 window.JalanCommunityFlow={sections:current,eta:(r,f)=>model.remainingDelay(r,current(r),f),
  match:(point,road)=>{
   if(!matched||Date.now()-matched.at>10000||!P.sameRoad(road,matched.road)||P.distance(point,matched.point)>80)return null;
   const path=model.layout(route),p=P.project(point,path.coords);
   if(!p||p.offset>10||Math.abs(p.along-matched.along)>90)return null;
   const a=path.coords[p.index-1],b=path.coords[p.index],edge=P.project(point,[a,b]);
   return model.roadSegment(model.locate(path,p.index-1,edge.along/edge.total)?.cell,road);
  },
  condition:()=>{const s=matched&&Date.now()-matched.at<=10000&&lookup.get(matched.cell.segment);if(s&&s.expiresAt>Date.now()&&P.sameRoad(matched.road,s.road))return s;
   // On a basic map a reliable route match can suppress an unnecessary question.
   const moving=readCell&&Date.now()-readCell.at<=10000&&lookup.get(readCell.segment);
   return moving?.type==='smooth'&&moving.expiresAt>Date.now()?moving:null;}};
})();
