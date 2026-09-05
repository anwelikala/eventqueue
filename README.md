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
  helped" button), event title, welcome message, ticket message, services
  list, pause/resume registration, CSV download/upload, and reset.

Default passwords (change these before your event — see below):
- Call desk: `call1234`
- Admin: `admin1234`

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

This also round-trips through the CSV export/import (see below) as a
`Helped` column (`true`/`false`), so you can bulk-review or bulk-edit it
in a spreadsheet if needed.

## Editable ticket message

The line visitors see under their number ("We'll help you in order." by
default) is now editable from the **Admin** page, under "Landing page
text" — alongside the event title and welcome message. Up to 150
characters, e.g. "Please have your ID ready" or "Estimated wait: 20
minutes."

## Pausing new registrations

On the admin page, under "Queue overview," there's a **Pause
registration** / **Resume registration** toggle with a status badge
(Active / Paused). While paused:

- The home screen's "Get my number" card is replaced with a message —
  no button, so visitors can't submit a new registration.
- Anyone who tries anyway (including a direct API call) is rejected with
  the same message, so this can't be bypassed by refreshing or navigating
  around the UI.
- **Visitors who already have a number are unaffected.** If a device
  already has a ticket (remembered from earlier — see "One number per
  device" below), the home screen shows a **"View my number"** button
  instead of the paused message, so they can always get back to their
  ticket and see how many are ahead of them, even while new registrations
  are paused. Call desk, admin, and the display board all keep working
  normally throughout a pause.

The message shown to visitors is editable right below the toggle — write
whatever fits your situation (e.g. "On a lunch break, back at 1pm") and
click Save. It's remembered for next time you pause, so you don't need to
retype it.

## Sound and visual alert — display board and ticket page

Whenever the served number changes — including a plain **recall** of the
same number, not just a new call — both places react:

- **The shared "Now Serving" board** — plays a two-tone chime, sends
  three amber rings rippling outward from the number, and pulses the
  number with a glow.
- **Each visitor's own ticket page** — a compact version of the same
  live panel sits below the ticket, showing the current number with the
  same ripple and pulse, and updates the "X numbers ahead of you" count
  alongside it. It plays the same chime too, and reacts to a recall
  exactly like the board does.

**On sound:** the display board requires a one-time tap (the
"🔔 Tap to enable" banner) since browsers block audio until a person
interacts with the page. The ticket page doesn't need this — since a
visitor only ever reaches it by clicking something first (submitting the
registration form, or "View my number"), that click already satisfies
the browser's requirement, so sound just works there from the start.

**If you're showing the board on a smart TV**, worth knowing: sound
reliably works if you're running a laptop/mini-PC into the TV over HDMI
(the browser genuinely runs on that device, audio comes through the HDMI
cable). If instead you're opening the board in the TV's own built-in
browser, Web Audio support varies a lot between TV models and the
"tap to enable" step may be awkward with a remote — the ripple effect is
a reliable fallback either way, since it doesn't depend on audio support
at all.

## Event title, welcome message, and ticket message length

The **Event title** (header bar) can be up to 100 characters. The
**Welcome message** (home screen) can be up to 200. The **Ticket
message** (under a visitor's number) can be up to 150. All three are
enforced in the input box and on the server, so pasting a longer value
just gets trimmed rather than rejected. A long title truncates with `…`
in the header bar on narrow screens rather than breaking the layout.

## Name and phone number validation

The registration form requires:

- **Name**: at least 2 characters, letters only (any language/script, so
  accented and non-Latin names work fine), plus spaces, hyphens,
  apostrophes, and periods for things like "Anne-Marie O'Connor" or
  "J. Fernando". Digits, symbols, and a single letter repeated the whole
  way through (like "aaaaaa") are rejected. Worth knowing: this catches
  obviously invalid input but can't perfectly detect every possible fake
  name, since there's no dictionary check involved.
- **Phone**: digits, spaces, `+`, `-`, and `()` are allowed (so
  international formats like `+46 70 123 45 67` work fine), with at
  least 7 and at most 15 digits.

Both are checked in the browser and again on the server, so the rules
hold even if someone calls the API directly rather than using the form.

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
   name or phone number, correct a service, change `Helped` to
   `true`/`false`, etc.
3. **To reorder the queue**, change the numbers in the `Number` column.
   The call desk always calls tickets in that exact numeric order, so
   renumbering rows changes who gets called next.
4. Save as CSV, then click **Upload CSV** on the admin page and choose the
   edited file. You'll get a confirmation prompt first, since this
   replaces the entire visitor list.

A few rules the import enforces, with nothing applied if any row fails:
- Every row needs a unique, positive whole number in `Number`.
- `Name`, `Phone`, and `Service` can't be blank.
- `RegisteredAt`, `CalledAt`, and `Helped` are optional — leave
  `RegisteredAt` blank and it's stamped with the current time; leave
  `CalledAt` blank to mark someone as not yet called; leave `Helped`
  blank (or anything other than `true`/`yes`/`1`) to mark as not yet
  helped.

If anything's wrong, you'll see exactly which rows and why — nothing is
changed until every row is valid. One thing worth knowing: the app treats
the numbers in your uploaded file as the new source of truth, so if you
delete the highest-numbered row rather than just editing it, the *next*
person who registers could be issued a number that collides with someone
still in the list. Renumber rather than delete if you're not sure.

## How visitor data is stored

Every registration is saved to whichever store is configured (Upstash if
set up as above, otherwise a local `state.json` file — see the warning
above about which one survives a redeploy). Either way, this is what
powers the admin and call desk pages and is rewritten after every change
(registration, call, reset, import, pause, marking helped).

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
