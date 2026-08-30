# Queue Ticket System (self-hosted)

A take-a-number system for events: visitors register with their name, phone
number, and what they need help with; a display board shows who's being
helped now; a password-protected call desk calls the next number; and a
password-protected admin page shows the full visitor list, renames the
event, and resets the queue.

## Run it locally

Requires [Node.js](https://nodejs.org) (v18 or newer).

```bash
npm install
npm start
```

Open **http://localhost:3000**. From the home screen:
- **Get my number** — visitors fill in name, phone, and what they need help with.
- **Show queue board** — put this on the screen everyone can see.
- **Call desk** — password-protected. Calls and recalls numbers.
- **Admin** — password-protected. Visitor list, event name, reset.

Default passwords (change these before your event — see below):
- Call desk: `call1234`
- Admin: `admin1234`

Queue and visitor data is saved to `state.json` in this folder, so it
survives a restart. The admin "Reset queue" button clears both the numbers
and the visitor list.

## Changing the passwords

The easiest way is with environment variables — set these on whatever
machine or host runs the app:

```bash
CALL_PASSWORD=yourcallpassword ADMIN_PASSWORD=youradminpassword npm start
```

On a host like Render, set `CALL_PASSWORD` and `ADMIN_PASSWORD` in the
service's Environment tab — no code changes or redeploy needed.

If you don't set them, the app falls back to the defaults above, which
means anyone who's used this README could log in — change them before a
real event.

## Using it at the event

You need the server running on one machine, and every device (visitor
phones, the display screen, the call desk, admin) needs to be able to
reach it over the network.

**Simplest: same Wi-Fi network**
1. Run `npm start` on a laptop connected to the venue's Wi-Fi.
2. Find that laptop's local IP address (e.g. `192.168.1.42`) — on Mac/Linux
   run `ipconfig getifaddr en0` or `hostname -I`; on Windows run `ipconfig`
   and look for "IPv4 Address".
3. On other devices (same Wi-Fi), open `http://192.168.1.42:3000`.
4. Optional: turn that URL into a QR code so visitors can scan it to
   register instead of typing it in.

**More permanent: deploy to a hosting provider**
Render's free tier works well for this (see the earlier setup steps in
your conversation, or render.com's docs) — deploy this folder, set
`CALL_PASSWORD` and `ADMIN_PASSWORD` as environment variables in Render's
dashboard, and share the resulting URL.

## Notes

- Visitor names, phone numbers, and service needs are only ever shown on
  the admin page — the public register and display screens never expose
  them.
- Passwords are checked on every request; there's no session timeout, so
  once a device is logged into the call desk or admin page it stays
  logged in until the browser tab is closed (this uses `sessionStorage`,
  not a permanent cookie).
- This is a simple shared-password model, not individual staff accounts —
  fine for a single trusted event team. If you need to know *which* staff
  member called a number, or want separate logins per person, that's a
  bigger change — let me know if you'd like that added.
- If two visitors submit the registration form at the exact same instant,
  the server processes requests one at a time, so there's no risk of two
  people getting the same number.
