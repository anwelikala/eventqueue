# Queue Ticket System (self-hosted)

A take-a-number system for events: visitors register with their name,
phone number, optional email, and what they need help with (picked from a
dropdown, or "Other" to type their own); a display board shows who's being
helped now; a password-protected call desk calls the next number; and a
password-protected admin page shows the full visitor list, edits the event
title, welcome message, and service list, downloads a CSV backup, and
resets the queue.

## Run it locally

Requires [Node.js](https://nodejs.org) (v18 or newer).

```bash
npm install
npm start
```

Open **http://localhost:3000**. From the home screen:
- **Get my number** — visitors fill in name, phone, optional email, and
  pick a service from the list (or "Other" to type their own).
- **Show queue board** — put this on the screen everyone can see.
- **Call desk** — password-protected. Calls and recalls numbers.
- **Admin** — password-protected. Visitor list, event title, welcome
  message, services list, CSV download, and reset.

Default passwords (change these before your event — see below):
- Call desk: `call1234`
- Admin: `admin1234`

## How visitor data is stored

Every registration is saved in two places:

1. **`state.json`** — the live working data the app reads from. Rewritten
   after every change (registration, call, reset). This is what powers
   the admin page and the "Download CSV" button.
2. **`visitors.csv`** — a plain-text, append-only log. Every registration
   adds one line to this file and nothing already written is ever
   rewritten, which makes it the more crash-resistant of the two: even if
   the app crashes mid-write, only the newest line is at risk, never the
   history before it. It is **not** cleared by "Reset queue", so it stays
   a permanent record across resets — open it directly on the server, or
   in a spreadsheet app, if you ever need to recover data outside the app.

Worth knowing: a plain crash-and-restart does **not** wipe either file —
the disk survives as long as the same server instance keeps running. What
*does* wipe them is a fresh deploy on a host with ephemeral storage (like
Render's free tier), since that spins up a brand new container. If you're
on Render free tier, back up `visitors.csv` (via the admin download button,
or by downloading the file directly from the server) before pushing new
code during an event, and consider the email BCC option below as an
entirely off-server safety net.

**Download a live CSV any time**: on the admin page, click **Download CSV**
next to "Visitors" — it generates a fresh export from the current data
(including who's been called) and downloads it straight to your device.

## Email confirmations (optional)

If configured, visitors who enter an email address get a message
confirming their number. This is off by default — the app runs fine
without it.

Set these as environment variables wherever you run the app:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=youraddress@gmail.com
SMTP_PASS=your16charapppassword
EMAIL_FROM="Mobile Consular Services <youraddress@gmail.com>"
ADMIN_EMAIL=youraddress@gmail.com
```

- `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are required to turn emailing
  on — without all three, the app silently skips sending and works
  normally otherwise.
- `EMAIL_FROM` is optional; defaults to `SMTP_USER` if not set.
- `ADMIN_EMAIL` is optional. If set, every confirmation is BCC'd to this
  address too — a simple way to get a live, off-server copy of every
  registration as it happens, independent of whatever's stored on the
  server's disk.

**Using Gmail**: you can't use your normal Gmail password here. Turn on
2-Step Verification on the Google account, then create an
[App Password](https://myaccount.google.com/apppasswords) and use that as
`SMTP_PASS`. Any other SMTP provider (Outlook, a work email account,
SendGrid, Mailgun, etc.) works the same way — just use that provider's
SMTP host, port, and credentials instead.

On Render, add these as environment variables in the service's
**Environment** tab — no code change or redeploy needed.

The admin page shows whether email confirmations are currently enabled,
under the "Visitors" heading.

## Changing the list of services

This is done from the **Admin** page — no code changes needed. Log in with
the admin password, and under "Services" you can add a new service (type
it in and click Add) or remove one (click the × on its chip). An "Other
(please specify)" option is always shown after the list, so a visitor
whose need isn't listed can still register.

## Changing the passwords

```bash
CALL_PASSWORD=yourcallpassword ADMIN_PASSWORD=youradminpassword npm start
```

On Render, set these in the service's Environment tab. If you don't set
them, the app falls back to the defaults above — change them before a real
event.

## Using it at the event

**Simplest: same Wi-Fi network**
1. Run `npm start` on a laptop connected to the venue's Wi-Fi.
2. Find that laptop's local IP address (e.g. `192.168.1.42`) — on Mac/Linux
   run `ipconfig getifaddr en0` or `hostname -I`; on Windows run `ipconfig`.
3. On other devices (same Wi-Fi), open `http://192.168.1.42:3000`.
4. Optional: turn that URL into a QR code so visitors can scan it.

**More permanent: deploy to a hosting provider**
Render's free tier works well — deploy this folder, set `CALL_PASSWORD`,
`ADMIN_PASSWORD`, and (if wanted) the `SMTP_*`/`EMAIL_FROM`/`ADMIN_EMAIL`
variables in Render's dashboard, and share the resulting URL.

## Notes

- Visitor names, phone numbers, emails, and service needs are only ever
  shown on the admin page — the public register and display screens never
  expose them.
- This is a simple shared-password model, not individual staff accounts —
  fine for a single trusted event team.
- If two visitors submit the registration form at the exact same instant,
  the server processes requests one at a time, so there's no risk of two
  people getting the same number.
