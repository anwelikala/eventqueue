# Queue Ticket System (self-hosted)

A take-a-number system for events: visitors register with their name,
phone number, and what they need help with (picked from a dropdown, or
"Other" to type their own); a display board shows who's being helped now;
a password-protected call desk calls the next number; and a
password-protected admin page shows the full visitor list, edits the
event title, welcome message, and service list, downloads/uploads a CSV,
and resets the queue.

## Run it locally

Requires [Node.js](https://nodejs.org) (v18 or newer).

```bash
npm install
npm start
```

Open **http://localhost:3000**. The home screen shows just one thing to
visitors: **Get my number**. Staff and display options are tucked one
click away, behind a small **"Staff & display options →"** link at the
bottom of the home screen, which opens a separate page listing:
- **Show queue board** — put this on the screen everyone can see.
- **Call desk** — password-protected. Calls and recalls numbers.
- **Admin** — password-protected. Visitor list, event title, welcome
  message, services list, CSV download/upload, and reset.

Default passwords (change these before your event — see below):
- Call desk: `call1234`
- Admin: `admin1234`

## Phone number validation

The registration form requires a plausible phone number: digits, spaces,
`+`, `-`, and `()` are allowed (so international formats like
`+46 70 123 45 67` work fine), with at least 7 and at most 15 digits.
Letters or too few/too many digits are rejected with an inline message.
This is checked both in the browser and on the server, so it holds even
if someone calls the API directly rather than using the form.

## How visitor data is stored

Every registration is saved in two places:

1. **`state.json`** — the live working data the app reads from. Rewritten
   after every change (registration, call, reset, import). This is what
   powers the admin page.
2. **`visitors.csv`** — a plain-text, append-only log. Every registration
   adds one line to this file and nothing already written is ever
   rewritten, which makes it more crash-resistant than `state.json`: even
   if the app crashes mid-write, only the newest line is at risk, never
   the history before it. It is **not** cleared by "Reset queue" and
   **not** touched by CSV imports — it always reflects the original
   registrations exactly as they came in, as a permanent audit trail.

Worth knowing: a plain crash-and-restart does **not** wipe either file —
the disk survives as long as the same server instance keeps running. What
*does* wipe them is a fresh deploy on a host with ephemeral storage (like
Render's free tier), since that spins up a brand new container. If you're
on Render free tier, back up `visitors.csv` (via the admin download
button) before pushing new code during an event.

Neither file is ever committed to GitHub — see `.gitignore` below.

## Editing visitor details or reordering the queue

Click **Upload CSV** (next to Download CSV, on the admin page) to replace
the visitor list with an edited file. The typical flow:

1. Click **Download CSV** to get the current list.
2. Edit it in Excel, Google Sheets, or any spreadsheet app — fix a typo'd
   name or phone number, correct a service, etc.
3. **To reorder the queue**, change the numbers in the `Number` column.
   The call desk always calls tickets in that exact numeric order, so
   renumbering rows changes who gets called next.
4. Save as CSV, then click **Upload CSV** on the admin page and choose the
   edited file. You'll get a confirmation prompt first, since this
   replaces the entire visitor list.

A few rules the import enforces, with nothing applied if any row fails:
- Every row needs a unique, positive whole number in `Number`.
- `Name`, `Phone`, and `Service` can't be blank.
- `RegisteredAt` and `CalledAt` are optional — leave a row's `RegisteredAt`
  blank and it's stamped with the current time; leave `CalledAt` blank to
  mark someone as not yet called.

If anything's wrong, you'll see exactly which rows and why — nothing is
changed until every row is valid. One thing worth knowing: the app treats
the numbers in your uploaded file as the new source of truth, so if you
delete the highest-numbered row rather than just editing it, the *next*
person who registers could be issued a number that collides with someone
still in the list. Renumber rather than delete if you're not sure.

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

On Render, set these in the service's Environment tab — either directly
under "Environment Variables," or via a linked Environment Group (if you
use a group, make sure it's actually **linked** to the service, not just
sitting unlinked in the dropdown). If you don't set them, the app falls
back to the defaults above — change them before a real event.

## Using it at the event

**Simplest: same Wi-Fi network**
1. Run `npm start` on a laptop connected to the venue's Wi-Fi.
2. Find that laptop's local IP address (e.g. `192.168.1.42`) — on Mac/Linux
   run `ipconfig getifaddr en0` or `hostname -I`; on Windows run `ipconfig`.
3. On other devices (same Wi-Fi), open `http://192.168.1.42:3000`.
4. Optional: turn that URL into a QR code so visitors can scan it.

**More permanent: deploy to a hosting provider**
Render's free tier works well — deploy this folder, set `CALL_PASSWORD`
and `ADMIN_PASSWORD` as environment variables in Render's dashboard, and
share the resulting URL.

## Notes

- Visitor names, phone numbers, and service needs are only ever shown on
  the admin page — the public register and display screens never expose
  them.
- Once you log into the call desk or admin page on a device, that device
  stays logged in (via `sessionStorage`) until its browser tab is closed —
  this is intentional, so staff aren't re-entering the password
  constantly. To test the password screen fresh, use a private/incognito
  window or close the tab first.
- `.gitignore` keeps `state.json`, `visitors.csv`, and `node_modules/` out
  of your GitHub repo, since the first two contain visitor personal data
  and the last is just reinstalled from `package.json`.
- This is a simple shared-password model, not individual staff accounts —
  fine for a single trusted event team.
- If two visitors submit the registration form at the exact same instant,
  the server processes requests one at a time, so there's no risk of two
  people getting the same number.
