/* Jalan V4.4.3: OSM inspection with TomTom reverse-geocoding fallback. */
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
  const overpassEndpoint='https://overpass-api.de/api/interpreter';
  const CACHE_PREFIX='jalan-ri-v443:';
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
  // One small, batched Overpass query rather than three separate requests.
  async function queryOverpass(points,gen) {
    const controller=new AbortController();abort=controller;
    const timer=setTimeout(()=>controller.abort(),10000);
    try {
      const around=points.map(([lat,lon])=>`way(around:45,${lat.toFixed(6)},${lon.toFixed(6)})["highway"];`).join('');
      const query=`[out:json][timeout:8];(${around});out tags geom;`;
      const url=overpassEndpoint+'?data='+encodeURIComponent(query);
      const response=await fetch(url,{signal:controller.signal,cache:'no-store'});
      if(gen!==generation)throw Error('Cancelled');
      if(!response.ok)throw Error(`Overpass HTTP ${response.status}`);
      const data=await response.json();
      if(!Array.isArray(data.elements))throw Error('Overpass response invalid');
      return data.elements.filter(e=>e.type==='way'&&Array.isArray(e.geometry));
    } finally {clearTimeout(timer);if(abort===controller)abort=null;}
  }
  function tomtomKey() {
    const k=($('tt-key')?.value||sessionStorage.getItem('jalan-tomtom-key')||localStorage.getItem('jalan-tomtom-key')||'').trim();
    return /^[\w-]{8,160}$/.test(k)?k:null;
  }
  async function tomtomReverse(point,gen) {
    const k=tomtomKey();if(!k)throw Error('Enter your TomTom key in Jalan settings to enable fallback');
    const controller=new AbortController();abort=controller;
    const timer=setTimeout(()=>controller.abort(),8000);
    try {
      const url=new URL(`https://api.tomtom.com/search/2/reverseGeocode/${point[0].toFixed(6)},${point[1].toFixed(6)}.json`);
      url.searchParams.set('key',k);url.searchParams.set('radius','100');url.searchParams.set('language','en-GB');
      const response=await fetch(url,{signal:controller.signal,cache:'no-store'});
      if(gen!==generation)throw Error('Cancelled');
      if(!response.ok)throw Error(`TomTom reverse geocoding HTTP ${response.status}`);
      const data=await response.json();
      const address=data.addresses?.[0]?.address;
      if(!address)throw Error('No nearby address returned');
      return {name:address.streetName||address.streetNameAndNumber||address.freeformAddress||'Unnamed road',
        type:'Unknown (not supplied)',limit:'Unknown (not supplied)',oneway:'Unknown (not supplied)',
        note:'TomTom nearby address — not verified road geometry'};
    } finally {clearTimeout(timer);if(abort===controller)abort=null;}
  }
  function showFallback(point,i,record,source) {
    const div=document.createElement('div');div.className='ri-item';
    const h=document.createElement('strong');h.textContent=`Sample ${i+1}: ${record.name}`;
    const d=document.createElement('div');d.textContent=`Road type: ${record.type} · Speed limit: ${record.limit} · Direction: ${record.oneway}`;
    const note=document.createElement('div');note.className='ri-meta';note.textContent=`${source} · ${record.note} · Approximate, not road-matched`;
    div.append(h,d,note);results.appendChild(div);
    L.circleMarker(point,{radius:6,color:'#7c3aed',fillColor:'#a78bfa',fillOpacity:.8,weight:2})
      .bindPopup(`Nearby address: ${record.name} (unverified road match)`).addTo(layer);
  }
  async function runInspection() {
    const route=getRoute();if(!route){status.textContent='Calculate a driving route first.';return;}
    clear();const points=samplesForRoute(route);
    if(points.length!==3){status.textContent='Selected route has no usable geometry.';return;}
    running=true;const gen=++generation;button.disabled=true;$('ri-cancel').disabled=false;
    const cached=points.map(readCache);
    const entries=cached.map(v=>v?{kind:'osm',ways:v,source:'Cached OSM'}:null);
    const missing=points.map((_,i)=>i).filter(i=>!entries[i]);
    const errors=[];
    try {
      if(missing.length) {
        status.textContent='Checking OpenStreetMap road data (up to 10 seconds)…';
        try {
          const ways=await queryOverpass(missing.map(i=>points[i]),gen);
          if(gen!==generation)return;
          for(const i of missing) {
            const match=nearestWay(points[i],ways);
            if(match&&match.meters<=65) {
              entries[i]={kind:'osm',ways,source:'Live OSM'};
              saveCache(points[i],ways);
            }
          }
        } catch(e) {if(gen!==generation)return;errors.push('OSM: '+(e.name==='AbortError'?'timeout':e.message));}
      }
      const needFallback=points.map((_,i)=>i).filter(i=>!entries[i]);
      if(needFallback.length) {
        if(!tomtomKey())errors.push('TomTom fallback unavailable: enter API key');
        else for(const i of needFallback) {
          if(gen!==generation)return;
          status.textContent=`OSM unavailable for some samples. Trying TomTom nearby-address lookup (${i+1}/3)…`;
          try {
            const record=await tomtomReverse(points[i],gen);
            if(gen!==generation)return;
            entries[i]={kind:'tomtom',record,source:'TomTom fallback'};
          } catch(e) {if(gen!==generation)return;errors.push(`Sample ${i+1}: ${e.name==='AbortError'?'TomTom timeout':e.message}`);}
        }
      }
      if(gen!==generation)return;
      layer.clearLayers();results.replaceChildren();
      let matched=0;
      points.forEach((point,i)=>{
        const entry=entries[i];
        if(entry?.kind==='osm') {showMatch(point,i,entry.ways,entry.source);matched++;}
        else if(entry?.kind==='tomtom') {showFallback(point,i,entry.record,entry.source);matched++;}
        else {const div=document.createElement('div');div.className='ri-item';div.textContent=`Sample ${i+1}: Unavailable — no road information retrieved.`;results.appendChild(div);}
      });
      status.textContent=`Inspection finished: ${matched}/3 samples (${entries.filter(e=>e?.kind==='osm').length} OSM, ${entries.filter(e=>e?.kind==='tomtom').length} TomTom approximate). ${errors.length?errors.join(' | '):'No errors.'}`;
    } finally {
      if(gen===generation){running=false;button.disabled=false;$('ri-cancel').disabled=true;}
    }
  }
  button.addEventListener('click',()=>{
    runInspection().catch(e=>{
      console.error('Jalan road inspection failed:',e);
      status.textContent=`Road inspection stopped: ${e.message||'Unexpected error'}. Navigation is unaffected.`;
      cancel();
    });
  });
})();
