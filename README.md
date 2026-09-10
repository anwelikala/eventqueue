# Queue Ticket System (self-hosted)

A take-a-number system for events with **multiple service counters**, each
running its own independent queue. Visitors pick a service, get routed to
the right counter automatically, and receive a ticket number specific to
that counter (e.g. `A-004` for Counter A, `B-002` for Counter B) — one
counter running faster or slower than another never affects the other's
numbering.

## ⚠️ If you're upgrading from the single-counter version

This version changes the data model (tickets are now per-counter, not one
global number). **Click "Reset queue" on the admin page after deploying
this update** — old visitor records use the previous format and won't
display correctly otherwise. Download a CSV backup first if you want to
keep a record of anything already collected.

## Run it locally

Requires [Node.js](https://nodejs.org) (v18 or newer).

```bash
npm install
npm start
```

Open **http://localhost:3000**. The home screen shows visitors two things:
**Get my number** (the main action) and **Now Serving** (a card that
takes anyone — visitor or staff — straight to the live queue display,
which now shows every counter side by side). **Call desk** and **Admin**
sit as small links in the footer, since visitors don't need them:
- **Now Serving** — the live display board, viewable by anyone, showing
  every counter's number at once.
- **Call desk** — password-protected. After logging in, staff pick which
  counter they're running for that session, then call/recall numbers and
  manage visitors for that counter only.
- **Admin** — password-protected. Manage counters, services, event text,
  visitor data (all counters), pause/resume, CSV import/export, and reset.

Default passwords (change these before your event — see below):
- Call desk: `call1234`
- Admin: `admin1234`

## How counters work

Each **counter** is an independent queue with its own numbering. Out of
the box there are two:

- **Counter A** (prefix `A`): Passport, Emergency Travel Documents, Dual
  Citizenship, Registration of Marriages, Attestation / Legalization
  (PoA, Affidavits, No objections), Government Leave Extensions, Life
  Certificates.
- **Counter B** (prefix `B`, allows "Other"): Registration of Birth,
  Citizenship and Passport for Newborn; Late Birth and Citizenship;
  Driving License; Registration of Death; VISA matters; and a free-text
  **"Other (please specify)"** option for anything not listed.

A visitor picks a service on the registration form (grouped by counter in
the dropdown) and is automatically issued the next number from the
correct counter — so if Counter B is moving faster than Counter A that
day, it simply gets further through its own numbers; the two never block
each other.

**Managing counters** (Admin page → "Counters"):
- Edit a counter's **name** or **numbering prefix** any time — this is
  also how you rename counters or change their letter/number scheme
  (e.g. the current "A"/"B" naming was set this way, not hardcoded).
- Toggle **"Allow other"** to add/remove the free-text option for that
  counter.
- **Add a new counter** with a name and prefix — it'll immediately appear
  as an option everywhere (registration dropdown, display board, call
  desk counter picker).
- **Remove a counter** — only allowed once it has no services and no
  visitors assigned, to avoid orphaning data. Move its services to
  another counter first, or clear its visitors via Reset.

**Managing services** (Admin page → "Services"): add or remove services
under each counter's own section. There's no way to move a service
between counters directly — remove it from one and re-add it under the
other.

## Call desk: choosing a counter

After entering the call desk password, staff are asked **"Which counter
are you running?"** — pick one, and from then on Call next / Recall / the
visitor list all apply to that counter only. This choice is remembered
for that browser tab (so refreshing the page doesn't ask again), and
there's a **"Switch counter"** link on the dashboard if the same device
needs to run a different counter later in the day.

The visitor list on the call desk only shows people queued for the
selected counter — a Counter A operator never sees Counter B's visitors
(and can't accidentally call or mark them completed).

## Visitors with tickets at more than one counter

Since needs can span both counters in a single visit, **each device can
hold one active ticket per counter at the same time** — not just one
ticket overall. If someone already has a Counter A number and later needs
a Counter B service too, they can still register there and get a second,
independent ticket for Counter B.

- The home screen shows small chips for any ticket(s) a device already
  holds, so returning visitors can always get back to any of them.
- If a device already holds valid tickets for **every** counter that
  exists, the home screen switches to "View my numbers" instead of
  showing the registration form.
- Trying to register again for a counter you already have a valid ticket
  for shows that existing ticket instead of issuing a duplicate.
- A queue reset clears all of this automatically (stale tickets from
  before a reset are detected and dropped).

## Registered service shown on the ticket

The visitor's own ticket page shows which service they registered for
(e.g. "Passport"), right below their number — a quick reminder of what
they came in for.

## Multi-counter notice on the ticket

A separate, admin-editable line appears on the ticket page below the
main ticket message — by default: "If you need services from more than
one counter, please get a number for each." Edit it from the **Admin**
page, under "Landing page text," alongside the other ticket text. This
is intentionally a separate field from the ticket message and the
registration form's privacy notice, so each can be worded independently.

## Marking visitors as completed

Both the admin page and the call desk page show a **"Mark completed"**
button next to each visitor. Click it once someone's finished — it turns
into a green **"Completed"** badge with an **Undo** link, in case they
need further help later. This is separate from "Called" status, and
either password (call desk or admin) can toggle it.

This also round-trips through the CSV export/import as a `Completed`
column (`true`/`false`). If you have an older CSV file that still says
`Helped` in its header, importing it still works — both header names are
accepted.

## Pausing new registrations

This pauses registration **for all counters at once** — there's a single
Pause/Resume toggle on the admin page, under "Queue overview," with an
editable message shown to visitors while paused. Visitors who already
have a ticket for a counter are unaffected and can still view it; only
*new* registrations are blocked. Call desk, admin, and the display board
keep working normally throughout a pause.

## Sound and visual alert — display board and ticket page

Whenever a counter's served number changes — including a plain **recall**
of the same number — that counter's panel reacts independently: a
two-tone chime, three amber rings rippling outward from its own number,
and a pulse. Each counter's ripple/chime fires separately, so calling
Counter B doesn't animate Counter A's panel.

A visitor's own ticket page behaves the same way for their specific
counter, and doesn't need the "tap to enable sound" step the shared board
does, since reaching the ticket page always follows a click.

## Editing visitor details or reordering a counter's queue

Click **Upload CSV** (next to Download CSV, on the admin page). The CSV
columns are: `Counter, TicketNumber, Name, Phone, Service, RegisteredAt,
CalledAt, Completed`.

1. **Download CSV** to get the current list (all counters together).
2. Edit it in Excel/Sheets — fix details, change `Completed`, etc.
3. **To reorder a counter's queue**, edit the numeric part of that
   counter's `TicketNumber` values (e.g. change `A-004` to `A-001`) — the
   call desk always calls a counter's tickets in that exact numeric
   order. Renumbering only affects ordering within the same counter;
   `Counter` and the ticket's prefix must still match.
4. **Upload CSV** — you'll get a confirmation prompt, since this replaces
   the entire visitor list across all counters.

Each row's `Counter` value must match an existing counter's exact name.
Every row needs a unique `TicketNumber` ending in a number, and non-blank
`Name`, `Phone`, `Service`. Nothing is changed until every row is valid.

## Name and phone number validation

- **Name**: must include a first and last name (two words, separated by a
  space) — a single word is rejected. Each word must be letters only (any
  language/script; hyphens, apostrophes, and periods allowed within a
  word, e.g. "Anne-Marie", "O'Brien", "J."), with digits and symbol
  strings rejected, and a single letter repeated the whole way through
  (like "aaaa") rejected too. At least one of the two words must be more
  than 3 letters long — so both "Kamal Perera" and "J Perera" pass, but
  "Jo Xu" doesn't.
- **Phone**: digits, spaces, `+`, `-`, and `()` are allowed (so
  international formats like `+46 70 123 45 67` work fine), with at
  least 7 and at most 15 digits.

Both are checked in the browser (with a specific inline message for each
failure) and again on the server, so the rules hold even if someone calls
the API directly.

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

1. Sign up free at [upstash.com](https://upstash.com).
2. Click **Create Database**, choose the **Redis** type (not Vector or
   QStash).
3. On the database's page, the **REST API** section shows both values
   ready to copy.
4. Add both as environment variables on Render, save, let it redeploy.

Without these set, the app falls back to a local file that a fresh
deploy on Render's free tier will wipe. The server logs which mode it's
in on startup.

## How visitor data is stored

Every registration is saved to whichever store is configured (Upstash if
set up, otherwise local `state.json`). There's also **`visitors.csv`** —
a local, append-only log, not cleared by Reset or CSV imports. Neither
file is ever committed to GitHub — see `.gitignore`.

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
  private/incognito window to test the password screen fresh. The chosen
  call desk counter is remembered the same way.
- `.gitignore` keeps `state.json`, `visitors.csv`, and `node_modules/` out
  of your GitHub repo.
- This is a simple shared-password model, not individual staff accounts.
- Simultaneous registrations are processed one at a time — no risk of two
  people getting the same number within the same counter.
