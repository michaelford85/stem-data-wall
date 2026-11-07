# Vendored front-end assets (offline, no CDNs)

Everything here is committed to the repo so the browser pages work with the
**internet unplugged**. Nothing in the app ever loads from a CDN.

| File | What it is | Version | License |
| --- | --- | --- | --- |
| `echarts.min.js` | Apache ECharts charting library | 5.5.1 | Apache-2.0 |
| `qrcode.min.js` | `qrcodejs` QR-code generator (staff page) | 1.0.0 | MIT |
| `fonts/fredoka-*.woff2` | Fredoka display font (weights 400–700, latin) | Fontsource 5.3.0 | SIL OFL 1.1 |
| `fonts/fredoka.css` | `@font-face` rules pointing at the woff2 files | — | — |

## The Socket.IO browser client

The Socket.IO **client** is *not* vendored here because it is served by our own
app at `/socket.io/socket.io.js` (the `socket.io` npm package ships it). That is
still fully local — it comes from the Pi, not a CDN.

## Emoji

Answer emoji are plain Unicode characters, drawn by the operating system's emoji
font. On the Raspberry Pi kiosk, the Ansible `common` role installs
`fonts-noto-color-emoji` so they render in full color offline.

## Updating an asset

Re-download the same version into this folder and commit it. If you bump a
version, update the table above.
