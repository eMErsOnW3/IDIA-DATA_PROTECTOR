// Shared by the content-script bridge and isolated PDF runtime. MiB = 1024² bytes.
(() => {
  'use strict';
  const hard=Object.freeze({file:25*1024*1024,pages:50,pagePixels:8_000_000,
    canvasDimension:8192,sourceImagePixels:24_000_000,canvasBytes:32*1024*1024,
    items:10000,pageOperators:100000,pageCharacters:200000,characters:1000000,findings:2000,
    output:40*1024*1024,scale:2});
  // Total rendered pixels and OCR count primarily measure sequential work, not
  // simultaneously resident canvases. They require consent rather than rejection.
  const soft=Object.freeze({file:10*1024*1024,pages:20,ocrPages:25,
    totalPixels:60_000_000,estimatedSeconds:60});
  const time=Object.freeze({startup:10000,inspect:120000,ocrPage:90000,
    scanBase:30000,textPage:5000,ocrPageBudget:120000,maxScan:3600000,
    buildBase:30000,buildPage:15000,maxBuild:900000});
  // Provisional cold-start estimate, deliberately above the measured fixture rate.
  // Device-local actual timings are returned for benchmarking, never persisted.
  const estimate=Object.freeze({startupSeconds:2,ocrSecondsPerMegapixel:1,textSecondsPerPage:0.05});
  function summarize({fileBytes,pages,ocrPages,totalPixels,ocrPixels}) {
    const estimatedSeconds=Math.ceil((ocrPages?estimate.startupSeconds:0)+ocrPixels/1e6*estimate.ocrSecondsPerMegapixel+pages*estimate.textSecondsPerPage);
    const reasons=[];
    if(fileBytes>soft.file)reasons.push('file size');
    if(pages>soft.pages)reasons.push('page count');
    if(ocrPages>soft.ocrPages)reasons.push('OCR page count');
    if(totalPixels>soft.totalPixels)reasons.push('rendered pixel workload');
    if(estimatedSeconds>soft.estimatedSeconds)reasons.push('estimated scanning time');
    return {fileBytes,pages,ocrPages,totalPixels,ocrPixels,estimatedSeconds,reasons,requiresConfirmation:reasons.length>0};
  }
  const scanDeadline=plan=>Math.min(time.maxScan,time.scanBase+plan.pages*time.textPage+plan.ocrPages*time.ocrPageBudget);
  const buildDeadline=pages=>Math.min(time.maxBuild,time.buildBase+pages*time.buildPage);
  globalThis.IDIAPdfLimits=Object.freeze({hard,soft,time,estimate,summarize,scanDeadline,buildDeadline});
})();
