// Display geometry is parameterised by distance on the original provider route.
// That keeps partial traffic colours and the travelled line on the same curves.
(() => {
 'use strict';
 const cache=new WeakMap();
 const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
 function delta(a,b){
   return [(b[0]-a[0])*111320*Math.cos((a[1]+b[1])*Math.PI/360),(b[1]-a[1])*111320];
 }
 function shape(route){
   const input=route.geometry.coordinates;
   const saved=cache.get(route);
   if(saved?.input===input)return saved.path;
   const protectedPoints=new Set(),protectedIndices=new Set();
   for(const leg of route.legs||[])for(const step of leg.steps||[]){
     protectedIndices.add(step.pointIndex);
     const at=step.location||step.maneuver?.location;
     if(Array.isArray(at))protectedPoints.add(at.join(','));
   }
   const points=[],offsets=[],lengths=[0];
   for(let i=1;i<input.length;i++)lengths.push(lengths[i-1]+Math.hypot(...delta(input[i-1],input[i])));
   function add(point,offset){
     if(offset===offsets.at(-1))return;
     points.push(point);offsets.push(offset);
   }
   add(input[0],0);
   for(let i=1;i<input.length-1;i++){
     const a=input[i-1],b=input[i],c=input[i+1],at=lengths[i];
     const before=at-lengths[i-1],after=lengths[i+1]-at;
     const u=delta(a,b),v=delta(b,c);
     const cosine=(u[0]*v[0]+u[1]*v[1])/(before*after);
     // Keep actual junctions, hairpins and straight sections. Round a bend
     // locally, limiting the lateral cut even on widely spaced motorway points.
     if(!(cosine>0.17&&cosine<0.99985)||protectedIndices.has(i)||protectedPoints.has(b.join(','))){
       add(b,at);continue;
     }
     const trim=Math.min(16,before*.30,after*.30,3/Math.sqrt((1-cosine)/2));
     const entry=mix(b,a,trim/before),exit=mix(b,c,trim/after);
     for(let j=0;j<=6;j++){
       const t=j/6;
       add(mix(mix(entry,b,t),mix(b,exit,t),t),at+(2*t-1)*trim);
     }
   }
   add(input.at(-1),lengths.at(-1));
   const path={points,offsets,total:lengths.at(-1)};
   cache.set(route,{input,path});return path;
 }
 function section(path,from=0,to=path.total){
   if(from>=to)return [];
   if(from===0&&to===path.total)return path.points;
   const points=[];
   for(let i=1;i<path.points.length;i++){
     const a=path.offsets[i-1],b=path.offsets[i];
     if(b<=from)continue;
     if(a>=to)break;
     const first=path.points[i-1],last=path.points[i];
     if(!points.length)points.push(from>a?mix(first,last,(from-a)/(b-a)):first);
     points.push(to<b?mix(first,last,(to-a)/(b-a)):last);
   }
   return points;
 }
 // Shared by the basic and detailed maps. Widths are CSS pixels at Leaflet zoom.
 const widthStops=[[0,2],[12,5],[16,8],[20,14]];
 function widthAtZoom(zoom){
   for(let i=1;i<widthStops.length;i++){
     const [lo,a]=widthStops[i-1],[hi,b]=widthStops[i];
     if(zoom<=hi)return a+(b-a)*Math.max(0,(zoom-lo)/(hi-lo));
   }
   return widthStops.at(-1)[1];
 }
 window.JalanRouteDisplay={shape,section,widthAtZoom,widthStops};
})();
