/* Jalan V3.3 — manual comparison only. No Waze data is collected. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const key = 'jalan-v3-3-eta-comparisons';
  const n = value => value.trim() === '' ? NaN : Number(value);
  const clean = value => Number.isFinite(value) && value >= 0;
  const round = value => Math.round(value * 10) / 10;
  const read = () => { try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const setMessage = msg => { el('cmp-message').textContent = msg; };
  function selectedJalan() {
    if (typeof routes === 'undefined' || !routes.length || !startPoint || !destination) return null;
    const route = routes[selectedRoute];
    return { start: [...startPoint], end: [...destination], routeIndex: selectedRoute,
      jalanMin: round(route.duration / 60), jalanKm: round(route.distance / 1000) };
  }
  function routeId(r) {
    return [r.start, r.end].map(p => p.map(x => x.toFixed(5)).join(',')).join(' → ') + ` (route ${r.routeIndex + 1})`;
  }
  function refresh() {
    const r = selectedJalan();
    el('cmp-jalan-eta').value = r ? r.jalanMin : '';
    el('cmp-jalan-km').value = r ? r.jalanKm : '';
    el('compare-route').textContent = r ? `Current Jalan route: ${routeId(r)}` : 'Search for a destination to compare the current route.';
    const w = n(el('cmp-waze-eta').value);
    const d = el('compare-difference');
    if (!r || !clean(w)) { d.textContent = 'Enter Waze’s ETA to compare.'; return; }
    const diff = round(w - r.jalanMin);
    d.textContent = `Waze ${diff >= 0 ? '+' : ''}${diff} min vs Jalan (${diff > 0 ? 'longer' : diff < 0 ? 'shorter' : 'equal'}).`;
  }
  function history() {
    const target = el('cmp-history'); target.replaceChildren();
    const records = read();
    if (!records.length) { target.textContent = 'No saved comparisons yet.'; return; }
    const title = document.createElement('strong'); title.textContent = `${records.length} saved comparison(s)`; target.appendChild(title);
    for (const item of records.slice(-5).reverse()) {
      const row = document.createElement('div');
      row.textContent = `${new Date(item.savedAt).toLocaleString()} · Jalan ${item.jalanMin} min / ${item.jalanKm} km · Waze ${item.wazeMin} min / ${item.wazeKm} km`;
      target.appendChild(row);
    }
  }
  el('cmp-waze-eta').addEventListener('input', refresh);
  el('cmp-waze-km').addEventListener('input', refresh);
  el('cmp-example').addEventListener('click', () => {
    el('cmp-waze-eta').value = '70'; el('cmp-waze-km').value = '34';
    refresh(); setMessage('Example loaded: Jalan 36 min, Waze 70 min, 34 km. Current Jalan values remain live; the example is not a live Waze reading.');
  });
  el('cmp-save').addEventListener('click', () => {
    const r = selectedJalan();
    if (!r) return setMessage('Calculate a Jalan route first.');
    const wazeMin = n(el('cmp-waze-eta').value), wazeKm = n(el('cmp-waze-km').value);
    if (!clean(wazeMin) || !clean(wazeKm)) return setMessage('Enter valid Waze ETA and distance (zero or higher).');
    const records = read();
    records.push({ ...r, wazeMin, wazeKm, savedAt: new Date().toISOString() });
    try { localStorage.setItem(key, JSON.stringify(records)); setMessage('Comparison saved in this browser.'); history(); }
    catch { setMessage('Could not save. Check browser storage permissions.'); }
  });
  el('cmp-export').addEventListener('click', () => {
    const records = read(); if (!records.length) return setMessage('Save at least one comparison before exporting.');
    const header = ['savedAt','startLat','startLng','endLat','endLng','routeIndex','jalanMin','jalanKm','wazeMin','wazeKm'];
    const rows = records.map(r => [r.savedAt,...r.start,...r.end,r.routeIndex + 1,r.jalanMin,r.jalanKm,r.wazeMin,r.wazeKm]);
    const csv = [header,...rows].map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'jalan-waze-eta-comparisons.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('CSV export started.');
  });
  // Existing V3.2 app.js owns the route state. Refresh when its route UI changes.
  new MutationObserver(refresh).observe(el('route-summary'), { childList: true, characterData: true, subtree: true });
  history(); refresh();
})();
