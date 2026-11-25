'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const scope=vm.createContext({window:{}});
for(const name of ['mesh','renderer']){
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../passenger-vehicle-'+name+'.js'),'utf8'),scope);
}
test('tilt changes geometry at a fixed bearing and rotating reveals the correct lights',()=>{
 for(const model of ['sedan','hatchback','suv','mpv','pickup','motorcycle']){
   let paints=0,pixels;
   const canvas={clientWidth:84,dataset:{},getContext:()=>({
     createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
     putImageData(image){pixels=Buffer.from(image.data);paints++;}
   })};
   const draw=(yaw,pitch)=>scope.window.JalanVehicleRenderer.draw(canvas,model,'#00aaa0',yaw,pitch,true);
   function lightCounts(){
     let red=0,white=0;
     for(let i=0;i<pixels.length;i+=4){
       const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
       if(r>90&&r>2*g&&r>2*b)red++;
       if(Math.min(r,g,b)>155)white++;
     }
     return {red,white};
   }
   draw(0,0);const roof=pixels;
   draw(0,65);const rear=lightCounts();
   assert.ok(!roof.equals(pixels),model+' responds to tilt alone');
   draw(180,65);const front=lightCounts();
   assert.ok(front.white>rear.white&&rear.red>front.red,model+' front lamps and tail lamps are on opposite ends');
   draw(-180,65);assert.equal(paints,3,'equivalent camera bearings reuse the painted frame');
 }
});
