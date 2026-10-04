# Third-party components

IDIA bundles these browser distributions and data files locally. Their upstream licenses remain applicable independently of the source-availability notice for IDIA's own code.

| Component | Bundled version | Purpose | License files |
| --- | --- | --- | --- |
| JSZip | 3.10.1 | Read/write Office ZIP containers | `lib/JSZip-LICENSE.markdown` (MIT option) |
| Mozilla PDF.js | 5.6.205, legacy browser build | PDF rendering and text extraction | `lib/pdfjs/LICENSE` (Apache-2.0) |
| PDF.js character maps | Bundled distribution | PDF character mapping | `lib/pdfjs/cmaps/LICENSE` |
| Foxit / Liberation fonts | Bundled PDF.js distribution | Local PDF font rendering | `lib/pdfjs/standard_fonts/LICENSE_FOXIT`, `LICENSE_LIBERATION` |
| pdf-lib | 1.17.1 | Create fresh image-only PDFs | `lib/pdf-lib/LICENSE.md` (MIT) |
| Tesseract.js | 7.0.0 | Browser OCR worker | `lib/tesseract/LICENSE.md` (Apache-2.0), `*.LICENSE.txt` notices |
| tesseract.js-core | 7.0.0 | Local LSTM OCR WASM engine | `lib/tesseract/CORE-LICENSE` (Apache-2.0) |
| tessdata_fast | Revision `87416418657359cb625c412a48b6e1d6d41c29bd` | English, Simplified Chinese, Japanese OCR data | `lib/tessdata/LICENSE` (Apache-2.0) |

Upstream projects: [JSZip](https://github.com/Stuk/jszip), [PDF.js](https://github.com/mozilla/pdf.js), [pdf-lib](https://github.com/Hopding/pdf-lib), [Tesseract.js](https://github.com/naptha/tesseract.js), [Tesseract.js core](https://github.com/naptha/tesseract.js-core), [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast).

OCR file sizes and SHA-256 digests are recorded in `lib/ocr-assets.json`. Preserve all bundled license and notice files when redistributing third-party components.
