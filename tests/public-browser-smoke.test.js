'use strict';
// Browser integration against the ACTUAL public JALAN HTML and JS, using only
// local static assets and mocked third-party network. No GPS or API key sent.
const test=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const ROOT=path.join(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
let server,browser,origin;
test.before(async()=>{
 server=http.createServer((req,res)=>{
  const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const target=p==='/'?path.join(ROOT,'index.html'):path.resolve(ROOT,'.'+p);
  if(!target.startsWith(ROOT+path.sep)){
   res.writeHead(403);res.end();return;
  }
  const file=target;
  fs.readFile(file,(err,data)=>{
   if(err){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'content-type':MIME[path.extname(file)]||'text/plain','cache-control':'no-store'});res.end(data);
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
});
test.after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function pageFor(width=390){
 const page=await browser.newPage({viewport:{width,height:844},permissions:[]});
 const errors=[],calls=[];
 page.on('pageerror',e=>errors.push(String(e.message)));
 const localLeaflet=path.join(ROOT,'node_modules','leaflet','dist');
 await page.route('**/*',async route=>{
  const u=route.request().url();
  if(u.startsWith(origin+'/'))return route.continue();
  if(u.startsWith('https://unpkg.com/leaflet@1.9.4/dist/leaflet.')){
   const name=u.split('/').pop().split('?')[0];
   if(name!=='leaflet.js'&&name!=='leaflet.css')return route.abort();
   return route.fulfill({path:path.join(localLeaflet,name),contentType:name.endsWith('.js')?'text/javascript':'text/css'});
  }
  if(u.includes('nominatim.openstreetmap.org/search')){
   calls.push('nominatim');
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([
    {lat:'3.1478',lon:'101.6953',display_name:'Public KL Test Destination'}])});
  }
  if(u.includes('router.project-osrm.org/route/v1/driving/')){
   calls.push('osrm');
   return route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({code:'Ok',routes:[{
     distance:3200,duration:480,
     geometry:{type:'LineString',coordinates:[[101.6869,3.139],[101.6953,3.1478]]},
     legs:[{steps:[{name:'Leboh Pasar Besar',distance:400,maneuver:{type:'turn',modifier:'right'}}]}]
    }]})});
  }
  if(u.includes('api.tomtom.com/routing/1/calculateRoute/')){
   calls.push('tomtom');
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({routes:[{
    legs:[{points:[{latitude:3.139,longitude:101.6869},{latitude:3.1478,longitude:101.6953}]}],
    summary:{travelTimeInSeconds:390,lengthInMeters:3190,trafficDelayInSeconds:35},
    guidance:{instructions:[]}
   }]})});
  }
  // No live tiles, telemetry, actual geocoder, TomTom key or original Mterms.
  return route.abort();
 });
 await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof window.JalanTomTom==='object',{timeout:15000});
 return {page,errors,calls};
}
test('390px public page boots with route controls and no fatal script exception',async()=>{
 const {page,errors}=await pageFor();
 assert.equal(await page.locator('#map').count(),1);
 assert.equal(await page.locator('#tt-primary').isChecked(),true);
 assert.equal(await page.locator('#kl3c-consent').isChecked(),false);
 assert.ok(!errors.length,'Browser page errors: '+errors.join('; '));
 await page.close();
});
test('manual OSRM fallback shows explicitly non-traffic-aware route',async()=>{
 const {page,calls,errors}=await pageFor();
 await page.locator('#tt-primary').uncheck();
 await page.evaluate(()=>{
  setStart([3.139,101.6869],'Public test start');
  destination=[3.1478,101.6953];
  calculateRoutes();
 });
 await page.waitForFunction(()=>document.getElementById('route-summary').textContent.includes('OSRM estimate only'),{timeout:12000});
 assert.ok(calls.includes('osrm'));assert.ok(!calls.includes('tomtom'));
 assert.ok(!errors.length,'Browser page errors: '+errors.join('; '));
 await page.close();
});
test('TomTom primary stays traffic-aware and key removal clears selected route',async()=>{
 const {page,calls,errors}=await pageFor();
 await page.locator('#tt-key').fill('onlyMockKey12345');
 await page.evaluate(()=>{
  setStart([3.139,101.6869],'Public test start');
  destination=[3.1478,101.6953];
  calculateRoutes();
 });
 await page.waitForFunction(()=>document.getElementById('route-summary').textContent.includes('TomTom traffic-aware'),{timeout:12000});
 assert.ok(calls.includes('tomtom'));assert.ok(!calls.includes('osrm'));
 // Successful routes collapse the details panel by design; reopen it before
 // clicking the actual user-facing Forget key button.
 await page.locator('#toggle-panel').click();
 await page.locator('#tt-remove-key').click();
 await page.waitForFunction(()=>document.getElementById('route-summary').classList.contains('hidden'));
 assert.equal(await page.locator('#tt-key').inputValue(),'');
 assert.ok(!errors.length,'Browser page errors: '+errors.join('; '));
 await page.close();
});
