/* Conservative fallback trigger, not a guarantee of destination correctness. */
(function(root){
 'use strict';
 const tokens=text=>String(text||'').normalize('NFC').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').normalize('NFC').match(/[\p{L}\p{N}\p{M}]+/gu)||[];
 function matches(query,place){
  const wanted=tokens(query),available=tokens(place.name+' '+place.address);
  // Preserve short distinctive brands such as Q. Only longer partial words
  // may prefix-match, so Zaynas Bistro cannot satisfy Q Bistro Taman Melati.
  return wanted.length>0&&wanted.every(word=>available.some(candidate=>candidate===word||(word.length>=3&&candidate.startsWith(word))));
 }
 const api=Object.freeze({matches});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.JalanDestinationMatch=api;
})(typeof window==='undefined'?globalThis:window);
