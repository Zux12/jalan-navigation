'use strict';
// Deterministic PUBLIC V4.7.4 desktop/390px browser gate. No live TomTom/OSRM,
// secret, GPS fix, third-party tile, Heroku request or user coordinates are sent.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
function serve(req,res){
  let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}
  catch{res.writeHead(400);return res.end()}
  const p=path.resolve(root,'.'+name);
  if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){
    res.writeHead(404);return res.end('Not found');
  }
  res.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream',
    'cache-control':'no-store'});
  res.end(fs.readFileSync(p));
}
const cors={'access-control-allow-origin':'*','content-type':'application/json'};
const tomtomOK={routes:[{summary:{travelTimeInSeconds:420,lengthInMeters:3200,
  trafficDelayInSeconds:45},legs:[{points:[{latitude:3.139,longitude:101.6869},
  {latitude:3.1478,longitude:101.6953}]}],guidance:{instructions:[]}}]};
const osrmOK={code:'Ok',routes:[{distance:3400,duration:500,
  geometry:{type:'LineString',coordinates:[[101.6869,3.139],[101.6953,3.1478]]},
  legs:[{steps:[{name:'Public demo road',distance:3400,maneuver:{type:'turn',modifier:'left'}}]}]}]};
async function main(){
 const server=http.createServer(serve);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,errors=[];
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,
    reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  // Deny all external calls by default; only bundled version-pinned Leaflet and
  // explicit mock provider responses are allowed. No live traffic provider calls.
  await page.route('**/*',route=>{
   if(route.request().url().startsWith(base+'/'))return route.continue();
   return route.abort('blockedbyclient');
  });
  const leaflet=path.resolve(root,'node_modules/leaflet/dist');
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',route=>
    route.fulfill({status:200,contentType:'application/javascript',
      body:fs.readFileSync(path.join(leaflet,'leaflet.js'))}));
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',route=>
    route.fulfill({status:200,contentType:'text/css',
      body:fs.readFileSync(path.join(leaflet,'leaflet.css'))}));
  await page.addInitScript(()=>{
    // Deterministic permission denial, no browser-held actual location used.
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
      getCurrentPosition(_ok,error){error({code:1,message:'Permission denied'})},
      watchPosition(ok,error){
        // Keep a deterministic non-network GPS callback for the separate
        // opt-in browser navigation safety test; physical GPS stays denied.
        window.__offlineGPSWatch=ok;
        error({code:1,message:'Permission denied'});
        return 1;
      },
      clearWatch(){window.__offlineGPSWatch=null}
    }});
  });
  await page.goto(base+'/index.html',{waitUntil:'load'});
  // The public Pages site is static, so verify the actual browser enforces
  // its meta CSP; an aborted fetch alone is not enough evidence.
  const csp=await page.evaluate(async()=>{
    const policy=document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if(!policy)return {present:false};
    const violation=new Promise(resolve=>{
      document.addEventListener('securitypolicyviolation',e=>
        resolve({directive:e.effectiveDirective,blockedURI:e.blockedURI}),{once:true});
    });
    try{await fetch('https://untrusted.example.invalid/jalan-location-exfil-test');}catch{}
    const result=await Promise.race([violation,
      new Promise(resolve=>setTimeout(()=>resolve(null),1000))]);
    return {present:true,policy:policy.content,result};
  });
  assert.equal(csp.present,true,'Public GitHub Pages must declare an explicit CSP');
  const connections=csp.policy.split(';').map(x=>x.trim()).find(x=>x.startsWith('connect-src ')).split(/\s+/).slice(1);
  assert.deepEqual(connections.sort(),["'self'",'https://api.tomtom.com','https://tiles.openfreemap.org',
    'https://router.project-osrm.org','https://nominatim.openstreetmap.org','https://overpass-api.de',
    'https://mterm2026-559f9bf571b5.herokuapp.com'].sort(),
    'Only the documented providers and the public vector tile host may receive requests');
  assert.equal(await page.evaluate(()=>!!window.JalanVectorMap),false,'Engineering Mode does not load the vector renderer');
  assert.equal(csp.result?.directive,'connect-src',
    'Browser must block unexpected cross-origin network calls via CSP');
  assert.ok(csp.result?.blockedURI.startsWith('https://untrusted.example.invalid'));

  // These are the v1.9.4 published integrity values in Leaflet's own quick start.
  // Loading local bytes under the original CDN URL also tests browser SRI enforcement.
  const sri=await page.evaluate(()=>({
    css:document.querySelector('link[href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"]')?.integrity,
    js:document.querySelector('script[src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"]')?.integrity
  }));
  assert.equal(sri.css,'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=');
  assert.equal(sri.js,'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=');
  await page.waitForFunction(()=>window.JalanTomTom&&window.L&&typeof window.L.map==='function');
  assert.equal(errors.length,0,'Public bundle must initialize without page JavaScript exceptions: '+errors.join('; '));
  const geom=await page.evaluate(()=>{
    const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();
      return {x:r.left,y:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
    return {viewport:innerWidth,docWidth:document.documentElement.scrollWidth,
      map:rect('map'),search:rect('search-form'),panel:rect('info-panel')};
  });
  assert.equal(geom.viewport,390);
  assert.ok(geom.map.width>=388&&geom.map.height>=800,'390px map should occupy viewport');
  assert.ok(geom.search.x>=-1&&geom.search.right<=391&&geom.search.width>120,
    'Search controls must remain inside 390px screen');
  assert.ok(geom.panel.x>=-1&&geom.panel.right<=391,'Panel must remain inside 390px screen');
  assert.ok(geom.docWidth<=391,'No horizontal overflow');
  // Key public status changes must be announced to assistive technologies.
  const accessibility=await page.evaluate(()=>({
    statusRole:document.getElementById('status').getAttribute('role'),
    statusLive:document.getElementById('status').getAttribute('aria-live'),
    summaryRole:document.getElementById('route-summary').getAttribute('role'),
    summaryLive:document.getElementById('route-summary').getAttribute('aria-live'),
    summaryAtomic:document.getElementById('route-summary').getAttribute('aria-atomic')
  }));
  assert.equal(accessibility.statusRole,'status');
  assert.equal(accessibility.statusLive,'polite');
  assert.equal(accessibility.summaryRole,'status');
  assert.equal(accessibility.summaryLive,'polite');
  assert.equal(accessibility.summaryAtomic,'true');
  await page.locator('#destination').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.trim()),'Search',
    'Keyboard Tab from destination must reach Search submit');
  // Navigation menu keyboard contract: focus enters the opened panel and
  // returns to its launcher when closed (including Escape). No GPS session.
  await page.evaluate(()=>{
    document.body.classList.add('nav-active');
    document.getElementById('nav-hud').classList.remove('hidden');
  });
  const navMenu=page.locator('#nav-hud .nav-menu-button');
  await navMenu.focus();
  await page.keyboard.press('Enter');
  assert.equal(await navMenu.getAttribute('aria-expanded'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'nav-panel-close',
    'Opening the navigation menu must move focus into visible menu controls');
  await page.keyboard.press('Escape');
  assert.equal(await navMenu.getAttribute('aria-expanded'),'false');
  assert.equal(await navMenu.evaluate(e=>document.activeElement===e),true,
    'Escape must restore focus to the navigation Menu button');
  await navMenu.click();
  await page.locator('#nav-panel-close').click();
  assert.equal(await navMenu.evaluate(e=>document.activeElement===e),true,
    'Close menu button must restore focus to the launcher');
  await page.evaluate(()=>{
    document.getElementById('nav-hud').classList.add('hidden');
    document.body.classList.remove('nav-active','menu-open');
  });
  // Axe checks the actual rendered public page, not HTML regex/fixtures.
  // No real API key, GPS or external browser request is needed for this audit.
  await page.addScriptTag({url:base+'/node_modules/axe-core/axe.min.js'});
  async function auditCurrentVisibleState(label){
    const violations=await page.evaluate(async()=>{
      const scan=await window.axe.run(document,{
        runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}
      });
      return scan.violations.map(v=>({id:v.id,impact:v.impact,
        help:v.help,targets:v.nodes.slice(0,5).map(n=>n.target.join(' ')),
        affected:v.nodes.length}));
    });
    for(const v of violations)
      console.log('PUBLIC ACCESSIBILITY '+label+':',JSON.stringify(v));
    assert.deepEqual(violations.filter(v=>v.impact==='critical'||v.impact==='serious'),[],
      'Rendered public '+label+' state must not have serious/critical automated WCAG violations');
  }
  await auditCurrentVisibleState('initial');
  await page.locator('#locate').click();
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Location unavailable'));
  await page.evaluate(()=>{setStart([3.139,101.6869],'Public test origin');destination=[3.1478,101.6953]});
  await page.locator('#tt-key').fill('PublicTestKey123');
  let osrmCalls=0,tomtomCalls=0;
  await page.route('https://api.tomtom.com/routing/**',route=>{
    tomtomCalls++;route.fulfill({status:200,headers:cors,body:JSON.stringify(tomtomOK)});
  });
  await page.route('https://router.project-osrm.org/route/**',route=>{
    osrmCalls++;route.fulfill({status:200,headers:cors,body:JSON.stringify(osrmOK)});
  });
  await page.locator('#tt-route').click();
  await page.waitForFunction(()=>document.getElementById('route-summary').textContent.includes('TomTom traffic-aware estimate'));
  assert.ok((await page.locator('#tt-eta').textContent()).includes('Traffic delay'));
  assert.equal(tomtomCalls,1);
  // User-requested route perspective: auto-tilt only after a route exists,
  // clearly distinguish 2.5-D preview from real terrain, and let the owner
  // return to interactive 2-D. No GPS/route network calls are added.
  const perspective=page.locator('#perspective-toggle');
  assert.equal(await perspective.isVisible(),true,'Selected route offers perspective control');
  assert.equal(await perspective.getAttribute('aria-pressed'),'true',
    'Route selection automatically activates perspective preview');
  assert.match(await page.locator('#perspective-note').textContent(),/not real 3D terrain/);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('map')).pointerEvents),'none',
    'Tilted Leaflet map must disable mismatched click hit-testing');
  await perspective.click();
  assert.equal(await perspective.getAttribute('aria-pressed'),'false',
    'Owner can return to interactive 2D');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('map')).pointerEvents),'auto');
  assert.equal(await perspective.textContent(),'3D-style view');
  assert.equal(await page.locator('#perspective-note').isVisible(),false);
  await page.locator('#toggle-panel').click(); // route options are hidden while panel is collapsed
  await page.locator('#route-options button').first().click();
  await page.locator('#toggle-panel').click(); // restore collapsed state for later tests
  assert.equal(await perspective.getAttribute('aria-pressed'),'false',
    'Manually selected 2D view remains stable across route re-render');
  await perspective.click();
  assert.equal(await perspective.getAttribute('aria-pressed'),'true');
  await perspective.click(); // leave 2D for GPS route-matching tests

  assert.equal(osrmCalls,0,'TomTom primary should not silently call OSRM');
  assert.equal(await page.evaluate(()=>localStorage.getItem('jalan-tomtom-key')),null,
    'Unchecked Remember must never persist TomTom key locally');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('jalan-tomtom-key')),null,
    'Unchecked Remember must never persist TomTom key in tab storage');
  // Exercise the real route-matching + GPS display + proactive-readiness
  // modules in Chromium, not only an isolated VM predictor fixture.
  // These synthetic fixes never access a device location or leave localhost.
  const gpsAccuracyGate=await page.evaluate(()=>{
    document.getElementById('gps-start').click();
    const before=window.JalanGPS.getState();
    const good={coords:{latitude:3.139,longitude:101.6869,
      accuracy:8,speed:0,heading:0},timestamp:Date.now()};
    window.__offlineGPSWatch?.(good);
    const matched=window.JalanGPS.getState();
    const missing={coords:{...good.coords,accuracy:undefined},
      timestamp:good.timestamp+1000};
    window.__offlineGPSWatch?.(missing);
    const missingState=window.JalanGPS.getState();
    const rendered=document.getElementById('gps-accuracy').textContent;
    window.JalanGPS.stop();
    const stopped=window.JalanGPS.getState();
    return {before,matched,missingState,rendered,stopped};
  });
  assert.equal(gpsAccuracyGate.before.active,true,'Mock GPS navigation starts on valid route');
  assert.equal(gpsAccuracyGate.matched.matched,true,'Known numeric accuracy supports initial route match');
  assert.equal(gpsAccuracyGate.matched.accuracy,8,'Raw reported browser accuracy preserved');
  assert.equal(gpsAccuracyGate.missingState.matched,false,
    'Unknown accuracy must revoke road-match trust before proactive TomTom reroute');
  assert.equal(gpsAccuracyGate.missingState.accuracy,Infinity,
    'Unknown GPS accuracy may not be parsed as 0 m from the rendered text');
  assert.equal(gpsAccuracyGate.rendered,'Unknown');
  assert.equal(gpsAccuracyGate.stopped.active,false);
  assert.equal(gpsAccuracyGate.stopped.accuracy,Infinity,
    'GPS stop must clear the browser navigation accuracy state');
  await page.locator('#toggle-panel').click(); // expand hidden details after route fit
  await page.locator('#tt-primary').uncheck();
  assert.equal(await page.evaluate(()=>routes.length),0,'Provider switch clears previous live route');
  assert.equal(osrmCalls,0,'Switch alone must not auto-request OSRM');
  await page.evaluate(()=>calculateRoutes());
  await page.waitForFunction(()=>document.getElementById('route-summary').textContent.includes('OSRM estimate only'));
  assert.equal(osrmCalls,1);
  assert.equal(await page.evaluate(()=>routes[0].provider||'osrm'),'osrm');
  await auditCurrentVisibleState('OSRM route visible');
  await page.locator('#toggle-panel').click(); // reveal provider controls after route fit
  // Reproduce stale OSRM completion AFTER selecting and completing a TomTom route.
  // The intentionally noncooperative mocked transport ignores AbortSignal, so
  // cancellation alone cannot accidentally make the test pass.
  async function armDelayedOsrm() {
    await page.evaluate(fixture=>{
      const priorFetch=window.fetch;
      window.__restoreOsrmRaceFetch=()=>{window.fetch=priorFetch};
      window.fetch=(u,opts)=>{
        if(String(u).startsWith('https://router.project-osrm.org/route/'))
          return new Promise(resolve=>{window.__finishOldOsrm=()=>resolve({ok:true,json:async()=>fixture})});
        return priorFetch(u,opts);
      };
      window.__pendingOldOsrm=calculateRoutes();
    },osrmOK);
    await page.waitForFunction(()=>typeof window.__finishOldOsrm==='function');
  }
  async function finishDelayedOsrm() {
    await page.evaluate(async()=>{
      window.__finishOldOsrm();
      await window.__pendingOldOsrm;
      window.__restoreOsrmRaceFetch();
      delete window.__finishOldOsrm;delete window.__pendingOldOsrm;
      delete window.__restoreOsrmRaceFetch;
    });
  }
  await armDelayedOsrm();
  await page.locator('#tt-primary').check();
  await page.locator('#tt-route').click();
  await page.waitForFunction(()=>routes[0]?.provider==='tomtom');
  await finishDelayedOsrm();
  assert.equal(await page.evaluate(()=>routes[0]?.provider),'tomtom',
    'Late OSRM must not replace a newer TomTom route even if abort is ignored');
  assert.match(await page.locator('#route-summary').textContent(),/TomTom traffic-aware estimate/);
  await page.evaluate(()=>setPanelCollapsed(false)); // TomTom render refits and collapses panel
  // A late OSRM response must also not redraw a deliberately cleared route.
  await page.locator('#tt-primary').uncheck();
  await armDelayedOsrm();
  await page.locator('#reset').click();
  await finishDelayedOsrm();
  assert.equal(await page.evaluate(()=>routes.length),0,
    'Old OSRM must not repopulate route after Reset');
  assert.equal(await perspective.isVisible(),false,
    'Reset must remove perspective controls and restore interactive 2D map');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('route-perspective')),false);
  await page.evaluate(()=>{setStart([3.139,101.6869],'Public test origin');destination=[3.1478,101.6953]});
  // With TomTom explicitly selected and key missing there must be NO silent OSRM.
  await page.locator('#tt-remove-key').click();
  await page.locator('#tt-primary').check();
  const callsBeforeNoKey=osrmCalls;
  await page.evaluate(()=>calculateRoutes());
  assert.equal(osrmCalls,callsBeforeNoKey,'Missing TomTom key must not silently switch to OSRM');
  assert.match(await page.locator('#status').textContent(),/Enter a TomTom key or uncheck/);
  await page.locator('#tt-key').fill('PublicTestKey123');
  // Delayed TomTom incident JSON may complete despite AbortSignal. Removing the
  // key must invalidate it: no old warning markers or stale 'traffic active'
  // status may reappear after the user has stopped traffic.
  await page.evaluate(()=>setPanelCollapsed(false));
  await page.locator('#tt-route').click();
  await page.waitForFunction(()=>routes[0]?.provider==='tomtom');
  await page.evaluate(()=>{
    const originalFetch=window.fetch;
    window.__restoreIncidentFetch=()=>{window.fetch=originalFetch};
    window.fetch=(url,options)=>{
      if(String(url).startsWith('https://api.tomtom.com/traffic/services/5/incidentDetails')){
        window.__incidentSignal=options?.signal;
        return new Promise(resolve=>{
          window.__finishStaleIncident=()=>resolve({ok:true,json:async()=>({incidents:[{
            geometry:{type:'Point',coordinates:[101.6869,3.139]},
            properties:{iconCategory:6,events:[{description:'Old warning'}]}
          }]})});
        });
      }
      return originalFetch(url,options);
    };
    document.getElementById('tt-incident-toggle').checked=true;
  });
  await page.evaluate(()=>setPanelCollapsed(false));
  await page.locator('#tt-connect').click();
  await page.waitForFunction(()=>typeof window.__finishStaleIncident==='function');
  await page.locator('#tt-remove-key').click();
  assert.equal(await page.evaluate(()=>window.__incidentSignal?.aborted),true,
    'Removing TomTom key must abort the incident request');
  await page.evaluate(async()=>{
    window.__finishStaleIncident(); // deliberately ignores the aborted signal
    await new Promise(resolve=>setTimeout(resolve,80));
    window.__restoreIncidentFetch();
    delete window.__finishStaleIncident;delete window.__restoreIncidentFetch;
  });
  assert.match(await page.locator('#tt-status').textContent(),/Key cleared from browser/,
    'Late incident response must not overwrite key-revocation status');
  assert.equal(await page.locator('#map .report-marker').count(),0,
    'Late incident response must not re-add old traffic hazard markers');
  await page.locator('#tt-key').fill('PublicTestKey123');

  // N11 actual public-script DOM integration for the new proactive safeguards.
  // GPS, provider and route data are fully mocked; never request phone location.
  await page.evaluate(()=>setPanelCollapsed(false));
  await page.locator('#tt-route').click();
  await page.waitForFunction(()=>routes[0]?.provider==='tomtom');
  await page.evaluate(()=>{
    const originalFetch=window.fetch,originalState=window.JalanGPS.getState;
    const originalApply=window.JalanGPS.applyTrafficRoute;
    window.__proactiveApplied=0;
    window.JalanGPS.getState=()=>({active:true,matched:true,accuracy:8,fixAgeMs:100,
      position:[3.139,101.6869],route:routes[0],remainingSeconds:1200});
    window.JalanGPS.applyTrafficRoute=()=>{window.__proactiveApplied++;return true};
    window.fetch=(url,options)=>{
      if(String(url).startsWith('https://api.tomtom.com/routing/1/calculateRoute/'))
        return new Promise(resolve=>{window.__finishProactive=payload=>{
          delete window.__finishProactive;
          resolve({ok:true,json:async()=>payload});
        }});
      return originalFetch(url,options);
    };
    window.__restoreProactive=()=>{
      window.fetch=originalFetch;window.JalanGPS.getState=originalState;
      window.JalanGPS.applyTrafficRoute=originalApply;
      delete window.__finishProactive;
    };
  });
  // A route with fabricated positive ETA but zero-length geometry must not be offered.
  await page.evaluate(()=>document.getElementById('proactive-check').click());
  await page.waitForFunction(()=>typeof window.__finishProactive==='function');
  await page.evaluate(()=>window.__finishProactive({routes:[{
    legs:[{points:[{latitude:3.139,longitude:101.6869},
      {latitude:3.139,longitude:101.6869}]}],
    summary:{travelTimeInSeconds:180,lengthInMeters:2500,trafficDelayInSeconds:30}
  }]}));
  await page.waitForFunction(()=>document.getElementById('proactive-status').textContent.includes('Invalid route geometry distance'));
  assert.equal(await page.locator('#proactive-offer').evaluate(el=>el.classList.contains('hidden')),true);
  assert.equal(await page.evaluate(()=>window.__proactiveApplied),0);
  // A valid alternative creates an offer, but mutating the key without a DOM
  // input event MUST still revoke the final acceptance in the real page module.
  await page.evaluate(()=>document.getElementById('proactive-check').click());
  await page.waitForFunction(()=>typeof window.__finishProactive==='function');
  await page.evaluate(fixture=>window.__finishProactive(fixture),tomtomOK);
  await page.waitForFunction(()=>document.getElementById('proactive-status').textContent.includes('Faster route suggested'));
  assert.equal(await page.locator('#proactive-offer').evaluate(el=>el.classList.contains('hidden')),false);
  await page.evaluate(()=>{
    document.getElementById('tt-key').value='ChangedWithoutEventFakeKey123';
    document.getElementById('proactive-accept').click();
  });
  assert.equal(await page.evaluate(()=>window.__proactiveApplied),0);
  assert.equal(await page.locator('#proactive-offer').evaluate(el=>el.classList.contains('hidden')),true);
  await page.evaluate(()=>{
    window.__restoreProactive();
    document.getElementById('tt-key').value='PublicTestKey123';
  });
  await page.evaluate(()=>setPanelCollapsed(false)); // preserve accessible provider controls
  await page.locator('#tt-primary').check();
  await page.route('https://api.tomtom.com/routing/**',route=>{
    tomtomCalls++;route.fulfill({status:401,headers:cors,
      body:JSON.stringify({error:'public fake key rejected'})});
  });
  const osrmBefore=osrmCalls;
  await page.locator('#tt-route').click();
  await page.waitForFunction(()=>document.getElementById('tt-status').textContent.includes('Uncheck TomTom primary routing to use OSRM'));
  assert.equal(osrmCalls,osrmBefore,'TomTom error must not silently fall back to OSRM');
  assert.equal(await page.evaluate(()=>routes.length),0,'Failed request must not leave stale OSRM geometry');
  await auditCurrentVisibleState('TomTom authentication error');
  // Previously saved key must be revoked on edit even before reconnecting.
  await page.locator('#tt-remember').check();
  await page.locator('#tt-route').click(); // fake 401, intentional local save
  assert.equal(await page.evaluate(()=>localStorage.getItem('jalan-tomtom-key')),'PublicTestKey123');
  await page.locator('#tt-key').fill('ReplacementFakeKey123');
  assert.equal(await page.evaluate(()=>localStorage.getItem('jalan-tomtom-key')),null);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('jalan-tomtom-key')),null);
  assert.ok((await page.locator('#tt-status').textContent()).includes('Old stored key removed'));
  await page.locator('#tt-remove-key').click();
  assert.equal(await page.locator('#tt-key').inputValue(),'');
  assert.equal(await page.evaluate(()=>localStorage.getItem('jalan-tomtom-key')),null);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('jalan-tomtom-key')),null);
  // Public opt-in traffic sharing must cancel an already pending upload on Stop.
  // The fetch is intercepted before networking, so no Heroku request is sent.
  const optInStop=await page.evaluate(()=>{
    const originalFetch=window.fetch;
    let started=0,signal=null;
    window.fetch=(url,options)=>{
      if(String(url).endsWith('/observations')){
        started++;signal=options?.signal;
        return new Promise(()=>{}); // deliberately remains pending, no network
      }
      return originalFetch(url,options);
    };
    document.getElementById('shared-start').click();
    window.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{
      matched:true,matchedPosition:[3.139,101.6869],
      accuracy:4,speedMps:3,heading:90
    }}));
    const beforeStop=signal?.aborted??null;
    document.getElementById('shared-stop').click();
    return {started,beforeStop,afterStop:signal?.aborted??null,
      status:document.getElementById('shared-status').textContent,
      nearbyHeld:document.getElementById('shared-check').disabled};
  });
  assert.equal(optInStop.started,1,'Opted-in observation intercepted in browser');
  assert.equal(optInStop.beforeStop,false);
  assert.equal(optInStop.afterStop,true,'Stop must abort browser fetch signal');
  assert.ok(optInStop.nearbyHeld,'Legacy nearby-coordinate GET must remain disabled');
  assert.match(optInStop.status,/already accepted observation is not recalled/);
  assert.equal(errors.length,0,'No runtime page exceptions: '+errors.join('; '));
  console.log('PASS public V4.7.4 Chromium 390px: initialization/layout, location denied, TomTom primary, explicit OSRM switch, 401 failure, key removal; external network blocked.');
  await context.close();
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error('PUBLIC NON-PHONE BROWSER GATE FAILED:',e);process.exitCode=1});
