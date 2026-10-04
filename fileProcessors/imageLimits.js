// Image cost is bounded before decoding, then verified against decoded geometry.
(() => {
  'use strict';
  const hard=Object.freeze({file:25*1024*1024,pixels:8_000_000,dimension:8192,characters:200000,findings:2000,output:40*1024*1024});
  const soft=Object.freeze({file:10*1024*1024,pixels:4_000_000});
  const time=Object.freeze({startup:10000,inspect:15000,scan:120000,ocr:90000,build:30000});
  const jpegQuality=0.94;
  function dimensions(width,height) {
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||Math.max(width,height)>hard.dimension||width*height>hard.pixels)
      throw new Error('This image exceeds the decoded size limit (8 million pixels / 8192 pixels per dimension).');
  }
  globalThis.IDIAImageLimits=Object.freeze({hard,soft,time,jpegQuality,dimensions});
})();
