// A policy belongs to one route. Optional permissions apply to individual legs.
(() => {
 'use strict';
 function check(choices,policy){
  if(!policy)return choices;
  let firstConflict=null,allConflicts=true;
  const allowed=[];
  for(const route of choices){
   const stop=route.pinnedStop;
   const legs=stop?[['toStop',stop.inboundTolls],['onward',stop.onward.tolls]]:[['onward',route.tolls]];
   const restricted=legs.filter(([leg])=>!policy[leg]);
   const conflict=restricted.find(([,paid])=>paid===true);
   if(conflict){firstConflict??=conflict[0];continue;}
   if(restricted.some(([,paid])=>paid!==false)){allConflicts=false;continue;}
   route.tollPolicy={...policy};
   if(stop)stop.onward.tollPolicy=policy.onward?{onward:true}:{};
   allowed.push(route);
  }
  if(allowed.length)return allowed;
  const error=new Error('Could not confirm a toll-free route.');
  error.tollConflict=allConflicts&&firstConflict;
  throw error;
 }
 const api={check};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else window.JalanTollPolicy=api;
})();
