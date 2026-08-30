# Queue Ticket System (self-hosted)

A small take-a-number system for events: visitors register and get a number,
a display board shows who's being helped now, and a staff screen calls the
next number. All three stay in sync through a tiny server — no third-party
accounts needed.

## Run it locally

Requires [Node.js](https://nodejs.org) (v18 or newer).

```bash
npm install
npm start
```

Then open **http://localhost:3000** in a browser. Pick "Get my number",
"Show queue board", or "Staff control" from the home screen.

Queue numbers are saved to `state.json` in this folder, so they survive a
server restart. Delete that file (or use the "Reset queue" button in Staff
control) to start over.

## Using it at the event

You need the server running on one machine, and every device (visitor
phones, the display screen, the staff laptop) needs to be able to reach it
over the network.

**Simplest: same Wi-Fi network**
1. Run `npm start` on a laptop connected to the venue's Wi-Fi.
2. Find that laptop's local IP address (e.g. `192.168.1.42`) — on Mac/Linux
   run `ipconfig getifaddr en0` or `hostname -I`; on Windows run `ipconfig`
   and look for "IPv4 Address".
3. On other devices (same Wi-Fi), open `http://192.168.1.42:3000`.
4. Optional: turn that URL into a QR code (any free QR generator) so
   visitors can scan it to register instead of typing it in.

This works well for a single-venue event and needs nothing beyond the
laptop you're already using.

**More permanent: deploy it to a hosting provider**
If you want a stable public URL (e.g. for a recurring event, or so it's
reachable outside the venue's Wi-Fi), deploy this folder to any Node.js
host. A few free/cheap options that work with zero config changes:

- **Render** (render.com) — "New Web Service", connect this folder/repo,
  build command `npm install`, start command `npm start`.
- **Railway** (railway.app) — similar one-click deploy from a repo.
- **Fly.io** or any VPS — run `npm install && npm start` behind a process
  manager like `pm2`, and put it behind a reverse proxy (e.g. Caddy or
  nginx) for HTTPS and a custom domain.

Whichever you choose, the app doesn't need a database or any environment
variables — it just needs Node.js and a writable folder for `state.json`.

## Notes

- There's no login on the staff screen — anyone with the URL plus
  `/staff` knowledge can control the queue. For a single-event kiosk this
  is usually fine; if you want to lock it down, the easiest option is
  putting the whole site behind your hosting provider's basic-auth feature,
  or asking to have a password added to the staff screen.
- If two people tap "Get my number" at the exact same instant, the server
  processes requests one at a time, so there's no risk of two visitors
  getting the same number.
