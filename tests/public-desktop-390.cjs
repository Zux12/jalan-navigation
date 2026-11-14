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
      watchPosition(_ok,error){error({code:1,message:'Permission denied'});return 1},
      clearWatch(){}
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
  assert.ok(csp.policy.includes("connect-src 'self' https://api.tomtom.com"),
    'Only the documented routing providers may receive browser requests');
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
  assert.equal(osrmCalls,0,'TomTom primary should not silently call OSRM');
  assert.equal(await page.evaluate(()=>localStorage.getItem('jalan-tomtom-key')),null,
    'Unchecked Remember must never persist TomTom key locally');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('jalan-tomtom-key')),null,
    'Unchecked Remember must never persist TomTom key in tab storage');
  await page.locator('#toggle-panel').click(); // expand hidden details after route fit
  await page.locator('#tt-primary').uncheck();
  assert.equal(await page.evaluate(()=>routes.length),0,'Provider switch clears previous live route');
  assert.equal(osrmCalls,0,'Switch alone must not auto-request OSRM');
  await page.evaluate(()=>calculateRoutes());
  await page.waitForFunction(()=>document.getElementById('route-summary').textContent.includes('OSRM estimate only'));
  assert.equal(osrmCalls,1);
  assert.equal(await page.evaluate(()=>routes[0].provider||'osrm'),'osrm');
  await auditCurrentVisibleState('OSRM route visible');
  await page.locator('#toggle-panel').click(); // OSRM route fit collapses details again
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
  // N11 privacy migration: real Chromium exercises the public KL3C panel.
  // Never send GPS to a live server, and never fall back to coordinate-URL GET.
  let kl3cPostCalls=0,kl3cGetCalls=0;
  await page.route('https://mterm2026-559f9bf571b5.herokuapp.com/api/jalan/kl-segment-v4102/**',route=>{
    const req=route.request();
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{
      'access-control-allow-origin':'*','access-control-allow-methods':'POST',
      'access-control-allow-headers':'content-type'}});
    if(req.method()==='GET')kl3cGetCalls++;
    else {
      assert.equal(req.method(),'POST','KL3C must submit a JSON-body POST');
      assert.equal(new URL(req.url()).search,'','Coordinates must not appear in request URL');
      assert.deepEqual(req.postDataJSON(),{startLat:3.139,startLng:101.6869,
        endLat:3.1478,endLng:101.6953});
      kl3cPostCalls++;
    }
    return route.fulfill({status:200,headers:cors,body:JSON.stringify({
      ok:true,geometry:{type:'LineString',coordinates:[
        [101.6869,3.139],[101.6953,3.1478]]},
      distanceMeters:3200,edgeCount:8,startSnapMeters:3,endSnapMeters:4,
      illustrativeEtaMinutes:6.4
    })});
  });
  await page.evaluate(()=>{
    setStart([3.139,101.6869],'Public dummy KL3C start');
    destination=[3.1478,101.6953];
    document.getElementById('kl3c-run').click();
  });
  assert.equal(kl3cPostCalls,0,'KL3C consent defaults off');
  await page.locator('#kl3c-consent').check({force:true});
  await page.evaluate(()=>document.getElementById('kl3c-run').click());
  await page.waitForFunction(()=>document.getElementById('kl3c-status').textContent.includes('Segment preview'));
  assert.equal(kl3cPostCalls,1);
  assert.equal(kl3cGetCalls,0,'KL3C cannot use legacy coordinate-URL GET');
  await page.locator('#kl3c-consent').uncheck({force:true});
  await page.evaluate(()=>document.getElementById('kl3c-run').click());
  assert.equal(kl3cPostCalls,1,'Consent revocation must stop later requests');
  assert.equal(kl3cGetCalls,0);
  assert.equal(errors.length,0,'No runtime page exceptions: '+errors.join('; '));
  console.log('PASS public V4.7.4 Chromium 390px: initialization/layout, location denied, TomTom primary, explicit OSRM switch, 401 failure, key removal; external network blocked.');
  await context.close();
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error('PUBLIC NON-PHONE BROWSER GATE FAILED:',e);process.exitCode=1});
