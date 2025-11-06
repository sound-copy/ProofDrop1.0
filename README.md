# ProofDrop v1
[![Codex Smoke](https://img.shields.io/badge/Codex%20Smoke-running-brightgreen)](https://github.com/sound-copy/ProofDrop1.0/actions?query=workflow%3A%22Codex+Smoke%22)

Zero-cost invisible watermark app (Electron). Drag a file in; get `_protected`, `_manifest.json`, and an OpenTimestamps proof next to the original.

## Supported inputs
- Images: `.jpg`, `.png`
- Video: `.mp4`, `.mov`
- Audio: `.wav`, `.mp3`

## What it does
1. Computes SHA‑256 of your original file.
2. Embeds that SHA as an invisible watermark (images/frames via Stability‑AI, audio via audiowmark if present).
3. Writes a `*_manifest.json` (creator: “Sound Recording Copyright”, date, license, canonical URL placeholder).
4. Tries to timestamp the manifest with OpenTimestamps. If the local `ots` tool isn’t available, it writes `*.ots.pending` (you can stamp later on opentimestamps.org).
5. For video, re‑encodes to your delivery spec (1080×1920 or 1920×1080; H.264 High@4.1; ~10 Mbps constrained VBR; GOP=2×fps; yuv420p; AAC 48kHz 192 kbps stereo).

## Quick start
```bash
# 1) Install Node.js 18+
# 2) In project folder
npm install

# 3) Install Python deps for image/frame watermarking
python3 -m pip install --upgrade pip
python3 -m pip install opencv-python imwatermark opentimestamps-client

# 4) Dev run
npm start

# 5) Build Mac app (.dmg)
npm run build
```

## Notes
- Audio watermark: If `audiowmark` isn’t installed, the app still processes audio but leaves a `NEEDS_AUDIOWMARK.txt` reminder and embeds the code in metadata as a weak fallback. Recommended: install via MacPorts `sudo port install audiowmark`.
- Timestamps: For fully automatic stamping, install `opentimestamps-client` so the `ots` CLI is available; otherwise use the website and attach the `.ots` later.
- Python: If your system Python isn’t accessible as `python3`, set `PYTHON_BIN` env var before launch.
