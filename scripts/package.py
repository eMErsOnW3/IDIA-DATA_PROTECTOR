"""Build a reproducible runtime ZIP using only the Python standard library."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent.parent
FILES = """
manifest.json background.js content.js decode.css decode.html decode.js
design-system.css detectors.js engine.js fileGuard.js manualDecode.css
manualDecode.js panelFileDecode.js popup.css popup.html popup.js
responseModal.css responseModal.html responseModal.js responseTree.js
reviewUI.js styles.css tokenSyntax.js tokenVault.js vaultClient.js
README.md SOURCE_NOTICE.md THIRD_PARTY_NOTICES.md
""".split()
FOLDERS = ("fileProcessors", "siteAdapters", "lib")


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    files = [ROOT / name for name in FILES]
    for folder in FOLDERS:
        files.extend(p for p in (ROOT / folder).rglob("*") if p.is_file())
    for path in files:
        if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(ROOT):
            raise ValueError(f"Invalid distribution file: {path}")
        if any(part.lower() in {"tests", "node_modules", ".git", "__pycache__"} for part in path.relative_to(ROOT).parts):
            raise ValueError(f"Development material in runtime directory: {path}")
    names = {p.relative_to(ROOT).as_posix() for p in files}
    required = [manifest["background"]["service_worker"], manifest["action"]["default_popup"]]
    for entry in manifest["content_scripts"]:
        required.extend(entry.get("js", []) + entry.get("css", []))
    for entry in manifest["web_accessible_resources"]:
        required.extend(entry["resources"])
    missing = set(required) - names
    if missing:
        raise ValueError(f"Missing manifest resources: {sorted(missing)}")
    for asset in json.loads((ROOT / "lib/ocr-assets.json").read_text(encoding="utf-8")):
        data = (ROOT / asset["path"]).read_bytes()
        if len(data) != asset["bytes"] or hashlib.sha256(data).hexdigest() != asset["sha256"]:
            raise ValueError(f"OCR asset integrity mismatch: {asset['path']}")
    output = ROOT / "dist" / f"IDIA-BrowserExtension-v{manifest['version']}.zip"
    output.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(files):
            entry = zipfile.ZipInfo(path.relative_to(ROOT).as_posix(), (2020, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None or "manifest.json" not in archive.namelist():
            raise ValueError("Distribution ZIP verification failed")
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(".zip.sha256").write_text(f"{digest}  {output.name}\n", encoding="ascii")
    print(f"Created {output.name}: {len(files)} files, {output.stat().st_size:,} bytes")
    print(f"SHA-256: {digest}")


if __name__ == "__main__":
    main()
