// Exact, opaque identifiers. No decoding heuristics and no privacy detection rules.
(() => {
  'use strict';
  const pattern='\\[IDIA_([A-Z][A-Z0-9]{0,23})_([A-F0-9]{32})\\]';
  const randomId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
  function find(text){return [...text.matchAll(new RegExp(pattern,'g'))].map(m=>({id:`token:${m.index}`,type:m[1],label:'Protected '+m[1].toLowerCase(),value:m[0],start:m.index,end:m.index+m[0].length,replacement:m[0]}));}
  const tokens=text=>[...new Set(find(text).map(f=>f.value))];
  const exact=value=>typeof value==='string'&&new RegExp('^'+pattern+'$').test(value);
  const likeTokens=text=>[...new Set(text.match(/\[IDIA_[A-Za-z0-9_]{1,100}\]/g)||[])];
  const unknownLike=(text,known)=>likeTokens(text).filter(t=>!known.includes(t)).length;
  globalThis.IDIATokenSyntax=Object.freeze({randomId,find,tokens,exact,likeTokens,unknownLike});
})();
