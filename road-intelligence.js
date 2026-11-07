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
  function clear() {
    if(abort){abort.abort();abort=null;}
    layer.clearLayers();results.replaceChildren();button.disabled=false;
    status.textContent='Road inspection cleared.';
  }
  $('ri-clear').addEventListener('click',clear);
  button.addEventListener('click',async()=>{
    const route=getRoute();
    if(!route){status.textContent='Calculate a driving route first.';return;}
    clear();const points=samplesForRoute(route);
    if(!points.length){status.textContent='Selected route has no usable geometry.';return;}
    button.disabled=true;abort=new AbortController();const signal=abort.signal;
    status.textContent='Checking mapped OSM roads near three route samples…';
    // Small on-demand query only; Overpass may be unavailable or rate-limited.
    const queries=points.map(([lat,lon])=>`way(around:65,${lat.toFixed(6)},${lon.toFixed(6)})["highway"];`).join('');
    const query=`[out:json][timeout:20];(${queries});out tags geom;`;
    try {
      const response=await fetch('https://overpass.kumi.systems/api/interpreter',{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:new URLSearchParams({data:query}),signal
      });
      if(!response.ok)throw Error(`OSM service returned HTTP ${response.status}`);
      const json=await response.json();
      if(!Array.isArray(json.elements))throw Error('Unexpected road data format');
      const ways=json.elements.filter(e=>e.type==='way'&&Array.isArray(e.geometry));
      if(!ways.length)throw Error('No mapped roads found near route samples');
      points.forEach((point,i)=>{
        const match=nearestWay(point,ways);
        const div=document.createElement('div');div.className='ri-item';
        if(!match||match.meters>65){div.textContent=`Sample ${i+1}: No reliable nearby mapped road (unknown).`;results.appendChild(div);return;}
        const tags=match.way.tags||{};
        const name=tags.name||tags.ref||'Unnamed road';
        const limit=tags.maxspeed||'Unknown (not tagged)';
        const type=tags.highway||'Unknown';
        const oneway=tags.oneway==='yes'?'One-way':tags.oneway==='-1'?'Reverse one-way':tags.oneway==='no'?'Two-way':'Not specified';
        const heading=document.createElement('strong');heading.textContent=`Sample ${i+1}: ${name}`;div.appendChild(heading);
        const detail=document.createElement('div');detail.textContent=`Road type: ${type} · Mapped speed limit: ${limit} · Direction tag: ${oneway}`;div.appendChild(detail);
        const note=document.createElement('div');note.className='ri-meta';note.textContent=`OSM way ${match.way.id} · ${Math.round(match.meters)} m from sample · Approximate match, not confirmed carriageway`;div.appendChild(note);
        results.appendChild(div);
        L.circleMarker(match.point,{radius:6,color:'#0f766e',fillColor:'#14b8a6',fillOpacity:1,weight:2}).bindPopup(`${name} — mapped maxspeed: ${limit}`).addTo(layer);
      });
      status.textContent=`Inspected ${points.length} points against ${ways.length} mapped OSM ways. Tags may be incomplete or outdated.`;
    } catch(err) {
      if(err.name!=='AbortError')status.textContent=`Road lookup unavailable: ${err.message}. Try again later; existing navigation is unaffected.`;
    } finally {button.disabled=false;abort=null;}
  });
})();
