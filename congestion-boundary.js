/* Jalan V4.5 — local-only, synthetic congestion queue boundary prototype. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const R = 6371000;
  const rad = x => x*Math.PI/180;
  function distance(a,b) {
    const dlat=rad(b[0]-a[0]),dlon=rad(b[1]-a[1]);
    return 2*R*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dlon/2)**2)));
  }
  const layer=L.layerGroup().addTo(map);
  let step=0, last=null, currentKey='';
  const SEGMENT_M=200, MAX_SEGMENTS=24;
  function routeKey(){
    const r=routes?.[selectedRoute], c=r?.geometry?.coordinates;
    return c?.length?`${selectedRoute}:${c.length}:${c[0].join(',')}:${c[c.length-1].join(',')}`:'';
  }
  function routeSegments(){
    const coords=routes?.[selectedRoute]?.geometry?.coordinates;
    if(!coords||coords.length<2)return [];
    const pts=coords.map(p=>[p[1],p[0]]), out=[];
    let seg=[pts[0]], accumulated=0;
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i],d=distance(a,b);
      if(d<.01)continue;
      let consumed=0;
      while(accumulated+d-consumed>=SEGMENT_M && out.length<MAX_SEGMENTS){
        const portion=SEGMENT_M-accumulated, f=(consumed+portion)/d;
        const cut=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
        seg.push(cut);out.push(seg);seg=[cut];consumed+=portion;accumulated=0;
      }
      if(out.length===MAX_SEGMENTS)break;
      seg.push(b);accumulated+=d-consumed;
    }
    if(out.length<MAX_SEGMENTS && seg.length>1 && accumulated>10)out.push(seg);
    return out;
  }
  // An illustrative temporal sequence: congestion grows upstream, then dissipates.
  // Each observation belongs to a separate synthetic driver group, not real users.
  const phases={
    forming:{from:5,to:7},
    growing:{from:3,to:8},
    recovering:{from:5,to:6},
    cleared:{from:-1,to:-1},
    sparse:{from:4,to:7,drivers:2}
  };
  const sequences={forming:['forming','growing','recovering','cleared'],growing:['growing','recovering','cleared'],recovering:['recovering','cleared'],cleared:['cleared'],sparse:['sparse','forming','growing']};
  function displayScenario(name){
    const segs=routeSegments();
    if(segs.length<9){$('boundary-status').textContent='Choose a longer driving route (at least 2 km) before running this test.';return;}
    const key=routeKey();
    if(key!==currentKey){last=null;currentKey=key;}
    const spec=phases[name], observations=segs.map((_,i)=>{
      const jam=i>=spec.from&&i<=spec.to;
      return {speed:jam?16:87,normal:90,drivers:jam?(spec.drivers??5):5,minutes:3};
    });
    const confirmed=observations.map(o=>o.drivers>=3&&o.minutes>=2&&o.speed/o.normal<.5);
    let start=confirmed.indexOf(true),end=confirmed.lastIndexOf(true);
    const hasQueue=start>=0, queueLength=hasQueue?(end-start+1)*SEGMENT_M:0;
    let trend='Initial snapshot';
    if(last&&last.key===key){
      if(hasQueue&&last.length>0)trend=queueLength>last.length?'Growing':queueLength<last.length?'Shrinking':'Stable';
      else if(!hasQueue&&last.length>0)trend=name==='sparse'?'Unknown — evidence lost':'Cleared (synthetic recovery confirmed)';
      else if(hasQueue)trend='New congestion detected';
      else trend='No confirmed congestion';
    }
    if(name==='sparse')trend='Unconfirmed — insufficient independent drivers';
    layer.clearLayers();
    segs.forEach((path,i)=>{
      const o=observations[i], isCandidate=o.speed/o.normal<.5;
      const color=confirmed[i]?'#dc2626':isCandidate?'#94a3b8':'#16a34a';
      L.polyline(path,{color:'#ffffff',weight:13,opacity:.9,interactive:false}).addTo(layer);
      L.polyline(path,{color,weight:8,opacity:.96,interactive:true})
        .addTo(layer).bindPopup(`Synthetic segment ${i+1}: ${o.speed} km/h, ${o.drivers} drivers — ${confirmed[i]?'confirmed slowdown':isCandidate?'unconfirmed slowdown':'normal'}`);
    });
    if(hasQueue){
      const tail=segs[start][0],head=segs[end][segs[end].length-1];
      L.circleMarker(tail,{radius:9,color:'#7f1d1d',weight:3,fillColor:'#f87171',fillOpacity:1}).addTo(layer).bindTooltip('Queue tail — slowdown begins');
      L.circleMarker(head,{radius:9,color:'#7c2d12',weight:3,fillColor:'#fdba74',fillOpacity:1}).addTo(layer).bindTooltip('Queue head — recovery begins');
    }
    $('boundary-status').textContent=`${name==='sparse'?'Unconfirmed slowdown':'Synthetic '+name} · ${hasQueue?`${Math.round(queueLength)} m confirmed queue`:'No confirmed queue'} · ${trend}.`;
    const metrics=$('boundary-metrics');metrics.replaceChildren();
    for(const [label,value] of [['Queue tail',hasQueue?`Segment ${start+1}`:'Not established'],['Queue head',hasQueue?`Segment ${end+1}`:'Not established'],['Approximate queue length',hasQueue?`${(queueLength/1000).toFixed(1)} km`:'Unknown / none'],['Change',trend]]){
      const div=document.createElement('div'),small=document.createElement('span'),strong=document.createElement('b');small.textContent=label;strong.textContent=value;div.append(small,strong);metrics.append(div);
    }
    const listing=$('boundary-segments');listing.replaceChildren();
    observations.forEach((o,i)=>{
      if(i>11)return;
      const div=document.createElement('div');div.className='boundary-row';
      div.textContent=`Segment ${i+1}: ${o.speed} km/h · ${o.drivers} drivers · ${confirmed[i]?'CONFIRMED SLOW':'normal / insufficient evidence'}`;listing.append(div);
    });
    last={key,length:queueLength};
  }
  $('boundary-run').addEventListener('click',()=>{step=0;displayScenario($('boundary-scenario').value);});
  $('boundary-next').addEventListener('click',()=>{
    const seq=sequences[$('boundary-scenario').value];step=Math.min(step+1,seq.length-1);displayScenario(seq[step]);
  });
  $('boundary-clear').addEventListener('click',()=>{
    layer.clearLayers();last=null;step=0;$('boundary-status').textContent='Boundary overlay cleared.';$('boundary-metrics').replaceChildren();$('boundary-segments').replaceChildren();
  });
  window.JalanCongestionBoundary={version:'4.5',clear:()=>{$('boundary-clear').click();}};
})();
