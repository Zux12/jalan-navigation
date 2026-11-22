// Bundled synthetic recordings rendered locally with eSpeak NG's Malay (ms)
// voice. Offsets/durations are in seconds in the decoded mono MP3.
(() => {
 'use strict';
 const malay = {
   'preview': [0.15, 7.1643],
   'follow': [7.4642, 1.8561],
   'straight': [9.4703, 1.49],
   'left': [11.1103, 0.8877],
   'right': [12.148, 0.8666],
   'slight-left': [13.1646, 1.6699],
   'slight-right': [14.9845, 1.6484],
   'sharp-left': [16.7829, 1.5108],
   'sharp-right': [18.4437, 1.5023],
   'keep-left': [20.0959, 1.3593],
   'keep-right': [21.6052, 1.3514],
   'uturn': [23.1066, 1.3077],
   'merge': [24.5643, 1.4944],
   'merge-left': [26.2087, 2.2289],
   'merge-right': [28.5876, 2.2208],
   'exit': [30.9583, 1.3961],
   'exit-left': [32.5044, 2.4794],
   'exit-right': [35.1337, 2.471],
   'ramp': [37.7547, 2.2351],
   'ramp-left': [40.1398, 2.0333],
   'ramp-right': [42.323, 2.0254],
   'motorway': [44.4984, 1.4095],
   'roundabout': [46.0579, 4.1558],
   'enter-roundabout': [50.3637, 1.2041],
   'leave-roundabout': [51.7177, 1.3969],
   'depart': [53.2646, 1.3477],
   'ferry': [54.7622, 0.8805],
   'arrival': [55.7927, 1.9423],
   'near-destination': [57.885, 1.8668],
   'stop-arrival': [59.9018, 4.1433],
   'stop-passed': [64.1951, 4.2438],
   'rerouting': [68.5889, 1.4283],
   'route-updated': [70.1671, 2.2058],
   'full-guidance': [72.5229, 1.4173],
   'alerts-only': [74.0902, 1.2537],
   'roundabout-1': [75.4939, 2.8717],
   'roundabout-2': [78.5156, 2.7272],
   'roundabout-3': [81.3927, 2.8102],
   'roundabout-4': [84.3529, 2.8954],
   'roundabout-5': [87.3983, 2.7564],
   'roundabout-6': [90.3046, 2.8039],
   'roundabout-7': [93.2585, 2.8673],
   'roundabout-8': [96.2758, 2.8584],
   'roundabout-9': [99.2842, 3.0919],
   'roundabout-10': [102.526, 2.9902],
   'in-50': [105.6663, 1.4344],
   'in-100': [107.2506, 1.3712],
   'in-200': [108.7718, 1.4912],
   'in-300': [110.413, 1.5643],
   'in-500': [112.1273, 1.4742],
   'in-1000': [113.7515, 1.5546],
   'in-2000': [115.4561, 1.4484],
   'speed-camera': [117.103, 1.858]
 };
 // English fallback spoken by Flite's SLT voice. Cue times are decoded seconds.
 const english = {
 'preview': [0.1000, 5.9400],
 'follow': [6.1400, 1.3650],
 'straight': [7.6050, 1.2200],
 'left': [8.9250, 1.0850],
 'right': [10.1100, 0.9700],
 'uturn': [11.1800, 1.2450],
 'merge': [12.5250, 0.8150],
 'exit': [13.4400, 1.1950],
 'ramp': [14.7350, 1.1050],
 'motorway': [15.9400, 1.4950],
 'roundabout': [17.5350, 2.9650],
 'enter-roundabout': [20.6000, 1.5850],
 'leave-roundabout': [22.2850, 1.5700],
 'depart': [23.9550, 1.4050],
 'ferry': [25.4600, 1.1850],
 'arrival': [26.7450, 1.1750],
 'near-destination': [28.0200, 2.0250],
 'stop-arrival': [30.1450, 3.0250],
 'stop-passed': [33.2700, 3.1150],
 'rerouting': [36.4850, 1.5600],
 'route-updated': [38.1450, 1.1350],
 'speed-camera': [39.3800, 1.5150],
 'slight-left': [40.9950, 0.9700],
 'sharp-left': [42.0650, 1.5000],
 'keep-left': [43.6650, 1.0650],
 'merge-left': [44.8300, 1.1200],
 'exit-left': [46.0500, 1.6600],
 'ramp-left': [47.8100, 1.6350],
 'slight-right': [49.5450, 0.8600],
 'sharp-right': [50.5050, 1.3450],
 'keep-right': [51.9500, 0.9650],
 'merge-right': [53.0150, 1.0350],
 'exit-right': [54.1500, 1.6000],
 'ramp-right': [55.8500, 1.5800],
 'roundabout-1': [57.5300, 2.7800],
 'roundabout-2': [60.4100, 2.7750],
 'roundabout-3': [63.2850, 2.7550],
 'roundabout-4': [66.1400, 2.7400],
 'roundabout-5': [68.9800, 2.7400],
 'roundabout-6': [71.8200, 2.7300],
 'roundabout-7': [74.6500, 2.8300],
 'roundabout-8': [77.5800, 2.7400],
 'roundabout-9': [80.4200, 2.6950],
 'roundabout-10': [83.2150, 2.6350],
 'in-50': [85.9500, 1.4150],
 'in-100': [87.4650, 1.6750],
 'in-200': [89.2400, 1.6950],
 'in-300': [91.0350, 1.7500],
 'in-500': [92.8850, 1.8350],
 'in-1000': [94.8200, 1.4900],
 'in-2000': [96.4100, 1.3300]
 };
 const AudioEngine = window.AudioContext || window.webkitAudioContext;
 function player(cues,asset){
  const aliases = {continue:'straight',arrive:'arrival',stop:'stop-arrival',generic:'follow'};
  const file = new URL(asset, document.currentScript?.src || document.baseURI).href;
  let context = null, loading = null, active = null;

  function getContext(){
    if(!AudioEngine)return null;
    if(!context || context.state==='closed'){
      context=new AudioEngine();loading=null;
    }
    return context;
  }
  function bank(ctx){
    if(!loading){
      const attempt=fetch(file).then(response=>{
        if(!response.ok)throw Error('Guidance audio unavailable');
        return response.arrayBuffer();
      }).then(bytes=>ctx.decodeAudioData(bytes));
      loading=attempt;
      attempt.catch(()=>{if(loading===attempt)loading=null;});
    }
    return loading;
  }
  // On iOS create/resume the context synchronously within the user's gesture.
  // Silent playback primes older Safari. Guidance itself can then run from GPS.
  function unlock(preload=true){
    try{
      const ctx=getContext();
      if(!ctx)return false;
      if(ctx.state!=='running'){
        ctx.resume().catch(()=>{});
        const silent=ctx.createBufferSource();
        silent.buffer=ctx.createBuffer(1,1,ctx.sampleRate);
        silent.connect(ctx.destination);silent.onended=()=>silent.disconnect();
        silent.start();
      }
      if(preload)bank(ctx).catch(()=>{});
      return true;
    }catch{return false;}
  }
  function finish(job,status){
    if(active!==job)return;
    active=null;
    for(const source of job.sources){
      source.onended=null;
      try{source.stop();}catch{}
      source.disconnect();
    }
    job.done?.(status);
  }
  function cancel(){if(active)finish(active,'done');}
  function play(keys,done){
    if(document.hidden || !keys.length)return false;
    let ctx;
    try{ctx=getContext();}catch{return false;}
    if(!ctx)return false;
    cancel();
    const job={sources:[],done};
    active=job;
    Promise.all([ctx.state==='running'?undefined:ctx.resume(),bank(ctx)]).then(([,buffer])=>{
      if(active!==job)return;
      if(document.hidden){finish(job,'done');return;}
      let when=ctx.currentTime+.025;
      keys.forEach((key,i)=>{
        const [offset,duration]=cues[key],source=ctx.createBufferSource();
        source.buffer=buffer;source.connect(ctx.destination);job.sources.push(source);
        if(i===keys.length-1)source.onended=()=>finish(job,'done');
        source.start(when,offset,duration);
        when+=duration+.08;
      });
    }).catch(()=>finish(job,'error'));
    return true;
  }
  const known=key=>Object.hasOwn(cues,key);
  function actionKey(text){
    const value=String(text||'').trim().toLowerCase();
    if(known(value))return value;
    if(Object.hasOwn(aliases,value))return aliases[value];
    const parser=window.JalanManeuvers;
    if(!parser)return 'follow';
    const key=parser.audioKey(null,String(text||''));
    if(key==='roundabout'){
      const ordinal=parser.roundaboutExit?.(null,String(text||''));
      if(known('roundabout-'+ordinal))return 'roundabout-'+ordinal;
    }
    return known(key)?key:(aliases[key]||'follow');
  }
  function speak(action,metres,done){
    const distance='in-'+metres,keys=[];
    // 50 m is the immediate manoeuvre prompt in JALAN's milestone policy.
    if(metres!==50&&known(distance))keys.push(distance);
    keys.push(actionKey(action));
    return play(keys,done);
  }
  const alertKeys=new Map([
    ['you are near your destination','near-destination'],['anda menghampiri destinasi','near-destination'],
    ['anda hampir tiba di destinasi','near-destination'],['anda telah tiba di destinasi','arrival'],
    ['full guidance','full-guidance'],['panduan penuh','full-guidance'],['panduan suara penuh','full-guidance'],
    ['alerts only','alerts-only'],['amaran sahaja','alerts-only'],['makluman sahaja','alerts-only'],
    ['stop reached. continuing to your destination','stop-arrival'],['stop passed. continuing to your destination','stop-passed'],
    ['recalculating route','rerouting'],['mengira semula laluan','rerouting']
  ]);
  function alert(text,done){
    const value=String(text||'').trim().toLowerCase().replace(/[.!…]+$/,'');
    if(value==='speed camera ahead in 300 metres')return play(['in-300','speed-camera'],done);
    if(value==='speed camera ahead')return play(['speed-camera'],done);
    return play([known(value)?value:(alertKeys.get(value)||'follow')],done);
  }
  return {available:!!AudioEngine,unlock,cancel,speak,alert,preview:done=>play(['preview'],done)};
 }
 window.JalanMalayAudio=player(malay,'audio/ms-guidance.mp3?v=2');
 window.JalanEnglishAudio=player(english,'audio/en-guidance.mp3?v=1');
})();
