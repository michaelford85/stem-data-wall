# 🧩 STEM Data Wall

An offline, kid-friendly interactive data game and live dashboard for a
Raspberry Pi, built for an elementary-school **STEM Career Day**.

Kids play a Jeopardy-style quiz on an iPad. Their (completely anonymous)
answers instantly become live charts on a big monitor, and the team uses those
charts to explain careers in **data, solutions architecture, technical sales,
cybersecurity, and automation**.

> 🔒 **No personal data is ever collected.** No names, no typing, no camera,
> no microphone. See the [Privacy by design](#) section (coming together as
> the project is built).

## Status

This README is a work in progress and grows as the project is built. Full
hardware list, architecture diagram, quick-start guides, kiosk-locking
instructions, wiring diagram, and the privacy section are added in the final
milestone.

## Quick start (laptop / Docker only)

```bash
cp .env.example .env     # then edit the passwords + PIN
make up                  # build + start app, MongoDB, and Grafana
```

Then open:

| Screen | URL | Who uses it |
| --- | --- | --- |
| Monitor (kiosk) | <http://localhost:8080/> | The crowd-facing big screen |
| Controller | <http://localhost:8080/controller> | The iPad |
| Results | <http://localhost:8080/results> | Live charts |
| Admin | <http://localhost:8080/admin> | Staff (PIN protected) |
| Staff | <http://localhost:8080/staff> | Laptop hub + QR code |
| Grafana | <http://localhost:3000/> | Engineer dashboard |

## License

[MIT](LICENSE)
