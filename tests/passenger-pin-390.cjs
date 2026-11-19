'use strict';
const assert=require('node:assert/strict');
module.exports=async function pinCard(page,{routing=false}={}){
 const card=page.locator('#jalan-pin-card');
 async function press(x=150,y=320){
   await page.mouse.move(x,y);await page.mouse.down();
   try{await card.waitFor({state:'visible',timeout:4500});}
   finally{await page.mouse.up();}
 }
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
   writeText:async text=>{window.__copiedPin=text;}
 }}));
 await press();
 const coordinates=await card.locator('small').textContent();
 await card.getByRole('button',{name:'Share location'}).click();
 const link=new URL(await page.evaluate(()=>window.__copiedPin));
 assert.equal(link.hostname,'www.google.com');
 assert.equal(link.searchParams.get('query').split(',').map(x=>Number(x).toFixed(5)).join(', '),coordinates);
 assert.equal(await page.locator('#jalan-pin-toast').textContent(),'Location link copied.');
 assert.equal(await card.isVisible(),false);
 if(!routing)return;
 await press();
 await card.waitFor({state:'hidden',timeout:9000});
 // Seed a preview using a known start on the basic map, then exercise actual
 // Go, stop choice, waypoint request and overlay rendering.
 await page.evaluate(()=>{
   window.__pinInitial={start:startPoint,destination,choice:$('start-choice').value};
   window.__pinProvider=$('tt-primary').checked;$('tt-primary').checked=false;
   startPoint=[3.139,101.6869];destination=[3.145,101.697];
   routes=[{duration:200,distance:1500,geometry:{type:'LineString',coordinates:[startPoint,destination].map(p=>[p[1],p[0]])},legs:[]}];
   selectedRoute=0;renderRoutes();
 });
 await page.route('https://router.project-osrm.org/route/v1/driving/**',route=>{
   const uri=new URL(route.request().url()),points=uri.pathname.split('/').at(-1).split(';').map(s=>s.split(',').map(Number));
   assert.equal(points.length,3);
   return route.fulfill({json:{code:'Ok',waypoints:points.map(location=>({location})),routes:[
    {duration:210,distance:1700,geometry:{type:'LineString',coordinates:points},legs:[{duration:100,distance:800,steps:[]},{duration:110,distance:900,steps:[]}]}
   ]}});
 });
 await press();
 await card.getByRole('button',{name:'Go',exact:true}).click();
 await card.getByRole('button',{name:'Add as stop'}).click();
 await page.waitForFunction(()=>!!routes[selectedRoute]?.pinnedStop);
 assert.deepEqual(await page.evaluate(()=>destination),[3.145,101.697]);
 assert.ok(await page.locator('.jalan-stop-route').count());
 await page.evaluate(()=>{clearRoute(true);startPoint=window.__pinInitial.start;$('tt-primary').checked=window.__pinProvider;});
 await page.unroute('https://router.project-osrm.org/route/v1/driving/**');
};
