/* Jalan V4.4: on-demand OSM road-tag inspection; no GPS upload. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const layer = L.layerGroup().addTo(map);
  const status = $('ri-status');
  const results = $('ri-results');
  const button = $('ri-scan');
  let abort = null;
  const rad = n => n * Math.PI / 180;
  function distance(a,b) {
    const R=6371000, dLat=rad(b[0]-a[0]), dLon=rad(b[1]-a[1]);
    return 2*R*Math.asin(Math.min(1,Math.sqrt(Math.sin(dLat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLon/2)**2)));
  }
  function nearestOnSegment(p,a,b) {
    const scale=Math.cos(rad(p[0]));
    const ax=(a[1]-p[1])*scale, ay=a[0]-p[0];
    const bx=(b[1]-p[1])*scale, by=b[0]-p[0];
    const dx=bx-ax,dy=by-ay;
    const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
    const q=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    return {point:q,meters:distance(p,q)};
  }
  function nearestWay(point,ways) {
    let best=null;
    for(const way of ways) {
      const g=way.geometry;
      if(!Array.isArray(g)||g.length<2)continue;
      for(let i=1;i<g.length;i++) {
        const a=[g[i-1].lat,g[i-1].lon], b=[g[i].lat,g[i].lon];
        const n=nearestOnSegment(point,a,b);
        if(!best||n.meters<best.meters)best={...n,way};
      }
    }
    return best;
  }
  function samplesForRoute(route) {
    const coords=route.geometry?.coordinates;
    if(!coords||coords.length<2)return [];
    const pts=coords.map(c=>[c[1],c[0]]), cumulative=[0];
    for(let i=1;i<pts.length;i++)cumulative.push(cumulative[i-1]+distance(pts[i-1],pts[i]));
    const total=cumulative.at(-1), fractions=[.2,.5,.8];
    return fractions.map(f=>{
      const target=total*f;
      let i=1;while(i<cumulative.length-1&&cumulative[i]<target)i++;
      const span=cumulative[i]-cumulative[i-1];const t=span?(target-cumulative[i-1])/span:0;
      return [pts[i-1][0]+(pts[i][0]-pts[i-1][0])*t,pts[i-1][1]+(pts[i][1]-pts[i-1][1])*t];
    });
  }
  function getRoute() {
    if(typeof routes==='undefined'||typeof selectedRoute==='undefined')return null;
    return routes[selectedRoute]||null;
  }
  const servers = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter'
  ];
  const CACHE_PREFIX='jalan-ri-v441:';
  const CACHE_TTL=24*60*60*1000;
  let running=false, generation=0;
  function cacheKey(point) { return CACHE_PREFIX+point.map(n=>n.toFixed(4)).join(','); }
  function readCache(point) {
    try {const v=JSON.parse(localStorage.getItem(cacheKey(point))||'null');return v&&Date.now()-v.saved<CACHE_TTL?v.ways:null;} catch{return null;}
  }
  function saveCache(point,ways) {
    try {localStorage.setItem(cacheKey(point),JSON.stringify({saved:Date.now(),ways}));}catch{}
  }
  function showMatch(point,i,ways,source) {
    const div=document.createElement('div');div.className='ri-item';
    const match=nearestWay(point,ways);
    if(!match||match.meters>65){div.textContent=`Sample ${i+1}: No reliable nearby mapped road (Unknown) · ${source}`;results.appendChild(div);return;}
    const tags=match.way.tags||{};
    const name=tags.name||tags.ref||'Unnamed road';
    const limit=tags.maxspeed||'Unknown (not tagged)';
    const type=tags.highway||'Unknown';
    const oneway=tags.oneway==='yes'?'One-way':tags.oneway==='-1'?'Reverse one-way':tags.oneway==='no'?'Two-way':'Not specified';
    const heading=document.createElement('strong');heading.textContent=`Sample ${i+1}: ${name}`;div.appendChild(heading);
    const detail=document.createElement('div');detail.textContent=`Road type: ${type} · Mapped speed limit: ${limit} · Direction tag: ${oneway}`;div.appendChild(detail);
    const note=document.createElement('div');note.className='ri-meta';note.textContent=`OSM way ${match.way.id} · ${Math.round(match.meters)} m from sample · ${source} · Approximate match`;div.appendChild(note);
    results.appendChild(div);
    L.circleMarker(match.point,{radius:6,color:'#0f766e',fillColor:'#14b8a6',fillOpacity:1,weight:2}).bindPopup(`${name} — mapped maxspeed: ${limit}`).addTo(layer);
  }
  function cancel() {
    generation++;
    if(abort){abort.abort();abort=null;}
    running=false;button.disabled=false;
    $('ri-cancel').disabled=true;
  }
  function clear() {
    cancel();layer.clearLayers();results.replaceChildren();
    status.textContent='Road inspection cleared.';
  }
  $('ri-clear').addEventListener('click',clear);
  $('ri-cancel').addEventListener('click',()=>{cancel();status.textContent='Road inspection cancelled. Existing results retained.';});
  async function queryServer(server,query,gen) {
    const controller=new AbortController();abort=controller;
    const timer=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch(server,{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:new URLSearchParams({data:query}),signal:controller.signal
      });
      if(gen!==generation)throw Error('Cancelled');
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const json=await response.json();
      if(!Array.isArray(json.elements))throw Error('Unexpected response');
      return json.elements.filter(e=>e.type==='way'&&Array.isArray(e.geometry));
    } finally {clearTimeout(timer);if(abort===controller)abort=null;}
  }
  button.addEventListener('click',async()=>{
    const route=getRoute();if(!route){status.textContent='Calculate a driving route first.';return;}
    clear();const points=samplesForRoute(route);
    if(!points.length){status.textContent='Selected route has no usable geometry.';return;}
    running=true;const gen=++generation;button.disabled=true;$('ri-cancel').disabled=false;
    const cached=points.map(readCache);
    const missing=points.map((_,i)=>i).filter(i=>!cached[i]);
    const waysBySample=[...cached];
    let error='';
    if(missing.length){
      const queryParts=missing.map(i=>{const [lat,lon]=points[i];return `way(around:65,${lat.toFixed(6)},${lon.toFixed(6)})["highway"];`;}).join('');
      const query=`[out:json][timeout:10];(${queryParts});out tags geom;`;
      for(let i=0;i<servers.length;i++){
        if(gen!==generation)return;
        status.textContent=`Checking mapped roads… server ${i+1}/${servers.length} (12-second timeout).`;
        try {
          const ways=await queryServer(servers[i],query,gen);
          if(gen!==generation)return;
          for(const idx of missing){waysBySample[idx]=ways;saveCache(points[idx],ways);}
          error='';break;
        } catch(e) {
          if(gen!==generation)return;
          error=e.name==='AbortError'?'Timed out after 12 seconds':e.message;
        }
      }
    }
    if(gen!==generation)return;
    layer.clearLayers();results.replaceChildren();
    let success=0;
    points.forEach((point,i)=>{
      if(waysBySample[i]){showMatch(point,i,waysBySample[i],cached[i]?'Cached':'Live Overpass');success++;}
      else {const div=document.createElement('div');div.className='ri-item';div.textContent=`Sample ${i+1}: Unavailable — road data not retrieved.`;results.appendChild(div);}
    });
    status.textContent=success===3?`Road inspection completed: ${success}/3 samples (${cached.filter(Boolean).length} cached).`:
      `Partial inspection: ${success}/3 samples. ${error||'No road data returned'}. Navigation is unaffected.`;
    running=false;button.disabled=false;$('ri-cancel').disabled=true;
  });
})();
