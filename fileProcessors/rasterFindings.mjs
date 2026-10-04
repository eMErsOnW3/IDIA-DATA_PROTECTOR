// One detector-to-region mapping for PDF text, PDF OCR, and standalone image OCR.
export function mapFindings(groups,{prefix,pageIndex=0,source,quality,sourceHint,wholeLine=false}) {
  return groups.flatMap((group,textGroupIndex)=>IDIADetectors.detectSensitiveInfo(group.text).map(finding=>{
    const spans=group.spans.filter(span=>span.start<finding.end&&span.end>finding.start);
    if(!spans.length)throw new Error('A finding could not be mapped to pixels.');
    let boxes=spans.map(span=>({...span.box}));
    if(source==='ocr'&&(wholeLine||!quality.reliable)){
      const all=group.spans.map(span=>span.box),x=Math.min(...all.map(b=>b.x)),y=Math.min(...all.map(b=>b.y));
      boxes=[{x,y,width:Math.max(...all.map(b=>b.x+b.width))-x,height:Math.max(...all.map(b=>b.y+b.height))-y}];
    }
    return {...finding,id:`${prefix}:${pageIndex}:${textGroupIndex}:${finding.id}`,pageIndex,textGroupIndex,
      source,confidence:quality?.confidence,boxes,itemIndexes:spans.map(span=>span.itemIndex),sourceHint};
  }));
}
export function selectedFindings(snapshot,ids) {
  if(!snapshot||!Array.isArray(ids))throw new Error('The review is no longer active.');
  const selected=[...new Set(ids)].map(id=>{const finding=snapshot.byId.get(id);if(!finding)throw new Error('Invalid selection.');return finding;});
  const chosenGroups=new Map();
  for(const f of selected){const key=`${f.pageIndex}:${f.textGroupIndex}`;if(!chosenGroups.has(key))chosenGroups.set(key,[]);chosenGroups.get(key).push(f);}
  // Validate canonical offsets and values using the existing sanitizer. Raster
  // output uses rectangles, never replacement text or a hidden OCR text layer.
  for(const chosen of chosenGroups.values())IDIAEngine.sanitizeSelected(snapshot.pages[chosen[0].pageIndex].groups[chosen[0].textGroupIndex].text,chosen);
  return selected;
}
