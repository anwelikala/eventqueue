# Queue Ticket System (self-hosted)

A take-a-number system for events: visitors register with their name, phone
number, and what they need help with (picked from a dropdown, or "Other" to
type their own); a display board shows who's being helped now; a
password-protected call desk calls the next number; and a password-protected
admin page shows the full visitor list, edits the event title, welcome
message, and service list, and resets the queue.

## Run it locally

Requires [Node.js](https://nodejs.org) (v18 or newer).

```bash
npm install
npm start
```

Open **http://localhost:3000**. From the home screen:
- **Get my number** — visitors fill in name, phone, and pick a service from
  the list (or choose "Other" to type their own).
- **Show queue board** — put this on the screen everyone can see.
- **Call desk** — password-protected. Calls and recalls numbers.
- **Admin** — password-protected. Visitor list, event title, welcome
  message, services list, and reset.

Default passwords (change these before your event — see below):
- Call desk: `call1234`
- Admin: `admin1234`

Queue and visitor data is saved to `state.json` in this folder, so it
survives a restart. The admin "Reset queue" button clears both the numbers
and the visitor list.

## Changing the list of services

This is done from the **Admin** page — no code changes needed. Log in with
the admin password, and under "Services" you can add a new service (type
it in and click Add) or remove one (click the × on its chip). Changes take
effect immediately for anyone who opens the register page afterward. An
"Other (please specify)" option is always shown after the list, so a
visitor whose need isn't listed can still register.

The list ships with these defaults the first time the app runs: Renewal of
Passports; Applications for Registration of Birth / Citizenship / Dual
Citizenships; Driving License Renewal; Registration of Marriages / Death;
Application for Marriage, Death Certificate extracts; Attestations; Power
of Attorneys; Affidavits; Legalization of Documents certified by the
Ministry for Foreign Affairs, Denmark.

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
Render's free tier works well for this — deploy this folder, set
`CALL_PASSWORD` and `ADMIN_PASSWORD` as environment variables in Render's
dashboard, and share the resulting URL.

## Notes

- Visitor names, phone numbers, and service needs are only ever shown on
  the admin page — the public register and display screens never expose
  them.
- The admin page has separate fields for **Event title** (shown in the
  small header bar on every screen), **Welcome message** (the sentence
  under "Welcome" on the home screen), and the **Services** list. They're
  all independent of each other.
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
