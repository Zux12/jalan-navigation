/* Jalan V4.2.1 — local synthetic road-speed confidence tests; no crowd uploads. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const rad = d => d * Math.PI / 180, R = 6371000;
  function meters(a,b) {
    const dlat=rad(b[0]-a[0]), dlon=rad(b[1]-a[1]);
    const x=Math.sin(dlat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dlon/2)**2;
    return 2*R*Math.asin(Math.min(1,Math.sqrt(x)));
  }
  let observations = new Map();
  const layer = L.layerGroup().addTo(map);
  let gpsWatch=null, gpsLast=null;
  let activeRouteKey='';
  function getRouteKey() {
    const r=routes?.[selectedRoute], pts=r?.geometry?.coordinates;
    return pts?.length ? `${selectedRoute}:${pts.length}:${pts[0].join(',')}:${pts[pts.length-1].join(',')}` : '';
  }
  function routeSegments() {
    const coords=routes?.[selectedRoute]?.geometry?.coordinates;
    if(!coords || coords.length<2) return [];
    const pts=coords.map(c=>[c[1],c[0]]), segments=[];
    let segment=[pts[0]], distance=0;
    for(let i=1;i<pts.length;i++) {
      const a=pts[i-1], b=pts[i], d=meters(a,b);
      if(d<0.001) continue;
      let traveled=0;
      while(distance+(d-traveled)>=200) {
        const take=200-distance;
        const f=(traveled+take)/d;
        const cut=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
        segment.push(cut);
        segments.push(segment);
        segment=[cut];
        traveled+=take;
        distance=0;
      }
      segment.push(b);
      distance+=d-traveled;
    }
    if(segment.length>1 && distance>5)segments.push(segment);
    return segments;
  }
  function classify(o) {
    const ratio=o.speed/o.normal;
    const level=ratio<.25?'Severe congestion':ratio<.5?'Heavy congestion':ratio<.75?'Slow traffic':'Normal / near-normal';
    const confirmed=o.drivers>=3 && o.minutes>=2;
    const color=!confirmed?'#94a3b8':ratio<.25?'#b91c1c':ratio<.5?'#ef4444':ratio<.75?'#f59e0b':'#16a34a';
    return {ratio,level,confirmed,color};
  }
  function getNumbers() {
    const vals=['si-limit','si-normal','si-speed','si-drivers','si-minutes','si-segment'].map(id=>Number(el(id).value));
    const [limit,normal,speed,drivers,minutes,segment]=vals;
    if(vals.some(v=>!Number.isFinite(v))||limit<10||limit>130||normal<5||normal>130||speed<0||speed>150||drivers<1||drivers>100||!Number.isInteger(drivers)||minutes<0||minutes>60||segment<1||!Number.isInteger(segment)) throw Error('Check input ranges; drivers and segment must be whole numbers.');
    return {limit,normal,speed,drivers,minutes,segment};
  }
  function resetIfRouteChanged() {
    const key=getRouteKey();
    if(key!==activeRouteKey){observations.clear();layer.clearLayers();activeRouteKey=key;}
  }
  function draw(message='') {
    resetIfRouteChanged();layer.clearLayers();
    const segs=routeSegments(), results=el('si-results');results.replaceChildren();
    const items=[...observations.entries()].sort((a,b)=>a[0]-b[0]);
    let confirmed=0,unconfirmed=0;
    for(const [index,o] of items) {
      const c=classify(o);c.confirmed?confirmed++:unconfirmed++;
      const div=document.createElement('div');div.className='si-result';
      const verdict=c.confirmed?'CONFIRMED (synthetic test)':'INSUFFICIENT EVIDENCE (unconfirmed)';
      div.textContent=`Segment ${index} — ${verdict} · ${c.level} · ${o.speed} / ${o.normal} km/h (${Math.round(c.ratio*100)}%) · ${o.drivers} independent drivers · ${o.minutes} min`;
      results.appendChild(div);
      if(segs[index-1]) {
        const path=segs[index-1];
        // A light casing keeps the experimental overlay visible above the blue navigation route.
        L.polyline(path,{color:'#ffffff',weight:17,opacity:.95,interactive:false}).addTo(layer);
        L.polyline(path,{color:c.color,weight:11,opacity:1}).addTo(layer).bindPopup(div.textContent);
      }
    }
    el('si-status').textContent=message || (items.length ? `${items.length} segment(s) analyzed: ${confirmed} confirmed, ${unconfirmed} unconfirmed. Synthetic observations only.`:'No observations. Experimental overlay cleared.');
  }
  el('si-add').onclick=()=>{
    try {
      resetIfRouteChanged();const o=getNumbers(),max=routeSegments().length;
      if(!max)throw Error('Calculate a route first.');
      if(o.segment>max)throw Error(`Choose segment 1–${max}.`);
      // A test entry is a synthetic aggregate for ONE segment. Replaces previous data for that segment.
      observations.set(o.segment,o);
      const c=classify(o);
      draw(`Segment ${o.segment}: ${c.confirmed?'CONFIRMED':'INSUFFICIENT EVIDENCE'} — ${c.level}. ${o.drivers} drivers for ${o.minutes} min. This replaces the previous test entry for this segment.`);
    } catch(e) {el('si-status').textContent=e.message;}
  };
  el('si-demo').onclick=()=>{
    resetIfRouteChanged();const segs=routeSegments();
    if(!segs.length){el('si-status').textContent='Calculate a route before running the demo.';return;}
    observations.clear();const speeds=[85,65,30,12,9,28,67,88];
    for(let i=0;i<Math.min(segs.length,speeds.length);i++)observations.set(i+1,{normal:90,limit:110,speed:speeds[i],drivers:i===1?2:5,minutes:3,segment:i+1});
    draw('Synthetic multi-driver demo loaded. For tests 4 and 5, click Clear observations, enter driver count, then Add observation.');
  };
  el('si-clear').onclick=()=>{observations.clear();draw();};
  function stopGPS(){if(gpsWatch!==null){navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;}gpsLast=null;el('si-gps-status').textContent='Local GPS sampling stopped. No GPS coordinates were stored.';}
  el('si-gps-start').onclick=()=>{
    if(!el('si-gps-consent').checked){el('si-gps-status').textContent='Enable the opt-in checkbox first.';return;}
    if(gpsWatch!==null)return;
    if(!navigator.geolocation){el('si-gps-status').textContent='GPS unavailable.';return;}
    el('si-gps-status').textContent='Waiting for accurate GPS readings…';
    gpsWatch=navigator.geolocation.watchPosition(fix=>{
      if(!el('si-gps-consent').checked){stopGPS();return;}
      const p=[fix.coords.latitude,fix.coords.longitude],t=fix.timestamp,accuracy=fix.coords.accuracy;
      if(accuracy>35){el('si-gps-status').textContent=`GPS accuracy ${Math.round(accuracy)} m — reading ignored.`;return;}
      let speed=fix.coords.speed;
      if((speed===null||!Number.isFinite(speed))&&gpsLast&&t>gpsLast.t+2000)speed=meters(gpsLast.p,p)/((t-gpsLast.t)/1000);
      gpsLast={p,t};
      if(Number.isFinite(speed)&&speed>=0&&speed<60)el('si-gps-status').textContent=`Local GPS speed: ${(speed*3.6).toFixed(1)} km/h · accuracy ${Math.round(accuracy)} m. Not shared or used to confirm congestion.`;
    },e=>{el('si-gps-status').textContent='GPS error: '+e.message;},{enableHighAccuracy:true,maximumAge:1000,timeout:20000});
  };
  el('si-gps-stop').onclick=stopGPS;
  el('si-gps-consent').onchange=()=>{if(!el('si-gps-consent').checked)stopGPS();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopGPS();});
  window.addEventListener('pagehide',stopGPS);
  window.JalanSpeedIntelligence={clear:()=>{observations.clear();draw();},version:'4.2.1'};
})();
