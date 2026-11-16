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
   startPoint=[3.139,101.6869];destination=[3.1478,101.6953];
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
  await page.locator('#passenger-go').click();
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-guiding')),true);
  assert.equal(await page.locator('#passenger-navigation').isVisible(),true);
  assert.equal(await page.locator('#gps-hud').isVisible(),false,'engineering HUD hidden in clean view');
  const zoomBefore=await page.evaluate(()=>{
    window.__jalanCameraTrace=[];
    for(const method of ['setView','fitBounds','panTo','setZoom']){
      const original=map[method].bind(map);
      map[method]=(...args)=>{
        window.__jalanCameraTrace.push({method,zoom:map.getZoom(),target:method==='setView'?args[1]:null,
          stack:new Error().stack?.split('\\n').slice(1,4).join(' | ')});
        return original(...args);
      };
    }
    map.on('zoomend',()=>window.__jalanCameraTrace.push({method:'zoomend',zoom:map.getZoom()}));
    return map.getZoom();
  });
  // Unreliable GPS must NEVER silently zoom into an asserted matched road.
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now(),coords:{
      latitude:3.139,longitude:101.6869,accuracy:180,speed:2,heading:0}});
  });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>map.getZoom()),zoomBefore,
    'uncertain GPS cannot drive passenger camera');
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()+1000,coords:{
      latitude:3.139,longitude:101.6869,accuracy:8,speed:2,heading:0}});
  });
  await page.waitForTimeout(150);
  const diagnostic=await page.evaluate(()=>({
    zoom:map.getZoom(),
    session:window.JalanGPS?.getState()?.active,
    matched:window.JalanGPS?.getState()?.matched,
    accuracy:window.JalanGPS?.getState()?.accuracy,
    guiding:document.body.classList.contains('passenger-guiding'),
    flat:document.body.classList.contains('passenger-map-flat'),
    camera:window.__jalanPassengerCameraDiagnostic||null
  }));
  console.log('Offline passenger camera contract: '+JSON.stringify(diagnostic));
  console.log('Offline passenger page exceptions: '+JSON.stringify(errors.slice(0,3)));
  console.log('Offline passenger map trace: '+JSON.stringify(await page.evaluate(()=>window.__jalanCameraTrace.slice(-18))));
  await page.waitForFunction(()=>map.getZoom()>=17,null,{timeout:4000});
  assert.equal(await page.evaluate(()=>document.getElementById('passenger-fix').textContent.includes('GPS matched')),true);
  const forward=await page.evaluate(()=>map.getCenter().lat);
  assert.ok(forward>3.139,'passenger camera should center ahead along validated route');
  await page.locator('#passenger-2d').click();
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-map-flat')),true);
  await page.locator('#passenger-stop').click();
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-guiding')),false);
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
