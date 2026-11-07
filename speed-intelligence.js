/* Jalan V4.2 — local prototype only. No crowd data uploaded, no persistent GPS. */
(() => {
  'use strict';
  const el=id=>document.getElementById(id), R=6371000;
  const rad=d=>d*Math.PI/180;
  function meters(a,b){const dlat=rad(b[0]-a[0]),dlon=rad(b[1]-a[1]);const x=Math.sin(dlat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dlon/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(x)));}
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  let samples=new Map(), layer=L.layerGroup().addTo(map), gpsWatch=null, gpsLast=null;
  function routeSegments(){const route=routes[selectedRoute];const coords=route?.geometry?.coordinates;if(!coords||coords.length<2)return [];
    const points=coords.map(c=>[c[1],c[0]]), segments=[];let start=points[0], prev=points[0], length=0;
    for(let i=1;i<points.length;i++){const p=points[i], d=meters(prev,p);length+=d;prev=p;
      if(length>=200){segments.push([start,p]);start=p;length=0;}}
    if(meters(start,prev)>5)segments.push([start,prev]);return segments;
  }
  function classify(o){const ratio=o.speed/o.normal;
    const level=ratio<.25?'Severe congestion':ratio<.5?'Heavy congestion':ratio<.75?'Slow traffic':'Normal / near-normal';
    const confirmed=o.drivers>=3&&o.minutes>=2;
    return {ratio,level,confirmed,color:!confirmed?'#94a3b8':ratio<.25?'#dc2626':ratio<.5?'#ef4444':ratio<.75?'#f59e0b':'#16a34a'};
  }
  function getNumbers(){const vals=['si-limit','si-normal','si-speed','si-drivers','si-minutes','si-segment'].map(id=>Number(el(id).value));
    const [limit,normal,speed,drivers,minutes,segment]=vals;
    if(vals.some(v=>!Number.isFinite(v))||limit<10||limit>130||normal<5||normal>130||speed<0||speed>150||drivers<1||drivers>100||!Number.isInteger(drivers)||minutes<0||minutes>60||segment<1||!Number.isInteger(segment))throw Error('Check the input ranges and use whole numbers for drivers and segment.');
    return {limit,normal,speed,drivers,minutes,segment};
  }
  function draw(){layer.clearLayers();const segs=routeSegments(), items=[...samples.entries()].sort((a,b)=>a[0]-b[0]);const results=el('si-results');results.replaceChildren();
    for(const [index,o] of items){const c=classify(o), div=document.createElement('div');div.className='si-result';
      div.textContent=`Segment ${index}: ${o.speed} km/h vs ${o.normal} km/h normal (${Math.round(c.ratio*100)}%) · ${o.drivers} drivers · ${o.minutes} min · ${c.level} · ${c.confirmed?'confirmed in demo':'insufficient evidence'}`;
      results.appendChild(div);
      if(segs[index-1])L.polyline(segs[index-1],{color:c.color,weight:10,opacity:.85}).addTo(layer).bindPopup(div.textContent);
    }
    el('si-status').textContent=items.length?`${items.length} segment(s) analyzed. Colored segments are experimental, not live crowd traffic.`:'No observations. Traffic overlay cleared.';
  }
  el('si-add').onclick=()=>{try{const o=getNumbers(),max=routeSegments().length;if(!max)throw Error('Calculate a route first.');if(o.segment>max)throw Error(`Choose segment 1–${max}.`);
    samples.set(o.segment,o);draw();}catch(e){el('si-status').textContent=e.message;}};
  el('si-demo').onclick=()=>{const segs=routeSegments();if(!segs.length){el('si-status').textContent='Calculate a route before running the demo.';return;}
    samples.clear();const normal=90,limit=110;const speeds=[85,65,30,12,9,28,67,88];
    for(let i=0;i<Math.min(segs.length,speeds.length);i++)samples.set(i+1,{normal,limit,speed:speeds[i],drivers:i===1?2:5,minutes:3,segment:i+1});draw();};
  el('si-clear').onclick=()=>{samples.clear();draw();};
  function stopGPS(){if(gpsWatch!==null){navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;}gpsLast=null;el('si-gps-status').textContent='Local GPS sampling stopped. No GPS coordinates were stored.';}
  el('si-gps-start').onclick=()=>{if(!el('si-gps-consent').checked){el('si-gps-status').textContent='Enable the opt-in checkbox first.';return;}
    if(gpsWatch!==null)return;if(!navigator.geolocation){el('si-gps-status').textContent='GPS unavailable.';return;}
    el('si-gps-status').textContent='Waiting for accurate GPS readings…';
    gpsWatch=navigator.geolocation.watchPosition(fix=>{
      if(!el('si-gps-consent').checked){stopGPS();return;}
      const p=[fix.coords.latitude,fix.coords.longitude],t=fix.timestamp,accuracy=fix.coords.accuracy;
      if(accuracy>35){el('si-gps-status').textContent=`GPS accuracy ${Math.round(accuracy)} m — reading ignored.`;return;}
      let speed=fix.coords.speed;
      if((speed===null||!Number.isFinite(speed))&&gpsLast&&t>gpsLast.t+2000){speed=meters(gpsLast.p,p)/((t-gpsLast.t)/1000);}
      gpsLast={p,t};if(Number.isFinite(speed)&&speed>=0&&speed<60){el('si-gps-status').textContent=`Local GPS speed: ${(speed*3.6).toFixed(1)} km/h · accuracy ${Math.round(accuracy)} m. Not shared or used to confirm congestion.`;}
    },e=>{el('si-gps-status').textContent='GPS error: '+e.message;},{enableHighAccuracy:true,maximumAge:1000,timeout:20000});
  };
  el('si-gps-stop').onclick=stopGPS;
  el('si-gps-consent').onchange=()=>{if(!el('si-gps-consent').checked)stopGPS();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopGPS();});
  window.addEventListener('pagehide',stopGPS);
  window.JalanSpeedIntelligence={clear:()=>{samples.clear();draw();},version:'4.2'};
})();
