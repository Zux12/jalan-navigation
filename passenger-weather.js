/* Optional, full-screen passenger weather. Navigation never waits for a forecast. */
(() => {
  'use strict';
  if (!document.body.classList.contains('passenger-mode')) return;
  const {towns,hour,condition,parse,slot,destinationCell} = window.JalanWeatherData;
  const el = id => document.getElementById(id);
  const arrival = el('passenger-arrival-weather'), stamp = el('passenger-weather-stamp');
  const cache = new Map(), markers = new Map(), retry = new Map();
  const mapInterval = hour/4, arrivalInterval = hour/2;
  let visible = [], tripPoint = null, ready = false, layoutTimer, queueTimer, flight, nextRequestAt = 0, blockedUntil = 0;
  const key = point => point.join(',');
  const ms = () => window.JalanLanguage?.code === 'ms';
  const formats = new Map();
  function format(time, date) {
    const locale = ms()?'ms-MY':'en-MY', id = locale+date;
    if (!formats.has(id)) formats.set(id,new Intl.DateTimeFormat(locale,{
      timeZone:'Asia/Kuala_Lumpur', ...(date?{day:'numeric',month:'short',year:'numeric'}:{}),
      hour:'numeric',minute:'2-digit',hour12:true
    }));
    return formats.get(id).format(time);
  }
  function text(node, value) {
    if (node.textContent !== value) node.textContent = value;
    if (node.hidden !== !value) node.hidden = !value;
  }
  function showArrival() {
    const state = window.JalanGPS?.getState();
    tripPoint = state?.active && destination ? destinationCell(destination) : null;
    paintArrival(state?.remainingSeconds);
  }
  function paintArrival(seconds) {
    let label = '';
    if (tripPoint && Number.isFinite(seconds) && seconds>=0) {
      const value = slot(cache.get(key(tripPoint)), Date.now()+seconds*1000);
      if (value) {
        const [icon,en,my] = condition(value[0]);
        label = (ms()?'Semasa tiba':'At arrival')+' · '+icon+' '+value[1]+'°C · '+(ms()?my:en);
      }
    }
    text(arrival,label);
  }
  function clearIcons() {
    for (const item of markers.values()) item.marker.remove();
    markers.clear();
    visible = [];
    text(stamp,'');
  }
  // Local vector artwork keeps the map symbols consistent across iPhone and browser emoji sets.
  const iconSize = 34;
  const cloudPath = 'M7.6 24h17a6 6 0 1 0-.6-12 8.5 8.5 0 0 0-16.2-1.2A6.6 6.6 0 1 0 7.6 24Z';
  function cloud(fill) {
    return '<path d="'+cloudPath+'" fill="'+fill+'" stroke="#405569" stroke-width="2"/>';
  }
  const paleCloud = cloud('#fffdf6');
  const sun = '<path d="M16 1.5v3.2m0 22.6v3.2M1.5 16h3.2m22.6 0h3.2M5.7 5.7 8 8m16 16 2.3 2.3M5.7 26.3 8 24M24 8l2.3-2.3" fill="none" stroke="#ee9300" stroke-width="2.4"/>'+
    '<circle cx="16" cy="16" r="7.2" fill="#ffbf19" stroke="#dc8700" stroke-width="1.5"/>';
  const moon = '<path d="M21.8 3.1a12.4 12.4 0 1 0 6.4 20.6A12.9 12.9 0 0 1 21.8 3.1Z" fill="#ffdc7c" stroke="#685731" stroke-width="1.8"/>';
  function behindCloud(sky, cloudTransform) {
    return '<g transform="translate(11 0) scale(.64)">'+sky+'</g>'+
      '<g transform="'+cloudTransform+'">'+paleCloud+'</g>';
  }
  function rain(fill, streaks) {
    return '<g transform="translate(0 -3)">'+cloud(fill)+'</g>'+
      '<path d="'+streaks+'" stroke="#167cb4" stroke-width="2.7" fill="none"/>';
  }
  const mapArtwork = {
    clear:sun, clearNight:moon, cloud:paleCloud,
    fair:behindCloud(sun,'translate(1 13) scale(.65)'),
    fairNight:behindCloud(moon,'translate(1 13) scale(.65)'),
    partlyCloudy:behindCloud(sun,'translate(0 6) scale(.88)'),
    partlyCloudyNight:behindCloud(moon,'translate(0 6) scale(.88)'),
    lightRain:rain('#edf4f7','M12 24.5l-2 3m11-3-2 3'),
    rain:rain('#e0eaf0','M9 24.5l-2.6 4M17 24.5l-2.6 4M25 24.5l-2.6 4'),
    heavyRain:rain('#9fb3c4','M8 24l-3.5 6M15 24l-3.5 6M22 24l-3.5 6M29 24l-3.5 6'),
    storm:'<g transform="translate(0 -3)">'+cloud('#8399ad')+'</g>'+
      '<path d="m17 17-6 8h5l-2 6 9-11h-6l2-3Z" fill="#ffcd30" stroke="#594719" stroke-width="1.2"/>',
    fog:'<g transform="translate(2 -2) scale(.88)">'+paleCloud+'</g>'+
      '<path d="M3 24h19m-11 4h18" fill="none" stroke="#647b87" stroke-width="2.3"/>'
  };
  function placeIcons() {
    const now = Date.now(), shown = new Set(), issues = [];
    for (const {town,point} of visible) {
      const id = key(point), data = cache.get(id), value = slot(data,now);
      if (!value) continue;
      const [,en,my,symbol] = condition(value[0]), label = town+' · '+(ms()?my:en);
      const signature = symbol+label;
      shown.add(id); issues.push(data.issued);
      if (markers.get(id)?.signature===signature) continue;
      markers.get(id)?.marker.remove();
      const html = '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" stroke-linecap="round" stroke-linejoin="round">'+mapArtwork[symbol]+'</svg>';
      const marker = L.marker(point,{
        icon:L.divIcon({className:'jalan-weather-icon',html,iconSize:[iconSize,iconSize],iconAnchor:[iconSize/2,iconSize+2]}),
        interactive:false, keyboard:false, title:label, zIndexOffset:-250
      }).addTo(map);
      markers.set(id,{marker,signature});
    }
    for (const [id,item] of markers) if (!shown.has(id)) {item.marker.remove();markers.delete(id);}
    if (!issues.length) {text(stamp,'');return;}
    const oldest = Math.min(...issues), newest = Math.max(...issues);
    let issued = format(oldest,true);
    if (Math.floor(newest/60000)!==Math.floor(oldest/60000)) {
      const sameDay = Math.floor((oldest+8*hour)/(24*hour))===Math.floor((newest+8*hour)/(24*hour));
      issued += '–'+format(newest,!sameDay);
    }
    text(stamp,(ms()?'Ramalan jam ':'Forecast for ')+format(Math.floor(now/hour)*hour,false)+' · '+
      (ms()?'Dikemas kini ':'Updated ')+issued+' MYT');
  }
  const wanted = () => [
    ...(tripPoint?[{point:tripPoint,interval:arrivalInterval}]:[]),
    ...visible.map(t=>({point:t.point,interval:mapInterval}))
  ];
  function scheduleQueue(delay=0) {
    clearTimeout(queueTimer);
    if (ready && !document.hidden && !flight) queueTimer=setTimeout(loadNext,Math.max(delay,nextRequestAt-Date.now()));
  }
  async function loadNext() {
    if (document.hidden || flight || Date.now()<blockedUntil) return;
    const now=Date.now();
    const next=wanted().find(({point,interval})=>{
      const id=key(point), entry=cache.get(id);
      return !(retry.get(id)>now) && (!entry || now>=Math.max(entry.fetched+interval,entry.expires));
    });
    if (!next) return;
    const id=key(next.point), controller=new AbortController();
    flight=controller;
    const timeout=setTimeout(()=>controller.abort(),9000);
    try {
      const [lat,lon]=next.point;
      // This simple CORS GET identifies the hosted app via Origin. The browser's
      // normal HTTP cache handles conditional requests; custom headers require a preflight.
      const response=await fetch('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat='+lat+'&lon='+lon,
        {credentials:'omit',signal:controller.signal});
      if (response.status===429 || response.status===403) {
        const seconds=Number(response.headers.get('Retry-After')) || 0;
        blockedUntil=Date.now()+Math.max(15*60000,seconds*1000);
      }
      if (!response.ok) throw Error('Weather service unavailable');
      const entry=parse(await response.json(), Date.parse(response.headers.get('Expires')),Date.now());
      if (!entry) throw Error('No usable forecast');
      cache.set(id,entry); retry.delete(id);
      if (cache.size>100) cache.delete(cache.keys().next().value);
      if (!document.hidden) {showArrival();placeIcons();}
    } catch {
      if (!document.hidden) retry.set(id,Date.now()+5*60000);
    } finally {
      clearTimeout(timeout);flight=null;nextRequestAt=Date.now()+650;scheduleQueue();
    }
  }
  const sheetIDs=['jalan-home-sheet','passenger-overview','passenger-journey-sheet'];
  function layout() {
    clearTimeout(layoutTimer);
    if (!ready || document.hidden) return;
    if (map.getZoom()>10.5) {clearIcons();scheduleQueue();return;}
    const bounds=map.getBounds(), rect=map.getContainer().getBoundingClientRect();
    const top=el('passenger-turn-toggle').getBoundingClientRect().bottom;
    let bottom=Math.min(rect.bottom,innerHeight);
    for (const id of sheetIDs) {
      const sheet=el(id)?.getBoundingClientRect();
      if (sheet?.height && sheet.width) bottom=Math.min(bottom,sheet.top);
    }
    // Keep the time legible above the speed badge and the map attribution.
    let stampEdge=bottom;
    for (const id of ['jalan-home-speed','passenger-speed-floating','jalan-home-credits']) {
      const box=el(id)?.getBoundingClientRect();
      if (box?.height && box.width && box.top>innerHeight/2) stampEdge=Math.min(stampEdge,box.top);
    }
    stamp.style.bottom=Math.ceil(innerHeight-stampEdge+4)+'px';
    const picked=[], zoom=map.getZoom(), gap=zoom<=7?72:55, limit=zoom<=7?5:8;
    for (const [town,lat,lon] of towns) {
      const point=[lat,lon];
      if (!bounds.contains(point)) continue;
      const p=window.JalanVectorMap?.project(point) || map.latLngToContainerPoint(point);
      if (p.x<iconSize/2 || p.x>rect.width-iconSize/2 || p.y+rect.top<Math.max(35,top)+iconSize+2 ||
          p.y+rect.top>bottom-35 || picked.some(other=>Math.hypot(p.x-other.x,p.y-other.y)<gap)) continue;
      picked.push({town,point,x:p.x,y:p.y});
      if (picked.length===limit) break;
    }
    visible=picked;placeIcons();scheduleQueue();
  }
  function settle() {
    if (!ready || document.hidden) return;
    if (map.getZoom()>10.5 && !visible.length) return;
    clearTimeout(layoutTimer);
    if (map.getZoom()>10.5) {clearIcons();return;}
    layoutTimer=setTimeout(layout,350);
  }
  function updateTrip() {showArrival();scheduleQueue();settle();}
  map.on('moveend zoomend resize',settle);
  for (const event of ['jalan:map-renderer','jalan:vector-gesture-end','jalan:navigation-view'])
    window.addEventListener(event,settle);
  for (const event of ['jalan:journey-start','jalan:journey-stop','jalan:route-cleared','jalan:route-change','jalan:routes-rendered'])
    window.addEventListener(event,()=>queueMicrotask(updateTrip));
  // Select another saved hourly forecast immediately if traffic changes the arrival hour.
  window.addEventListener('jalan:gps-fix',event=>{
    const seconds = event.detail?.remainingSeconds;
    if (tripPoint && !document.hidden && Number.isFinite(seconds)) paintArrival(seconds);
  });
  window.addEventListener('jalan:community-flow',()=>{if(tripPoint && !document.hidden) showArrival();});
  window.addEventListener('jalan:language-change',()=>{if(ready){showArrival();placeIcons();}});
  const observer=new ResizeObserver(settle);
  for (const id of sheetIDs) if (el(id)) observer.observe(el(id));
  document.addEventListener('visibilitychange',()=>{
    if (document.hidden) {clearTimeout(queueTimer);clearTimeout(layoutTimer);flight?.abort();}
    else if (ready) {showArrival();layout();}
  });
  // Timers only inspect the cache. MET's expiry can postpone a network refresh.
  setInterval(()=>{
    if (!ready || document.hidden || (!tripPoint && !visible.length)) return;
    showArrival();placeIcons();scheduleQueue();
  },30000);
  Promise.resolve(window.JalanLaunch?.mainScreenReady).then(()=>{ready=true;showArrival();layout();});
})();
