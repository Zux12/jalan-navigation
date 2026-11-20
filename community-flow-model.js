/* Distances use the original route geometry so map colours and ETA share boundaries. */
(function(root,build){if(typeof module==='object'&&module.exports)module.exports=build();else root.JalanFlowModel=build();})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const cache=new WeakMap();
 function hash(s){
  let a=2166136261,b=5381;
  for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b,33)^s.charCodeAt(i);}
  return 's'+[a,b].map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
 }
 function layout(route){
  if(!route?.geometry?.coordinates)return null;
  const coords=route.geometry.coordinates,saved=cache.get(route);
  if(saved?.coords===coords)return saved;
  const cells=[],edges=[],regions=new Set(),offsets=[0];
  for(let i=1;i<coords.length;i++){
   const a=coords[i-1],b=coords[i],dx=(b[0]-a[0])*111320*Math.cos((a[1]+b[1])*Math.PI/360),dy=(b[1]-a[1])*111320;
   const len=Math.hypot(dx,dy),count=Math.ceil(len/120),edge=[];
   offsets.push(offsets[i-1]+len);
   for(let j=0;j<count;j++){
    const f=(j+.5)/count,x=a[0]+(b[0]-a[0])*f,y=a[1]+(b[1]-a[1])*f;
    const region='r'+Math.floor(x*10)+'_'+Math.floor(y*10);
    const segment=hash([a[0],a[1],b[0],b[1]].map(n=>n.toFixed(5)).join(',')+'|'+j+'/'+count);
    const cell={segment,region,start:offsets[i-1]+len*j/count,end:j===count-1?offsets[i]:offsets[i-1]+len*(j+1)/count,index:i-1,order:cells.length};
    cells.push(cell);edge.push(cell);regions.add(region);
   }
   edges.push(edge);
  }
  const value={coords,cells,edges,regions:[...regions],offsets,total:offsets.at(-1)};cache.set(route,value);return value;
 }
 function locate(path,index,fraction){
  const edge=path?.edges[index];if(!edge?.length||!Number.isFinite(fraction))return null;
  const t=Math.max(0,Math.min(1,fraction)),cell=edge[Math.min(edge.length-1,Math.floor(t*edge.length))];
  return {cell,along:path.offsets[index]+t*(path.offsets[index+1]-path.offsets[index])};
 }
 function remainingDelay(route,sections,fraction,now=Date.now()){
  if(route?.provider!=='tomtom'||!sections?.length||!Number.isFinite(fraction))return 0;
  const path=layout(route),progress=path.total*Math.max(0,Math.min(1,fraction));
  let extra=0;const attributed=new Map();
  for(const s of sections){
   const start=Math.max(progress,s.start),length=s.end-start;
   if(length<=0||s.type==='smooth'||!(s.speed>0&&s.normal>s.speed)||s.expiresAt<=now)continue;
   const covering=(route.trafficSections||[]).filter(t=>t.sectionType==='TRAFFIC'&&path.offsets[t.startPointIndex]<s.end&&path.offsets[t.endPointIndex]>start);
   if(covering.some(t=>t.simpleCategory==='ROAD_CLOSURE'))continue;
   let baseline;
   if(covering.length===1&&path.offsets[covering[0].startPointIndex]<=start&&path.offsets[covering[0].endPointIndex]>=s.end&&covering[0].effectiveSpeedInKmh>0)
    baseline=Math.min(s.normal,covering[0].effectiveSpeedInKmh);
   else if(covering.length===1&&Number.isFinite(covering[0].delayInSeconds)&&covering[0].delayInSeconds>=0&&
    path.offsets[covering[0].startPointIndex]<=start&&path.offsets[covering[0].endPointIndex]>=s.end){
    // Subtract known provider delay once. Avoid guessing its distribution in a partially covered section.
    const t=covering[0];attributed.set(t,(attributed.get(t)||0)+length*3.6*(1/s.speed-1/s.normal));continue;
   }else if(route.knownTrafficDelay===0&&!covering.length)baseline=s.normal;
   else continue;
   extra+=Math.max(0,length*3.6*(1/s.speed-1/baseline));
  }
  for(const [section,observed]of attributed)extra+=Math.max(0,observed-section.delayInSeconds);
  return extra;
 }
 // Preserve a geometry prefix for inexpensive regional reads. The full ID
 // binds the direction, vector road identity and grade before aggregation.
 function roadSegment(cell,road){
  if(!cell||!road||!/^vector-[a-f0-9]{1,8}$/.test(road.key)||!/^-?\d{1,2}:(surface|bridge|tunnel)$/.test(road.level))return null;
  return cell.segment.slice(0,9)+hash(cell.segment+'|'+road.key+'|'+road.level).slice(1,9);
 }
 function readRoad(path,cell,resolve){
  const i=cell.index,a=path.coords[i],b=path.coords[i+1],len=path.offsets[i+1]-path.offsets[i];
  const dx=(b[0]-a[0])*Math.cos((a[1]+b[1])*Math.PI/360),heading=(Math.atan2(dx,b[1]-a[1])*180/Math.PI+360)%360;
  let road=null;
  for(const f of [.2,.5,.8]){
   const t=(cell.start+(cell.end-cell.start)*f-path.offsets[i])/len;
   const candidate=resolve([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],heading,8,true);
   if(!candidate||(road&&(road.key!==candidate.key||road.level!==candidate.level)))return null;
   road=candidate;
  }
  return road;
 }
 return {layout,locate,remainingDelay,roadSegment,readRoad};
});
