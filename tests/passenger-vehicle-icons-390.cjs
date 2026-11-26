'use strict';
const assert=require('node:assert/strict');

module.exports=async function checkVehicleIcons(page,markerSelector){
 const picker=page.locator('#passenger-vehicle-picker');
 const model=value=>picker.locator('input[name="vehicle-picker-model"][value="'+value+'"]');
 const colour=value=>picker.locator('input[name="vehicle-picker-colour"][value="'+value+'"]');
 const open=async()=>{
   await page.locator('#jalan-home-menu').click();
   await page.locator('#passenger-navigation-settings summary').click();
   await page.locator('#passenger-vehicle-choice').click();
 };
 const marker=page.locator(markerSelector);
 const mesh=marker.locator('xpath=following-sibling::canvas[1]');
 const preview=picker.locator('.vehicle-preview-icon canvas');
 const view=picker.locator('.vehicle-view-choice select');
 const pixels=()=>preview.evaluate(canvas=>canvas.toDataURL());
 assert.equal(await mesh.getAttribute('data-model'),'duck','Go keeps the chosen vehicle');
 const filter=await mesh.evaluate(canvas=>{
   const screen=canvas.closest('.passenger-vehicle-screen');
   const uncertain=screen.classList.contains('passenger-vehicle-uncertain');
   screen.classList.add('passenger-vehicle-uncertain');
   const value=getComputedStyle(canvas).filter;
   screen.classList.toggle('passenger-vehicle-uncertain',uncertain);
   return value;
 });
 assert.doesNotMatch(filter,/grayscale/,'GPS uncertainty preserves the chosen paint in guidance');
 await open();
 assert.ok(await model('duck').isChecked()&&await colour('yellow').isChecked(),'Go keeps the saved colour');
 for(const name of ['sedan','hatchback','suv','mpv','pickup','motorcycle','balloon','wau','duck']){
   await model(name).check();
   assert.equal(await preview.getAttribute('data-model'),name);
   const images=new Set();
   for(const angle of ['front','side','rear','top']){
     await view.selectOption(angle);images.add(await pixels());
   }
   assert.equal(images.size,4,'each angle renders distinct geometry for '+name);
   if(['balloon','wau','duck'].includes(name)){
     await colour('yellow').check();
     await picker.locator('.jalan-dialog-ok').click();
     await mesh.and(page.locator('canvas[data-model="'+name+'"]')).waitFor();
     await open();
     assert.ok(await model(name).isChecked()&&await colour('yellow').isChecked());
   }
 }
 await model('pickup').check();
 for(const name of ['teal','blue','red','yellow','white','charcoal'])await colour(name).check();
 const charcoal=await pixels();
 await colour('white').check();assert.notEqual(await pixels(),charcoal);
 await colour('charcoal').check();
 await picker.locator('.jalan-dialog-ok').click();
 await mesh.and(page.locator('canvas[data-model="pickup"]')).waitFor();
 await open();
 assert.ok(await model('pickup').isChecked()&&await colour('charcoal').isChecked());
 await model('sedan').check();await colour('red').check();
 await picker.locator('.jalan-dialog-secondary').click();
 assert.equal(await mesh.getAttribute('data-model'),'pickup','Cancel preserves the active marker');
 await open();await model('classic').check();
 assert.equal(await picker.locator('.vehicle-colours').isVisible(),false);
 await picker.locator('.jalan-dialog-ok').click();
 await mesh.waitFor({state:'detached'});
 assert.equal(await marker.locator('.vehicle-left').isVisible(),true);
};
