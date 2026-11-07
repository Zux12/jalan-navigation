/* Jalan V3.8: experimental foreground GPS navigation. Not safe for driving. */
(() => {
  'use strict';
  const $g = id => document.getElementById(id);
  const R = 6371000, rad = x => x * Math.PI / 180;
  const meters = (a,b) => {const dlat=rad(b[0]-a[0]),dlon=rad(b[1]-a[1]);const x=Math.sin(dlat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dlon/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(x)));};
  let active=false, watch=null, marker=null, current=null, offCount=0, lastReroute=0, rerouting=false, auto=false, route=null, points=[], cumulative=[], total=0;
  const warn = message => {const e=$g('gps-warning');e.textContent=message;e.classList.toggle('hidden',!message);};
  function prepare(){route=routes[selectedRoute];if(!route?.geometry?.coordinates?.length)return false;points=route.geometry.coordinates.map(p=>[p[1],p[0]]);if(points.length<2)return false;cumulative=[0];for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+meters(points[i-1],points[i]));total=cumulative.at(-1);return total>10;}
  // Project a GPS fix onto the closest line segment; use local metre-scale coordinates.
  function project(p){let best={distance:Infinity,along:0};const sx=111320*Math.cos(rad(p[0])),sy=111320;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],ax=(a[1]-p[1])*sx,ay=(a[0]-p[0])*sy,dx=(b[1]-a[1])*sx,dy=(b[0]-a[0])*sy;const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));const d=Math.hypot(ax+t*dx,ay+t*dy);if(d<best.distance)best={distance:d,along:cumulative[i-1]+t*(cumulative[i]-cumulative[i-1])};}return best;}
  function update(fix){if(!active)return;const p=[fix.coords.latitude,fix.coords.longitude],accuracy=fix.coords.accuracy;current=p;updateLocation(p);marker?.setLatLng(p);$g('gps-accuracy').textContent=Math.round(accuracy)+' m';
    if(!Number.isFinite(accuracy)||accuracy>75){warn('Low GPS accuracy. Waiting for a more reliable position.');$g('gps-instruction').textContent='Waiting for accurate GPS';return;}
    const match=project(p),left=Math.max(0,total-match.along),remaining=route.distance*(left/total),secs=route.duration*(left/total);
    $g('gps-distance').textContent=fmtDist(remaining);$g('gps-eta').textContent=fmtTime(secs);$g('gps-instruction').textContent='Follow the selected route (test only)';$g('gps-detail').textContent=`Estimated arrival ${new Date(Date.now()+secs*1000).toLocaleTimeString('en-MY',{hour:'numeric',minute:'2-digit'})} · ${Math.round(match.distance)} m from route`;
    if(match.distance>Math.max(85,accuracy*2)){offCount++;warn(`Possible off-route position (${Math.round(match.distance)} m away). Confirm GPS accuracy before rerouting.`);if(offCount>=4&&auto&&Date.now()-lastReroute>90000)reroute();}
    else {offCount=0;warn('');if(remaining<45){$g('gps-instruction').textContent='Near destination (GPS test)';}}
    if(!document.hidden)map.panTo(p,{animate:false});
  }
  function start(){if(active)return;if(!prepare()){statusEl.textContent='Calculate a route before testing GPS navigation.';return;}if(!navigator.geolocation){statusEl.textContent='This browser does not support GPS.';return;}
    window.JalanNavigation?.stop();active=true;offCount=0;document.body.classList.add('nav-active');$g('gps-hud').classList.remove('hidden');$g('gps-instruction').textContent='Acquiring GPS…';warn('Test while stationary or as a passenger. Do not operate while driving.');
    marker=L.circleMarker(points[0],{radius:10,color:'#fff',weight:3,fillColor:'#0e9f6e',fillOpacity:1}).addTo(map);
    watch=navigator.geolocation.watchPosition(update,err=>{warn('GPS unavailable: '+err.message+'. Check Safari location permission.');},{enableHighAccuracy:true,maximumAge:1500,timeout:20000});
  }
  function stop(){active=false;if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null;}if(marker){map.removeLayer(marker);marker=null;}$g('gps-hud').classList.add('hidden');document.body.classList.remove('nav-active');setTimeout(()=>map.invalidateSize(),60);}
  async function reroute(){if(rerouting||!active||!current)return;if(Date.now()-lastReroute<15000)return;rerouting=true;lastReroute=Date.now();const wasAuto=auto;warn('Requesting a new route from current GPS position…');
    try {startPoint=[...current];await calculateRoutes();if(routes.length){start();auto=wasAuto;updateAuto();warn('Route recalculated. Verify it before continuing.');}else statusEl.textContent='Reroute failed. Check connection.';}
    catch(e){warn('Reroute failed: '+e.message);}finally{rerouting=false;}
  }
  function updateAuto(){$g('gps-auto').textContent='Auto reroute: '+(auto?'On':'Off');$g('gps-auto').setAttribute('aria-pressed',String(auto));}
  $g('gps-start').onclick=start;$g('gps-exit').onclick=()=>{stop();if(routes.length)renderRoutes();};$g('gps-recenter').onclick=()=>{if(current)map.setView(current,16);};$g('gps-reroute').onclick=reroute;$g('gps-auto').onclick=()=>{auto=!auto;updateAuto();};
  document.addEventListener('visibilitychange',()=>{if(active&&document.hidden)warn('Safari is in the background; GPS updates may pause. Keep the screen on for testing.');});
  window.JalanGPS={stop,routeReady(){$g('gps-start').classList.remove('hidden');}};
})();
