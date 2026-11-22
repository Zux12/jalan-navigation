// Passenger lane arrows and schematic forks use only the active maneuver.
(() => {
 'use strict';
 // All right-hand shapes are mirrored for their left-hand counterparts.
 const arrows={
  STRAIGHT:'M16 29V5 M10 11l6-6 6 6',
  SLIGHT_RIGHT:'M16 29v-9l9-12 M17 9l8-1 1 8',
  RIGHT:'M16 29V18q0-6 6-6h6 M22 6l6 6-6 6',
  SHARP_RIGHT:'M16 29V14q0-8 6-5l6 5 M28 7v7l-7 1',
  RIGHT_U_TURN:'M12 29V13a7 7 0 0 1 14 0v6 M21 14l5 5 5-5'
 };
 function shape(direction){
  if(typeof direction!=='string')return null;
  return Object.hasOwn(arrows,direction.replace('LEFT','RIGHT'))?arrows[direction.replace('LEFT','RIGHT')]:null;
 }
 function lanesAt(step){
  // OSRM's first intersection is the maneuver itself. Later intersections
  // in that step describe other decisions along the outgoing road.
  const intersection=step.intersections?.[0],location=step.maneuver?.location;
  const osrm=Array.isArray(location)&&location.length===2&&Array.isArray(intersection?.location)&&
   intersection.location[0]===location[0]&&intersection.location[1]===location[1];
  const raw=osrm?intersection.lanes:step.lanes;
  if(!Array.isArray(raw)||raw.length<2)return null;
  const lanes=[];
  for(const lane of raw){
   let directions=lane?.directions,follow=lane?.follow;
   if(osrm){
    if(typeof lane?.valid!=='boolean'||!Array.isArray(lane.indications))return null;
    directions=lane.indications.map(d=>typeof d==='string'?d.toUpperCase().replaceAll(' ','_'):'');
    follow=lane.valid?(directions.length===1?directions[0]:step.maneuver.modifier?.toUpperCase().replaceAll(' ','_')):null;
    if(lane.valid&&!follow)return null;
   }
   if(!Array.isArray(directions)||!directions.length||!directions.every(shape)||
      (follow!=null&&!directions.includes(follow)))return null;
   lanes.push({directions,follow});
  }
  return lanes.some(l=>l.follow)?lanes:null;
 }
 function forkAt(step){
  const type=step.maneuver?.type,exit=['TAKE_EXIT','MOTORWAY_EXIT_LEFT','MOTORWAY_EXIT_RIGHT','off ramp'].includes(type);
  const fork=type==='fork'||step.junctionType==='BIFURCATION'||type==='KEEP_LEFT'||type==='KEEP_RIGHT';
  if((!exit&&!fork)||step.junctionType==='ROUNDABOUT')return null;
  const modifier=type==='fork'||type==='off ramp'?step.maneuver.modifier:'';
  const explicit={MOTORWAY_EXIT_LEFT:'left',MOTORWAY_EXIT_RIGHT:'right',KEEP_LEFT:'left',KEEP_RIGHT:'right'}[type]||
   /^(?:slight |sharp )?(left|right)$/.exec(modifier)?.[1];
  const angle=step.turnAngleInDecimalDegrees;
  const side=Number.isFinite(angle)&&Math.abs(angle)<180&&angle!==0?(angle<0?'left':'right'):null;
  if((side&&explicit&&side!==explicit)||(!side&&!explicit))return null;
  return {side:explicit||side,exit};
 }
 function visual(step,distance){
  if(!step||!Number.isFinite(distance)||distance<0||distance>800)return null;
  const fork=distance<=200?forkAt(step):null;
  if(fork)return {fork};
  const lanes=lanesAt(step);
  return lanes?{lanes}:null;
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={visual};return;}
 if(new URLSearchParams(location.search).get('mode')!=='passenger')return;
 const guide=document.getElementById('passenger-junction-guide');
 let lastStep,lastPhase,lastLanguage;
 function svgElement(tag,attributes){
  const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [name,value] of Object.entries(attributes))node.setAttribute(name,value);
  return node;
 }
 function picture(box){
  return svgElement('svg',{viewBox:box,'aria-hidden':'true',focusable:'false'});
 }
 function laneRow(lanes,ms){
  const row=document.createElement('span'),positions=[];
  row.className='junction-lanes';
  lanes.forEach(({directions,follow},index)=>{
   const glyph=picture('0 0 32 34');
   if(follow)positions.push(index+1);
   // Draw the route direction last so shared arrow stems stay blue.
   for(const dir of [...directions.filter(d=>d!==follow),...(follow?[follow]:[])]){
    const path=svgElement('path',{d:shape(dir),class:dir===follow?'recommended':'other'});
    if(dir.includes('LEFT'))path.setAttribute('transform','translate(32 0) scale(-1 1)');
    glyph.append(path);
   }
   row.append(glyph);
  });
  const numbers=positions.join(', ');
  return {drawing:row,label:ms?'Lorong di persimpangan (dari kiri): '+numbers:
   'Lanes to use at the junction (from left): '+numbers};
 }
 function forkDrawing({side,exit},ms){
  const drawing=picture('0 0 144 62');
  const roads=svgElement('g',side==='left'?{transform:'translate(144 0) scale(-1 1)'}:{});
  const other=exit?'M72 61V4':'M72 61V48Q72 37 61 26L39 4';
  roads.append(svgElement('path',{class:'other',d:other}),
   svgElement('path',{class:'recommended',d:'M72 61V48Q72 37 83 26L104 5'}),
   svgElement('path',{class:'junction-tip',d:'M94 3h13v13z'}));
  drawing.append(roads);
  const label=ms?(exit?'Ambil susur keluar di sebelah ':'Ikut cabang ')+(side==='left'?'kiri':'kanan'):
   (exit?'Take the '+side+' exit':'Take the '+side+' branch');
  return {drawing,label};
 }
 function clear(){
  lastStep=null;lastPhase=null;
  if(guide.hidden)return;
  guide.hidden=true;guide.replaceChildren();guide.removeAttribute('aria-label');
 }
 function render(instruction){
  if(!instruction){clear();return;}
  const {step,distance}=instruction,phase=distance<=200?'near':distance<=800?'approach':'far';
  const language=window.JalanLanguage?.code||'en';
  if(lastStep===step&&lastPhase===phase&&lastLanguage===language)return;
  const view=visual(step,distance);
  clear();lastStep=step;lastPhase=phase;lastLanguage=language;
  if(!view)return;
  const ms=language==='ms';
  const {drawing,label}=view.fork?forkDrawing(view.fork,ms):laneRow(view.lanes,ms);
  guide.dataset.view=view.fork?'fork':'lanes';guide.setAttribute('aria-label',label);
  guide.replaceChildren(drawing);guide.hidden=false;
 }
 window.JalanLaneGuidance={render,clear,hasGuide:step=>!!visual(step,0)};
})();
