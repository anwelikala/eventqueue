# Queue Ticket System (self-hosted)

A take-a-number system for events: visitors register with their name,
phone number, and what they need help with (picked from a dropdown, or
"Other" to type their own); a "Now Serving" display board shows who's
being helped now — with a sound alert on number changes — viewable on a
shared screen or a visitor's own phone; a password-protected call desk
calls the next number and shows a read-only visitor list; and a
password-protected admin page manages the event and visitor data.

## Run it locally

Requires [Node.js](https://nodejs.org) (v18 or newer).

```bash
npm install
npm start
```

Open **http://localhost:3000**. The home screen shows visitors two things:
**Get my number** (the main action) and **Now Serving** (a card that
takes anyone — visitor or staff — straight to the live queue display, on
a shared screen or their own phone). **Call desk** and **Admin** sit as
small links in the footer at the bottom of the page, since visitors don't
need them:
- **Now Serving** — the live display board, viewable by anyone.
- **Call desk** — password-protected. Calls and recalls numbers, and
  shows a read-only visitor list.
- **Admin** — password-protected. Visitor list, event title, welcome
  message, services list, CSV download/upload, and reset.

Default passwords (change these before your event — see below):
- Call desk: `call1234`
- Admin: `admin1234`

## Event title and welcome message length

The **Event title** (shown in the small header bar on every screen) can
be up to 100 characters. The **Welcome message** (shown under "Welcome"
on the home screen) can be up to 200 characters. Both are enforced in the
input box and on the server, so pasting a longer value just gets trimmed
to the limit rather than rejected. A long title truncates with `…` in the
header bar on narrow screens rather than breaking the layout.

## Sound alert on the display board

The "Now Serving" board plays a short two-tone chime whenever the number
changes, in addition to the visual pulse. Browsers require a tap before
they'll allow any sound to play, so the first time the board is opened
you'll see a small **"🔔 Tap to enable the number-change sound"** banner
at the top — tap it once (it plays a confirmation chime and disappears)
and the sound will keep working for the rest of that browser session.
This only needs doing once per device/browser tab you use for the board.

## One number per device

To stop the same visitor from accidentally registering twice (a double
tap, a page reload, coming back to the form out of curiosity), the app
remembers on each device that a number has already been issued, and
shows that same ticket again instead of the registration form. This is
remembered even if the browser is closed and reopened.

This restriction is automatically lifted for **admins** — if you're
logged into the Admin page on a device, "Get my number" on that same
device always shows the registration form, so staff can test freely
without being blocked by their own earlier test tickets.

If the queue is reset for a new event, previously-issued device tickets
are recognized as stale (since they no longer refer to anyone in the
fresh queue) and the restriction clears automatically — no need to clear
browser data between events.

## Call desk visitor list

The call desk page now shows a read-only table of all visitors (number,
name, phone, service, registration time, and called/waiting status) below
the call controls — the same information admins see, but without any of
the editing tools (no CSV import/export, no reset, no event settings).
This uses the call desk password only; call desk staff never need the
admin password to see who's registered.

## ⚠️ Preventing data loss on redeploy (important — read this)

**If you're hosting on Render's free tier (or any host with an ephemeral
filesystem), every time you push new code and it redeploys, the disk is
wiped — including all registered visitor data.** Here's how to make sure
that doesn't happen.

Set these two environment variables (on Render: Environment tab) to store
data in [Upstash](https://upstash.com) instead of a local file — a free,
permanent key-value store that isn't wiped by a redeploy:

```bash
UPSTASH_REDIS_REST_URL=https://your-db-name.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-rest-token
```

**Getting these values (takes about 2 minutes, no credit card):**
1. Sign up free at [upstash.com](https://upstash.com).
2. Click **Create Database** and choose the **Redis** database type (not
   Vector or QStash — those are for different purposes). Give it any
   name, pick any region.
3. On the database's page, scroll to the **REST API** section — it shows
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` directly,
   ready to copy.
4. Add both as environment variables on Render (or wherever you host),
   save, and let it redeploy once.

From that point on, all queue and visitor data lives in Upstash — future
deploys only replace your code, never your data. The free tier covers
500,000 requests/month, far more than a single event needs.

**Without these two variables set**, the app still works, but falls back
to a local file that a fresh deploy on Render's free tier will wipe. The
server logs which mode it's in on startup — look for "Persistent storage:
Upstash" vs. "Persistent storage: local file only" in Render's Logs tab.

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

## Phone number validation

The registration form requires a plausible phone number: digits, spaces,
`+`, `-`, and `()` are allowed (so international formats like
`+46 70 123 45 67` work fine), with at least 7 and at most 15 digits.
Letters or too few/too many digits are rejected with an inline message.
This is checked both in the browser and on the server, so it holds even
if someone calls the API directly rather than using the form.

## How visitor data is stored

Every registration is saved to whichever store is configured (Upstash if
set up as above, otherwise a local `state.json` file — see the warning
above about which one survives a redeploy). Either way, this is what
powers the admin and call desk pages and is rewritten after every change
(registration, call, reset, import).

There's also **`visitors.csv`** — a local, plain-text, append-only log.
Every registration adds one line here and nothing already written is ever
rewritten. It's a convenient local mirror and isn't cleared by "Reset
queue" or touched by CSV imports, but — like `state.json` — it lives on
local disk, so it's still wiped by a redeploy on ephemeral hosts. Once
Upstash is set up, it is **not** the safety net anymore; think of it as a
nice-to-have local companion log, not your backup.

Neither file is ever committed to GitHub — see `.gitignore` below.

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
Render's free tier works well — deploy this folder, set `CALL_PASSWORD`,
`ADMIN_PASSWORD`, and (strongly recommended) the two `UPSTASH_*`
variables above in Render's dashboard, and share the resulting URL.

## Notes

- Visitor names, phone numbers, and service needs are only ever shown on
  the admin and call desk pages — the public register and display screens
  never expose them.
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
