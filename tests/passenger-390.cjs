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
    legs:[{steps:[{name:'Test segment',distance,routeOffsetInMeters:125,maneuver:{type:'turn',modifier:'left'}}]}]});
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
  await page.evaluate(()=>{
    const reports=[
      {type:'flood',lat:3.144,lng:101.6917,time:Date.now()},
      {type:'rain',lat:3.144,lng:101.6937,time:Date.now()},
      {type:'hazard',lat:4.0,lng:102.0,time:Date.now()}
    ];
    localStorage.setItem('jalan-demo-reports-v1',JSON.stringify(reports));
    reports.forEach(showReport);
  });
  await page.locator('#passenger-go').click();
  assert.equal(await page.evaluate(()=>map.hasLayer(reportLayer)),false,
    'Go hides the unrestricted area-wide demo marker layer');
  assert.equal(await page.locator('.passenger-demo-report-marker').count(),1,
    'only the demo pin close to the selected route appears during navigation');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-guiding')),true);
  assert.deepEqual(await page.evaluate(()=>({
    startVisible:!!startMarker&&pointLayer.hasLayer(startMarker),
    locationVisible:!!locationMarker&&pointLayer.hasLayer(locationMarker)
  })),{startVisible:false,locationVisible:false},
  'start and legacy location circles must not overlap the passenger vehicle marker');
  assert.equal(await page.locator('#passenger-navigation').isVisible(),true);
  const activeStyles=await page.evaluate(()=>routeLayer.getLayers().map(x=>x.options.opacity));
  assert.equal(activeStyles.filter(x=>x>0.9).length,1,
    'Go hides unselected alternatives and highlights the chosen road');
  assert.equal(await page.locator('#gps-hud').isVisible(),false,'engineering HUD hidden in clean view');
  assert.equal(await page.locator('#passenger-options').evaluate(x=>x.open),false,
    'Go keeps the menu collapsed, showing only minutes, km and speed');
  assert.equal(await page.locator('.passenger-turn').isVisible(),true,
    'top next-turn guidance must be visible even with compact metrics');
  assert.equal(await page.locator('#passenger-turn-list').isVisible(),false,
    'full direction list starts closed');
  assert.equal(await page.locator('.passenger-stats').isVisible(),true);
  assert.equal(await page.locator('#passenger-voice').isVisible(),false,
    'advanced controls remain hidden until opening options');
  await page.locator('#passenger-options > summary').click();
  assert.equal(await page.locator('#passenger-voice').isVisible(),true,
    'advanced controls remain accessible when passenger requests them');
   assert.equal(await page.locator('#passenger-traffic-toggle').getAttribute('aria-pressed'),'false',
     'OSRM / no-key Go cannot start TomTom traffic checks');
   await page.locator('#passenger-traffic-details summary').click();
   await page.locator('#passenger-traffic-toggle').click();
   assert.equal(await page.locator('#passenger-traffic-toggle').getAttribute('aria-pressed'),'false',
     'no-key / OSRM route cannot enable automatic TomTom checks');
   assert.match(await page.locator('#passenger-traffic-status').innerText(),/active TomTom route/);
   await page.locator('#passenger-traffic-check').click();
   assert.match(await page.locator('#passenger-traffic-status').innerText(),/road-matched GPS/,
     'manual traffic check must fail closed without road-matched GPS');
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:traffic-status',{
     detail:{message:'Traffic check failed: TomTom HTTP 503',enabled:false}
   })));
   assert.match(await page.locator('#passenger-traffic-status').innerText(),/HTTP 503/,
     'provider failure is visible in passenger view');
   assert.equal(await page.locator('#passenger-traffic-offer').isVisible(),false,
     'a provider failure cannot invent a faster route');
   assert.equal(await page.locator('#proactive-toggle').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#passenger-auto-reroute').getAttribute('aria-pressed'),'false',
    'Passenger Mode must not automatically opt in to rerouting');
  assert.match(await page.locator('#passenger-voice').innerText(),/Mute/);
  await page.locator('#passenger-voice').click();
  assert.match(await page.locator('#passenger-voice').innerText(),/Full guidance/,
    'voice button enables existing guidance engine');
  assert.match(await page.locator('#gps-voice').innerText(),/Full guidance/,
    'passenger voice control mirrors engineering state');
  await page.locator('#passenger-voice').click();
  await page.locator('#passenger-voice').click();
  assert.match(await page.locator('#passenger-voice').innerText(),/Mute/,
    'passenger voice control can mute without leaving navigation');
  await page.locator('#passenger-auto-reroute').click();
  assert.equal(await page.locator('#passenger-auto-reroute').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#gps-auto').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('#passenger-reroute-status').innerText(),/enabled/);
  await page.locator('#passenger-auto-reroute').click();
  assert.equal(await page.locator('#passenger-auto-reroute').getAttribute('aria-pressed'),'false');
  await page.locator('#passenger-reroute-now').click();
  assert.match(await page.locator('#passenger-reroute-status').innerText(),/not ready/i,
    'manual recalculate shows unavailable status rather than a fake new route');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:reroute-status',{
    detail:{state:'checking',message:'Checking an alternative route…'}
  })));
  assert.match(await page.locator('#passenger-reroute-status').innerText(),/Checking an alternative/);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:reroute-status',{
    detail:{state:'error',message:'Recalculation failed. Check connection and route.'}
  })));
  assert.equal(await page.locator('#passenger-reroute-status').getAttribute('data-state'),'error');
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
  // Actual proactive engine denies missing key and never offers a route
  // after a blocked TomTom request, even with matched synthetic GPS.
  await page.evaluate(()=>{
    window.__originalTrafficPrimary=document.getElementById('tt-primary').checked;
    routes[selectedRoute].provider='tomtom';
    document.getElementById('tt-primary').checked=true;
    document.getElementById('tt-key').value='';
  });
  await page.locator('#passenger-traffic-check').click();
  assert.match(await page.locator('#passenger-traffic-status').innerText(),/Enter TomTom key/,
    'matched GPS does not bypass absent provider credentials');
  await page.evaluate(()=>{document.getElementById('tt-key').value='TEST_RESTRICTED_KEY_1234';});
  await page.locator('#passenger-traffic-check').click();
  await page.waitForFunction(()=>document.getElementById('passenger-traffic-status').textContent.includes('Traffic check failed'),null,{timeout:4000});
  assert.equal(await page.locator('#passenger-traffic-offer').isVisible(),false,
    'failed network request cannot fabricate an alternative');
  await page.evaluate(()=>{
    routes[selectedRoute].provider='osrm';
    document.getElementById('tt-primary').checked=window.__originalTrafficPrimary;
    document.getElementById('tt-key').value='';
  });
  const cameraPosition=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
  assert.ok(Math.abs(cameraPosition[0]-3.139)<0.00002&&
    Math.abs(cameraPosition[1]-101.6869)<0.00002,
    'follow camera must keep the matched vehicle location in frame');
  assert.match(await page.locator('#passenger-instruction').innerText(),/left/i,
    'the banner shows the next maneuver provided by the selected route');
  // The top banner remains fixed and opening it defaults to available Reports.
  assert.equal(await page.locator('#passenger-turn-toggle').evaluate(x=>getComputedStyle(x).position),
    'fixed','next-turn banner remains locked while the map moves');
  await page.locator('#passenger-turn-toggle').click();
  assert.equal(await page.locator('#passenger-turn-list').isVisible(),true);
  assert.equal(await page.locator('#passenger-tab-reports').getAttribute('aria-selected'),'true',
    'Reports tab selected by default');
  assert.equal(await page.locator('#passenger-report-list li').count(),1,
    'only demo reports projected near the selected road appear');
  assert.match(await page.locator('#passenger-report-list').innerText(),
    /unverified demo report|from report to destination/i);
  // A TomTom incident must belong to the same selected route and its
  // original provider fetch. Never invent an incident if traffic unavailable.
  await page.evaluate(()=>{
    window.dispatchEvent(new CustomEvent('jalan:incidents-updated',{detail:{
      route:window.JalanGPS.getState().route,checkedAt:Date.now(),
      incidents:[{lat:3.145,lng:101.6925,description:'Reported traffic delay',category:'🚧'},
        {lat:3.145,lng:101.694,description:'Unrelated nearby road',category:'🚧'}]
    }}));
  });
  assert.equal(await page.locator('#passenger-report-list li').count(),2,
    'route incident appears beside the demo, with the nearby-road incident excluded');
  const reportCenter=()=>page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
  const assertReportCenter=async(lat,lng)=>{
    const center=await reportCenter();
    assert.ok(Math.abs(center[0]-lat)<0.00002&&Math.abs(center[1]-lng)<0.00002,
      'report camera centers on the actual reported coordinates');
    assert.equal(await page.evaluate(()=>map.getZoom()),18,'report opens at street detail');
  };
  await page.evaluate(()=>{window.__routeBeforeReport=window.JalanGPS.getState().route;});
  await page.locator('#passenger-report-list button').first().tap();
  await assertReportCenter(3.144,101.6917);
  assert.equal(await page.locator('#passenger-turn-list').isVisible(),false,
    'tapping a report dismisses the panel so the location is visible');
  assert.equal(await page.locator('#passenger-turn-toggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('.jalan-report-focus-marker').count(),1);
  assert.match(await page.locator('.jalan-report-focus-label').innerText(),/unverified demo report/);
  assert.equal(await page.locator('#passenger-recenter-floating').evaluate(x=>x===document.activeElement),true,
    'focus moves out of the hidden report panel to Recenter');
  await page.evaluate(()=>window.__offlineGPSWatch({timestamp:Date.now()+1000,coords:{
    latitude:3.139,longitude:101.6869,accuracy:8,speed:0,heading:0}}));
  await page.waitForTimeout(100);
  await assertReportCenter(3.144,101.6917);
  assert.equal(await page.evaluate(()=>window.JalanGPS.getState().route===window.__routeBeforeReport),true,
    'viewing a report never changes the selected route');
  await page.locator('#passenger-recenter-floating').tap();
  assert.equal(await page.locator('.jalan-report-focus-marker').count(),0,
    'Recenter clears the report highlight');
  const returned=await reportCenter();
  assert.ok(Math.abs(returned[0]-3.139)<0.00002&&Math.abs(returned[1]-101.6869)<0.00002,
    'Recenter returns to the trusted GPS position');
  await page.locator('#passenger-turn-toggle').click();
  await page.locator('#passenger-tab-directions').click();
  assert.equal(await page.locator('#passenger-tab-directions').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#passenger-maneuver-list li').count(),2,
    'Directions tab includes the actual next maneuver and destination');
  assert.match(await page.locator('#passenger-maneuver-list').innerText(),/Test segment|left|destination/i);
  await page.locator('#passenger-tab-reports').click();
  assert.equal(await page.locator('#passenger-report-list li').count(),2);
  await page.locator('#passenger-turn-close').click();
  assert.equal(await page.locator('#passenger-turn-list').isVisible(),false);
  await page.locator('#passenger-turn-toggle').click();
  assert.equal(await page.locator('#passenger-tab-reports').getAttribute('aria-selected'),'true',
    'reopened turn banner defaults back to Reports');
  await page.locator('#passenger-turn-close').click();
  assert.equal(await page.locator('.jalan-vehicle-marker').count(),1,
    'verified GPS must create one georeferenced marker');
  assert.equal(await page.locator('#passenger-vehicle-screen').isVisible(),true,
    'upright vehicle HUD is visible only on matched GPS');
  assert.equal(await page.locator('#passenger-vehicle-screen').textContent(),'▲');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.jalan-vehicle-marker')).opacity),'0',
    'rotating map must not draw a second triangle');
  assert.equal(await page.evaluate(()=>!!locationMarker&&pointLayer.hasLayer(locationMarker)),false,
    'ongoing GPS fixes must not recreate legacy location dot in passenger mode');
  // A browser-cached 20s-old fix must revoke the previously valid vehicle
  // marker rather than appearing as current road position.
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()-20000,coords:{
      latitude:3.139,longitude:101.6869,accuracy:8,speed:0,heading:0}});
  });
  await page.waitForFunction(()=>!document.querySelector('.jalan-vehicle-marker'),null,{timeout:1500});
  assert.equal(await page.locator('#passenger-vehicle-screen').isVisible(),false,
    'expired Safari GPS update removes the upright triangle');
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()+2000,coords:{
      latitude:3.139,longitude:101.6869,accuracy:8,speed:0,heading:0}});
  });
  await page.waitForFunction(()=>!!document.querySelector('.jalan-vehicle-marker')&&
    !document.getElementById('passenger-vehicle-screen').classList.contains('hidden'),
    null,{timeout:1500});
  assert.equal(await page.locator('#passenger-vehicle-screen').isVisible(),true,
    'trusted fresh GPS update restores vehicle indicator after projection frame');
  // Verified live TomTom query is informational: never replace ETA or road
  // geometry just because the provider found a faster alternative.
  const quote=await page.evaluate(()=>{
    const active=window.JalanGPS.getState().route;
    const before=document.getElementById('passenger-eta').textContent;
    const geometry=routes[selectedRoute].geometry;
    const event=()=>window.dispatchEvent(new CustomEvent('jalan:traffic-estimate',{detail:{
      provider:'tomtom',seconds:360,currentSelectedSeconds:600,
      checkedAt:Date.now(),route:active
    }}));
    event();
    const rejected=document.getElementById('passenger-live-eta').textContent;
    // Synthetic provider authorization, not an actual key or network request.
    active.provider='tomtom';
    document.getElementById('tt-primary').checked=true;
    document.getElementById('tt-key').value='TEST_RESTRICTED_KEY_1234';
    event();
    return {before,after:document.getElementById('passenger-eta').textContent,
      rejected,text:document.getElementById('passenger-live-eta').textContent,
      sameRoute:routes[selectedRoute].geometry===geometry};
  });
  assert.doesNotMatch(quote.rejected,/6 min/,
    'OSRM routing without authorized TomTom key cannot claim refreshed traffic');
  assert.match(quote.text,/6 min/);
  assert.equal(quote.after,quote.before,'traffic alternative must not silently change selected-route ETA');
  assert.equal(quote.sameRoute,true,'traffic alternative must not replace selected route');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jalan:traffic-estimate',{
    detail:{provider:'tomtom',seconds:2,checkedAt:Date.now()-700000,
      route:window.JalanGPS.getState().route}
  })));
  assert.match(await page.locator('#passenger-live-eta').innerText(),/6 min/,
    'expired estimate message cannot override the last validated quote');
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
  const visibleTriangle=await page.locator('#passenger-vehicle-screen').boundingBox();
  const anchorTriangle=await page.locator('.jalan-vehicle-marker').boundingBox();
  assert.ok(Math.abs(visibleTriangle.x+visibleTriangle.width/2-
    (anchorTriangle.x+anchorTriangle.width/2))<6,
    'upright triangle stays screen-aligned with georeferenced marker');
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
  assert.equal(await page.evaluate(()=>{
    const hud=document.getElementById('passenger-vehicle-screen');
    return !document.getElementById('map').contains(hud)&&
      document.getElementById('passenger-navigation').contains(hud);
  }),true,'vehicle HUD is outside rotating Leaflet map');
  // Slow incremental pinches are common on iOS. The old per-event threshold
  // never accumulated them, so test a full gesture across several small moves.
  const incrementalPinch=await page.evaluate(()=>{
    const surface=document.getElementById('passenger-map-gestures');
    const send=(type,p)=>{
      const e=new Event(type,{bubbles:true,cancelable:true});
      Object.defineProperty(e,'touches',{value:p.map(([clientX,clientY])=>({clientX,clientY}))});
      surface.dispatchEvent(e);
    };
    map.setZoom(15,{animate:false});
    const before=map.getZoom();
    send('touchstart',[[150,400],[250,400]]);
    for(const d of [102,104,106,108,110,113,116,120]){
      send('touchmove',[[200-d/2,400],[200+d/2,400]]);
    }
    send('touchend',[]);
    return {before,after:map.getZoom()};
  });
  assert.ok(incrementalPinch.after>incrementalPinch.before,
    'incremental two-finger pinch must accumulate into a zoom step');
  assert.match(touchResults.exploringText,/Exploring map/);
  const exploreCenter=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
  await page.evaluate(()=>{
    window.__offlineGPSWatch({timestamp:Date.now()+3000,coords:{
      latitude:3.1392,longitude:101.6872,accuracy:8,speed:5,heading:90}});
  });
  assert.deepEqual(await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]),exploreCenter,
    'GPS updates do not steal the camera while manually exploring');
  assert.equal(await page.locator('#passenger-recenter-floating').isVisible(),true,
    'right-side Recenter remains available without opening the menu');
  await page.locator('#passenger-recenter-floating').click();
  assert.match(await page.locator('#passenger-gesture-hint').innerText(),/Following GPS/);
  // Repeated identical GPS fixes must not invoke Leaflet setView or panTo:
  // this previously flashed raster tiles on the phone after Recenter.
  const stableCamera=await page.evaluate(()=>{
    const originalSet=map.setView.bind(map),originalPan=map.panTo.bind(map);
    let setCount=0,panCount=0;
    map.setView=(...args)=>{setCount++;return originalSet(...args);};
    map.panTo=(...args)=>{panCount++;return originalPan(...args);};
    const position=window.JalanGPS.getState().position;
    for(let i=0;i<3;i++){
      window.__offlineGPSWatch({timestamp:Date.now()+3900+i*100,coords:{
        latitude:position[0],longitude:position[1],accuracy:8,speed:0,heading:0}});
    }
    const result={setCount,panCount};map.setView=originalSet;map.panTo=originalPan;
    return result;
  });
  assert.deepEqual(stableCamera,{setCount:0,panCount:0},
    'stationary GPS updates must not redraw the entire route camera');
  await page.locator('#passenger-recenter').click();
  assert.match(await page.locator('#passenger-gesture-hint').innerText(),/Following GPS/);
  assert.equal(await page.evaluate(()=>map.getZoom()),17,
    'Recenter explicitly restores navigation zoom after exploration');
  const restored=await page.evaluate(()=>[map.getCenter().lat,map.getCenter().lng]);
  assert.notDeepEqual(restored,exploreCenter,
    'Recenter returns the map to the GPS-follow target instead of keeping the dragged view');
  await page.locator('#passenger-2d').click();
  assert.equal(await page.evaluate(()=>document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
    '0deg','2D mode stays north-up');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('map')).pointerEvents),
    'none','2D map rotation uses a dedicated gesture plane, not mismatched Leaflet hit testing');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('passenger-map-gestures')).pointerEvents),
    'auto','2D gesture plane supports pan pinch and twist');
  const flatGestures=await page.evaluate(()=>{
    const surface=document.getElementById('passenger-map-gestures');
    const send=(type,p)=>{
      const e=new Event(type,{bubbles:true,cancelable:true});
      Object.defineProperty(e,'touches',{value:p.map(([clientX,clientY])=>({clientX,clientY}))});
      surface.dispatchEvent(e);
    };
    const before=map.getCenter(),zoom=map.getZoom();
    send('touchstart',[[170,350]]);
    send('touchmove',[[210,390]]);
    send('touchend',[]);
    const panned=Math.abs(map.getCenter().lng-before.lng)>0.000001;
    send('touchstart',[[150,400],[250,400]]);
    send('touchmove',[[140,390],[260,410]]);
    send('touchend',[]);
    return {panned,zoomed:map.getZoom()!==zoom,
      rotated:Math.abs(Number.parseFloat(document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')))>2};
  });
  assert.equal(flatGestures.panned,true,'flat 2D one-finger drag works');
  assert.equal(flatGestures.zoomed,true,'flat 2D pinch works');
  assert.equal(flatGestures.rotated,true,'flat 2D two-finger rotation works');
  await page.locator('#passenger-recenter').click();
  assert.equal(await page.evaluate(()=>document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
    '0deg','2D Recenter restores north-up');
  assert.equal(await page.evaluate(()=>map.getZoom()),17,'2D Recenter returns to GPS zoom');
  await page.locator('#passenger-2d').click();
  const headingAfterReturn=await page.evaluate(()=>({
    camera:Number.parseFloat(document.getElementById('map').style.getPropertyValue('--jalan-camera-turn')),
    vehicle:Number.parseFloat(document.querySelector('.jalan-vehicle-symbol').style.getPropertyValue('--jalan-vehicle-heading'))
  }));
  assert.ok(Number.isFinite(headingAfterReturn.camera)&&
    Math.abs(headingAfterReturn.camera+headingAfterReturn.vehicle)<0.02,
    'return to perspective uses last valid GPS or route-estimated heading with upright triangle');
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
  assert.equal(await page.locator('.passenger-demo-report-marker').count(),0);
  assert.equal(await page.evaluate(()=>map.hasLayer(reportLayer)),true,
    'End preview restores the original map demo layer');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-guiding')),false);
  assert.equal(await page.evaluate(()=>routeLayer.getLayers().filter(x=>x.options.opacity>=0.6).length),3,
    'End preview restores visible route alternatives');
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
  // Exercise actual Go -> traffic module -> mocked provider -> Reports flow.
  // All provider requests remain intercepted; no real key or GPS is sent.
  let incidentRequests=0,trafficRouteRequests=0,incidentFailure=false;
  await page.route('https://api.tomtom.com/traffic/map/**',route=>route.fulfill({
    status:200,contentType:'image/png',body:Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')}));
  await page.route('https://api.tomtom.com/traffic/services/5/incidentDetails?**',route=>{
    incidentRequests++;
    return route.fulfill({status:incidentFailure?503:200,contentType:'application/json',body:JSON.stringify({incidents:[{
      geometry:{type:'Point',coordinates:[101.6925,3.145]},
      properties:{iconCategory:6,events:[{description:'Fixture roadworks ahead'}]}
    },{
      geometry:{type:'Point',coordinates:[101.694,3.145]},
      properties:{iconCategory:6,events:[{description:'Unrelated nearby road'}]}
    },{
      geometry:{type:'LineString',coordinates:[[101.6889,3.139],[101.6973,3.1478]]},
      properties:{iconCategory:6,events:[{description:'Unrelated parallel road'}]}
    },{
      geometry:{type:'LineString',coordinates:[[101.6827,3.1346],[101.69362,3.14604]]},
      properties:{iconCategory:6,events:[{description:'Long incident overlapping selected route'}]}
    }]})});
  });
  await page.route('https://api.tomtom.com/routing/1/calculateRoute/**',route=>{
    trafficRouteRequests++;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({routes:[{
      legs:[{points:[{latitude:3.139,longitude:101.6869},{latitude:3.1478,longitude:101.6953}]}],
      summary:{lengthInMeters:3200,travelTimeInSeconds:600,trafficDelayInSeconds:30},guidance:{instructions:[]}
    }]})});
  });
  await page.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});
  const setupTrafficRoute=()=>page.evaluate(()=>{
    document.getElementById('tt-primary').checked=true;
    document.getElementById('tt-key').value='TEST_RESTRICTED_KEY_1234';
    document.getElementById('tt-incident-toggle').checked=false;
    localStorage.removeItem('jalan-demo-reports-v1');
    setStart([3.139,101.6869],'Fixture start');destination=[3.1478,101.6953];
    routes=[{provider:'tomtom',duration:600,distance:3200,delay:30,
      geometry:{type:'LineString',coordinates:[[101.6869,3.139],[101.6953,3.1478]]},legs:[{steps:[]}]}];
    selectedRoute=0;renderRoutes();
  });
  await setupTrafficRoute();
  assert.equal(incidentRequests,0,'route review does not start traffic fetching');
  await page.locator('#passenger-go').click();
  await page.waitForFunction(()=>document.getElementById('passenger-traffic-summary').dataset.state==='ready');
  assert.equal(incidentRequests,1,'Go fetches incidents without opening options');
  assert.equal(trafficRouteRequests,0,'GPS-based traffic checks wait for a trusted fix');
  assert.equal(await page.locator('#passenger-options').evaluate(x=>x.open),false);
  assert.equal(await page.locator('#passenger-traffic-summary').isVisible(),true);
  assert.match(await page.locator('#passenger-traffic-summary').innerText(),/Route reports: 2/);
  assert.equal(await page.locator('.report-marker').count(),2,
    'map pins use the same route filter as the report list');
  assert.equal(await page.locator('#passenger-traffic-toggle').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>document.getElementById('tt-incident-toggle').checked),true);
  const trafficLayers=()=>page.evaluate(()=>{
    let n=0;map.eachLayer(layer=>{if(String(layer._url||'').includes('/traffic/map/'))n++;});return n;
  });
  assert.equal(await trafficLayers(),1,'Go starts one traffic colour overlay');
  await page.locator('#passenger-turn-toggle').click();
  assert.match(await page.locator('#passenger-report-list').innerText(),/Fixture roadworks ahead/);
  assert.equal(await page.locator('#passenger-report-list li').count(),2);
  assert.doesNotMatch(await page.locator('#passenger-report-list').innerText(),/Unrelated/);
  await page.getByRole('button',{name:/Long incident overlapping selected route/}).tap();
  await assertReportCenter(3.14252,101.69026);
  await page.locator('#passenger-turn-toggle').click();
  // Reports can be inspected immediately after Go, even before GPS matches.
  const liveReport=page.getByRole('button',{name:/View report on map: TomTom traffic incident.*Fixture roadworks ahead/});
  await liveReport.focus();
  await liveReport.press('Enter');
  await assertReportCenter(3.145,101.6925);
  assert.equal(await page.locator('.jalan-report-focus-marker').count(),1);
  assert.equal(await page.locator('.jalan-vehicle-marker').count(),0,
    'a report marker must not impersonate a matched GPS vehicle');
  assert.equal(await page.locator('#passenger-turn-list').isVisible(),false);
  await page.evaluate(()=>window.__offlineGPSWatch({timestamp:Date.now(),coords:{
    latitude:3.139,longitude:101.6869,accuracy:8,speed:0,heading:0}}));
  await page.waitForFunction(()=>document.getElementById('passenger-live-eta').textContent.includes('10 min'));
  await assertReportCenter(3.145,101.6925);
  await page.locator('#passenger-recenter-floating').click();
  assert.equal(await page.locator('.jalan-report-focus-marker').count(),0);
  assert.equal(trafficRouteRequests,1,'first trusted fix starts the immediate traffic route check');
  await page.evaluate(()=>window.__offlineGPSWatch({timestamp:Date.now()+1000,coords:{
    latitude:3.139,longitude:101.6869,accuracy:8,speed:0,heading:0}}));
  assert.equal(trafficRouteRequests,1,'GPS updates do not repeatedly request traffic routes');
  await page.locator('#passenger-turn-toggle').click();
  await page.getByRole('button',{name:/Fixture roadworks ahead/}).tap();
  await assertReportCenter(3.145,101.6925);
  await page.locator('#passenger-options > summary').click();
  await page.locator('#passenger-traffic-details summary').click();
  await page.locator('#passenger-traffic-toggle').click();
  assert.equal(await trafficLayers(),0,'Live traffic Off removes colour overlay');
  assert.equal(await page.locator('.jalan-report-focus-marker').count(),0,
    'Live traffic Off also removes the selected incident highlight');
  assert.equal(await page.locator('#passenger-traffic-summary').getAttribute('data-state'),'off');
  await page.locator('#passenger-turn-toggle').click();
  assert.equal(await page.locator('#passenger-report-list li').count(),0,'Off clears old incident reports');
  await page.locator('#passenger-turn-close').click();
  incidentFailure=true;
  await page.locator('#passenger-traffic-toggle').click();
  await page.waitForFunction(()=>document.getElementById('passenger-traffic-summary').textContent.includes('unavailable'));
  assert.equal(await page.locator('#passenger-traffic-summary').getAttribute('data-state'),'error');
  await page.locator('#passenger-stop').click();
  assert.equal(await trafficLayers(),0,'End preview removes automatic traffic layers');
  assert.equal(await page.locator('#proactive-toggle').getAttribute('aria-pressed'),'false');
  // A new Go with a TomTom-shaped route but no key must make no traffic call.
  await setupTrafficRoute();
  await page.evaluate(()=>{document.getElementById('tt-key').value='';});
  const beforeMissingKey=incidentRequests;
  await page.locator('#passenger-go').click();
  assert.match(await page.locator('#passenger-traffic-summary').innerText(),/add a TomTom key/);
  assert.equal(incidentRequests,beforeMissingKey);
  assert.equal(await trafficLayers(),0);
  await page.locator('#passenger-options > summary').click();
  await page.locator('#passenger-stop').click();
  await page.goto(base+'/index.html?mode=engineering',{waitUntil:'load'});
  assert.equal(await page.evaluate(()=>document.body.classList.contains('passenger-mode')),false);
  assert.equal(await page.locator('#info-panel').isVisible(),true,'original engineering dashboard retained');
  assert.equal(await page.locator('#passenger-settings-top').isVisible(),false);
  // Privacy-restricted browser: storage getters may throw SecurityError before
  // the TomTom module initializes. Preserve the no-key/OSRM experience and
  // use an explicitly entered key only for this tab, never claim it was saved.
  const deniedContext=await browser.newContext({viewport:{width:390,height:844},
    isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await deniedContext.addInitScript(()=>{
    for(const storage of ['localStorage','sessionStorage']){
      Object.defineProperty(window,storage,{configurable:true,get(){
        throw new DOMException('Disabled by browser privacy policy','SecurityError');
      }});
    }
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
      getCurrentPosition(_ok,error){error({code:1,message:'Permission denied'})},
      watchPosition(_ok,error){error({code:1,message:'Permission denied'});return 1},
      clearWatch(){}
    }});
  });
  const deniedPage=await deniedContext.newPage(),deniedErrors=[];
  deniedPage.on('pageerror',error=>deniedErrors.push(error.message));
  await deniedPage.route('**/*',route=>route.request().url().startsWith(base+'/')?
    route.continue():route.abort('blockedbyclient'));
  await deniedPage.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',route=>
    route.fulfill({status:200,contentType:'application/javascript',
      body:fs.readFileSync(path.join(leaflet,'leaflet.js'))}));
  await deniedPage.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',route=>
    route.fulfill({status:200,contentType:'text/css',
      body:fs.readFileSync(path.join(leaflet,'leaflet.css'))}));
  await deniedPage.goto(base+'/index.html?mode=passenger',{waitUntil:'load'});
  assert.equal(await deniedPage.evaluate(()=>document.body.classList.contains('passenger-mode')),true);
  assert.equal(await deniedPage.locator('#passenger-remember').isChecked(),false);
  await deniedPage.locator('#passenger-settings-top').click();
  await deniedPage.locator('#passenger-key').fill('TEST_RESTRICTED_KEY_1234');
  await deniedPage.locator('#passenger-remember').check();
  await deniedPage.locator('#passenger-use-tomtom').click();
  assert.equal(await deniedPage.evaluate(()=>document.getElementById('tt-primary').checked),true,
    'page-memory key remains usable when browser blocks storage');
  assert.equal(await deniedPage.locator('#passenger-remember').isChecked(),false,
    'a denied key persistence attempt must unset remember');
  assert.match(await deniedPage.locator('#passenger-provider-status').innerText(),
    /Browser storage blocked; key not saved/);
  assert.equal(await deniedPage.evaluate(()=>document.getElementById('tt-key').value),
    'TEST_RESTRICTED_KEY_1234','key is retained only in the current page');
  await deniedPage.locator('#passenger-settings-top').click();
  await deniedPage.locator('#passenger-forget-key').click();
  assert.equal(await deniedPage.evaluate(()=>document.getElementById('tt-key').value),'',
    'Forget must still clear a page-memory key when persistent storage fails');
  await deniedPage.evaluate(()=>{
    document.getElementById('report-hazard').click();
    map.fire('click',{latlng:L.latLng(3.139,101.687)});
  });
  assert.match(await deniedPage.locator('#status').innerText(),
    /visible for this page only; browser storage unavailable/);
  assert.deepEqual(deniedErrors,[],'storage denial must not crash either TomTom or Passenger scripts');
  await deniedContext.close();
  assert.deepEqual(errors,[],'no uncaught JS errors in either UI');
  console.log('JALAN passenger 390px offline PASS: two modes, fastest, real alternatives, +minutes, Go, 2D, exit and provider fallback.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
