(() => {
 'use strict';
 const coords=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180?[p.lat,p.lon]:null;
 const meters=(a,b)=>Math.hypot(a[0]-b[0],(a[1]-b[1])*Math.cos((a[0]+b[0])*Math.PI/360))*111320;
 const clean=s=>String(s||'').trim().toLowerCase();
 function connector(c){
   const type={IEC62196Type2CCS:'CCS2',IEC62196Type1CCS:'CCS1',IEC62196Type2Outlet:'Type 2',IEC62196Type2CableAttached:'Type 2'}[c.connectorType]||c.connectorType;
   return [/^AC/.test(c.currentType)?'AC':c.currentType==='DC'?'DC':'',c.ratedPowerKW>0?c.ratedPowerKW+' kW':'',type].filter(Boolean).join(' · ');
 }
 function station(raw){
   const point=coords(raw?.position),poi=raw?.poi;
   if(!point||!poi?.name||!raw.id)return null;
   const ids=(poi.categorySet||[]).map(c=>String(c.id)),labels=clean((poi.categories||[]).join(' '));
   const connectors=raw.chargingPark?.connectors||[];
   const ev=ids.some(id=>id.startsWith('7309'))||connectors.length>0||/electric vehicle|charging station/.test(labels);
   const petrol=ids.some(id=>id.startsWith('7311'))||/petrol station|gas station|fuel station/.test(labels);
   if(!ev&&!petrol)return null;
   const address=raw.address||{};
   return {id:raw.id,name:poi.name,point,access:coords(raw.entryPoints?.find(e=>e.type==='main')?.position)||point,
     petrol,ev,address:address.freeformAddress||'',streetNumber:address.streetNumber,street:address.streetName,
     brand:(poi.brands||[]).map(x=>clean(x.name)).filter(Boolean),
     related:(raw.relatedPois||[]).map(x=>x.id).filter(Boolean),
     details:[...new Set(connectors.map(connector).filter(Boolean))],
     hpc:/\bHPC\b|high[- ](?:performance|power) charg/i.test(poi.name),evName:ev?poi.name:''};
 }
 function sameSite(a,b){
   if(a.related.includes(b.id)||b.related.includes(a.id))return true;
   const d=meters(a.point,b.point);
   if(d>55)return false;
   const direction=s=>(clean(s).match(/\b(?:northbound|southbound|eastbound|westbound|arah (?:utara|selatan|timur|barat))\b/)||[])[0];
   if(direction(a.name)&&direction(b.name)&&direction(a.name)!==direction(b.name))return false;
   if(d<=6)return true;
   if(a.streetNumber&&b.streetNumber&&clean(a.streetNumber)===clean(b.streetNumber)&&a.street&&clean(a.street)===clean(b.street))return true;
   const brands=['shell','petronas','petron','caltex','bhpetrol',...a.brand].filter(Boolean);
   const nameHas=(s,brand)=>clean(s.name).split(/[^a-z0-9]+/).includes(brand)||s.brand.includes(brand);
   return d<=35&&brands.some(brand=>nameHas(a,brand)&&nameHas(b,brand));
 }
 function merge(rows){
   const unique=Array.from(new Map(rows.filter(Boolean).map(r=>[r.id,r])).values());
   const petrol=unique.filter(r=>r.petrol).map(r=>({...r,details:[...r.details]}));
   const cells=new Map(),byId=new Map(),related=new Map(),separate=[];
   const cell=s=>s.point.map(n=>Math.floor(n*1000));
   for(const site of petrol){
     byId.set(site.id,site);for(const id of site.related)related.set(id,site);
     const key=cell(site).join('/');if(!cells.has(key))cells.set(key,[]);cells.get(key).push(site);
   }
   for(const ev of unique.filter(r=>!r.petrol)){
     const [x,y]=cell(ev),near=new Set([related.get(ev.id),...ev.related.map(id=>byId.get(id))].filter(Boolean));
     for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
       for(const p of cells.get([x+dx,y+dy].join('/'))||[])near.add(p);
     }
     const matches=[...near].filter(p=>sameSite(p,ev)).sort((a,b)=>meters(a.point,ev.point)-meters(b.point,ev.point));
     const site=matches[0];
     if(site){
       site.ev=true;site.hpc||=ev.hpc;site.evName=ev.name;
       site.details=Array.from(new Set([...site.details,...ev.details]));
     }else separate.push(ev);
   }
   return petrol.concat(separate);
 }
 // UI Kit results may only provide an ID and point. Combine them with a
 // locally listed forecourt only at the same entrance, never by street alone.
 function withGoogle(rows,google){
   if(!google.length)return rows;
   const combined=[...rows];
   for(const item of google){
     const i=combined.findIndex(s=>s.googleId===item.googleId||meters(s.point,item.point)<=6);
     if(i<0){combined.push(item);continue;}
     const local=combined[i];
     combined[i]={...local,name:local.name||item.name,googleId:local.googleId||item.googleId,
       ev:!!(local.ev||item.ev),petrol:!!(local.petrol||item.petrol)};
   }
   return combined;
 }
 async function nearby(center,radius,key,signal){
   const rows=[];
   for(let offset=0;;){
     const url=new URL('https://api.tomtom.com/search/2/nearbySearch/.json');
     url.search=new URLSearchParams({lat:center[0],lon:center[1],radius,limit:100,ofs:offset,countrySet:'MY',categorySet:'7309,7311',relatedPois:'all',key});
     const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),credentials:'omit'});
     if(!response.ok)throw Error('Station lookup unavailable');
     const data=await response.json(),items=data.results||[];
     rows.push(...items.map(station).filter(Boolean));offset+=items.length;
     if(!items.length||offset>=Number(data.summary?.totalResults)||items.length<100)break;
   }
   return merge(rows);
 }
 const api={station,merge,meters,nearby,withGoogle};
 if(typeof module==='object'&&module.exports)module.exports=api;else window.JalanStationData=api;
})();
