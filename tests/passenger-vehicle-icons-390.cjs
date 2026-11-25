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
 await open();
 assert.equal(await model('classic').isChecked(),true);
 assert.equal(await picker.locator('.vehicle-colours').isVisible(),false);
 for(const name of ['sedan','hatchback','suv','mpv','pickup','motorcycle']){
   await model(name).check();
   assert.ok((await picker.locator('.vehicle-preview-icon .vehicle-model-art').getAttribute('style')).includes(name+'.webp'));
 }
 await model('pickup').check();
 for(const name of ['teal','blue','red','yellow','white','charcoal'])await colour(name).check();
 assert.equal(await picker.locator('.vehicle-preview-icon .vehicle-model-art').evaluate(el=>el.style.backgroundPositionX),'100%');
 await picker.locator('.jalan-dialog-ok').click();
 await marker.locator('svg[data-colour="charcoal"] image[href="icons/vehicles/pickup.webp"]').waitFor();
 await open();
 assert.ok(await model('pickup').isChecked()&&await colour('charcoal').isChecked());
 await model('sedan').check();await colour('red').check();
 await picker.locator('.jalan-dialog-secondary').click();
 assert.equal(await marker.getAttribute('data-vehicle-model'),'pickup','Cancel preserves the active marker');
 await open();await model('classic').check();
 assert.equal(await picker.locator('.vehicle-colours').isVisible(),false);
 await picker.locator('.jalan-dialog-ok').click();
 await marker.locator('image').waitFor({state:'detached'});
 assert.equal(await marker.locator('.vehicle-left').isVisible(),true);
};
