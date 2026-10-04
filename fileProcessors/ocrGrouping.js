// Pure geometry/text helpers. No privacy patterns: the existing detector owns those.
(() => {
  'use strict';
  const CONFIG = Object.freeze({maxWords:10000, minTextCharacters:8,
    minMeaningfulRatio:0.55, minWordConfidence:60, minPageConfidence:70,
    minRecognizedCharacters:12, maxLowConfidenceFraction:0.25, padding:4});
  const meaningful = text => (text.match(/[\p{L}\p{N}]/gu)||[]).length;
  function hasUsableTextLayer(text) {
    const compact=text.replace(/\s/g,'');
    return meaningful(text)>=CONFIG.minTextCharacters && meaningful(text)/Math.max(1,compact.length)>=CONFIG.minMeaningfulRatio
      && !/[\u0000\ufffd]/u.test(text);
  }
  function groupWords(words, width, height) {
    if(words.length>CONFIG.maxWords)throw new Error('Too many OCR words.');
    const entries=words.filter(w=>w.text?.trim()).map((w,itemIndex)=>{
      const b=w.bbox;
      if(!b||![b.x0,b.y0,b.x1,b.y1].every(Number.isFinite)||b.x0<0||b.y0<0||b.x1>width+1||b.y1>height+1||b.x1<=b.x0||b.y1<=b.y0)throw new Error('Unreliable OCR coordinates.');
      return {text:w.text.trim(),confidence:Number.isFinite(w.confidence)?w.confidence:0,itemIndex,
        box:{x:b.x0,y:b.y0,width:b.x1-b.x0,height:b.y1-b.y0}};
    }).sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x);
    const lines=[];
    for(const word of entries){
      const b=word.box;
      const line=lines.find(l=>Math.min(l.bottom,b.y+b.height)-Math.max(l.top,b.y)>=Math.min(l.bottom-l.top,b.height)*0.5);
      if(line){line.words.push(word);line.top=Math.min(line.top,b.y);line.bottom=Math.max(line.bottom,b.y+b.height);}
      else lines.push({top:b.y,bottom:b.y+b.height,words:[word]});
    }
    const groups=[];
    for(const line of lines.sort((a,b)=>a.top-b.top)){
      let group={text:'',spans:[]},previous;
      const finish=()=>{if(group.spans.length)groups.push(group);group={text:'',spans:[]};previous=null;};
      for(const word of line.words.sort((a,b)=>a.box.x-b.box.x)){
        const gap=previous?word.box.x-previous.box.x-previous.box.width:0;
        if(previous&&gap>Math.max(previous.box.height,word.box.height)*4)finish();
        if(previous){
          // CJK OCR often separates each ideograph; joining those restores addresses.
          const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(previous.text)||/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word.text);
          if(!cjk&&gap>Math.min(previous.box.height,word.box.height)*0.12)group.text+=' ';
        }
        const start=group.text.length;group.text+=word.text;
        group.spans.push({...word,start,end:group.text.length});previous=word;
      }
      finish();
    }
    return groups;
  }
  function reliability(groups, confidence) {
    const spans=groups.flatMap(g=>g.spans),text=groups.map(g=>g.text).join('\n');
    const low=spans.filter(w=>w.confidence<CONFIG.minWordConfidence).length/Math.max(1,spans.length);
    const reliable=meaningful(text)>=CONFIG.minRecognizedCharacters && hasUsableTextLayer(text)
      && Number.isFinite(confidence)&&confidence>=CONFIG.minPageConfidence&&low<=CONFIG.maxLowConfidenceFraction;
    return {reliable,confidence:Number.isFinite(confidence)?confidence:0,characters:meaningful(text),lowConfidenceFraction:low};
  }
  function mapBox(box, sourceViewport, targetViewport) {
    const points=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]]
      .map(p=>targetViewport.convertToViewportPoint(...sourceViewport.convertToPdfPoint(...p)));
    if(!points.flat().every(Number.isFinite))throw new Error('Unreliable OCR mapping.');
    const pad=Math.max(CONFIG.padding,box.height*0.12);
    const x=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0]))-pad));
    const y=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1]))-pad));
    const right=Math.min(Math.ceil(targetViewport.width),Math.ceil(Math.max(...points.map(p=>p[0]))+pad));
    const bottom=Math.min(Math.ceil(targetViewport.height),Math.ceil(Math.max(...points.map(p=>p[1]))+pad));
    if(right<=x||bottom<=y)throw new Error('Empty OCR region.');
    return {x,y,width:right-x,height:bottom-y};
  }
  globalThis.IDIAOcrGeometry=Object.freeze({CONFIG,hasUsableTextLayer,groupWords,reliability,mapBox});
})();
