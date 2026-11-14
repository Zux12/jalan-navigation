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
  await page.waitForFunction(()=>window.JalanTomTom&&typeof window.L==='function');
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
  await page.locator('#tt-primary').uncheck();
  assert.equal(await page.evaluate(()=>routes.length),0,'Provider switch clears previous live route');
  assert.equal(osrmCalls,0,'Switch alone must not auto-request OSRM');
  await page.evaluate(()=>calculateRoutes());
  await page.waitForFunction(()=>document.getElementById('route-summary').textContent.includes('OSRM estimate only'));
  assert.equal(osrmCalls,1);
  assert.equal(await page.evaluate(()=>routes[0].provider||'osrm'),'osrm');
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
  await page.locator('#tt-remove-key').click();
  assert.equal(await page.locator('#tt-key').inputValue(),'');
  assert.equal(await page.evaluate(()=>localStorage.getItem('jalan-tomtom-key')),null);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('jalan-tomtom-key')),null);
  assert.equal(errors.length,0,'No runtime page exceptions: '+errors.join('; '));
  console.log('PASS public V4.7.4 Chromium 390px: initialization/layout, location denied, TomTom primary, explicit OSRM switch, 401 failure, key removal; external network blocked.');
  await context.close();
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error('PUBLIC NON-PHONE BROWSER GATE FAILED:',e);process.exitCode=1});
