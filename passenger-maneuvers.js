// Passenger guidance keeps the provider step and the original English text.
// Render either language from that same step when the language changes.
(() => {
 'use strict';
 const sides={left:'kiri',right:'kanan'};
 const turn={
   left:'Belok kiri',right:'Belok kanan',straight:'Teruskan perjalanan',
   'slight left':'Belok sedikit ke kiri','slight right':'Belok sedikit ke kanan',
   'sharp left':'Belok tajam ke kiri','sharp right':'Belok tajam ke kanan',
   uturn:'Buat pusingan U'
 };
 const ordinal=['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth'];
 const text=v=>typeof v==='string'?v.trim():'';
 const lowerFirst=s=>s.charAt(0).toLowerCase()+s.slice(1);
 const sideOf=s=>sides[String(s||'').match(/\b(left|right)\b/i)?.[1].toLowerCase()]||'';
 const spokenSide=phrase=>{
   const directional=phrase.match(/\b(left|right) (?:exit|lane|side|turn)\b|\b(?:on (?:your|the)|to (?:your|the)|turn|bear|keep|merge) (left|right)\b/i);
   return sides[(directional?.[1]||directional?.[2]||'').toLowerCase()]||'';
 };
 const sideSuffix=side=>side?' di sebelah '+side:'';
 function ordinalNumber(value){
   const s=String(value??'').trim().toLowerCase(),n=ordinal.indexOf(s)+1;
   return n||(s.match(/^([1-9]\d*)(?:st|nd|rd|th)?$/)?.[1]||'');
 }
 const roundExit=n=>'Di bulatan, ambil susur keluar '+(String(n)==='1'?'pertama':'ke-'+n);
 const destination='Anda telah tiba di destinasi';
 const waypoint='Anda telah tiba di persinggahan';
 const direct={
   STRAIGHT:'Teruskan perjalanan',DEPART:'Mulakan perjalanan',ARRIVE:destination,
   ARRIVE_LEFT:destination+' di sebelah kiri',ARRIVE_RIGHT:destination+' di sebelah kanan',
   MAKE_UTURN:turn.uturn,TRY_MAKE_UTURN:'Buat pusingan U apabila keadaan mengizinkan',
   ENTER_MOTORWAY:'Masuk ke lebuh raya',ENTER_FREEWAY:'Masuk ke lebuh raya',ENTER_HIGHWAY:'Masuk ke lebuh raya',
   ENTRANCE_RAMP:'Ambil susur masuk',TAKE_FERRY:'Naiki feri',FOLLOW:'Ikut',
   SWITCH_PARALLEL_ROAD:'Beralih ke jalan selari',SWITCH_MAIN_ROAD:'Beralih ke jalan utama',
   WAYPOINT_REACHED:waypoint,WAYPOINT_LEFT:waypoint+' di sebelah kiri',WAYPOINT_RIGHT:waypoint+' di sebelah kanan'
 };
 function numberedRoundabout(step,phrase){
   const written=phrase.match(/\b(\d+(?:st|nd|rd|th)|[a-z]+)\s+exit\b/i)?.[1];
   const numbered=phrase.match(/\bexit\s+(?:no\.?\s*)?(\d+)\b/i)?.[1];
   return ordinalNumber(step.roundaboutExitNumber)||ordinalNumber(step.maneuver?.exit)||ordinalNumber(written)||ordinalNumber(numbered);
 }
 function roundabout(step,phrase,code=''){
   if(/^(?:leave|exit) (?:the )?(?:roundabout|rotary)\b/i.test(phrase)||/^exit (?:roundabout|rotary)$/.test(code))
     return 'Keluar dari bulatan';
   const n=numberedRoundabout(step,phrase);
   if(n)return roundExit(n);
   if(/^enter (?:the )?(?:roundabout|rotary)\b/i.test(phrase))return 'Masuk ke bulatan';
   const side=sideOf(code.replace(/_/g,' '))||spokenSide(phrase);
   if(side)return 'Di bulatan, ambil susur keluar di sebelah '+side;
   if(code==='ROUNDABOUT_BACK'||/go around/i.test(phrase))return 'Ikut bulatan untuk berpatah balik';
   if(code==='ROUNDABOUT_CROSS'||/cross|straight/i.test(phrase))return 'Teruskan perjalanan merentasi bulatan';
   return 'Ikut bulatan';
 }
 function highwayExit(step,phrase,side){
   const number=text(step.exitNumber)||text(step.exits)||
     phrase.match(/\bexit\s+(?:(?:no\.?|number)\s*)?(\d+[a-z]?(?:\s*[-,]\s*\d+[a-z]?)*)\b/i)?.[1];
   return 'Ambil susur keluar'+(number?' '+number:'')+sideSuffix(side);
 }
 function tomtom(code,step,phrase){
   if(direct[code])return direct[code];
   const pair=code.match(/^(KEEP|BEAR|TURN|SHARP)_(LEFT|RIGHT)$/);
   if(pair){
     const side=pair[2].toLowerCase();
     if(pair[1]==='KEEP')return 'Kekal di sebelah '+sides[side];
     const degree=({BEAR:'slight ',SHARP:'sharp '})[pair[1]]||'';
     return turn[degree+side];
   }
   if(code.startsWith('ROUNDABOUT_'))return roundabout(step,phrase,code);
   if(/^TAKE_EXIT$|^MOTORWAY_EXIT_(LEFT|RIGHT)$/.test(code))
     return highwayExit(step,phrase,sideOf(code.replace(/_/g,' '))||spokenSide(phrase));
   return '';
 }
 function osrm(type,step,phrase){
   const modifier=text(step.maneuver?.modifier).toLowerCase(),side=sideOf(modifier);
   if(type==='turn'||type==='end of road'||type==='continue')
     return turn[modifier]||(type==='continue'?'Teruskan perjalanan':'');
   if(type==='new name'||type==='notification')return 'Teruskan perjalanan';
   if(type==='depart')return 'Mulakan perjalanan';
   if(type==='arrive')return destination+sideSuffix(side);
   if(type==='roundabout turn')return 'Di bulatan, '+lowerFirst(turn[modifier]||'Ikut bulatan');
   if(/^(?:exit )?(?:roundabout|rotary)$/.test(type))return roundabout(step,phrase,type);
   if(type==='on ramp')return 'Ambil susur masuk'+sideSuffix(side);
   if(type==='off ramp')return highwayExit(step,phrase,side);
   if(type==='merge')return 'Masuk ke aliran trafik'+(side?' di sebelah '+side:'');
   if(type==='fork')return side?'Di persimpangan, ikut cabang '+side:'Ikut cabang laluan';
   if(type==='use lane')return side?'Gunakan lorong '+side:'Gunakan lorong yang ditunjukkan';
   return turn[modifier]||'';
 }
 // Current TomTom responses include structured names. The older text-only
 // responses can supply the same road, signpost, and exit number in the message.
 function parts(source,step){
   let message=source.trim().replace(/[.!]$/,'');
   let named=text(step.street)||text(step.name);
   if(named===text(step.message)||/^(?:road|unnamed road|next road)$/i.test(named))named='';
   const refs=(Array.isArray(step.roadNumbers)?step.roadNumbers:[step.ref]).map(text).filter(Boolean);
   const signpost=text(step.signpostText)||text(step.destinations);
   // Protect complete metadata labels before looking for "towards" or "onto".
   // These words can occur inside a street name or a signpost.
   const labels=[...new Set([named,signpost,...refs].filter(Boolean))].sort((a,b)=>b.length-a.length);
   for(const [i,label] of labels.entries())message=message.split(label).join('\x01'+i+'\x02');
   const restore=s=>s.replace(/\x01(\d+)\x02/g,(token,n)=>labels[n]??token);
   const sign=message.match(/\s+towards?\s+(.+)$/i);
   const command=sign?message.slice(0,sign.index):message;
   const via=command.match(/\s+onto\s+(.+)$/i)||
     command.match(/\s+to (?:stay|remain|continue) on\s+(.+)$/i)||
     command.match(/^(?:follow|continue (?:along|on)|head (?:north|south|east|west)(?:east|west)? on)\s+(.+)$/i);
   const road=via?restore(via[1]):named;
   const missingRefs=refs.filter(ref=>!road.includes(ref));
   const prefix=via?command.slice(0,via.index||command.length-via[1].length).trim():command;
   return {prefix:restore(prefix),road:[road,...missingRefs].filter(Boolean).join(' / '),
     toward:signpost||(sign?restore(sign[1]):'')};
 }
 function legacy(phrase,step){
   let m;
   if(/^(?:at |cross |go around |enter |exit |leave )?(?:the )?(?:roundabout|rotary)\b/i.test(phrase))
     return roundabout(step,phrase);
   if(/^take (?:the )?(?:(?:left|right) )?exit\b/i.test(phrase))return highwayExit(step,phrase,spokenSide(phrase));
   if(/^take (?:the )?(?:entrance )?ramp\b/i.test(phrase))return 'Ambil susur masuk'+sideSuffix(spokenSide(phrase));
   if(/^(?:(?:make|take|perform|try to make) (?:a |an )?)?u[ -]?turn\b/i.test(phrase))
     return /^try/i.test(phrase)?direct.TRY_MAKE_UTURN:turn.uturn;
   if((m=phrase.match(/^(?:keep|stay) (?:to (?:the )?)?(left|right)\b/i)))return 'Kekal di sebelah '+sides[m[1].toLowerCase()];
   if((m=phrase.match(/^(?:(?:turn|bear|make (?:a |an )?)\s*)?(?:(slightly|slight|sharply|sharp)\s+)?(left|right)(?:\s+turn)?$/i))){
     const degree=m[1]?m[1].toLowerCase().replace(/ly$/,'')+' ':/^bear\b/i.test(phrase)?'slight ':'';
     return turn[degree+m[2].toLowerCase()];
   }
   if(/^arriv(?:e|ed) at (?:your |the )?destination|^you have arrived\b/i.test(phrase))return destination+sideSuffix(spokenSide(phrase));
   if(/^you have reached (?:the |your )?(?:waypoint|stop)\b/i.test(phrase))return waypoint+sideSuffix(spokenSide(phrase));
   if(/^take (?:the )?(?:motorway|freeway|highway)\b/i.test(phrase))return direct.ENTER_HIGHWAY;
   if(/^take (?:the )?ferry\b/i.test(phrase))return direct.TAKE_FERRY;
   if(/^switch to (?:the )?parallel road$/i.test(phrase))return direct.SWITCH_PARALLEL_ROAD;
   if(/^switch to (?:the )?main road$/i.test(phrase))return direct.SWITCH_MAIN_ROAD;
   if(/^(?:follow|continue on|continue along)$/i.test(phrase))return 'Ikut';
   if(/^merge\b/i.test(phrase))return 'Masuk ke aliran trafik'+sideSuffix(spokenSide(phrase));
   if(/^(?:go |keep |continue )?straight(?: (?:on|ahead))?$|^continue$/i.test(phrase))return direct.STRAIGHT;
   if(/^leave$|^depart$/i.test(phrase))return direct.DEPART;
   const heading=phrase.match(/^head (north(?:east|west)?|south(?:east|west)?|east|west)(?: on)?$/i);
   if(heading){
     const compass={north:'utara',south:'selatan',east:'timur',west:'barat',northeast:'timur laut',
       northwest:'barat laut',southeast:'tenggara',southwest:'barat daya'};
     return 'Bergerak ke arah '+compass[heading[1].toLowerCase()];
   }
   return '';
 }
 function commandFor(step,prefix){
   const code=text(step.maneuver?.type);
   // Older adapters used a lower-case "continue" as a missing-code sentinel
   // while retaining the authoritative human-readable instruction as modifier.
   if(code==='continue'&&text(step.message)&&step.maneuver?.modifier===step.message){
     const described=legacy(prefix,step);
     if(described)return described;
     return '';
   }
   const tt=/^[A-Z][A-Z_]+$/.test(code);
   let command=tt?tomtom(code,step,prefix):osrm(code.toLowerCase(),step,prefix);
   return command||legacy(prefix,step);
 }
 function malay(step,source){
   const {prefix,road,toward}=parts(source,step);
   let command=commandFor(step,prefix);
   if(!command)return '';
   if(command.startsWith(destination)||command.startsWith(waypoint))return command;
   const name=/^(?:unnamed road|next road|road)$/i.test(road)?'':road==='destination'?'destinasi':road;
   if(command==='Ikut')command+=name?' '+name:' laluan yang dipilih';
   else if(name)command+=(command===direct.STRAIGHT||command==='Mulakan perjalanan'?' di ':' ke ')+name;
   if(toward)command+=' menghala ke '+(/^(?:the |your )?destination$/i.test(toward)?'destinasi':toward);
   return command;
 }
 function translateText(english){
   if(typeof english!=='string'||!english)return english;
   const distance=english.match(/^(?:In )?(\d+(?:[.,]\d+)?)\s*(km|m|met(?:er|re)s?|kilomet(?:er|re)s?)\s*[:,]\s*(.+)$/i);
   if(distance){
     const action=translateText(distance[3]);
     if(action===distance[3])return english;
     const unit=({m:'m',km:'km'})[distance[2].toLowerCase()]||(/^k/i.test(distance[2])?'kilometer':'meter');
     return 'Dalam '+distance[1]+' '+unit+', '+lowerFirst(action);
   }
   return malay({},english)||english;
 }
 function action(step,englishAction,language){
   if(!/^ms(?:[-_]|$)/i.test(language))return englishAction;
   const source=text(step?.message)||text(englishAction);
   return malay(step||{},source)||'Ikut laluan yang dipilih';
 }
 // Keep recorded prompts independent of variable road and sign names: a road
 // named "Right Avenue" must never turn an instruction to continue into a turn.
 const recordedCommands={
   ...Object.fromEntries(Object.entries(turn).map(([modifier,command])=>[command,
     modifier==='straight'?'continue':modifier.replace(/ /g,'-')])),
   'Kekal di sebelah kiri':'keep-left','Kekal di sebelah kanan':'keep-right',
   'Di persimpangan, ikut cabang kiri':'keep-left','Di persimpangan, ikut cabang kanan':'keep-right',
   'Gunakan lorong kiri':'keep-left','Gunakan lorong kanan':'keep-right',
   [direct.TRY_MAKE_UTURN]:'uturn',[direct.TAKE_FERRY]:'ferry',[direct.DEPART]:'depart',Ikut:'continue'
 };
 function audioKey(step,englishAction){
   const data=step||{},source=text(data.message)||text(englishAction),{prefix}=parts(source,data);
   const command=commandFor(data,prefix);
   if(recordedCommands[command])return recordedCommands[command];
   if(command.startsWith(destination))return 'arrive';
   if(command.startsWith(waypoint))return 'stop';
   if(command.includes('bulatan'))return 'roundabout';
   if(command.startsWith('Ambil susur keluar'))return 'exit';
   if(command.startsWith('Ambil susur masuk')||command===direct.ENTER_HIGHWAY)return 'ramp';
   if(command.startsWith('Masuk ke aliran trafik'))return 'merge';
   return 'generic';
 }
 function roundaboutExit(step,englishAction){
   if(audioKey(step,englishAction)!=='roundabout')return null;
   const data=step||{},source=text(data.message)||text(englishAction);
   return Number(numberedRoundabout(data,parts(source,data).prefix))||null;
 }
 const api={action,translateText,audioKey,roundaboutExit};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else window.JalanManeuvers=api;
})();
