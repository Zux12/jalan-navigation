/* Jalan V3.5 — TomTom live traffic, independent of existing Jalan routing. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const keyInput = $('tt-key');
  const status = message => { $('tt-status').textContent = message; };
  const remembered = localStorage.getItem('jalan-tomtom-key');
  if (remembered) { keyInput.value = remembered; $('tt-remember').checked = true; }
  else keyInput.value = sessionStorage.getItem('jalan-tomtom-key') || '';
  const validKey = () => {
    const key = keyInput.value.trim();
    if (!key || !/^[A-Za-z0-9_-]{8,160}$/.test(key)) throw Error('Enter a valid TomTom API key.');
    return key;
  };
  function saveKey() {
    const key = validKey();
    sessionStorage.setItem('jalan-tomtom-key', key);
    if ($('tt-remember').checked) localStorage.setItem('jalan-tomtom-key', key);
    else localStorage.removeItem('jalan-tomtom-key');
    return key;
  }
  let tiles = null;
  let incidentLayer = L.layerGroup().addTo(map);
  let refreshHandle = null;
  let incidentsRequest = null;
  let active = false;
  const MAX_INCIDENTS = 80;
  function removeTraffic() {
    active = false;
    if (refreshHandle) clearInterval(refreshHandle);
    refreshHandle = null;
    if (incidentsRequest) incidentsRequest.abort();
    if (tiles) { map.removeLayer(tiles); tiles = null; }
    incidentLayer.clearLayers();
  }
  function descriptionFor(item) {
    const props = item.properties || {};
    const event = Array.isArray(props.events) ? props.events[0] : null;
    return String(event?.description || props.from || 'Traffic incident').slice(0, 140);
  }
  function addIncidents(data) {
    incidentLayer.clearLayers();
    const incidents = Array.isArray(data.incidents) ? data.incidents : [];
    let count = 0;
    for (const incident of incidents.slice(0, MAX_INCIDENTS)) {
      const geom = incident.geometry;
      const props = incident.properties || {};
      if (!geom || !Array.isArray(geom.coordinates)) continue;
      let latlng;
      if (geom.type === 'Point') latlng = [geom.coordinates[1], geom.coordinates[0]];
      else if (geom.type === 'LineString' && geom.coordinates.length) latlng = [geom.coordinates[0][1], geom.coordinates[0][0]];
      if (!latlng || !latlng.every(Number.isFinite)) continue;
      const category = Number(props.iconCategory);
      const icon = [6,7].includes(category) ? '🚧' : [1,2].includes(category) ? '🚗' : '⚠️';
      const marker = L.marker(latlng, {icon:L.divIcon({className:'report-marker',html:icon,iconSize:[28,28],iconAnchor:[14,14]})});
      const popup = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = 'TomTom live incident';
      const details = document.createElement('p'); details.textContent = descriptionFor(incident);
      popup.append(title,details);
      marker.bindPopup(popup).addTo(incidentLayer);
      count++;
    }
    return count;
  }
  async function fetchIncidents(key) {
    if (!active || !$('tt-incident-toggle').checked) { incidentLayer.clearLayers(); return; }
    if (map.getZoom() < 9) { incidentLayer.clearLayers(); status('Traffic tiles active. Zoom in to level 9+ to load incidents.'); return; }
    if (incidentsRequest) incidentsRequest.abort();
    incidentsRequest = new AbortController();
    const b = map.getBounds();
    const bbox = [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].map(v=>v.toFixed(5)).join(',');
    const fields = '{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description}}}}';
    const url = new URL('https://api.tomtom.com/traffic/services/5/incidentDetails');
    url.searchParams.set('key',key); url.searchParams.set('bbox',bbox);
    url.searchParams.set('fields',fields); url.searchParams.set('language','en-GB');
    try {
      const response = await fetch(url, {signal:incidentsRequest.signal,cache:'no-store'});
      if (!response.ok) throw Error(`Incident API HTTP ${response.status}`);
      const count = addIncidents(await response.json());
      status(`Live traffic overlay on. ${count} incident markers shown in current view (up to ${MAX_INCIDENTS}).`);
    } catch (e) {
      if (e.name !== 'AbortError') status('Traffic tiles enabled; incidents unavailable: '+e.message+'. Check API permissions, domain whitelist and quota.');
    }
  }
  async function connect() {
    try {
      const key = saveKey();
      removeTraffic();
      active = true;
      // TomTom flow tiles can be overlaid on the Leaflet/OpenStreetMap map.
      tiles = L.tileLayer('https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key='+encodeURIComponent(key),{
        opacity:0.82,maxZoom:19,maxNativeZoom:18,attribution:'Traffic © TomTom',updateWhenIdle:true
      }).addTo(map);
      let tileErrorCount = 0;
      tiles.on('tileerror', () => {if (++tileErrorCount === 3) status('TomTom traffic tiles failed. Check your key, domain whitelist, product access or quota.');});
      status('Loading live TomTom traffic tiles and incidents…');
      await fetchIncidents(key);
      refreshHandle = setInterval(() => {
        if (!active) return;
        // Refresh tiles only every five minutes to limit API usage.
        if (tiles) tiles.setUrl('https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key='+encodeURIComponent(key)+'&v='+Math.floor(Date.now()/300000));
        fetchIncidents(key);
      },300000);
    } catch(e) { status(e.message); }
  }
  let debounce;
  map.on('moveend',()=>{
    if (!active) return;
    clearTimeout(debounce);
    debounce=setTimeout(()=>{try{fetchIncidents(validKey())}catch(e){status(e.message)}},1100);
  });
  $('tt-connect').addEventListener('click',connect);
  $('tt-hide').addEventListener('click',()=>{removeTraffic();status('Live TomTom overlay hidden.');});
  $('tt-incident-toggle').addEventListener('change',()=>{if(active) {try{fetchIncidents(validKey())}catch(e){status(e.message)}}});
  $('tt-toggle-key').addEventListener('click',()=>{
    const show = keyInput.type === 'password'; keyInput.type = show ? 'text' : 'password';
    $('tt-toggle-key').textContent = show ? 'Hide' : 'Show';
  });
  $('tt-remove-key').addEventListener('click',()=>{
    removeTraffic(); keyInput.value='';
    sessionStorage.removeItem('jalan-tomtom-key');localStorage.removeItem('jalan-tomtom-key');
    $('tt-remember').checked=false; $('tt-eta').textContent='TomTom ETA will appear here after you calculate a Jalan route.';
    status('TomTom key cleared from this browser.');
  });
  $('tt-route').addEventListener('click',async()=>{
    try {
      const key=saveKey();
      if (!startPoint || !destination) throw Error('Calculate a Jalan route first.');
      const points = [startPoint,destination].map(p=>p.join(','));
      const url = new URL('https://api.tomtom.com/routing/1/calculateRoute/'+points.join(':')+'/json');
      url.searchParams.set('key',key);
      url.searchParams.set('traffic','true');
      url.searchParams.set('travelMode','car');
      url.searchParams.set('routeType','fastest');
      $('tt-eta').textContent='Calculating TomTom traffic-aware ETA…';
      const response = await fetch(url);
      if (!response.ok) throw Error('TomTom Routing API HTTP '+response.status);
      const data=await response.json();
      const summary=data.routes?.[0]?.summary;
      if (!summary) throw Error('TomTom returned no route.');
      const seconds=summary.travelTimeInSeconds;
      const km=(summary.lengthInMeters/1000).toFixed(1);
      const delay=summary.trafficDelayInSeconds;
      $('tt-eta').textContent=`TomTom: ${Math.round(seconds/60)} min · ${km} km`+(Number.isFinite(delay)?` · Traffic delay ${Math.round(delay/60)} min`:'')+'. Jalan blue route remains unchanged.';
    } catch(e) { $('tt-eta').textContent='Could not calculate TomTom ETA: '+e.message; }
  });
})();
