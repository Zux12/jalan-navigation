// Original vehicle geometry in local coordinates: X right, -Y forward, Z up.
// Flat panels, rounded body sections and solid wheels share one indexed mesh.
(() => {
 'use strict';
 const cache=new Map();
 const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
 const sub=(a,b)=>a.map((v,i)=>v-b[i]);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const unit=a=>{const length=Math.hypot(...a)||1;return a.map(v=>v/length);};
 const shapes={
   // Half width, nose, tail, shoulder, roof, windscreen base, rear glass base,
   // roof front and rear, tyre radius and wheel centres.
   sedan:    [13.5,-32,31,13,23,-15,20,-8,11,6.3,-20,19],
   hatchback:[13.7,-28,27,14,25,-14,25,-7,19,6.3,-17,16],
   suv:      [15.2,-31,31,17,29,-18,27,-11,21,7.4,-20,20],
   mpv:      [14.5,-34,33,15,29,-23,30,-14,25,6.5,-21,21],
   pickup:   [15,-34,34,16,27,-19,6,-12,3,7.5,-22,22]
 };

 // The balloon's alternating fabric gores meet at the crown. A pennant streams
 // towards +Y so its direction is visible even when the basket is hidden.
 function hotAirBalloon({face,ring,bridge,tube}){
   const profile=[[12.5,3.7],[15.4,6.2],[19,11.5],[23,16.1],[27,17.2],[31,15.4],[34,11.5],[36,5.5],[36.5,2.1]];
   const panels=12,steps=panels*2;
   const bands=profile.map(([z,r])=>Array.from({length:steps},(_,i)=>{
     const angle=i*2*Math.PI/steps,bulge=i%2?1.025:.985;
     return [r*bulge*Math.cos(angle),-2+r*bulge*Math.sin(angle),z];
   }));
   for(let j=1;j<bands.length;j++){
     const low=bands[j-1],high=bands[j];
     for(let i=0;i<steps;i++){
       const next=(i+1)%steps;
       face([low[i],low[next],high[next],high[i]],Math.floor(i/2)%2?'cream':'paint');
     }
   }
   face(bands[0],'weave');face(bands[bands.length-1],'gold');
   const base=ring(4.5,-5.4,1.4,1,1),rim=ring(5.2,-6.1,2.1,5.9,1.3);
   bridge(base,rim,'wicker');face(base,'weave');face(rim,'weave');
   for(const z of [2.7,4.2,5.9]){
     const outer=ring(4.8+z*.08,-5.7-z*.09,1.7+z*.09,z,1.2);
     bridge(outer,outer.map(([x,y])=>[x,y,z+.55]),z===5.9?'gold':'weave');
   }
   for(const x of [-1,1])for(const y of [-1,1])
     tube([x*4.6,-2+y*3.4,6.1],[x*5.1,-2+y*4.1,16],.48,.48,'weave',6);
   const ribbon=[[0,11,27],[-1,16,25],[1,20,24],[2,24,21.5],[0,27,20]];
   for(let i=1;i<ribbon.length;i++){
     const a=ribbon[i-1],b=ribbon[i],halfWidth=i===ribbon.length-1?.65:1.55;
     face([[a[0]-1.55,a[1],a[2]],[a[0]+1.55,a[1],a[2]+.3],
       [b[0]+halfWidth,b[1],b[2]+.3],[b[0]-halfWidth,b[1],b[2]]],i%2?'gold':'paintShade');
   }
 }

 // Each half is cut as fabric strips. Their lower outline forms the wau bulan's
 // separate crescent tail. The cambered sail rises above a bamboo spine.
 function wauBulan({face,tube}){
   const wing=[[0,-24,8],[6,-17.7,6],[12,-13.4,3.4],[19,-10.8,1],[25,-6.6,-.2],[29,-1.8,.3]];
   const moon=[[0,9.2,23],[5,10.7,22],[10,10.6,19.4],[15,8.6,15.9],[19,5.9,11],[22,2.4,4.2]];
   const rise=(x,y)=>12.5-y*.12-Math.abs(x)*.25;
   function drawSail(stations,isMoon,side){
     const cuts=isMoon?[0,.13,.55,.69,.87,1]:[0,.09,.42,.51,.82,.92,1];
     const fabric=isMoon?['gold','paint','cream','paint','gold']:['gold','paint','cream','paint','gold','paintShade'];
     function point(row,t,under=false){
       const [x,front,rear]=row,y=front+(rear-front)*t;
       return [x*side,y,rise(x,y)+(under?-.8:1.4*Math.sin(Math.PI*t))];
     }
     for(let j=1;j<stations.length;j++){
       const a=stations[j-1],b=stations[j];
       for(let i=1;i<cuts.length;i++){
         const u=cuts[i-1],v=cuts[i];
         face([point(a,u),point(b,u),point(b,v),point(a,v)],fabric[i-1]);
       }
       face([point(a,0,true),point(b,0,true),point(b,1,true),point(a,1,true)],'paintShade');
       for(const t of [0,1])face([point(a,t),point(b,t),point(b,t,true),point(a,t,true)],'gold');
     }
   }
   for(const side of [-1,1]){
     drawSail(wing,false,side);drawSail(moon,true,side);
     const panel=[[3,-10],[8,-11.4],[12,-9.5],[8,-8.8]];
     face(panel.map(([x,y])=>[side*x,y,rise(x,y)+1.75]),'gold');
     // Two short knotted tails mark the trailing edge in a top-down view.
     const knots=[[side*3,21,rise(3,21)],[side*4.4,25.5,8],[side*3.1,28.7,7],[side*5.4,32,5]];
     for(let i=1;i<knots.length;i++){
       const a=knots[i-1],b=knots[i];
       face([[a[0]-1,a[1],a[2]],[a[0]+1,a[1],a[2]],
         [b[0]+1,b[1],b[2]],[b[0]-1,b[1],b[2]]],i===2?'cream':'paint');
     }
   }
   tube([0,-24,rise(0,-24)+.6],[0,23,rise(0,23)+.6],.7,.85,'gold',8);
 }

 function rubberDuck({oval,tube}){
   oval([0,5.3,9.1],[13.7,17.2,9.1],'paint',20,10);
   tube([0,16.7,10],[0,24,15.8],5.8,1.3,'paint',14);
   oval([0,-9,19.3],[9.6,10,10],'paint',20,10);
   oval([0,-18.5,16.5],[6.1,6.7,1.8],'billEdge',16,6);
   oval([0,-18.8,17.8],[6.9,7.4,2.5],'bill',16,8);
   for(const side of [-1,1]){
     oval([side*10.6,6,11.8],[4,9.4,4.8],'paintShade',16,8);
     oval([side*6.15,-15.9,22.7],[1.8,1.55,1.9],'eye',12,6);
     oval([side*6.45,-16.9,23.4],[.7,.65,.7],'headlamp',8,5);
     oval([side*2.5,-22.6,19.65],[.68,.82,.33],'billEdge',8,5);
   }
 }

 function build(model){
   const vertices=[],faces=[],ids=new Map();
   function vertex(p){
     const key=p.join(',');
     if(!ids.has(key)){ids.set(key,vertices.length);vertices.push(p);}
     return ids.get(key);
   }
   function face(points,material){
     const indices=points.map(vertex);
     for(let i=1;i<indices.length-1;i++){
       const a=vertices[indices[0]],b=vertices[indices[i]],c=vertices[indices[i+1]];
       const normal=unit(cross(sub(b,a),sub(c,a)));
       faces.push({a:indices[0],b:indices[i],c:indices[i+1],normal,material});
     }
   }
   function bridge(a,b,material){
     a.forEach((p,i)=>{const n=(i+1)%a.length;face([p,a[n],b[n],b[i]],material);});
   }
   // Rounded rectangular cross section, ordered clockwise as viewed from above.
   function ring(width,front,rear,z,r){
     const points=[];
     for(const [cx,cy,start] of [[width-r,front+r,-90],[width-r,rear-r,0],[-width+r,rear-r,90],[-width+r,front+r,180]]){
       for(let i=0;i<=3;i++){
         const angle=(start+i*30)*Math.PI/180;
         points.push([cx+r*Math.cos(angle),cy+r*Math.sin(angle),z]);
       }
     }
     return points;
   }
   function block(x,y,z,w,l,h,material){
     const plane=height=>[[x-w/2,y-l/2,height],[x+w/2,y-l/2,height],[x+w/2,y+l/2,height],[x-w/2,y+l/2,height]];
     const a=plane(z-h/2),b=plane(z+h/2);bridge(a,b,material);face(b,material);face(a,material);
   }
   function tube(a,b,r1,r2,material,steps=10){
     const axis=unit(sub(b,a)),u=unit(cross(axis,Math.abs(axis[2])<.85?[0,0,1]:[0,1,0])),v=cross(axis,u);
     function circle(center,r){
       return Array.from({length:steps},(_,i)=>{
         const angle=i*2*Math.PI/steps,c=r*Math.cos(angle),s=r*Math.sin(angle);
         return center.map((n,j)=>n+c*u[j]+s*v[j]);
       });
     }
     const low=circle(a,r1),high=circle(b,r2);bridge(low,high,material);face(low,material);face(high,material);
   }
   function oval(center,radii,material,slices=12,bands=7){
     let previous;
     for(let j=0;j<=bands;j++){
       const phi=-Math.PI/2+j*Math.PI/bands;
       const layer=Array.from({length:slices},(_,i)=>{
         const t=i*2*Math.PI/slices;
         return [center[0]+radii[0]*Math.cos(t)*Math.cos(phi),
           center[1]+radii[1]*Math.sin(t)*Math.cos(phi),center[2]+radii[2]*Math.sin(phi)];
       });
       if(previous)bridge(previous,layer,material);
       previous=layer;
     }
   }
   function wheel(x,y,r,width,bike=false){
     const at=offset=>[x+offset,y,r];
     const edges=[-width/2,-width*.33,width*.33,width/2];
     for(let i=0;i<3;i++)tube(at(edges[i]),at(edges[i+1]),r*(i===0?.86:1),r*(i===2?.86:1),'tyre',16);
     for(const side of bike?[-1,1]:[Math.sign(x)]){
       const outer=side*width/2,axle=at(outer+side*.12);
       tube(at(outer),axle,r*.64,r*.64,'rim',16);
       tube(axle,at(outer+side*.23),r*.49,r*.49,'inset',16);
       const spokeX=x+outer+side*.29;
       for(let i=0;i<5;i++){
         const t=2*Math.PI*i/5,point=(radius,offset)=>[spokeX,y+radius*Math.cos(t+offset),r+radius*Math.sin(t+offset)];
         face([point(r*.08,-.36),point(r*.58,-.09),point(r*.58,.14),point(r*.08,.38)],'metal');
       }
     }
   }
   if(model==='balloon'){
     hotAirBalloon({face,ring,bridge,tube});
   }else if(model==='wau'){
     wauBulan({face,tube});
   }else if(model==='duck'){
     rubberDuck({oval,tube});
   }else if(model==='motorcycle'){
     wheel(0,-19,8,4.6,true);wheel(0,20,8.6,5.8,true);
     for(const side of [-1,1]){
       tube([side*2.9,-19,7.9],[side*2.9,-12,22],1.05,1.3,'metal');
       tube([side*2.8,20,8.6],[side*3.6,2,11],1.25,1.65,'frame');
       tube([side*4,0,17],[side*3,14,16],1.4,1.4,'frame');
     }
     oval([0,1,12],[4.5,8,5.3],'engine');
     oval([0,-10,18],[5.4,7.8,6],'paint');
     oval([0,11,17.5],[5,10,3.5],'paint');
     oval([0,6.5,20],[4.5,7,1.6],'tyre');
     oval([0,-15.3,21.6],[4.4,3,4.1],'paint');
     oval([0,-17.9,21.8],[3.1,.85,2.4],'headlamp');
     oval([0,19.7,18],[3.1,1.4,1.4],'tail');
     tube([-7,-11,24],[7,-11,24],.75,.75,'frame');
     for(const s of [-1,1]){
       tube([s*6,-12,24],[s*8.8,-13,27],.38,.4,'metal');
       oval([s*9.1,-13.5,27.4],[1.8,.9,.9],'frame');
       tube([s*2.2,5,21],[s*5.5,-1.5,16.4],2.5,2,'pants');
       tube([s*5.5,-1.5,16.4],[s*5.3,5,9.5],1.85,1.5,'pants');
       oval([s*5.3,4.1,9.3],[1.65,3,.95],'tyre');
       tube([s*3.6,-.3,27.7],[s*6,-4,23.3],1.9,1.45,'jacket');
       tube([s*6,-4,23.3],[s*6.5,-10.8,24],1.45,1.15,'jacket');
     }
     oval([0,.8,25.3],[5,5.1,6.4],'jacket');
     oval([0,-3.3,33.5],[4.8,5.1,5.1],'paint',16,8);
     oval([0,-6.7,33.4],[4.45,2.05,2.35],'glass');
   }else{
     const [w,nose,tail,belt,roof,glassFront,glassRear,roofFront,roofRear,r,axFront,axRear]=shapes[model];
     for(const s of [-1,1])for(const y of [axFront,axRear])wheel(s*(w-1.3),y,r,3.7);
     const sill=ring(w-.6,nose+1,tail-1,4.8,4);
     const bumper=ring(w,nose,tail,7.5,4.6);
     const waist=ring(w+.15,nose+.65,tail-.6,belt-2,4.6);
     const deck=ring(w-1,nose+2.5,tail-2,belt,4.1);
     bridge(sill,bumper,'trim');bridge(bumper,waist,'paint');bridge(waist,deck,'paint');face(deck,'paint');
     const base=ring(w-1.05,glassFront,glassRear,belt+.08,3);
     const glassTop=ring(w-3.5,roofFront,roofRear,roof-1.35,2.8);
     const lid=ring(w-4.4,roofFront+.8,roofRear-.85,roof,2.7);
     bridge(base,glassTop,'glass');bridge(glassTop,lid,'paint');
     const crown=ring(w-6,roofFront+2.7,roofRear-2.7,roof+.6,2);
     bridge(lid,crown,'paint');face(crown,'paint');
     // A cool reflection along the upper glass helps distinguish the windows
     // from body paint at navigation scale, particularly on charcoal cars.
     for(const [i,j] of [[15,0],[7,8],[3,4],[11,12]]){
       function panePoint(u,v){
         const p=mix(mix(base[i],base[j],u),mix(glassTop[i],glassTop[j],u),v);
         p[2]+=.06;return p;
       }
       face([panePoint(.025,.72),panePoint(.975,.58),panePoint(.975,.96),panePoint(.025,.96)],'glassSky');
     }
     // Paint the four corner pillars and divide the side glass on its own plane.
     for(const i of [0,4,8,12]){
       for(let k=i;k<i+3;k++)face([base[k],base[k+1],glassTop[k+1],glassTop[k]],'paint');
     }
     for(const [i,j] of [[3,4],[11,12]]){
       for(const t of (model==='mpv'?[.33,.69]:[.53])){
         const a=mix(base[i],base[j],t-.027),b=mix(base[i],base[j],t+.027);
         const c=mix(glassTop[i],glassTop[j],t+.027),d=mix(glassTop[i],glassTop[j],t-.027);
         for(const p of [a,b,c,d])p[0]+=Math.sign(p[0])*.12;
         face([a,b,c,d],'frame');
       }
     }
     // Panels follow the bumper slope. Winding and depth work from either end.
     function fascia(front,x1,x2,z1,z2,material){
       const at=(x,z)=>{
         const t=(z-7.5)/(belt-2-7.5);
         return [x,front?nose+.65*t-.12:tail-.6*t+.12,z];
       };
       face([at(x1,z1),at(x2,z1),at(x2,z2),at(x1,z2)],material);
     }
     fascia(true,-w*.49,w*.49,7.65,belt-2.15,'grille');
     fascia(true,-w*.43,w*.43,8.2,8.65,'rim');
     fascia(true,-2.5,2.5,8.5,9.85,'plate');
     fascia(false,-3.2,3.2,7.9,9.7,'plate');
     for(const side of [-1,1]){
       fascia(true,side*w*.46,side*w*.73,belt-4.5,belt-2,'headlamp');
       // Wrap the daytime running light around the nose and onto the shoulder.
       const corner=side>0?2:13;
       const next=side>0?1:14;
       face([waist[corner],waist[next],deck[next],deck[corner]],'headlamp');
       face([[side*(w-5.6),nose+2.65,belt+.09],[side*(w-3.3),nose+2.75,belt+.09],
         [side*(w-2.1),nose+5.7,belt+.09],[side*(w-3.15),nose+5.2,belt+.09]],'headlamp');
       fascia(false,side*w*.43,side*w*.76,belt-4.8,belt-2,'tail');
       const edgeX=side*(w-.7),mirrorY=glassFront+5;
       tube([edgeX,mirrorY,belt+1],[side*(w+1.7),mirrorY+.7,belt+2],.57,.57,'frame',6);
       oval([side*(w+1.7),mirrorY+.6,belt+2.15],[1.65,2.1,1.05],'paint',8,4);
       // Shoulder trim and door pulls stand just proud of the side panel.
       const sideX=side*(w+.10);
       for(const y of model==='pickup'?[glassFront*.43]:[glassFront*.46,glassRear*.62])
         block(sideX,y,belt-3,.38,2.8,.6,'rim');
       block(side*(w+.03),(axFront+axRear)/2,7.6,.28,axRear-axFront-7,.6,'trim');
       // Bonnet crease, tail lamps wrapping the deck edge.
       face([[side*(w-5),nose+4,belt+.05],[side*(w-3.15),glassFront-1,belt+.05],
         [side*(w-3.85),glassFront-1,belt+.05]],'paintShade');
       face([[side*(w-4),tail-2.4,belt+.05],[side*(w-2),tail-4,belt+.05],
         [side*(w-3.1),tail-4.9,belt+.05],[side*(w-6.1),tail-2.6,belt+.05]],'tail');
     }
     if(model==='pickup'){
       const well=ring(w-3.15,glassRear+1,tail-3.8,belt+.13,1.6);
       const floor=ring(w-4.1,glassRear+2.8,tail-5.6,belt+.16,1.2);
       // A raised bed surrounds a lower cargo floor with stamped longitudinal ribs.
       const lip=ring(w-3.15,glassRear+1,tail-3.8,belt+1.8,1.6);
       const outer=ring(w-1.3,glassRear+.2,tail-2.4,belt+1.8,2.4);
       bridge(well,outer,'paint');bridge(outer,lip,'paint');bridge(lip,floor,'inset');face(floor,'bed');
       for(let x=-8;x<=8;x+=4)block(x,(glassRear+tail)/2,belt+.45,.7,tail-glassRear-10,.44,'inset');
     }
     if(model==='suv'||model==='mpv'){
       for(const s of [-1,1]){
         const x=s*(w-5.3);
         for(const y of [roofFront+3,roofRear-3])block(x,y,roof+.48,1.35,2.4,1,'frame');
         tube([x,roofFront+2,roof+1.1],[x,roofRear-2,roof+1.1],.65,.65,'rim',8);
       }
     }
   }
   return {vertices,faces};
 }
 window.JalanVehicleMesh={get(model){
   if(!cache.has(model))cache.set(model,build(model));
   return cache.get(model);
 }};
})();
