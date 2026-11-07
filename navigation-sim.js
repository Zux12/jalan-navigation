/* Jalan V3.7 — stationary-only route playback, no live driving guidance. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const hud=el('nav-hud'), startButton=el('nav-start');
  let active=false, playing=false, timer=null, marker=null, geometry=[], cumulative=[], total=0, progress=0, lastTime=0, route=null;
  const R=6371000;
  const rad=n=>n*Math.PI/180;
  function distance(a,b){const dLat=rad(b[0]-a[0]),dLng=rad(b[1]-a[1]);const x=Math.sin(dLat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(x)));}
  function pointAt(m){if(!geometry.length)return null;const d=Math.max(0,Math.min(total,m));let hi=1;while(hi<cumulative.length-1&&cumulative[hi]<d)hi++;const a=geometry[hi-1],b=geometry[hi],span=cumulative[hi]-cumulative[hi-1];const t=span?Math.min(1,Math.max(0,(d-cumulative[hi-1])/span)):0;return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}
  function makePath(){route=routes[selectedRoute];if(!route?.geometry?.coordinates?.length)return false;geometry=route.geometry.coordinates.map(p=>[p[1],p[0]]).filter(p=>p.every(Number.isFinite));if(geometry.length<2)return false;cumulative=[0];for(let i=1;i<geometry.length;i++)cumulative.push(cumulative[i-1]+distance(geometry[i-1],geometry[i]));total=cumulative.at(-1);return total>5;}
  function closestInstruction(){const steps=(route.legs||[]).flatMap(x=>x.steps||[]).filter(x=>x.maneuver?.type!=='arrive');let distanceAlong=0;let next=null;
    // OSRM steps expose maneuver.location as [longitude, latitude].
    // TomTom normalized steps currently do not contain maneuver coordinates;
    // do not invent precise turn distances for them.
    for(const step of steps){const loc=step.maneuver?.location;if(!Array.isArray(loc)||loc.length<2)continue;const p=[loc[1],loc[0]];let best=Infinity,idx=-1;for(let i=0;i<geometry.length;i++){const d=distance(p,geometry[i]);if(d<best){best=d;idx=i;}}if(idx<0||best>100)continue;distanceAlong=cumulative[idx];if(distanceAlong>progress+15&&(!next||distanceAlong<next.at))next={step,at:distanceAlong};}
    return next;
  }
  function render(){if(!active)return;const pos=pointAt(progress);if(!pos)return;marker?.setLatLng(pos);map.panTo(pos,{animate:false});const ratio=Math.min(1,progress/total),remainingMeters=Math.max(0,route.distance*(1-ratio));const remainingSeconds=Math.max(0,route.duration*(1-ratio));el('nav-time').textContent=remainingSeconds<60?'0 min':fmtTime(remainingSeconds);el('nav-distance').textContent=fmtDist(remainingMeters);el('nav-arrival').textContent=new Date(Date.now()+remainingSeconds*1000).toLocaleTimeString('en-MY',{hour:'numeric',minute:'2-digit'});
    const next=closestInstruction();if(next){const howFar=Math.max(0,next.at-progress);const text=next.step.name||'next road';el('nav-instruction').textContent=`${next.step.maneuver.modifier||next.step.maneuver.type||'Continue'} in ${fmtDist(howFar)}`;el('nav-next').textContent=text;el('nav-arrow').textContent=/left/i.test(next.step.maneuver.modifier||'')?'↰':/right/i.test(next.step.maneuver.modifier||'')?'↱':'↑';}else{el('nav-instruction').textContent=ratio>=1?'Destination reached (simulation)':'Continue on selected route';el('nav-next').textContent=route.provider==='tomtom'?'TomTom route playback — turn distances unavailable':'Route preview';el('nav-arrow').textContent='↑';}
    if(ratio>=1){playing=false;el('nav-play').textContent='Replay simulation';el('nav-warning').textContent='Simulation complete. No real journey was tracked.';el('nav-warning').classList.remove('hidden');}
  }
  function tick(now){if(!active)return;if(playing){if(lastTime){const dt=Math.min(0.25,(now-lastTime)/1000);const metersPerSecond=Math.max(4,total/90);progress=Math.min(total,progress+dt*metersPerSecond);render();}lastTime=now;}else lastTime=0;timer=requestAnimationFrame(tick);}
  function start(){if(!makePath()){statusEl.textContent='Calculate a route before starting the simulation.';return;}stop();if(!makePath())return;active=true;playing=true;progress=0;lastTime=0;document.body.classList.add('nav-active');hud.classList.remove('hidden');el('nav-warning').classList.add('hidden');el('nav-play').textContent='Pause simulation';marker=L.marker(geometry[0],{icon:L.divIcon({className:'nav-sim-dot',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(map);map.setView(geometry[0],15);render();timer=requestAnimationFrame(tick);}
  function stop(){active=false;playing=false;if(timer!==null)cancelAnimationFrame(timer);timer=null;lastTime=0;if(marker){map.removeLayer(marker);marker=null;}hud.classList.add('hidden');document.body.classList.remove('nav-active');setTimeout(()=>map.invalidateSize(),80);}
  startButton.onclick=start;el('nav-exit').onclick=()=>{stop();if(routes.length)renderRoutes();};el('nav-play').onclick=()=>{if(!active)return;if(progress>=total)progress=0;playing=!playing;el('nav-play').textContent=playing?'Pause simulation':'Resume simulation';el('nav-warning').classList.add('hidden');lastTime=0;};el('nav-restart').onclick=()=>{progress=0;playing=true;lastTime=0;el('nav-play').textContent='Pause simulation';el('nav-warning').classList.add('hidden');render();};el('nav-recenter').onclick=()=>{if(active)map.setView(pointAt(progress),15);};
  window.JalanNavigation={stop,routeReady(){startButton.classList.remove('hidden');}};
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active){playing=false;lastTime=0;el('nav-play').textContent='Resume simulation';el('nav-warning').textContent='Simulation paused because this tab is in the background.';el('nav-warning').classList.remove('hidden');}});
})();
