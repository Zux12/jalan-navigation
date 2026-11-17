'use strict';
// Actual MapLibre/WebGL rendering and the production Leaflet adapter. Fixture
// journeys never use real GPS, credentials or provider routing requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'test-artifacts');
fs.mkdirSync(artifacts,{recursive:true});
const style={version:8,sources:{streets:{type:'geojson',data:{type:'FeatureCollection',features:[
 {type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[101.680,3.132],[101.70,3.154]]}},
 {type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[101.679,3.148],[101.70,3.13]]}}
 ]}}},layers:[{id:'background',type:'background',paint:{'background-color':'#f5f3ee'}},
 {id:'roads',type:'line',source:'streets',paint:{'line-color':'#fff','line-width':20}}]};
const server=http.createServer((req,res)=>{
 const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!name.startsWith(root+path.sep)||!fs.existsSync(name)||!fs.statSync(name).isFile()){res.writeHead(404);return res.end();}
 res.writeHead(200,{'content-type':name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
 res.end(fs.readFileSync(name));
});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 let currentPage;
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  await context.addInitScript(()=>{
   Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
    getCurrentPosition(_ok,fail){fail({code:1,message:'Fixture'});},
    watchPosition(ok){window.__fix=ok;return 1;},clearWatch(){}
   }});
  });
  async function dependencies(page){
   for(const lib of ['leaflet@1.9.4','maplibre-gl@5.15.0'])for(const ext of ['js','css']){
    const name=lib.split('@')[0];
    await page.route('https://unpkg.com/'+lib+'/dist/'+name+'.'+ext,route=>route.fulfill({status:200,
     contentType:ext==='js'?'application/javascript':'text/css',body:fs.readFileSync(path.join(root,'node_modules',name,'dist',name+'.'+ext))}));
   }
  }
  const page=await context.newPage(),errors=[];currentPage=page;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await dependencies(page);
  await page.route('https://tiles.openfreemap.org/styles/positron',route=>route.fulfill({json:style}));
  await page.goto(base+'/index.html?mode=passenger');
  await page.waitForFunction(()=>window.JalanVectorMap?.active,null,{timeout:25000});
  assert.equal(await page.locator('#map').evaluate(x=>getComputedStyle(x).transform),'none');
  await page.evaluate(()=>{window.__mapClicks=0;map.on('click',()=>{window.__mapClicks++;});});
  await page.locator('#jalan-vector-map canvas').click({position:{x:60,y:340}});
  assert.equal(await page.evaluate(()=>window.__mapClicks),1,'one native map click cannot also trigger a flat Leaflet click');
  const routeFixture=()=>{
   setStart([3.139,101.6869],'Fixture start');destination=[3.1478,101.6953];
   const route=(duration,coordinates)=>({provider:'osrm',duration,distance:3200,
    geometry:{type:'LineString',coordinates},legs:[{steps:[{name:'Fixture road',distance:3200,
      routeOffsetInMeters:125,maneuver:{type:'turn',modifier:'left'}}]}]});
   routes=[route(600,[[101.6869,3.139],[101.6953,3.1478]]),
     route(720,[[101.6869,3.139],[101.690,3.145],[101.6953,3.1478]])];
   selectedRoute=0;renderRoutes();
  };
  await page.evaluate(routeFixture);
  // Coloured traffic is drawn only on TomTom-selected route pieces, from the
  // same route points mirrored into native MapLibre. No live traffic key used.
  const colours=await page.evaluate(()=>{
    const first=routes[0],prior=first.geometry;
    first.provider='tomtom';
    first.geometry={type:'LineString',coordinates:[[101.6869,3.139],
      [101.6880,3.1403],[101.6900,3.143],[101.6953,3.1478]]};
    first.trafficSectionsCheckedAt=Date.now();
    first.trafficSections=[
      {sectionType:'TRAFFIC',startPointIndex:0,endPointIndex:1,magnitudeOfDelay:1},
      {sectionType:'TRAFFIC',startPointIndex:1,endPointIndex:2,magnitudeOfDelay:2},
      {sectionType:'TRAFFIC',startPointIndex:2,endPointIndex:3,magnitudeOfDelay:3}
    ];
    window.dispatchEvent(new Event('jalan:routes-rendered'));
    const overlays=[];map.eachLayer(x=>{
      if(x?.options?.className==='jalan-selected-traffic-colour')overlays.push(x.options.color);
    });
    return {overlays};
  });
  await page.waitForFunction(()=>JalanVectorMap.getState().selectedTrafficSegments>=3);
  const colouredState=await page.evaluate(()=>JalanVectorMap.getState());
  assert.equal(colouredState.trafficAboveRoute,true,
    'selected-route traffic must render in a separate MapLibre layer ABOVE the blue route');
  assert.ok(colouredState.selectedTrafficSegments>=3,'native map receives traffic segments');
  assert.ok(colours.overlays.includes('#ffe68a'),'light traffic must be light yellow');
  assert.ok(colours.overlays.includes('#f59b24'),'moderate traffic must be orange');
  assert.ok(colours.overlays.includes('#de3d35'),'heavy traffic must be red');
  await page.evaluate(()=>{
    const first=routes[0];first.provider='osrm';
    first.geometry={type:'LineString',coordinates:[[101.6869,3.139],[101.6953,3.1478]]};
    delete first.trafficSections;
    window.dispatchEvent(new Event('jalan:routes-rendered'));
  });
  await page.waitForFunction(()=>JalanVectorMap.getState().selectedTrafficSegments===0);
  assert.equal(await page.evaluate(()=>JalanRouteTraffic.getState().overlayCount),0,
    'no TomTom colours survive OSRM selection');
  await page.locator('.jalan-vector-pin').first().press('Enter');
  assert.match(await page.locator('.maplibregl-popup-content').first().textContent(),/Fixture start/);
  await page.locator('.maplibregl-popup-close-button').click();
  await page.locator('#passenger-route-list button').nth(1).click();
  assert.equal(await page.evaluate(()=>selectedRoute),1);
  await page.locator('#passenger-route-list button').first().click();
  await page.locator('#passenger-go').click();
  assert.equal(await page.evaluate(()=>JalanVectorMap.getPitch()),48,'Go uses native pitch');
  for(const height of [844,560]){
   await page.setViewportSize({width:390,height});
   const layout=await page.evaluate(()=>{
    const speed=document.getElementById('passenger-speed-floating').getBoundingClientRect(),
      recenter=document.getElementById('passenger-recenter-floating').getBoundingClientRect(),
      bottom=document.querySelector('.passenger-bottom').getBoundingClientRect();
    return {aligned:Math.abs(speed.top+speed.height/2-recenter.top-recenter.height/2)<2,
      clear:speed.bottom<bottom.top&&recenter.bottom<bottom.top,separated:speed.right<recenter.left};
   });
   assert.deepEqual(layout,{aligned:true,clear:true,separated:true},
     'speed and Recenter stay opposite and above the vector map bottom bar');
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#passenger-search').click();
  assert.equal(await page.locator('#jalan-home-sheet').getAttribute('data-state'),'c');
  assert.equal(await page.evaluate(()=>JalanVectorMap.active&&JalanGPS.getState().active),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#jalan-home-sheet').isVisible(),false);
  assert.equal(await page.evaluate(()=>JalanVectorMap.getPitch()),48,
    'opening and dismissing Stage C preserves the native pitched map');
  assert.equal(await page.locator('#passenger-map-gestures').isVisible(),false,'native gestures get the touch surface');
  const fix=()=>window.__fix({timestamp:Date.now(),coords:{latitude:3.139,longitude:101.6869,accuracy:8,speed:5,heading:45}});
  await page.evaluate(fix);
  await page.waitForFunction(()=>map.getZoom()>=17);
  assert.equal(await page.evaluate(()=>JalanVectorMap.getBearing()),45);
  // Screen HUD is deliberately batched into requestAnimationFrame; assert the
  // rendered frame, not the synchronous midpoint of a GPS event dispatch.
  await page.waitForFunction(()=>{
   const p=JalanVectorMap.project([3.139,101.6869]),b=document.getElementById('passenger-vehicle-screen').getBoundingClientRect();
   return Math.abs(b.x+b.width/2-p.x)<2&&Math.abs(b.y+b.height/2-p.y)<2;
  },null,{timeout:2000});
  const placement=await page.evaluate(()=>{
   const p=JalanVectorMap.project([3.139,101.6869]),box=document.getElementById('passenger-vehicle-screen').getBoundingClientRect();
   return {dx:Math.abs(box.x+box.width/2-p.x),dy:Math.abs(box.y+box.height/2-p.y),y:p.y};
  });
  assert.ok(placement.dx<2&&placement.dy<2,'vehicle shares native pitched projection with route');
  assert.ok(placement.y>450&&placement.y<700,'vehicle is in lower visible map area');
  await page.screenshot({path:path.join(artifacts,'vector-fixture-navigation.png')});
  // Native gestures must actually change the camera. A former vector-gesture
  // handler called gl.stop() on dragstart, cancelling the map movement.
  const initialCenter=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
  await page.mouse.move(150,380);await page.mouse.down();
  await page.mouse.move(240,430,{steps:12});await page.mouse.up();
  await page.waitForTimeout(250);
  assert.match(await page.locator('#passenger-gesture-hint').textContent(),/Exploring map/);
  // MapLibre drag inertia legitimately continues after pointer-up. Allow it
  // to settle before asserting that a subsequent GPS fix leaves explore intact.
  await page.waitForTimeout(900);
  const draggedCenter=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
  assert.ok(Math.hypot(draggedCenter[0]-initialCenter[0],draggedCenter[1]-initialCenter[1])>0.00001,
    'native mouse drag must move the actual map center');
  await page.evaluate(fix);
  await page.waitForTimeout(100);
  const afterGPS=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
  assert.ok(Math.hypot(afterGPS[0]-draggedCenter[0],afterGPS[1]-draggedCenter[1])<0.00001,
    'GPS updates must not seize the camera during manual exploration');
  const zoomBeforeWheel=await page.evaluate(()=>JalanVectorMap.getState().zoom);
  await page.mouse.move(210,350);await page.mouse.wheel(0,-420);
  await page.waitForTimeout(650);
  assert.ok(await page.evaluate(()=>JalanVectorMap.getState().zoom)>zoomBeforeWheel+0.1,
    'native wheel zoom must change map zoom');
  const bearingBeforeRotate=await page.evaluate(()=>JalanVectorMap.getBearing());
  await page.mouse.move(200,340);await page.mouse.down({button:'right'});
  await page.mouse.move(280,380,{steps:12});await page.mouse.up({button:'right'});
  await page.waitForTimeout(200);
  assert.ok(Math.abs(await page.evaluate(()=>JalanVectorMap.getBearing())-bearingBeforeRotate)>1,
    'native right-drag must rotate the vector map');
  // Mobile Safari uses touch, not desktop right-drag or wheel. Exercise
  // native two-finger pinch and twist on the actual 390px WebGL canvas.
  const cdp=await context.newCDPSession(page);
  const gesture=async(from,to)=>{
    const points=(pair)=>pair.map(([x,y],id)=>({x,y,id:id+1}));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(from)});
    for(let step=1;step<=10;step++){
      const intermediate=from.map(([x,y],i)=>[x+(to[i][0]-x)*step/10,y+(to[i][1]-y)*step/10]);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(intermediate)});
      await page.waitForTimeout(18);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  const pinchBefore=await page.evaluate(()=>JalanVectorMap.getState().zoom);
  await gesture([[160,355],[230,355]],[[95,355],[295,355]]);
  await page.waitForTimeout(350);
  assert.ok(await page.evaluate(()=>JalanVectorMap.getState().zoom)>pinchBefore+0.1,
    'native two-finger pinch must zoom the vector map on mobile');
  const twistBefore=await page.evaluate(()=>JalanVectorMap.getBearing());
  await gesture([[150,355],[240,355]],[[195,310],[195,400]]);
  await page.waitForTimeout(250);
  assert.ok(Math.abs(await page.evaluate(()=>JalanVectorMap.getBearing())-twistBefore)>3,
    'native two-finger twist must rotate the vector map on mobile');
  await cdp.detach();
  // The longer mobile gesture test can exceed the five-second trusted GPS
  // window. Recenter should require a fresh fix rather than bypassing it.
  await page.evaluate(fix);
  await page.locator('#passenger-recenter-floating').click();
  assert.equal(await page.evaluate(()=>Math.round(map.getZoom())),17);
  await page.locator('#jalan-home-menu').click();
  await page.locator('#passenger-2d').click();
  assert.equal(await page.evaluate(()=>JalanVectorMap.getPitch()),0);
  await page.locator('#passenger-2d').click();
  assert.equal(await page.evaluate(()=>JalanVectorMap.getPitch()),48);
  await page.locator('#jalan-home-menu').click();
  await page.evaluate(()=>{
    const route=JalanGPS.getState().route;
    const projected=window.JalanTomTom.projectReportPoint(
      [101.6925,3.145],route.geometry.coordinates);
    window.dispatchEvent(new CustomEvent('jalan:incidents-updated',{detail:{
      route,checkedAt:Date.now(),
      incidents:[{lat:3.145,lng:101.6925,description:'Fixture route section',
        roadName:'Fixture road',category:'🚧',
        routeAlong:projected.along,routeTotal:projected.total}]
    }}));
  });
  await page.locator('#passenger-turn-toggle').click();
  await page.locator('#passenger-report-list button').first().tap();
  await page.waitForFunction(()=>document.querySelector('.jalan-vector-report-label'));
  assert.equal(await page.evaluate(()=>map.getZoom()),18);
  assert.equal(await page.evaluate(()=>JalanVectorMap.getPitch()),0);
  assert.ok(await page.evaluate(()=>Math.abs(map.getCenter().lat-3.145)<.00001));
  assert.equal(await page.locator('.jalan-vector-report-label').isVisible(),true);
  // Existing flow tiles are mirrored, updated and removable without fetching
  // a second Leaflet copy or exposing a real API key.
  await page.evaluate(()=>{
   window.__tile=L.tileLayer('https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=FIXTURE',
     {opacity:.82,maxNativeZoom:18}).addTo(map);
  });
  await page.waitForFunction(()=>JalanVectorMap.getState().trafficLayers===1);
  assert.equal(await page.evaluate(()=>!!window.__tile._map),false,'no duplicate hidden raster downloads');
  assert.equal(await page.evaluate(()=>map.hasLayer(window.__tile)),true);
  await page.evaluate(()=>map.removeLayer(window.__tile));
  await page.waitForFunction(()=>JalanVectorMap.getState().trafficLayers===0);
  // Native resource loss restores current route/markers and existing raster path.
  await page.evaluate(()=>document.querySelector('#jalan-vector-map canvas').dispatchEvent(new Event('webglcontextlost')));
  await page.waitForFunction(()=>!JalanVectorMap.active);
  assert.equal(await page.locator('#jalan-vector-map').count(),0);
  assert.equal(await page.evaluate(()=>routeLayer.getLayers().length),2);
  assert.match(await page.locator('#jalan-map-status').textContent(),/Basic map/);
  assert.deepEqual(errors,[]);
  await page.close();
  // Real browser geolocation (fixture coordinates only) on fresh Passenger
  // Preview opening. No destination is selected and GPS navigation is NOT on.
  const startupContext=await browser.newContext({viewport:{width:390,height:844},
    deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await startupContext.grantPermissions(['geolocation']);
  await startupContext.setGeolocation({latitude:3.139,longitude:101.6869,accuracy:8});
  const startup=await startupContext.newPage();currentPage=startup;
  await startup.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await dependencies(startup);
  await startup.route('https://tiles.openfreemap.org/styles/positron',route=>route.fulfill({json:style}));
  await startup.goto(base+'/index.html?mode=passenger');
  await startup.waitForFunction(()=>window.JalanVectorMap?.active&&window.JalanPassengerStartup?.ready,null,{timeout:12000});
  console.log('STARTUP MARKER DIAGNOSTIC',JSON.stringify(await startup.evaluate(()=>({
    ready:window.JalanPassengerStartup?.ready,
    markers:window.JalanVectorMap?.getState().markers,
    vectorPinHtml:[...document.querySelectorAll('.jalan-vector-pin')].map(node=>node.innerHTML.slice(0,260)),
    iconClasses:[...document.querySelectorAll('.leaflet-marker-icon')].map(node=>node.className),
    layerIcons:Object.values(map._layers).filter(layer=>layer instanceof L.Marker).map(layer=>layer.options.icon?.options.className)
  }))));
  await startup.waitForFunction(()=>[...document.querySelectorAll('.jalan-vector-pin')]
    .some(node=>node.textContent?.includes('▲')),null,{timeout:8000});
  assert.equal(await startup.evaluate(()=>Math.round(map.getZoom())),17,
    'accurate permission-granted startup position zooms to street scale');
  assert.ok(await startup.evaluate(()=>Math.abs(map.getCenter().lat-3.139)<.00001&&
    Math.abs(map.getCenter().lng-101.6869)<.00001));
  assert.equal(await startup.evaluate(()=>routes.length),0,'no route is invented at startup');
  assert.equal(await startup.evaluate(()=>JalanGPS.getState().active),false,
    'a one-shot location does not start GPS journey tracking');
  assert.match(await startup.locator('#passenger-startup-location-status').innerText(),/position, not heading/);
  await startup.close();await startupContext.close();
  // Inaccurate geolocation must not display a false current-position arrow or
  // auto-zoom, and browser permission denial must remain usable.
  const weakContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await weakContext.grantPermissions(['geolocation']);
  await weakContext.setGeolocation({latitude:3.139,longitude:101.6869,accuracy:180});
  const weak=await weakContext.newPage();currentPage=weak;
  await weak.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await dependencies(weak);
  await weak.route('https://tiles.openfreemap.org/styles/positron',route=>route.fulfill({json:style}));
  await weak.goto(base+'/index.html?mode=passenger');
  await weak.waitForFunction(()=>window.JalanVectorMap?.active&&
    document.getElementById('passenger-startup-location-status')?.textContent.includes('uncertain'),null,{timeout:12000});
  assert.equal(await weak.locator('.passenger-startup-pin').count(),0);
  assert.equal(await weak.evaluate(()=>Math.round(map.getZoom())),12);
  await weak.close();await weakContext.close();
  currentPage=null;
  // Sustained post-style-load vector tile outage: the live provider smoke
  // above/below cannot establish this recovery behavior on its own.
  const outage=await context.newPage();currentPage=outage;
  let failTiles=false,failedTileRequests=0;
  await outage.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await dependencies(outage);
  const outageStyle=JSON.parse(JSON.stringify(style));
  outageStyle.sources.outage={type:'vector',tiles:['https://tiles.openfreemap.org/outage-fixture/{z}/{x}/{y}.pbf'],maxzoom:18};
  outageStyle.layers.push({id:'outage-roads',type:'line',source:'outage','source-layer':'transportation',paint:{'line-color':'#fff'}});
  await outage.route('https://tiles.openfreemap.org/styles/positron',route=>route.fulfill({json:outageStyle}));
  await outage.route('https://tiles.openfreemap.org/outage-fixture/**',route=>{
   if(failTiles){failedTileRequests++;return route.abort('failed');}
   return route.fulfill({status:200,contentType:'application/x-protobuf',body:Buffer.alloc(0)});
  });
  await outage.goto(base+'/index.html?mode=passenger');
  await outage.waitForFunction(()=>JalanVectorMap?.active,null,{timeout:25000});
  await outage.evaluate(routeFixture);
  await outage.locator('#passenger-go').click();
  await outage.evaluate(fix);
  await outage.waitForFunction(()=>map.getZoom()>=17);
  await outage.evaluate(()=>{
   window.__savedGeometry=routes[selectedRoute].geometry;
   window.__retainedTraffic=L.tileLayer('https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=FIXTURE',
    {opacity:.82,maxNativeZoom:18}).addTo(map);
  });
  await outage.waitForFunction(()=>JalanVectorMap.getState().trafficLayers===1);
  failTiles=true;
  await outage.evaluate(()=>map.setView([3.5,102],17));
  await outage.waitForFunction(()=>!document.getElementById('jalan-map-status').disabled);
  assert.ok(failedTileRequests>=3,'sustained outage exercises multiple actual vector tile failures');
  const recover=outage.getByRole('button',{name:'Map details unavailable · Use basic map'});
  assert.equal(await recover.isVisible(),true);
  await recover.focus();await recover.press('Enter');
  await outage.waitForFunction(()=>!JalanVectorMap.active);
  assert.equal(await outage.evaluate(()=>routes[selectedRoute].geometry===window.__savedGeometry),true);
  assert.equal(await outage.evaluate(()=>window.__retainedTraffic._map===map&&map.hasLayer(window.__retainedTraffic)),true,
    'basic renderer restores enabled TomTom flow without replacing the selected route');
  assert.equal(await outage.locator('#passenger-map-gestures').isVisible(),true);
  await outage.close();
  // Live public basemap smoke. Local dependency files, actual provider style,
  // vector tiles, glyphs and sprites. No traffic key or real user's location.
  const live=await context.newPage(),mapFailures=[],tileResponses=[];currentPage=live;
  await dependencies(live);
  live.on('response',response=>{
   if(response.url().startsWith('https://tiles.openfreemap.org/')){
    if(response.status()>=400)mapFailures.push(response.status());
    if(response.url().includes('.pbf'))tileResponses.push(response.status());
   }
  });
  await live.goto(base+'/index.html?mode=passenger');
  await live.waitForFunction(()=>JalanVectorMap?.active,null,{timeout:25000});
  await live.evaluate(routeFixture);
  await live.locator('#passenger-go').click();
  await live.evaluate(fix);
  await live.waitForFunction(()=>map.getZoom()>=17);
  await live.waitForTimeout(5000);
  await live.evaluate(fix);
  assert.deepEqual(mapFailures,[],'public vector resources must load');
  assert.ok(tileResponses.some(code=>code===200),'actual vector/glyph resources received');
  assert.equal(await live.evaluate(()=>JalanVectorMap.active),true);
  assert.ok(await live.evaluate(()=>document.querySelector('.passenger-bottom').getBoundingClientRect().bottom<=
    document.querySelector('.maplibregl-ctrl-attrib').getBoundingClientRect().top),'map attribution stays below the HUD');
  await live.screenshot({path:path.join(artifacts,'vector-live-kl-mobile.png')});
  await live.setViewportSize({width:1280,height:800});
  await live.screenshot({path:path.join(artifacts,'vector-live-kl-desktop.png')});
  console.log('PASS: native WebGL map, GPS projection, gestures, report zoom, traffic lifecycle, graphics and post-style tile-outage fallback, live OpenFreeMap');
 }catch(error){
  if(currentPage&&!currentPage.isClosed()){
   await currentPage.screenshot({path:path.join(artifacts,'vector-failure.png')});
   console.error('Renderer state:',await currentPage.evaluate(()=>({state:window.JalanVectorMap?.getState(),
    message:document.getElementById('jalan-map-status')?.textContent})));
  }
  throw error;
 }finally{await browser.close();server.close();}
}
main().catch(error=>{console.error(error);server.close();process.exitCode=1;});
