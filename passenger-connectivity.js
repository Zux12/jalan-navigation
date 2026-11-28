// The current route stays on the phone while live services are unreachable.
(() => {
  'use strict';
  if (!document.body.classList.contains('passenger-mode')) return;

  const banner = document.getElementById('passenger-offline-banner');
  const message = document.getElementById('passenger-offline-message');
  const delay = 15000;
  const copy = {
    route: ['No internet · Your route is still available', 'Tiada internet · Laluan anda masih tersedia'],
    reroute: ['No internet · Reconnecting to update your route', 'Tiada internet · Menunggu sambungan untuk mengemas kini laluan'],
    manual: ['No internet · Automatic rerouting is off', 'Tiada internet · Pengiraan semula laluan automatik dimatikan']
  };
  let active = false, offRoute = false, lostAt = null;
  let nextCheck, bannerTimer, currentCheck;

  function render() {
    const visible = active && lostAt !== null && Date.now() - lostAt >= delay;
    const route = visible ? (offRoute ? 'off' : 'on') : '';
    const changed = (banner.dataset.route || '') !== route;
    const auto = document.getElementById('gps-auto').getAttribute('aria-pressed') === 'true';
    const words = offRoute ? (auto ? copy.reroute : copy.manual) : copy.route;
    const label = visible ? words[window.JalanLanguage.code === 'ms' ? 1 : 0] : '';
    if (message.textContent !== label) message.textContent = label;
    if (changed) {
      banner.hidden = !visible;
      banner.dataset.route = route;
      window.dispatchEvent(new Event('jalan:offline-banner-change'));
    }
  }

  function lost(at) {
    if (lostAt === null) lostAt = at;
    clearTimeout(bannerTimer);
    const remaining = lostAt + delay - Date.now();
    if (remaining > 0) bannerTimer = setTimeout(render, remaining);
    else render();
  }

  function connected() {
    clearTimeout(bannerTimer);
    lostAt = null;
    render();
  }

  function cancelChecks() {
    clearTimeout(nextCheck);
    clearTimeout(bannerTimer);
    currentCheck?.controller?.abort();
    currentCheck = null;
  }

  // Verify a small known JSON response. A Wi-Fi login page can't confirm connectivity.
  async function reachable(check, url, valid) {
    const controller = new AbortController();
    check.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(url, {
        cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer', signal:controller.signal
      });
      return response.ok && valid(await response.json());
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function checkConnection() {
    if (!active || document.hidden) return;
    if (navigator.onLine === false) {
      lost(Date.now());
    } else {
      const started = Date.now(), check = {};
      currentCheck = check;
      let ok = await reachable(check, 'passenger.webmanifest', data => data.name === 'JALAN');
      if (currentCheck !== check) return;
      if (!ok) {
        // A hosting outage alone shouldn't flag the phone as offline.
        ok = await reachable(check, 'https://mterm2026-559f9bf571b5.herokuapp.com/api/jalan/health',
          data => data.ok === true && data.service === 'jalan');
        if (currentCheck !== check) return;
      }
      currentCheck = null;
      if (ok) connected();
      else lost(started);
    }
    nextCheck = setTimeout(checkConnection, lostAt === null ? delay : 5000);
  }

  function recheck() {
    cancelChecks();
    if (active && !document.hidden) void checkConnection();
  }
  function stop() {
    active = false;
    offRoute = false;
    cancelChecks();
    connected();
  }
  window.addEventListener('jalan:journey-start', () => {
    active = true;
    offRoute = false;
    connected();
    recheck();
  });
  for (const event of ['jalan:journey-stop','jalan:route-cleared']) window.addEventListener(event, stop);
  for (const event of ['online','offline','pageshow']) window.addEventListener(event, recheck);
  window.addEventListener('pagehide', cancelChecks);
  document.addEventListener('visibilitychange', recheck);

  window.addEventListener('jalan:gps-fix', ({detail}) => {
    if (!active || !detail?.gpsReliable) return;
    // Keep a confirmed deviation through uncertain fixes. A positive rematch clears it.
    if (detail.matched) offRoute = false;
    else if (!offRoute && window.JalanGPS.getState().deviationConfirmed) offRoute = true;
    if (!banner.hidden) render();
  });
  window.addEventListener('jalan:route-change', () => {
    offRoute = false;
    if (!banner.hidden) render();
  });
  window.addEventListener('jalan:navigation-settings', () => { if (!banner.hidden) render(); });
  window.addEventListener('jalan:language-change', () => { if (!banner.hidden) render(); });
})();
