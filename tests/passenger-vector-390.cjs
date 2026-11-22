'use strict';
// Actual MapLibre/WebGL rendering and the production Leaflet adapter. Fixture
// journeys never use real GPS, credentials or provider routing requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'test-artifacts');
fs.mkdirSync(artifacts,{recursive:true});
const style={version:8,sources:{streets:{type:'geojson',data:{type:'FeatureCollection',features:[
 {type:'Feature',properties:{width:28},geometry:{type:'LineString',coordinates:[[101.680,3.139],[101.685,3.139]]}},
 {type:'Feature',properties:{width:7},geometry:{type:'LineString',coordinates:[[101.685,3.139],[101.690,3.139]]}},
 {type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[101.680,3.132],[101.70,3.154]]}},
 {type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[101.679,3.148],[101.70,3.13]]}}
 ]}}},layers:[{id:'background',type:'background',paint:{'background-color':'#f5f3ee'}},
 {id:'roads',type:'line',source:'streets',paint:{'line-color':'#fff','line-width':['coalesce',['get','width'],20]}}]};
const server=http.createServer((req,res)=>{
 const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!name.startsWith(root+path.sep)||!fs.existsSync(name)||!fs.statSync(name).isFile()){res.writeHead(404);return res.end();}
 res.writeHead(200,{'content-type':name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.ttf')?'font/ttf':'text/html'});
 res.end(path.basename(name)==='jalan-config.js'?"window.JalanPublicConfig=Object.freeze({tomtomBrowserKey:'',appVersion:'4.8.0-test',buildDate:'2026-11-18'});":fs.readFileSync(name));
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
  // The local vector bundle itself may stall before it can signal fallback.
  // Advance actual browser timers, then deliver it late: the old map must not
  // suddenly switch after we have deliberately chosen the usable basic view.
  const lateContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await lateContext.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(_ok,fail){fail({code:1,message:'Fixture'});},watchPosition(){return 1;},clearWatch(){}}}));
  const late=await lateContext.newPage();
  await late.clock.install();
  await late.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await dependencies(late);
  let releaseBundle;const heldBundle=new Promise(resolve=>{releaseBundle=resolve;});
  await late.route('**/passenger-vector-map.js*',async route=>{await heldBundle;await route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'passenger-vector-map.js'))});});
  const lateNavigation=late.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});
  await late.waitForFunction(()=>document.getElementById('map')?._leaflet_id);
  assert.equal(await late.locator('#jalan-launch').isVisible(),true);
  assert.equal(await late.locator('#jalan-home-credits').isVisible(),false,'basic map splash is credit-free');
  await late.clock.pauseAt(new Date(await late.evaluate(()=>Date.now()+1000)));
  await late.clock.fastForward(23000);
  await late.clock.runFor(4100);
  const stage=()=>late.locator('#jalan-home-sheet').getAttribute('data-state');
  const credits=late.locator('#jalan-home-credits');
  assert.equal(await credits.isVisible(),false,'credits stay hidden until the splash fade finishes');
  assert.equal(await stage(),'a','the card is collapsed at reveal');
  await late.clock.runFor(200);
  const untilLift=await late.evaluate(async()=>Math.ceil((await JalanLaunch.mainScreenReady)+500-performance.now()));
  assert.ok(untilLift>1 && untilLift<=500);
  await late.clock.runFor(untilLift-1);
  assert.equal(await stage(),'a','the card still rests at A after 499 ms on the main screen');
  await late.clock.runFor(1);
  assert.equal(await stage(),'b','idle startup lifts the card to B at 500 ms');
  const remaining=await late.evaluate(async()=>Math.ceil((await JalanLaunch.mainScreenReady)+5000-performance.now()));
  await late.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await late.clock.runFor(7000);
  assert.equal(await credits.evaluate(el=>el.classList.contains('show-map-credits')),true,'background time is excluded');
  await late.evaluate(()=>{
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await late.clock.runFor(remaining-1);
  assert.equal(await credits.evaluate(el=>el.classList.contains('show-map-credits')),true,'the initial window lasts 4999 visible ms');
  await late.clock.runFor(1);
  assert.equal(await credits.evaluate(el=>el.classList.contains('show-map-credits')),false,'the initial window ends at 5000 visible ms');
  assert.equal(await credits.locator('.jalan-osm-credit').isVisible(),true,'the basic map retains its credit');
  assert.equal(await credits.locator('.jalan-tiles-credit').isVisible(),false,'the basic map does not use OpenMapTiles');
  await late.clock.resume();
  assert.equal(await late.locator('#map .leaflet-control-attribution').count(),0);
  await late.locator('#jalan-home-menu').tap();
  assert.equal(await late.locator('#jalan-home-menu-panel').isVisible(),true);
  assert.equal(await late.locator('#jalan-home-menu-panel a[href*="openstreetmap.org"]').count(),0,'basic map credits are outside the menu');
  await late.locator('#jalan-home-menu-close').tap();
  assert.equal(await late.locator('#jalan-launch').count(),0,'watchdog reveals usable basic map after stalled local bundle');
  releaseBundle();await lateNavigation;
  assert.equal(await late.evaluate(()=>window.JalanLaunch.basicOnly),true);
  assert.equal(await late.evaluate(()=>!!window.JalanVectorMap?.active),false,'late vector script cannot flip to another map');
  await lateContext.close();
  const page=await context.newPage(),errors=[];currentPage=page;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await dependencies(page);
  let releaseStyle;const styleReady=new Promise(resolve=>{releaseStyle=resolve;});
  await page.route('https://tiles.openfreemap.org/styles/positron',async route=>{await styleReady;await route.fulfill({json:style});});
  await page.goto(base+'/index.html?mode=passenger');
  assert.equal(await page.locator('#jalan-launch').isVisible(),true,'brand covers the old map while detailed style is pending');
  assert.equal(await page.locator('#map').evaluate(x=>getComputedStyle(x).visibility),'hidden');
  assert.equal(await page.locator('#jalan-home-credits').isVisible(),false,'detailed-map splash is credit-free');
  await page.waitForFunction(()=>document.querySelector('#jalan-launch img').naturalWidth>0);
  const tagline=page.locator('.jalan-launch-tagline'),loading=page.locator('#jalan-launch-status');
  for(const [language,status] of [['en','Loading your map…'],['ms','Peta sedang dimuatkan…'],['en','Loading your map…']]){
    await page.evaluate(code=>JalanLanguage.set(code),language);
    assert.equal(await tagline.textContent(),'Menemani Anda Sehingga ke Destinasi');
    assert.equal(await tagline.getAttribute('lang'),'ms');
    assert.equal(await loading.textContent(),status);
  }
  assert.equal(await page.evaluate(async()=>{await document.fonts.load('600 29px "JALAN Script"');return document.fonts.check('600 29px "JALAN Script"');}),true,'bundled cursive font is ready');
  assert.equal(await page.locator('.jalan-launch-tagline').evaluate(el=>getComputedStyle(el).animationName),'jalan-tagline-reveal');
  await page.screenshot({path:path.join(artifacts,'jalan-launch-screen.png'),animations:'disabled'});
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.jalan-launch-tagline').evaluate(el=>getComputedStyle(el).animationName),'none','reduced motion keeps readable static text');
  await page.emulateMedia({reducedMotion:'no-preference'});
  releaseStyle();
  await page.waitForFunction(()=>window.JalanVectorMap?.active,null,{timeout:25000});
  assert.equal(await page.locator('#jalan-launch').isVisible(),true,'ready map still leaves time to read the tagline');
  await page.waitForTimeout(2000);
  assert.equal(await page.locator('#jalan-launch').isVisible(),true,'launch branding remains during the four-second reading interval');
  await page.evaluate(()=>{
    // Exercise input inside the startup window before Playwright waits for layout stability.
    window.JalanLaunch.mainScreenReady.then(()=>{
      for(const type of ['pointerdown','pointerup']){
        document.querySelector('#map').dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:8,isPrimary:true}));
      }
      const panel=document.querySelector('#jalan-home-sheet'),handle=document.querySelector('#jalan-sheet-handle');
      const links=document.querySelectorAll('#jalan-home-credits a');
      const sample=()=>[panel.dataset.state,...Array.from(links,link=>link.getBoundingClientRect().height>0)];
      window.__creditStages=[sample()];
      for(const key of ['ArrowUp','ArrowUp','ArrowDown','ArrowDown']){
        handle.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
        window.__creditStages.push(sample());
      }
    });
  });
  await page.locator('#jalan-launch').waitFor({state:'hidden'});
  await page.waitForTimeout(550);
  assert.deepEqual(await page.evaluate(()=>window.__creditStages),[['a',true,false],['b',true,false],['c',true,false],['b',true,false],['a',true,false]],
    'the separate OpenMapTiles credit is the only link on the vector map');
  assert.equal(await page.locator('#jalan-home-sheet').getAttribute('data-state'),'a','an early map touch cancels the opening lift');
  assert.equal(await page.locator('#map').evaluate(x=>getComputedStyle(x).visibility),'visible','reveal only after native renderer ready');
  assert.equal(await page.locator('#map').evaluate(x=>getComputedStyle(x).transform),'none');
  const recentCredit=page.locator('.jalan-recent-credit'),handle=page.locator('#jalan-sheet-handle');
  await page.waitForTimeout(5100);
  assert.equal(await recentCredit.count(),1,'a collapsed Recent section spends none of the reading time');
  await handle.press('ArrowUp');
  await recentCredit.waitFor({state:'visible'});
  const emptyRow=page.locator('.jalan-recent-empty');
  assert.equal(await emptyRow.textContent(),'Your recently selected destinations will appear here during this session. © OpenStreetMap');
  assert.equal(await recentCredit.evaluate(el=>el.tagName==='SPAN'&&!el.closest('a')&&getComputedStyle(el).font===getComputedStyle(el.parentElement).font),true);
  await page.evaluate(()=>JalanLanguage.set('ms'));
  assert.match(await emptyRow.textContent(),/di sini\. © OpenStreetMap$/);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:destination-selected',{
    detail:{name:'Fixture stop',label:'Fixture stop',point:[3.14,101.68]}
  })));
  assert.equal(await page.locator('.jalan-sheet-recent h2 .jalan-recent-credit').isVisible(),true);
  await page.evaluate(()=>JalanLanguage.set('en'));
  assert.equal(await page.locator('.jalan-sheet-recent h2').textContent(),'Recent © OpenStreetMap');
  await page.waitForTimeout(4100);
  assert.equal(await recentCredit.isVisible(),true,'still present before five visible seconds');
  await recentCredit.waitFor({state:'detached',timeout:2200});
  assert.equal((await page.locator('.jalan-sheet-recent h2').textContent()).trim(),'Recent');
  assert.equal(await page.locator('#jalan-recent-list li').innerText(),'Fixture stop');
  await handle.press('ArrowDown');
  await require('./passenger-pin-390.cjs')(page);
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
  // Read evaluated paint at two positions along one line. The map has a
  // wide street on the west and a narrow street on the east of this point.
  await page.evaluate(()=>{
   const proto=maplibregl.Map.prototype,original=proto.getSource;
   proto.getSource=function(...args){
     window.__widthMap=this;proto.getSource=original;return original.apply(this,args);
   };
   const path=Array.from({length:1201},(_,i)=>[3.139,101.680+.01*i/1200]);
   window.__widthLine=L.polyline(path,{jalanRouteScale:1,color:'#087af5'}).addTo(map);
  });
  for(const [zoom,width] of [[16,12],[18,16.5],[16,12]]){
   await page.evaluate(zoom=>map.setView([3.139,101.685],zoom,{animate:false}),zoom);
   await page.waitForFunction(({zoom,width})=>{
     const gl=window.__widthMap;
     if(!gl||gl.getZoom()!==zoom-1)return false;
     return [[101.68465,28],[101.68535,7]].every(([lng,roadWidth])=>{
       const hits=gl.queryRenderedFeatures(gl.project([lng,3.139]),{layers:['roads','jalan-route-lines']});
       const painted=id=>hits.find(f=>f.layer.id===id)?.layer.paint['line-width'];
       return painted('roads')===roadWidth&&painted('jalan-route-lines')===width;
     });
   },{zoom,width});
  }
  await page.evaluate(()=>map.removeLayer(window.__widthLine));
  console.log('PASS blue route keeps the same width across 28px and 7px streets and scales with zoom in both directions');
  await page.evaluate(routeFixture);
  await page.locator('#passenger-route-list button').nth(1).tap();
  assert.equal(await page.locator('#passenger-route-list button').nth(1).getAttribute('aria-pressed'),'true');
  await page.locator('#passenger-go').tap();
  assert.equal(await page.evaluate(()=>JalanGPS.getState().active&&JalanGPS.getState().route===routes[1]),true);
  await page.evaluate(()=>JalanPassengerJourney.stop());
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
  assert.equal(await page.locator('#jalan-route-traffic-legend').count(),0);
  await page.locator('#passenger-route-handle').click();
  assert.equal(await page.locator('#passenger-overview').getAttribute('data-collapsed'),'true');
  await page.waitForTimeout(300);
  const routeBeforePan=await page.evaluate(()=>{
    window.__planningRoute=routes[selectedRoute];return [map.getCenter().lat,map.getCenter().lng];
  });
  await page.mouse.move(170,400);await page.mouse.down();
  await page.mouse.move(240,450,{steps:10});await page.mouse.up();
  await page.waitForTimeout(900);
  const routeAfterPan=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
  assert.ok(Math.hypot(routeAfterPan[0]-routeBeforePan[0],routeAfterPan[1]-routeBeforePan[1])>0.00001,
    'native map can be explored with the route panel collapsed');
  assert.equal(await page.evaluate(()=>routes[selectedRoute]===window.__planningRoute),true);
  await page.locator('#passenger-route-handle').click();
  assert.equal(await page.locator('#passenger-route-list button').count(),2);
  await page.locator('#passenger-go').click();
  assert.equal(await page.evaluate(()=>JalanVectorMap.getPitch()),60,'Go uses native pitch');
  for(const height of [844,560]){
   await page.setViewportSize({width:390,height});
   await page.waitForFunction(()=>{const speed=document.getElementById('passenger-speed-floating').getBoundingClientRect(),bottom=document.querySelector('.passenger-bottom').getBoundingClientRect();return speed.bottom<bottom.top;});
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
  assert.equal(await page.evaluate(()=>JalanVectorMap.getPitch()),60,
    'opening and dismissing Stage C preserves the native pitched map');
  assert.equal(await page.locator('#passenger-map-gestures').isVisible(),false,'native gestures get the touch surface');
  const fix=()=>window.__fix({timestamp:Date.now(),coords:{latitude:3.139,longitude:101.6869,accuracy:8,speed:5,heading:45}});
  await page.evaluate(fix);
  await page.waitForFunction(()=>map.getZoom()>=17);
  assert.equal(await page.evaluate(()=>JalanVectorMap.getBearing()),45);
  // A fresh GPS reading becomes visible on the next native map frame.
  await page.waitForFunction(()=>{
   const p=JalanVectorMap.project([3.139,101.6869]),b=document.getElementById('passenger-vehicle-screen').getBoundingClientRect();
   return Math.abs(b.x+b.width/2-p.x)<2&&Math.abs(b.y+b.height/2-p.y)<2;
  },null,{timeout:2000});
  const placement=await page.evaluate(()=>{
   const p=JalanVectorMap.project([3.139,101.6869]),box=document.getElementById('passenger-vehicle-screen').getBoundingClientRect();
   return {dx:Math.abs(box.x+box.width/2-p.x),dy:Math.abs(box.y+box.height/2-p.y),y:p.y};
  });
  assert.ok(placement.dx<2&&placement.dy<2,'vehicle shares native pitched projection with route');
  assert.ok(placement.y>450&&placement.y<750,'vehicle is in lower visible map area');
  const assertAnchor=async()=>{
   await page.waitForFunction(()=>{const v=document.getElementById('passenger-vehicle-screen').getBoundingClientRect(),b=document.getElementById('passenger-journey-sheet').getBoundingClientRect();return Math.abs(b.top-v.bottom-12)<3;});
   assert.ok(await page.locator('#passenger-journey-sheet').evaluate(el=>Math.abs(innerHeight-el.getBoundingClientRect().bottom)<1),'native journey banner reaches phone bottom');
  };
  await assertAnchor();
  // Hold the GPS fix still and inspect the marker on the actual WebGL render
  // event, while zoom, center, pitch and fractional bearing change together.
  await page.waitForFunction(()=>Math.abs(JalanVectorMap.getBearing()-45)<.001);
  const frameErrors=await page.evaluate(async()=>{
   const gl=window.__widthMap,center=gl.getCenter(),zoom=gl.getZoom();
   const base={center,bearing:gl.getBearing(),pitch:gl.getPitch(),zoom};
   const marker=document.querySelector('#passenger-vehicle-screen'),shape=marker.querySelector('svg');
   const fix=[101.6869,3.139];
   const nextFrame=camera=>new Promise(resolve=>{
     gl.once('render',()=>resolve());gl.jumpTo(camera);
   });
   const errors=[];
   for(const n of [1,2,3,4,3,2,1]){
     await nextFrame({center:[center.lng+n*.00004,center.lat-n*.00003],zoom:zoom+n*.08,
       bearing:45+n*1.35,pitch:60-n*.65});
     const projected=gl.project(fix),box=marker.getBoundingClientRect(),canvas=gl.getContainer().getBoundingClientRect();
     const turn=(45-gl.getBearing()+360)%360;
     errors.push({pixels:Math.hypot(box.x+box.width/2-canvas.x-projected.x,box.y+box.height/2-canvas.y-projected.y),
       degrees:Math.max(Math.abs(Number(shape.dataset.heading)-turn),Math.abs(Number(shape.dataset.pitch)-gl.getPitch()))});
   }
   await nextFrame(base);return errors;
  });
  assert.ok(frameErrors.every(f=>f.pixels<.25&&f.degrees<.01),'stationary triangle follows each rendered camera frame: '+JSON.stringify(frameErrors));
  console.log('Stationary triangle max positional error (CSS pixels):',Math.max(...frameErrors.map(f=>f.pixels)).toFixed(3));
  await page.locator('#jalan-home-menu').click();
  await page.locator('#passenger-navigation-settings>summary').click();
  assert.equal(await page.locator('#passenger-nav-zoom').inputValue(),'80');
  assert.equal(await page.locator('#passenger-nav-tilt').inputValue(),'100');
  // Rendering several frames on a slow GPU can age out the earlier GPS fix.
  // Navigation zoom settings recenter only with a fresh measured location.
  await page.evaluate(fix);
  await page.locator('#passenger-nav-zoom').evaluate(el=>{el.value='50';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#passenger-nav-tilt').evaluate(el=>{el.value='50';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.ok(Math.abs(await page.evaluate(()=>map.getZoom())-17)<.01);
  assert.equal(await page.evaluate(()=>JalanVectorMap.getPitch()),30);
  await assertAnchor();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('jalan-navigation-view-v1'))),{zoom:50,tilt:50});
  for(const [key,value]of [['zoom',80],['tilt',100]])await page.locator('#passenger-nav-'+key).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  assert.equal(await page.locator('#jalan-home-menu-close').evaluate(el=>{const b=el.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight;}),true,'bottom Close stays visible while Navigation is expanded');
  await page.screenshot({path:path.join(artifacts,'navigation-view-settings.png')});
  await page.locator('#jalan-home-menu-close').click();
  for(const height of [560,844]){await page.setViewportSize({width:390,height});await page.evaluate(fix);await assertAnchor();}

  await page.screenshot({path:path.join(artifacts,'vector-fixture-navigation.png')});
  // Native gestures must actually change the camera. A former vector-gesture
  // handler called gl.stop() on dragstart, cancelling the map movement.
  // Taking a WebGL screenshot on a slow runner can outlast a single fix.
  // This is a pan with live GPS. Keep delivering the stationary fixture
  // during the gesture so the stale-GPS message is a separate scenario.
  await page.evaluate(fix);
  await page.evaluate(()=>{window.__panFixes=setInterval(()=>window.__fix({timestamp:Date.now(),
    coords:{latitude:3.139,longitude:101.6869,accuracy:8,speed:0,heading:45}}),1000);});
  const initialCenter=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
  await page.mouse.move(150,380);await page.mouse.down();
  try{
    await page.mouse.move(240,430,{steps:12});
    // Measure the drag while the finger is held. GPU load may otherwise
    // let the normal three-second return expire before the runner reads it.
    await page.waitForFunction(([lat,lon])=>Math.hypot(map.getCenter().lat-lat,map.getCenter().lng-lon)>.00001,initialCenter);
    assert.match(await page.locator('#passenger-gesture-hint').textContent(),/Exploring map/);
    const draggedCenter=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
    await page.evaluate(fix);
    const afterGPS=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
    assert.ok(Math.hypot(afterGPS[0]-draggedCenter[0],afterGPS[1]-draggedCenter[1])<0.00001,
      'GPS updates must not seize the camera during manual exploration');
  }finally{
    await page.mouse.up();
    await page.evaluate(()=>clearInterval(window.__panFixes));
  }
  // Observe the camera as the wheel gesture renders, before auto-follow can restore it.
  const zoomBeforeWheel=await page.evaluate(()=>JalanVectorMap.getState().zoom);
  await page.mouse.move(210,350);
  await Promise.all([
    page.waitForFunction(before=>JalanVectorMap.getState().zoom>before+.1,zoomBeforeWheel,{timeout:5000}),
    page.mouse.wheel(0,-420)
  ]);
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
  assert.ok(await page.evaluate(()=>Math.abs(map.getZoom()-18.8)<.001),'Recenter restores the configured navigation zoom');
  await page.waitForFunction(()=>document.body.classList.contains('passenger-following-location'));
  assert.equal(await page.locator('#jalan-home-report').isVisible(),true);
  await page.mouse.move(180,360);await page.mouse.down();await page.mouse.move(270,415,{steps:8});
  await page.evaluate(fix);await page.waitForTimeout(3200);
  assert.equal(await page.locator('#passenger-recenter-floating').isVisible(),true,'native held drag never auto-returns');
  assert.equal(await page.locator('#jalan-home-report').isVisible(),false);
  await page.mouse.up();await page.evaluate(fix);await page.waitForTimeout(1800);
  assert.equal(await page.locator('#passenger-recenter-floating').isVisible(),true,'native return waits after release');
  await page.evaluate(fix);
  await page.waitForFunction(()=>document.body.classList.contains('passenger-following-location'),null,{timeout:2500});
  assert.equal(await page.locator('#jalan-home-report').isVisible(),true);
  await page.screenshot({path:path.join(artifacts,'vector-report-follow-control.png')});
  console.log('PASS native map: held drag, three-second return after release and report/Recenter swap');
  await page.locator('#jalan-home-menu').click();
  if(!await page.locator('#passenger-navigation-settings').evaluate(x=>x.open))await page.locator('#passenger-navigation-settings>summary').click();
  await page.locator('#passenger-nav-tilt').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.evaluate(()=>JalanVectorMap.getPitch()),0);
  if(!await page.locator('#passenger-navigation-settings').evaluate(x=>x.open))await page.locator('#passenger-navigation-settings>summary').click();
  await page.locator('#passenger-nav-tilt').evaluate(el=>{el.value='100';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.evaluate(()=>JalanVectorMap.getPitch()),60);
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
  await page.locator('#passenger-tab-directions').tap();
  const directions=await page.locator('#passenger-turn-list').boundingBox();
  await page.touchscreen.tap(70,Math.ceil(directions.y+directions.height)+20);
  await page.locator('#passenger-turn-list').waitFor({state:'hidden'});
  assert.equal(await page.locator('#passenger-turn-toggle').getAttribute('aria-expanded'),'false');
  await page.locator('#passenger-turn-toggle').tap();
  await page.locator('#passenger-report-list button').first().tap();
  await page.waitForFunction(()=>document.querySelector('.jalan-vector-report-label'));
  assert.equal(await page.evaluate(()=>map.getZoom()),18);
  assert.equal(await page.evaluate(()=>JalanVectorMap.getPitch()),0);
  assert.ok(await page.evaluate(()=>Math.abs(map.getCenter().lat-3.145)<.00001));
  assert.equal(await page.locator('.jalan-vector-report-label').isVisible(),true);
  // Exercise the Navigation switch through the native vector adapter.
  await page.route('https://api.tomtom.com/traffic/map/**',r=>r.fulfill({contentType:'image/png',
    body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')}));
  await page.evaluate(()=>{document.getElementById('tt-key').value='TEST_RESTRICTED_KEY_1234';});
  await page.locator('#jalan-home-menu').click();
  await page.locator('#passenger-navigation-settings>summary').click();
  const nearbySwitch=page.getByRole('switch',{name:'Show nearby traffic'});
  await nearbySwitch.uncheck();
  await nearbySwitch.check();
  await page.waitForFunction(()=>JalanVectorMap.getState().trafficLayers===1);
  assert.equal(await page.evaluate(()=>{
    let traffic;map.eachLayer(layer=>{if(layer._url?.includes('/traffic/map/'))traffic=layer;});
    return !!traffic&&!traffic._map&&map.hasLayer(traffic);
  }),true,'no duplicate hidden Leaflet layer');
  await nearbySwitch.uncheck();
  await page.waitForFunction(()=>JalanVectorMap.getState().trafficLayers===0);
  await page.locator('#jalan-home-menu-close').click();
  // Native resource loss restores current route/markers and existing raster path.
  await page.evaluate(()=>document.querySelector('#jalan-vector-map canvas').dispatchEvent(new Event('webglcontextlost')));
  await page.waitForFunction(()=>!JalanVectorMap.active);
  assert.equal(await page.locator('#jalan-vector-map').count(),0);
  assert.equal(await page.evaluate(()=>routeLayer.getLayers().length),2);
  assert.match(await page.locator('#jalan-map-status').textContent(),/Basic map/);
  for(const [zoom,width] of [[16,12],[18,16.5],[16,12]]){
   await page.evaluate(zoom=>map.setZoom(zoom,{animate:false}),zoom);
   assert.equal(await page.evaluate(()=>Number(routeLayer.getLayers()[selectedRoute].getElement().getAttribute('stroke-width'))),width);
  }
  console.log('PASS basic map uses the same blue stroke widths after vector fallback');
  assert.deepEqual(errors,[]);
  await page.evaluate(()=>{JalanPassengerCamera.setSetting('zoom',55);JalanPassengerCamera.setSetting('tilt',35);});
  await page.reload();
  await page.locator('#jalan-launch').waitFor({state:'hidden'});
  await page.waitForFunction(()=>window.JalanPassengerCamera&&window.JalanVectorMap?.active);
  assert.deepEqual(await page.evaluate(()=>JalanPassengerCamera.getSettings()),{zoom:55,tilt:35},'view choices survive reload');
  assert.equal(await page.evaluate(()=>JalanVectorMap.getPitch()),0,'saved view applies to navigation, not route planning');
  await page.locator('#jalan-home-menu').click();await page.locator('#passenger-navigation-settings>summary').click();
  assert.equal(await page.locator('#passenger-nav-zoom').inputValue(),'55');
  assert.equal(await page.locator('#passenger-nav-tilt').inputValue(),'35');
  await page.evaluate(()=>{JalanPassengerCamera.setSetting('zoom',80);JalanPassengerCamera.setSetting('tilt',100);});
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
  await startup.locator('#jalan-launch').waitFor({state:'hidden'});
  await startup.waitForFunction(()=>window.JalanVectorMap?.active&&window.JalanPassengerStartup?.ready,null,{timeout:12000});
  console.log('STARTUP MARKER DIAGNOSTIC',JSON.stringify(await startup.evaluate(()=>({
    ready:window.JalanPassengerStartup?.ready,
    markers:window.JalanVectorMap?.getState().markers,
    vectorPinHtml:[...document.querySelectorAll('.jalan-vector-pin')].map(node=>node.innerHTML.slice(0,260)),
    iconClasses:[...document.querySelectorAll('.leaflet-marker-icon')].map(node=>node.className),
    layerIcons:Object.values(map._layers).filter(layer=>layer instanceof L.Marker).map(layer=>layer.options.icon?.options.className)
  }))));
  await startup.locator('.jalan-vector-pin .passenger-startup-pin .vehicle-left[d^="M"]').waitFor({timeout:8000});
  async function assertTriangleCentered(selector){
    const offsets=await startup.locator(selector).evaluate(ring=>{
      const center=element=>{
        const box=element.getBoundingClientRect();
        return [box.left+box.width/2,box.top+box.height/2];
      };
      const [cx,cy]=center(ring);
      return ['svg','.vehicle-outline'].map(part=>{
        const [x,y]=center(ring.querySelector(part));
        return [x-cx,y-cy];
      });
    });
    assert.ok(offsets.flat().every(delta=>Math.abs(delta)<0.5),
      'The SVG and the visible triangle must both be centered inside the GPS ring: '+JSON.stringify(offsets));
  }
  const vectorHalo='.jalan-vector-pin .passenger-startup-pin';
  await assertTriangleCentered(vectorHalo);
  assert.equal(await startup.evaluate(()=>Math.round(map.getZoom())),17,
    'accurate permission-granted startup position zooms to street scale');
  assert.ok(await startup.evaluate(()=>Math.abs(map.getCenter().lat-3.139)<.00001&&
    Math.abs(map.getCenter().lng-101.6869)<.00001));
  assert.equal(await startup.evaluate(()=>routes.length),0,'no route is invented at startup');
  assert.equal(await startup.evaluate(()=>JalanGPS.getState().active),false,
    'a one-shot location does not start GPS journey tracking');
  assert.equal(await startup.locator('#passenger-startup-location-status').count(),0);
  await startupContext.setGeolocation({latitude:3.13900001,longitude:101.6869,accuracy:8});
  await startup.waitForFunction(()=>document.getElementById('passenger-gps-status').dataset.quality==='green');
  await startup.evaluate(()=>{window.__freeMarker=Object.values(map._layers).find(x=>x.options?.icon?.options.className==='passenger-startup-pin');});
  await startupContext.setGeolocation({latitude:3.1394,longitude:101.6873,accuracy:8});
  await startup.waitForFunction(()=>Math.abs(window.__freeMarker.getLatLng().lat-3.1394)<.000001);
  assert.equal(await startup.evaluate(()=>Object.values(map._layers).filter(x=>x.options?.icon?.options.className==='passenger-startup-pin').length),1,
    'pre-route GPS moves the same triangle without duplicate markers');
  assert.equal(await startup.evaluate(()=>routes.length===0&&!JalanGPS.getState().active),true,
    'moving before a destination never starts navigation or calculates a route');
  assert.ok(await startup.evaluate(()=>Math.abs(map.getCenter().lat-3.1394)<.00001),
    'pre-route map follows the live triangle');
  await startup.evaluate(()=>{
    window.__turnFrames=[];
    window.__sampleTurn=()=>{
      const svg=document.querySelector('.jalan-vector-pin .passenger-startup-pin svg');
      if(svg)window.__turnFrames.push([JalanVectorMap.getBearing(),Number(svg.dataset.heading)]);
    };
    window.addEventListener('jalan:vector-render',window.__sampleTurn);
  });
  await startup.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:free-location',{detail:{
    point:[3.1394,101.6873],accuracy:8,timestamp:Date.now()+1,heading:90,speed:5}})));
  await startup.waitForFunction(()=>document.querySelector('.jalan-vector-pin .passenger-startup-pin svg')?.dataset.heading==='0'&&Math.abs(JalanVectorMap.getBearing()-90)<.01);
  const frames=await startup.evaluate(()=>{
    window.removeEventListener('jalan:vector-render',window.__sampleTurn);
    return window.__turnFrames;
  });
  const midTurn=frames.filter(([bearing])=>bearing>50&&bearing<89);
  assert.ok(new Set(midTurn.map(([bearing])=>bearing)).size>=2,'free-driving map renders intermediate bearings');
  assert.ok(midTurn.every(([,heading])=>Math.min(heading,360-heading)<.02),'triangle stays upright throughout the turn');
  await assertTriangleCentered(vectorHalo);
  const anchored=()=>startup.evaluate(()=>{
   const ring=document.querySelector('.jalan-vector-pin .passenger-startup-pin').getBoundingClientRect();
   const top=document.querySelector('#jalan-home-sheet').getBoundingClientRect().top;
   return Math.abs(ring.x+ring.width/2-innerWidth/2)<2&&Math.abs(top-ring.bottom-12)<2;
  });
  assert.ok(await anchored(),'free-driving marker stays just above the visible sheet');
  await startup.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:free-location',{detail:{
    point:[3.1394,101.6873],accuracy:8,timestamp:Date.now()+2,heading:180,speed:0}})));
  assert.equal(await startup.evaluate(()=>JalanVectorMap.getBearing()),90,'stationary fixes hold the last course');
  await startup.evaluate(()=>{
    const fix=(lat,heading,speed,ms)=>window.dispatchEvent(new CustomEvent('jalan:free-location',{
      detail:{point:[lat,101.6873],accuracy:8,timestamp:Date.now()+ms,heading,speed}}));
    // Each northward movement is smaller than the reported accuracy.
    fix(3.13943,null,null,3);fix(3.13946,null,null,4);fix(3.13949,null,null,5);
  });
  await startup.waitForFunction(()=>Math.abs(JalanVectorMap.getBearing())<.01);
  assert.ok(await anchored(),'the map turns under the same marker when heading is inferred from movement');
  await startup.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:free-location',{detail:{
    point:[3.1394,101.6873],accuracy:8,timestamp:Date.now()+6,heading:90,speed:5}})));
  await startup.waitForFunction(()=>Math.abs(JalanVectorMap.getBearing()-90)<.01);
  const pinSelector=vectorHalo+' svg';
  await startup.evaluate(selector=>{
    window.__startupShape=document.querySelector(selector);
    JalanVectorMap.setCamera({bearing:22.4,pitch:14.4,zoom:16.35});
  },pinSelector);
  await startup.waitForFunction(selector=>{
    const shape=document.querySelector(selector);
    return shape&&Math.abs(Number(shape.dataset.heading)-67.6)<.01&&Math.abs(Number(shape.dataset.pitch)-14.4)<.01;
  },pinSelector);
  assert.ok(await startup.evaluate(selector=>document.querySelector(selector)===window.__startupShape,pinSelector),
    'rotating and zooming before Go keeps the visible SVG attached');
  await assertTriangleCentered(vectorHalo);
  await startup.evaluate(()=>JalanVectorMap.setCamera({bearing:0,pitch:0,zoom:16}));
  await startup.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:free-location',{detail:{point:[4,102],accuracy:180,timestamp:Date.now()}})));
  assert.equal(await startup.evaluate(()=>window.__freeMarker.getLatLng().lat),3.1394,'poor GPS cannot move the triangle');
  await startup.screenshot({path:path.join(artifacts,'gps-badge-startup-green.png')});
  await startupContext.setGeolocation({latitude:3.13900002,longitude:101.6869,accuracy:80});
  await startup.waitForFunction(()=>document.getElementById('passenger-gps-status').dataset.quality==='yellow');
  await startupContext.setGeolocation({latitude:3.13900003,longitude:101.6869,accuracy:180});
  await startup.waitForFunction(()=>document.getElementById('passenger-gps-status').dataset.quality==='red');
  assert.ok(await startup.evaluate(()=>Math.abs(map.getCenter().lat-3.1394)<.00001),
    'quality tracking changes only the indicator, without moving the map');
  await startup.evaluate(()=>JalanVectorMap.useBasicMap());
  const basicHalo='#map .leaflet-marker-pane .passenger-startup-pin';
  await startup.locator(basicHalo).waitFor({state:'visible'});
  await assertTriangleCentered(basicHalo);
  await startup.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:free-location',{detail:{
    point:[3.1394,101.6873],accuracy:8,timestamp:Date.now()+8,heading:90,speed:5}})));
  await startup.waitForFunction(()=>{
    const host=map.getContainer(),box=host.querySelector('.passenger-startup-pin').getBoundingClientRect();
    const top=document.getElementById('jalan-home-sheet').getBoundingClientRect().top;
    return host.classList.contains('jalan-free-raster')&&host.style.getPropertyValue('--jalan-free-turn')==='-90deg'&&
      Math.abs(box.left+box.width/2-innerWidth/2)<3&&Math.abs(top-box.bottom-12)<3;
  });
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
  await weak.locator('#jalan-launch').waitFor({state:'hidden'});
  await weak.waitForFunction(()=>window.JalanVectorMap?.active&&
    document.getElementById('passenger-gps-status')?.dataset.quality==='red',null,{timeout:12000});
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
  await outage.locator('#jalan-launch').waitFor({state:'hidden'});
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
  await live.locator('#jalan-launch').waitFor({state:'hidden'});
  await live.waitForFunction(()=>JalanVectorMap?.active,null,{timeout:25000});
  const homeCredit=live.locator('#jalan-home-credits');
  await live.waitForFunction(()=>document.querySelector('#jalan-home-sheet').dataset.state==='b');
  await live.waitForFunction(()=>!document.querySelector('#jalan-home-credits').classList.contains('show-map-credits'));
  assert.equal(await homeCredit.isVisible(),false,'stage B is clear after the five-second window');
  await live.locator('#jalan-sheet-handle').press('ArrowDown');
  assert.equal(await homeCredit.locator('a:visible').count(),0,'returning to stage A keeps both map credits collapsed');
  await live.waitForTimeout(550);
  assert.equal(await live.locator('#jalan-home-sheet').getAttribute('data-state'),'a');
  const mapCredits=live.locator('#map .maplibregl-ctrl-attrib, #map .leaflet-control-attribution');
  assert.equal(await mapCredits.count(),0,'no credit strip over the initial map');
  await live.evaluate(routeFixture);
  await live.locator('#passenger-route-list button').nth(1).tap();
  assert.equal(await mapCredits.count(),0,'no credit overlay on route selection');
  // Restore the route used by the GPS and trail fixture.
  await live.locator('#passenger-route-list button').first().tap();
  await live.locator('#passenger-go').click();
  await live.evaluate(fix);
  await live.waitForFunction(()=>map.getZoom()>=17);
  await live.waitForTimeout(5000);
  await live.evaluate(fix);
  assert.deepEqual(mapFailures,[],'public vector resources must load');
  assert.ok(await live.evaluate(()=>Math.abs(map.getZoom()-(18.8))<.001),'navigation uses configured 80% close-up zoom');
  const shape=live.locator('#passenger-vehicle-screen .jalan-vehicle-shape');
  assert.equal((await shape.boundingBox()).width,84,'vehicle keeps its readable screen size');
  assert.ok(Number(await shape.getAttribute('data-pitch'))>0,'vehicle uses the tilted map camera');
  assert.match(await shape.locator('.vehicle-rim').getAttribute('d'),/^M/,'pitch reveals a raised side wall');
  // Exercise the display boundary using trusted controller progress, without
  // inventing a road match or waiting for physical travel in this fixture.
  await live.evaluate(()=>{
   window.__originalState=JalanGPS.getState;
   const state=JalanGPS.getState();
   JalanGPS.getState=()=>({...state,matched:true,accuracy:8,fixAgeMs:0,remainingMeters:state.route.distance/2});
   window.dispatchEvent(new CustomEvent('jalan:gps-fix',{detail:{matched:false}}));
  });
  await live.waitForFunction(()=>Object.values(map._layers).some(x=>x.options?.className==='jalan-travelled-route'));
  const trail=await live.evaluate(()=>{
   const line=Object.values(map._layers).find(x=>x.options?.className==='jalan-travelled-route');
   return {color:line.options.color,last:line.getLatLngs().at(-1),end:JalanGPS.getState().route.geometry.coordinates.at(-1)};
  });
  assert.equal(trail.color,'#8293aa');assert.ok(trail.last.lng<trail.end[0],'travelled colour stops before the destination');
  await live.screenshot({path:path.join(artifacts,'vector-travelled-route.png')});
  // The real continuous-GPS controller emits this after a successful atomic
  // off-route route swap; old geometry must disappear before the next fix.
  await live.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:route-change',{detail:{reason:'off-route'}})));
  assert.equal(await live.evaluate(()=>Object.values(map._layers).some(x=>x.options?.className==='jalan-travelled-route')),false,
    'atomic replacement immediately clears obsolete travelled-route geometry');
  await live.evaluate(()=>{JalanGPS.getState=window.__originalState;});
  assert.ok(tileResponses.some(code=>code===200),'actual vector/glyph resources received');
  assert.equal(await live.evaluate(()=>JalanVectorMap.active),true);
  assert.equal(await live.locator('.maplibregl-ctrl-attrib-button').isVisible(),false,
    'no persistent black information button remains on the native map');
  assert.equal(await mapCredits.count(),0,'no credit overlay during active guidance');
  assert.equal(await live.locator('#passenger-traffic-summary').count(),0);
  assert.equal(await live.evaluate(()=>getComputedStyle(document.getElementById('passenger-distance')).fontSize===
    getComputedStyle(document.getElementById('passenger-eta')).fontSize),true);
  assert.match(await live.locator('#passenger-next').textContent(),/Arrival approx/);
  assert.doesNotMatch(await live.locator('#passenger-next').textContent(),/GPS matched to selected route/);
  await live.locator('#jalan-home-menu').click();
  assert.equal(await live.locator('#jalan-home-menu-panel').isVisible(),true);
  assert.equal(await live.locator('#jalan-home-menu-panel a[href*="openstreetmap.org"],#jalan-home-menu-panel a[href*="openmaptiles.org"],#jalan-home-menu-panel a[href*="openfreemap.org"]').count(),0,'the open guidance menu contains no map credits');
  await live.locator('#passenger-about').click();
  assert.equal(await live.locator('#passenger-policy').isVisible(),true);
  assert.equal(await live.evaluate(()=>JalanGPS.getState().active),true,'guidance stays active under About');
  await live.locator('#passenger-about-ok').click();
  assert.equal(await live.locator('#jalan-home-menu-panel').isVisible(),false);
  await live.screenshot({path:path.join(artifacts,'vector-live-kl-mobile.png')});
  await live.evaluate(()=>{window.__journeyVectorBefore={route:JalanGPS.getState().route,bearing:JalanVectorMap.getBearing()};});
  await live.locator('#passenger-journey-handle').click();
  assert.equal(await live.locator('#passenger-journey-content').isVisible(),true);
  await live.screenshot({animations:'disabled',path:path.join(artifacts,'vector-live-journey-details.png')});
  await live.locator('#passenger-journey-resume').click();
  assert.equal(await live.evaluate(()=>JalanGPS.getState().active&&JalanGPS.getState().route===window.__journeyVectorBefore.route),true);
  assert.equal(await live.locator('#passenger-journey-sheet').getAttribute('data-expanded'),'false');

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
