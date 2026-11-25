// Orthographic projection with a per-pixel depth buffer. The marker is small
// enough to render directly, including on the basic map without WebGL.
(() => {
 'use strict';
 const materials={
   tyre:'#252c33',rim:'#8996a3',inset:'#394452',metal:'#cfdae3',trim:'#303d48',
   glass:'#29485a',glassSky:'#59879b',frame:'#25303b',grille:'#202933',headlamp:'#f2f9ff',
   tail:'#e23847',plate:'#d4dbe1',bed:'#46515d',engine:'#738291',pants:'#293c50',jacket:'#445667',
   cream:'#fff0cb',gold:'#e7ac43',wicker:'#bd8552',weave:'#865334',bill:'#ff8c24',billEdge:'#cd6223',eye:'#182332'
 };
 const states=new WeakMap();
 const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 const fixed=Object.fromEntries(Object.entries(materials).map(([name,hex])=>[name,rgb(hex)]));
 const rad=Math.PI/180;
 function prepare(canvas){
   const ctx=canvas.getContext('2d');
   if(!ctx)return;
   // Backing pixels stay independent of map zoom and the CSS marker size.
   const size=Math.round((canvas.clientWidth||84)*2);
   const n=Math.max(80,Math.min(192,size));
   canvas.width=n;canvas.height=n;
   const image=ctx.createImageData(n,n);
   const state={ctx,n,image,pixels:new Uint32Array(image.data.buffer),depth:new Float32Array(n*n)};
   states.set(canvas,state);
   return state;
 }
 function triangle(state,a,b,c,ink){
   const n=state.n;
   const dx1=b[0]-a[0],dy1=b[1]-a[1],dx2=c[0]-a[0],dy2=c[1]-a[1];
   const area=dx1*dy2-dy1*dx2;
   if(Math.abs(area)<.0001)return;
   const minX=Math.max(0,Math.ceil(Math.min(a[0],b[0],c[0])-.5));
   const maxX=Math.min(n-1,Math.floor(Math.max(a[0],b[0],c[0])-.5));
   const minY=Math.max(0,Math.ceil(Math.min(a[1],b[1],c[1])-.5));
   const maxY=Math.min(n-1,Math.floor(Math.max(a[1],b[1],c[1])-.5));
   const du=dy2/area,dv=-dy1/area,dz1=b[2]-a[2],dz2=c[2]-a[2];
   for(let y=minY;y<=maxY;y++){
     const x0=minX+.5-a[0],y0=y+.5-a[1];
     let u=(x0*dy2-y0*dx2)/area,v=(dx1*y0-dy1*x0)/area;
     for(let x=minX,i=y*n+x;x<=maxX;x++,i++,u+=du,v+=dv){
       if(u<-.00001||v<-.00001||u+v>1.00001)continue;
       const depth=a[2]+u*dz1+v*dz2;
       if(depth<state.depth[i]-.0001)continue;
       state.depth[i]=depth;state.pixels[i]=ink;
     }
   }
 }
 function draw(canvas,model,paint,heading,pitch,centered=false){
   const state=states.get(canvas)||prepare(canvas);
   if(!state)return false;
   const turn=Math.round(((heading%360+360)%360)*4)/4%360;
   const tilt=Math.round(pitch*4)/4;
   if(state.model===model&&state.paint===paint&&state.turn===turn&&state.tilt===tilt&&state.centered===centered)return true;
   const mesh=window.JalanVehicleMesh.get(model);
   if(state.model!==model){
     state.points=mesh.vertices.map(()=>[0,0,0]);
     state.model=model;
   }
   if(state.paint!==paint){
     const body=rgb(paint);
     state.palette={...fixed,paint:body,paintShade:body.map(v=>v*.85)};
   }
   Object.assign(state,{paint,turn,tilt,centered});
   canvas.dataset.model=model;canvas.dataset.heading=turn;canvas.dataset.pitch=tilt;
   const ch=Math.cos(turn*rad),sh=Math.sin(turn*rad),cp=Math.cos(tilt*rad),sp=Math.sin(tilt*rad);
   let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
   for(let i=0;i<mesh.vertices.length;i++){
     const [x,y,z]=mesh.vertices[i],p=state.points[i],across=x*ch-y*sh,along=x*sh+y*ch;
     p[0]=across;p[1]=along*cp-z*sp;p[2]=along*sp+z*cp;
     left=Math.min(left,across);right=Math.max(right,across);top=Math.min(top,p[1]);bottom=Math.max(bottom,p[1]);
   }
   const scale=state.n/84,offsetX=centered?(left+right)/2:0,offsetY=centered?(top+bottom)/2:0;
   for(const p of state.points){p[0]=state.n/2+(p[0]-offsetX)*scale;p[1]=state.n/2+(p[1]-offsetY)*scale;}
   state.depth.fill(-Infinity);state.pixels.fill(0);
   for(const f of mesh.faces){
     const [nx,ny,nz]=f.normal;
     const across=nx*ch-ny*sh,along=nx*sh+ny*ch;
     const up=along*cp-nz*sp,normalDepth=along*sp+nz*cp;
     const side=normalDepth>=0?1:-1;
     const light=side*(-.40*across-.68*up+.61*normalDepth);
     const shade=.63+.49*Math.max(0,light);
     const spec=(f.material==='paint'||f.material==='glass')?Math.pow(Math.max(0,side*(-.29*across-.47*up+.835*normalDepth)),12)*39:0;
     const [r,g,b]=state.palette[f.material];
     const red=Math.min(255,Math.round(r*shade+spec)),green=Math.min(255,Math.round(g*shade+spec)),blue=Math.min(255,Math.round(b*shade+spec));
     triangle(state,state.points[f.a],state.points[f.b],state.points[f.c],(255<<24)|(blue<<16)|(green<<8)|red);
   }
   state.ctx.putImageData(state.image,0,0);
   return true;
 }
 window.JalanVehicleRenderer={draw};
})();
