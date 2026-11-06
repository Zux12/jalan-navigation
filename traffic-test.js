/* Jalan V3.4 — GeoJSON overlay feasibility. No Waze extraction or network requests. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const status = message => { byId('traffic-status').textContent = message; };
  const overlay = L.layerGroup().addTo(map);
  const MAX_BYTES = 1024 * 1024;
  const MAX_FEATURES = 500;
  const validNumber = n => typeof n === 'number' && Number.isFinite(n);
  const validCoord = c => Array.isArray(c) && c.length >= 2 && validNumber(c[0]) && validNumber(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
  const validLine = coords => Array.isArray(coords) && coords.length >= 2 && coords.length <= 3000 && coords.every(validCoord);
  const supported = g => g && (
    (g.type === 'Point' && validCoord(g.coordinates)) ||
    (g.type === 'LineString' && validLine(g.coordinates)) ||
    (g.type === 'MultiLineString' && Array.isArray(g.coordinates) && g.coordinates.length <= 100 && g.coordinates.every(validLine))
  );
  const safeText = (v, fallback) => typeof v === 'string' ? v.slice(0, 160) : fallback;
  function paint(collection, demo = false) {
    const features = collection?.type === 'FeatureCollection' ? collection.features : null;
    if (!Array.isArray(features) || features.length > MAX_FEATURES) throw Error('Expected a GeoJSON FeatureCollection with at most 500 features.');
    if (!features.length) throw Error('The file contains no features.');
    if (features.some(f => !f || f.type !== 'Feature' || !supported(f.geometry))) throw Error('Only valid Point, LineString and MultiLineString features are supported.');
    overlay.clearLayers();
    let bounds = L.latLngBounds([]);
    features.forEach(f => {
      const props = f.properties || {};
      const label = safeText(props.label || props.description, demo ? 'Synthetic example' : 'Imported data');
      const level = safeText(props.severity, 'unknown').toLowerCase();
      const color = level === 'high' ? '#dc2626' : level === 'medium' ? '#f59e0b' : '#2563eb';
      const coords = f.geometry.coordinates;
      if (f.geometry.type === 'Point') {
        const point = [coords[1], coords[0]];
        L.circleMarker(point,{radius:8,color:'#fff',weight:2,fillColor:color,fillOpacity:.9}).bindTooltip(label).addTo(overlay);
        bounds.extend(point);
      } else {
        const lines = f.geometry.type === 'LineString' ? [coords] : coords;
        lines.forEach(line => {
          const latlngs = line.map(c => [c[1], c[0]]);
          L.polyline(latlngs,{color,weight:7,opacity:.85}).bindTooltip(label).addTo(overlay);
          latlngs.forEach(point => bounds.extend(point));
        });
      }
    });
    if (bounds.isValid()) map.fitBounds(bounds,{padding:[35,35],maxZoom:14});
    status(`${features.length} ${demo ? 'synthetic demonstration' : 'user-provided'} feature(s) displayed. This is NOT a live Waze feed.`);
  }
  byId('traffic-demo').addEventListener('click', () => {
    paint({type:'FeatureCollection',features:[
      {type:'Feature',properties:{label:'Synthetic congestion example — not live',severity:'high'},geometry:{type:'LineString',coordinates:[[101.690,3.139],[101.698,3.146],[101.704,3.151]]}},
      {type:'Feature',properties:{label:'Synthetic hazard example — not verified',severity:'medium'},geometry:{type:'Point',coordinates:[101.712,3.158]}}
    ]},true);
  });
  byId('traffic-clear').addEventListener('click', () => { overlay.clearLayers();byId('traffic-file').value='';status('Overlay cleared.'); });
  byId('traffic-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!byId('traffic-authorized').checked) { event.target.value='';status('Confirm you have permission to use the data before importing.');return; }
    if (file.size > MAX_BYTES) { status('File is too large (maximum 1 MB).');return; }
    try { paint(JSON.parse(await file.text())); }
    catch (error) { status(`Import failed: ${error.message}`); }
  });
})();
