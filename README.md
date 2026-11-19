# GTA 6 Cover Art Studio

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/kysoog/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/kysoog/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Browser cover-art studio for the make.fun **Make GTA 6 Cover Art** bounty.
Compose a Vice-City-grade key art on four canvases (16:9 cover, editor view,
poster 2:3, square 1:1), layer skyline / sun / palm silhouettes / logo type,
grade the palette, then export PNG or JPEG at print size.

Entry for [make.fun](https://make.fun).

## Run

```bash
node tools/serve.ts 8080     # http://127.0.0.1:8080
```

Open the page, pick a canvas, drag layers, hit **Export PNG**.

## Layout

- `app/` — static UI (index.html, style.css, studio.js, layers)
- `vendor/` — pinned fonts and helper modules
- `tools/` — static server, screenshot capture
- `screenshots/` — the four entry screenshots (cover, editor, portrait, square)
- `main.ts` — node22 entrypoint

MIT.
