# Bundled local runtime

This directory contains the browser libraries, workers, fonts, character maps, WebAssembly engine, and OCR models required by IDIA. No runtime CDN or model download is needed.

See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for versions and licenses. `ocr-assets.json` records OCR asset sizes and SHA-256 digests, verified during packaging.

- Keep PDF.js library and worker versions matched.
- Keep Tesseract library, worker, core JavaScript, and WASM versions matched.
- OCR includes `eng`, `chi_sim`, and `jpn` from tessdata_fast.
- Retain all upstream license and notice files.

Replacing these assets requires verifying document rendering, OCR, and protected output before release.
