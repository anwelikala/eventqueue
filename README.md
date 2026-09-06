# Queue Ticket System (self-hosted)

A take-a-number system for events: visitors register with their name,
phone number, and what they need help with (picked from a dropdown, or
"Other" to type their own); both the shared "Now Serving" display board
and each visitor's own ticket page show live updates with sound and a
ripple effect when the number changes — including a plain recall of the
same number; a password-protected call desk calls the next number, shows
a visitor list, and can mark visitors as helped; and a
password-protected admin page manages the event, visitor data, and can
pause new registrations with a custom message.

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
  shows the visitor list with a "Mark helped" button per person.
- **Admin** — password-protected. Visitor list (with the same "Mark
  helped" button), event title, welcome message, ticket message, privacy
  notice, services list, pause/resume registration, CSV download/upload,
  and reset.

Default passwords (change these before your event — see below):
- Call desk: `call1234`
- Admin: `admin1234`

## Privacy notice on the registration form

A short, muted line appears below the "Get my number" button on the
registration form — by default:

> Your name, phone number, and selected service are used only to manage
> today's queue and are deleted after the event.

This is editable from the **Admin** page, under "Landing page text,"
alongside the event title, welcome message, and ticket message — up to
250 characters. Update it if your actual retention practice changes, or
to name who's responsible for the data.

**Worth knowing (not legal advice):** GDPR applies to personal data
processing regardless of how briefly it's retained — a one-day retention
policy doesn't exempt you from it, though it does help satisfy GDPR's
"storage limitation" principle. If your policy is same-day deletion,
make sure that's actually true everywhere the data lives: clicking
"Reset queue" clears the live visitor list (and the Upstash-backed copy,
if configured), but does **not** clear the local `visitors.csv` backup
log, which is deliberately never touched by Reset or CSV imports. If you
need guaranteed same-day erasure across everything, that's a further
change worth making — and for the parts of this that touch actual legal
obligations (lawful basis, cross-border data transfer, any special
arrangement covering diplomatic missions), that's worth confirming with
whoever handles data protection for the embassy.

## Marking visitors as helped

Both the admin page and the call desk page show a **"Mark helped"**
button next to each visitor in the list. Click it once someone's finished
being helped — it turns into a green **"Helped"** badge with an **Undo**
link next to it, in case they need further help later and you want to
flip it back to not-yet-helped.

This is separate from the "Called" status: a visitor can be called but
not yet marked helped (still being assisted), or you can track both at a
glance. Either the call desk password or the admin password can toggle
it — call desk staff don't need admin access just to mark someone done.

The visitor table is fairly compact by design (small text, a truncated
"Needs help with" column that shows the full text on hover) so that all
the columns — including "Helped" — fit on typical laptop screens without
scrolling. On narrower screens the table scrolls horizontally as a
fallback.

This also round-trips through the CSV export/import (see below) as a
`Helped` column (`true`/`false`), so you can bulk-review or bulk-edit it
in a spreadsheet if needed.

## Ticket status text

The pill on a visitor's ticket page (below the "Now serving" mini-board)
shows one of four accurate states, not just "ahead" vs. "next":

- **"X numbers ahead of you"** — the normal waiting state.
- **"You're next"** — the served number is exactly one below theirs.
- **"It's your turn — please come forward"** — the served number now
  equals theirs.
- **"Your number has already been called — please check with staff"** —
  the served number has gone *past* theirs.

## Pausing new registrations

On the admin page, under "Queue overview," there's a **Pause
registration** / **Resume registration** toggle with a status badge
(Active / Paused). While paused:

- The home screen's "Get my number" card is replaced with a message —
  no button, so visitors can't submit a new registration.
- Anyone who tries anyway (including a direct API call) is rejected with
  the same message.
- **Visitors who already have a number are unaffected.** If a device
  already has a ticket, the home screen shows a **"View my number"**
  button instead of the paused message. Call desk, admin, and the display
  board all keep working normally throughout a pause.

The message shown to visitors is editable right below the toggle — it's
remembered for next time you pause.

## Sound and visual alert — display board and ticket page

Whenever the served number changes — including a plain **recall** of the
same number — both places react:

- **The shared "Now Serving" board** — plays a two-tone chime, sends
  three amber rings rippling outward from the number, and pulses the
  number with a glow.
- **Each visitor's own ticket page** — a compact version of the same
  live panel sits below the ticket, with the same ripple and pulse, and
  updates the status pill alongside it.

**On sound:** the display board requires a one-time tap (the
"🔔 Tap to enable" banner) since browsers block audio until a person
interacts with the page. The ticket page doesn't need this, since
reaching it always follows a click.

**If you're showing the board on a smart TV**, sound reliably works over
HDMI from a laptop/mini-PC; the TV's own built-in browser is less
predictable for audio — the ripple effect works regardless either way.

## Event title, welcome message, ticket message, and privacy notice length

**Event title** (header bar): up to 100 characters. **Welcome message**
(home screen): up to 200. **Ticket message** (under a visitor's number):
up to 150. **Privacy notice** (register form): up to 250. All are
enforced in the input box and on the server.

## Name and phone number validation

- **Name**: at least 2 characters, letters only (any language/script),
  plus spaces, hyphens, apostrophes, and periods. Digits, symbols, and a
  single letter repeated the whole way through are rejected.
- **Phone**: digits, spaces, `+`, `-`, and `()`, with 7–15 digits.

Both are checked in the browser and again on the server.

## One number per device

The app remembers on each device that a number has already been issued,
and shows that same ticket again instead of the registration form —
remembered even if the browser is closed and reopened.

This is lifted for **admins** on their own device, so staff can test
freely. A queue reset clears stale device tickets automatically.

## ⚠️ Preventing data loss on redeploy (important — read this)

**If you're hosting on Render's free tier (or any host with an ephemeral
filesystem), every time you push new code and it redeploys, the disk is
wiped — including all registered visitor data.**

Set these two environment variables to store data in
[Upstash](https://upstash.com) instead of a local file — a free,
permanent key-value store that isn't wiped by a redeploy:

```bash
UPSTASH_REDIS_REST_URL=https://your-db-name.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-rest-token
```

**Getting these values:**
1. Sign up free at [upstash.com](https://upstash.com).
2. Click **Create Database**, choose the **Redis** type (not Vector or
   QStash).
3. On the database's page, the **REST API** section shows both values
   ready to copy.
4. Add both as environment variables on Render, save, let it redeploy.

**Without these set**, the app falls back to a local file that a fresh
deploy on Render's free tier will wipe. The server logs which mode it's
in on startup.

## Editing visitor details or reordering the queue

Click **Upload CSV** (next to Download CSV, on the admin page) to replace
the visitor list with an edited file:

1. **Download CSV** to get the current list.
2. Edit it in Excel/Sheets — fix details, change `Helped` to
   `true`/`false`, etc.
3. **Renumber the `Number` column** to reorder the queue — the call desk
   always calls tickets in that exact order.
4. **Upload CSV** the edited file — you'll get a confirmation prompt
   first, since this replaces the entire visitor list.

Every row needs a unique positive `Number`, and non-blank `Name`,
`Phone`, `Service`. `RegisteredAt`, `CalledAt`, and `Helped` are optional.
Nothing is changed until every row is valid. Deleting the highest-numbered
row (rather than editing it) risks a future registration reusing that
number — renumber rather than delete if unsure.

## How visitor data is stored

Every registration is saved to whichever store is configured (Upstash if
set up, otherwise local `state.json`). There's also **`visitors.csv`** —
a local, append-only log, not cleared by Reset or CSV imports (see the
privacy notice section above for why that matters). Neither file is ever
committed to GitHub — see `.gitignore` below.

## Changing the list of services

From the **Admin** page — add or remove services under "Services," no
code changes needed. "Other (please specify)" is always available too.

## Changing the passwords

```bash
CALL_PASSWORD=yourcallpassword ADMIN_PASSWORD=youradminpassword npm start
```

Set these as environment variables on Render (directly, or via a linked
Environment Group — make sure it's actually linked, not just available).

## Using it at the event

**Simplest: same Wi-Fi network** — run `npm start` on a laptop, find its
local IP, open `http://<that-ip>:3000` on other devices, optionally turn
it into a QR code.

**More permanent:** deploy to Render, set `CALL_PASSWORD`,
`ADMIN_PASSWORD`, and the `UPSTASH_*` variables, share the URL.

## Notes

- Visitor names, phone numbers, and service needs are only ever shown on
  the admin and call desk pages.
- Once logged into the call desk or admin page on a device, it stays
  logged in (via `sessionStorage`) until the tab closes — use a
  private/incognito window to test the password screen fresh.
- `.gitignore` keeps `state.json`, `visitors.csv`, and `node_modules/` out
  of your GitHub repo.
- This is a simple shared-password model, not individual staff accounts.
- Simultaneous registrations are processed one at a time — no risk of two
  people getting the same number.
