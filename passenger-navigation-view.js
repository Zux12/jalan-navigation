/* Navigation camera preferences: percentage controls over the close-up view range. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.JalanNavigationView=factory();})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const defaults=Object.freeze({zoom:80,tilt:100});
 const percent=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(100,Math.round(value))):fallback;
 const sanitize=value=>({zoom:percent(value?.zoom,defaults.zoom),tilt:percent(value?.tilt,defaults.tilt)});
 const zoomLevel=value=>14+percent(value,defaults.zoom)*.06;
 const pitch=value=>percent(value,defaults.tilt)*.6;
 function anchor({height,barTop,vehicleSize=84,gap=12}){
  const y=Math.max(vehicleSize/2,Math.min(height-vehicleSize/2,barTop-vehicleSize/2-gap)),shift=2*y-height;
  return {y,padding:{top:Math.max(0,shift),bottom:Math.max(0,-shift),left:0,right:0}};
 }
 function rasterOffset({height,y,angle,tilt}){
  const flat=tilt===0,r=Math.PI/180,p=(flat?0:17*tilt/100)*r,dy=y-height/2;
  // Invert the existing CSS perspective/rotation rather than draw a fake fixed vehicle.
  const distance=dy/(Math.cos(p)+dy*Math.sin(p)/1200)/(flat?1:1.35);
  return {x:distance*Math.sin(angle*r),y:distance*Math.cos(angle*r)};
 }
 return {defaults,sanitize,zoomLevel,pitch,anchor,rasterOffset};
});
