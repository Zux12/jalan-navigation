'use strict';
// No-network 390px integration of two JALAN interfaces. Mock alternative
// routes and geolocation; no actual TomTom key, GPS, Atlas or external requests.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const contentTypes={'.html':'text/html; charset=utf-8','.js':'application/javascript',
 '.css':'text/css; charset=utf-8'};
const serve=(req,res)=>{
 let url;try{url=new URL(req.url,'http://localhost')}catch{res.writeHead(400);return res.end()}
 const name=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!name.startsWith(root+path.sep)||!fs.existsSync(name)||!fs.statSync(name).isFile()){
   res.writeHead(404);return res.end('Missing test asset');
 }
 res.writeHead(200,{'content-type':contentTypes[path.extname(name)]||'text/plain',
  'cache-control':'no-store'});
 res.end(fs.readFileSync(name));
};
async function main(){
 const server=http.createServer(serve);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({
   viewport:{width:390,height:844},deviceScaleFactor:2,
   isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript(()=>{
   Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
    getCurrentPosition(_success,error){error({code:1,message:'Denied in offline fixture'})},
    watchPosition(success,error){window.__offlineGPSWatch=success;error({code:1,message:'Denied in offline fixture'});return 1},
    clearWatch(){}
   }});
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
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
  await page.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-mode')),true);
  assert.equal(await page.locator('#info-panel').isVisible(),false);
  assert.equal(await page.locator('#search-form').isVisible(),true);
  assert.equal(await page.locator('#passenger-overview').isVisible(),false);
  await page.evaluate(()=>{
   // Deliberately out-of-order synthetic provider returns, NOT live roads.
   const points=[[101.6869,3.139],[101.6953,3.1478]];
   setStart([3.139,101.6869],'Fixture starting point');
   updateLocation([3.139,101.6869]);
   destination=[3.1478,101.6953];
   const route=(duration,distance)=>({provider:'osrm',duration,distance,
    geometry:{type:'LineString',coordinates:points},
    legs:[{steps:[{name:'Test segment',distance,maneuver:{type:'turn',modifier:'left'}}]}]});
   routes=[route(840,4200),route(600,3200),route(720,3400)];
   selectedRoute=0;renderRoutes();
  });
  assert.equal(await page.evaluate(()=>selectedRoute),0,'shortest actual ETA selected');
  assert.equal(await page.evaluate(()=>routes[0].duration),600,'provider routes sorted by ETA');
  assert.equal(await page.locator('#passenger-overview').isVisible(),true);
  assert.equal(await page.locator('#passenger-route-list button').count(),3);
  // A shorter Safari-like visible viewport must never clip the Go button.
  // A long list should scroll inside the card instead of pushing Go below it.
  await page.setViewportSize({width:390,height:560});
  const layout=await page.evaluate(()=>{
    const panel=document.getElementById('passenger-overview');
    const list=document.getElementById('passenger-route-list');
    const button=document.getElementById('passenger-go');
    for(let i=0;i<10;i++){
      const copy=list.firstElementChild.cloneNode(true);
      copy.removeAttribute('aria-pressed');
      list.appendChild(copy);
    }
    const p=panel.getBoundingClientRect(),b=button.getBoundingClientRect();
    return {viewport:window.innerHeight,panelTop:p.top,panelBottom:p.bottom,
      goBottom:b.bottom,goTop:b.top,listScrollHeight:list.scrollHeight,
      listClientHeight:list.clientHeight};
  });
  assert.ok(layout.panelTop>=0,'route overview must fit visible mobile viewport');
  assert.ok(layout.goBottom<=layout.viewport-1,
    'Go action must remain visible above mobile Safari browser chrome');
  assert.ok(layout.listScrollHeight>layout.listClientHeight,
    'only alternative cards should scroll; Go stays pinned');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    const list=document.getElementById('passenger-route-list');
    while(list.children.length>3)list.lastElementChild.remove();
  });
  assert.match(await page.locator('#passenger-route-list').innerText(),/\+2 min/);
  assert.match(await page.locator('#passenger-route-list').innerText(),/\+4 min/);
  assert.equal(await page.evaluate(()=>document.body.classList.contains('route-perspective')),false,
   'Route review must remain 2D until Go');
  await page.locator('#passenger-route-list button').nth(1).click();
  assert.equal(await page.evaluate(()=>selectedRoute),1,'alternative selectable');
  await page.locator('#passenger-route-list button').first().click();
  assert.deepEqual(await page.evaluate(()=>({
    startVisible:!!startMarker&&pointLayer.hasLayer(startMarker),
    locationVisible:!!locationMarker&&pointLayer.hasLayer(locationMarker)
  })),{startVisible:true,locationVisible:true},'route-planning indicators visible before Go');
  await page.locator('#passenger-go').click();
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-guiding')),true);
  assert.deepEqual(await page.evaluate(()=>({
    startVisible:!!startMarker&&pointLayer.hasLayer(startMarker),
    locationVisible:!!locationMarker&&pointLayer.hasLayer(locationMarker)
  })),{startVisible:false,locationVisible:false},
  'start and legacy location circles must not overlap the passenger vehicle marker');
  assert.equal(await page.locator('#passenger-navigation').isVisible(),true);
  assert.equal(await page.locator('#gps-hud').isVisible(),false,'engineering HUD hidden in clean view');
  assert.equal(await page.locator('.passenger-car-arrow').count(),0,
    'fixed fake vehicle triangle must be removed');
  const zoomBefore=await page.evaluate(()=>map.getZoom());
  // Unreliable GPS must NEVER silently zoom into an asserted matched road.
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now(),coords:{
      latitude:3.139,longitude:101.6869,accuracy:180,speed:2,heading:0}});
  });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>map.getZoom()),zoomBefore,
    'uncertain GPS cannot drive passenger camera');
  assert.equal(await page.locator('.jalan-vehicle-marker').count(),0,
    'poor GPS must not display a claimed vehicle position');
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()+1000,coords:{
      latitude:3.139,longitude:101.6869,accuracy:8,speed:2,heading:0}});
  });
  await page.waitForFunction(()=>map.getZoom()>=17,null,{timeout:4000});
  // The old overview animation used to snap the camera back to 15 shortly
  // after the matched fix. Hold the contract across that transition window.
  await page.waitForTimeout(1200);
  assert.ok(await page.evaluate(()=>map.getZoom()>=17),
    'passenger follow zoom must persist after delayed route overview settling');
  assert.equal(await page.evaluate(()=>document.getElementById('passenger-fix').textContent.includes('GPS matched')),true);
  const forward=await page.evaluate(()=>map.getCenter().lat);
  assert.ok(forward>3.139,'passenger camera should center ahead along validated route');
  assert.equal(await page.locator('.jalan-vehicle-marker').count(),1,
    'verified GPS must create one georeferenced marker');
  assert.equal(await page.evaluate(()=>!!locationMarker&&pointLayer.hasLayer(locationMarker)),false,
    'ongoing GPS fixes must not recreate legacy location dot in passenger mode');
  assert.equal(await page.locator('.jalan-vehicle-symbol').getAttribute('data-heading'),
    'route','slow GPS uses clearly estimated route direction, not fake compass');
  assert.equal(await page.locator('.jalan-vehicle-symbol').textContent(),'▲',
    'triangle appears after a verified GPS match even when stationary');
  const slowDirection=await page.evaluate(()=>{
    const symbol=document.querySelector('.jalan-vehicle-symbol');
    return {map:Number.parseFloat(document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
      marker:Number.parseFloat(symbol.style.getPropertyValue('--jalan-vehicle-heading'))};
  });
  assert.ok(Number.isFinite(slowDirection.map)&&
    Math.abs(slowDirection.map+slowDirection.marker)<0.01,
    'triangle stays up while map uses estimated route bearing');
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()+2500,coords:{
      latitude:3.1391,longitude:101.6870,accuracy:8,speed:5,heading:90}});
  });
  await page.waitForTimeout(80);
  assert.equal(await page.locator('.jalan-vehicle-symbol').getAttribute('data-heading'),
    'gps','moving GPS uses direction of movement');
  assert.equal(await page.locator('.jalan-vehicle-symbol').textContent(),'▲',
    'vehicle is a triangle while moving');
  assert.equal(await page.evaluate(()=>document.querySelector('.jalan-vehicle-symbol').style.getPropertyValue('--jalan-vehicle-heading')),
    '90deg','triangle counter-rotates to screen-up while map turns');
  assert.equal(await page.evaluate(()=>document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
    '-90deg','moving camera rotates only on a reliable heading');
  // Simulated touch-only interactions on the actual tilted navigation gesture
  // plane: one finger pans, two fingers pinch/rotate. No GPS or network calls.
  const touchResults=await page.evaluate(()=>{
    const surface=document.getElementById('passenger-map-gestures');
    const send=(type,points)=>{
      const event=new Event(type,{bubbles:true,cancelable:true});
      Object.defineProperty(event,'touches',{value:points.map(([clientX,clientY])=>({clientX,clientY}))});
      surface.dispatchEvent(event);
    };
    const first=map.getCenter();
    send('touchstart',[[170,400]]);
    send('touchmove',[[210,415]]);
    send('touchend',[]);
    const moved=map.getCenter();
    const zoomBefore=map.getZoom();
    const bearingBefore=Number.parseFloat(map.getContainer().style.getPropertyValue('--jalan-camera-turn'));
    send('touchstart',[[120,390],[240,390]]);
    send('touchmove',[[100,380],[260,420]]);
    send('touchend',[]);
    return {
      moved:Math.abs(moved.lng-first.lng)+Math.abs(moved.lat-first.lat)>0.00000001,
      zoomChanged:map.getZoom()!==zoomBefore,
      bearingChanged:Math.abs(Number.parseFloat(map.getContainer().style.getPropertyValue('--jalan-camera-turn'))-bearingBefore)>1,
      exploringText:document.getElementById('passenger-gesture-hint').textContent,
      rotation:map.getContainer().style.getPropertyValue('--jalan-camera-turn')
    };
  });
  assert.equal(touchResults.moved,true,'one finger drags tilted map');
  assert.equal(touchResults.zoomChanged,true,'two fingers pinch to zoom tilted map');
  assert.equal(touchResults.bearingChanged,true,'two fingers twist to rotate tilted map');
  assert.match(touchResults.exploringText,/Exploring map/);
  const exploreCenter=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()+3000,coords:{
      latitude:3.1392,longitude:101.6872,accuracy:8,speed:5,heading:90}});
  });
  assert.deepEqual(await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]),exploreCenter,
    'GPS updates do not steal the camera while manually exploring');
  await page.locator('#passenger-recenter').click();
  assert.match(await page.locator('#passenger-gesture-hint').innerText(),/Following GPS/);
  await page.locator('#passenger-2d').click();
  assert.equal(await page.evaluate(()=>document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
    '0deg','2D mode stays north-up');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('map')).pointerEvents),
    'auto','flat 2D must restore native Leaflet touch interactions');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('passenger-map-gestures')).pointerEvents),
    'none','flat 2D touch must reach Leaflet without transformed overlay');
  await page.locator('#passenger-2d').click();
  assert.equal(await page.evaluate(()=>document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
    '-90deg','returning to perspective restores heading');
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()+4000,coords:{
      latitude:3.1391,longitude:101.6870,accuracy:180,speed:5,heading:90}});
  });
  await page.waitForTimeout(60);
  assert.equal(await page.locator('.jalan-vehicle-marker').count(),0,
    'uncertain GPS must hide geolocated arrow rather than freeze it');
  assert.equal(await page.evaluate(()=>document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
    '','uncertain GPS resets camera to north-up');
  await page.locator('#passenger-2d').click();
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-map-flat')),true);
  await page.locator('#passenger-stop').click();
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-guiding')),false);
  assert.equal(await page.evaluate(()=>!!startMarker&&pointLayer.hasLayer(startMarker)),true,
    'route planning start marker returns after ending preview');
  assert.equal(await page.locator('#passenger-overview').isVisible(),true);
  await page.locator('#passenger-settings-top').click();
  assert.equal(await page.locator('#passenger-setup').isVisible(),true);
  await page.locator('#passenger-use-osrm').click();
  assert.equal(await page.evaluate(()=>document.getElementById('tt-primary').checked),false);
  assert.equal(await page.locator('#passenger-overview').isVisible(),false);
  // A passenger can explicitly save a restricted key once on the same device.
  // Tests use a synthetic token; no real credentials or provider requests.
  await page.locator('#passenger-settings-top').click();
  await page.locator('#passenger-key').fill('TEST_RESTRICTED_KEY_1234');
  await page.locator('#passenger-remember').check();
  await page.locator('#passenger-use-tomtom').click();
  assert.equal(await page.evaluate(()=>document.getElementById('tt-primary').checked),true);
  assert.equal(await page.evaluate(()=>!!localStorage.getItem('jalan-tomtom-key')),true,
    'remember on this device requires explicit checkbox');
  await page.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});
  assert.equal(await page.locator('#passenger-remember').isChecked(),true);
  assert.equal(await page.evaluate(()=>!!document.getElementById('tt-key').value),true,
    'both interfaces reuse saved browser key');
  assert.match(await page.locator('#passenger-provider-status').innerText(),/no re-entry needed/);
  await page.locator('#passenger-settings-top').click();
  await page.locator('#passenger-use-tomtom').click();
  assert.equal(await page.evaluate(()=>document.getElementById('tt-primary').checked),true,
    'reuse existing browser key without entering again');
  await page.locator('#passenger-settings-top').click();
  await page.locator('#passenger-forget-key').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('jalan-tomtom-key')),null);
  assert.equal(await page.evaluate(()=>document.getElementById('tt-key').value),'');
  await page.goto(base+'/index.html?mode=engineering',{waitUntil:'load'});
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-mode')),false);
  assert.equal(await page.locator('#info-panel').isVisible(),true,'original engineering dashboard retained');
  assert.equal(await page.locator('#passenger-settings-top').isVisible(),false);
  assert.deepEqual(errors,[],'no uncaught JS errors in either UI');
  console.log('JALAN passenger 390px offline PASS: two modes, fastest, real alternatives, +minutes, Go, 2D, exit and provider fallback.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
