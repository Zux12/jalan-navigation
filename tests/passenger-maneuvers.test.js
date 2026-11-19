'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {action,translateText,audioKey,roundaboutExit}=require('../passenger-maneuvers.js');
const tt=(type,message,attrs={})=>({maneuver:{type,modifier:message},message,...attrs});
const osrm=(type,modifier,attrs={})=>({maneuver:{type,modifier},...attrs});

test('TomTom exit keeps the highway number, street and destination sign in English or Malay',()=>{
 const original='Take exit 2 onto Persiaran Utara toward Putrajaya International Convention Center (PICC)';
 const step=tt('TAKE_EXIT',original);
 assert.equal(action(step,original,'ms'),'Ambil susur keluar 2 ke Persiaran Utara menghala ke Putrajaya International Convention Center (PICC)');
 assert.equal(action(step,original,'en'),original);
 assert.equal(audioKey(step,original),'exit');
 const second='Take exit no. 209A onto E2 towards Universiti Putra Malaysia';
 assert.equal(translateText(second),'Ambil susur keluar 209A ke E2 menghala ke Universiti Putra Malaysia');
});
test('structured roundabout and ramp instructions retain exit information',()=>{
 const round=tt('ROUNDABOUT_LEFT','At the roundabout take the exit on the left',{
   roundaboutExitNumber:3,street:'Jalan Bulatan',signpostText:'KLCC'});
 assert.equal(action(round,round.message,'ms-MY'),'Di bulatan, ambil susur keluar ke-3 ke Jalan Bulatan menghala ke KLCC');
 assert.equal(roundaboutExit(round,round.message),3);
 const ramp=osrm('off ramp','slight right',{name:'Lebuhraya PLUS',exits:'209',destinations:'Serdang'});
 assert.equal(action(ramp,'slight right onto Lebuhraya PLUS','ms'),'Ambil susur keluar 209 di sebelah kanan ke Lebuhraya PLUS menghala ke Serdang');
 assert.equal(audioKey(ramp,'slight right onto Lebuhraya PLUS'),'exit');
 assert.equal(roundaboutExit(ramp,''),null);
 const rotary={name:'Persiaran Surian',maneuver:{type:'rotary',modifier:'left',exit:1}};
 assert.equal(action(rotary,'left onto Persiaran Surian','ms'),'Di bulatan, ambil susur keluar pertama ke Persiaran Surian');
 assert.equal(translateText('At the roundabout, take the second exit onto Left Avenue'),'Di bulatan, ambil susur keluar ke-2 ke Left Avenue');
});
test('recorded directions derive from the maneuver, never the road name',()=>{
 const tests=[['BEAR_LEFT','slight-left'],['KEEP_RIGHT','keep-right'],['TURN_RIGHT','right'],
   ['SHARP_RIGHT','sharp-right'],['MAKE_UTURN','uturn'],['WAYPOINT_REACHED','stop'],
   ['ARRIVE_RIGHT','arrive'],['STRAIGHT','continue'],['SWITCH_MAIN_ROAD','generic']];
 for(const [code,key] of tests)assert.equal(audioKey(tt(code,'',{name:'Left Avenue'}),''),key);
 const straight=osrm('turn','straight',{name:'Jalan Left Avenue'});
 assert.equal(audioKey(straight,'straight onto Jalan Left Avenue'),'continue');
 assert.equal(audioKey(osrm('fork','slight left',{name:'Right Exit Road'}),''),'keep-left');
});
test('distance wording works for display and spoken guidance without translating proper names',()=>{
 assert.equal(translateText('300 m: Turn left onto Jalan Ampang'),'Dalam 300 m, belok kiri ke Jalan Ampang');
 assert.equal(translateText('In 2 kilometers, keep right onto Left Bank Road'),'Dalam 2 kilometer, kekal di sebelah kanan ke Left Bank Road');
 assert.equal(translateText('1.9 km: Take exit 209 onto Lebuhraya Kuala Lumpur Seremban toward Universiti Putra Malaysia'),
   'Dalam 1.9 km, ambil susur keluar 209 ke Lebuhraya Kuala Lumpur Seremban menghala ke Universiti Putra Malaysia');
 assert.equal(translateText('Follow Jalan Damansara/E11 towards Pusat Bandar'),'Ikut Jalan Damansara/E11 menghala ke Pusat Bandar');
 assert.equal(translateText('Continue toward destination'),'Teruskan perjalanan menghala ke destinasi');
 assert.equal(translateText('Jalan Ampang'),'Jalan Ampang');
});
test('untagged or unfamiliar instructions do not fabricate maneuvers',()=>{
 assert.equal(action(tt('FUTURE_CODE','Unknown instruction'),'Unknown instruction','ms'),'Ikut laluan yang dipilih');
 assert.equal(audioKey(tt('FUTURE_CODE','Unknown instruction'),'Unknown instruction'),'generic');
 assert.equal(translateText('Turner Road'),'Turner Road');
 assert.equal(action(null,'a made-up instruction in English','en'),'a made-up instruction in English');
 assert.equal(action(tt('KEEP_RIGHT','Keep right'),null,'ms'),'Kekal di sebelah kanan');
 assert.equal(action(tt('TRY_MAKE_UTURN','Try to make a U-turn'),null,'ms'),'Buat pusingan U apabila keadaan mengizinkan');
});
test('old TomTom responses with no maneuver code honor their retained instruction',()=>{
 const text='Turn left onto Right Bank Road',step=tt('continue',text,{name:text});
 assert.equal(action(step,text,'ms'),'Belok kiri ke Right Bank Road');
 assert.equal(audioKey(step,text),'left');
 const unknown=tt('continue','Proceed as directed by the attendant');
 assert.equal(action(unknown,unknown.message,'ms'),'Ikut laluan yang dipilih');
 assert.equal(audioKey(unknown,unknown.message),'generic');
});
test('words inside names, exit labels or signposts cannot supply a turn side or a road connector',()=>{
 const name='Road towards The Right Bank',sign='Pavilion onto Left Plaza';
 const english='Take exit 13-15 onto '+name+' towards '+sign;
 const step=tt('TAKE_EXIT',english,{street:name,signpostText:sign,roadNumbers:['E2'],exitNumber:'13-15'});
 assert.equal(action(step,english,'ms'),'Ambil susur keluar 13-15 ke '+name+' / E2 menghala ke '+sign);
 assert.equal(audioKey(step,english),'exit');
 const unknown=osrm('new provider maneuver','slight left',{name:'Right Exit Road'});
 assert.equal(action(unknown,'unused','ms'),'Belok sedikit ke kiri ke Right Exit Road');
 assert.equal(audioKey(unknown,''),'slight-left');
});
