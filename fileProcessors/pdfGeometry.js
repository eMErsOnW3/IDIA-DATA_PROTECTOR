// Shared by the isolated PDF runtime and its tests. Coordinates are canvas pixels.
(() => {
  "use strict";
  const fail = () => { throw new Error("IDIA cannot reliably map this PDF's text to page regions. The file was not protected."); };
  function mapItem(item, style, viewport, transform) {
    if (!item.str.trim()) return null;
    if (item.dir !== "ltr" || style?.vertical || /[\u0000\ufffd]/u.test(item.str)) fail();
    const tx = transform(viewport.transform, item.transform);
    if (tx.length !== 6 || !tx.every(Number.isFinite)) fail();
    const h = Math.hypot(tx[2], tx[3]), advance = Math.hypot(tx[0], tx[1]);
    const scale = Math.hypot(viewport.transform[0], viewport.transform[1]);
    const width = item.width * scale;
    if (h < 1 || h > 500 || advance < 0.01 || !Number.isFinite(width) || width <= 0) fail();
    const dx = tx[0] / advance, dy = tx[1] / advance, ux = tx[2] / h, uy = tx[3] / h;
    // Axis-aligned text, including quarter-turn page/text rotation, is supported.
    // Skewed, vertical-writing and arbitrary-angle text fail instead of guessing.
    if (Math.abs(dx * ux + dy * uy) > 0.02 || Math.min(Math.abs(dx), Math.abs(dy)) > 0.01) fail();
    const ascent = Math.max(1.15, style?.ascent || 0), descent = Math.min(-0.35, style?.descent || 0);
    if (ascent > 2 || descent < -1) fail();
    const points = [[0, descent*h], [width, descent*h], [0, ascent*h], [width, ascent*h]]
      .map(([x,y]) => [tx[4] + dx*x + ux*y, tx[5] + dy*x + uy*y]);
    const padding = Math.max(3, h * 0.08);
    const x = Math.max(0, Math.floor(Math.min(...points.map(p=>p[0])) - padding));
    const y = Math.max(0, Math.floor(Math.min(...points.map(p=>p[1])) - padding));
    const right = Math.min(Math.ceil(viewport.width), Math.ceil(Math.max(...points.map(p=>p[0])) + padding));
    const bottom = Math.min(Math.ceil(viewport.height), Math.ceil(Math.max(...points.map(p=>p[1])) + padding));
    if (right <= x || bottom <= y) fail();
    return { str:item.str, box:{x,y,width:right-x,height:bottom-y}, h, width,
      along:tx[4]*dx+tx[5]*dy, level:tx[4]*ux+tx[5]*uy,
      direction:Math.round(Math.atan2(dy,dx)/(Math.PI/2)) };
  }
  function groupItems(items, styles, viewport, transform) {
    const mapped = items.map((item,itemIndex) => {
      if (!item.str) return null;
      const value = mapItem(item, styles[item.fontName], viewport, transform);
      return value && {...value,itemIndex};
    }).filter(Boolean);
    mapped.sort((a,b)=>a.direction-b.direction || b.level-a.level || a.along-b.along);
    const lines=[];
    for (const item of mapped) {
      let line=lines.at(-1);
      if (!line || line.direction!==item.direction || Math.abs(line.level-item.level)>Math.min(line.h,item.h)*0.3) {
        line={direction:item.direction,level:item.level,h:item.h,items:[]};lines.push(line);
      }
      line.items.push(item);
    }
    const groups=[];
    for (const line of lines) {
      line.items.sort((a,b)=>a.along-b.along);
      let group,previous;
      for (const item of line.items) {
        const gap=previous ? item.along-previous.along-previous.width : Infinity;
        if (previous && gap < -Math.min(item.h,previous.h)*0.3) fail();
        if (!group || gap>Math.max(item.h,previous.h)*1.7) {group={text:"",spans:[]};groups.push(group);}
        else if (gap>Math.min(item.h,previous.h)*0.12 && !/\s$/.test(group.text) && !/^\s/.test(item.str)) group.text+=" ";
        const start=group.text.length;group.text+=item.str;
        group.spans.push({start,end:group.text.length,itemIndex:item.itemIndex,box:item.box});previous=item;
      }
    }
    return groups;
  }
  globalThis.IDIAPdfGeometry=Object.freeze({groupItems});
})();
