const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'state.json');
const CSV_FILE = path.join(__dirname, 'visitors.csv');
const CSV_HEADER = 'Number,Name,Phone,Service,RegisteredAt,CalledAt\n';
const REDIS_KEY = 'queue-app-state';

// Change these — either edit the defaults below, or (recommended) set
// CALL_PASSWORD and ADMIN_PASSWORD as environment variables on your host
// so you don't have to put real passwords in the code.
const CALL_PASSWORD = process.env.CALL_PASSWORD || 'call1234';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';

// Optional persistent storage via Upstash (a free Redis service reachable
// over plain HTTPS — see README). When both variables are set, all queue
// and visitor data is stored there instead of a local file, so it survives
// a fresh deploy on hosts with ephemeral disks (like Render's free tier).
// Without these set, the app falls back to a local file, which works fine
// for local use but is wiped by a redeploy on such hosts.
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const usingUpstash = !!(UPSTASH_URL && UPSTASH_TOKEN);

async function upstashGet(key) {
  const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  if (!res.ok) throw new Error(`Upstash GET failed: ${res.status}`);
  const data = await res.json();
  return data.result; // string or null
}

async function upstashSet(key, value) {
  const res = await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'text/plain' },
    body: value
  });
  if (!res.ok) throw new Error(`Upstash SET failed: ${res.status}`);
}

function csvEscape(value) {
  const str = (value === null || value === undefined) ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function ensureCsvFile() {
  if (!fs.existsSync(CSV_FILE)) {
    fs.writeFileSync(CSV_FILE, CSV_HEADER);
  }
}

function appendVisitorToCsv(visitor) {
  const row = [
    visitor.number,
    csvEscape(visitor.name),
    csvEscape(visitor.phone),
    csvEscape(visitor.service),
    new Date(visitor.registeredAt).toISOString(),
    visitor.calledAt ? new Date(visitor.calledAt).toISOString() : ''
  ].join(',') + '\n';
  fs.appendFile(CSV_FILE, row, (err) => {
    if (err) console.error('Failed to append to visitors.csv:', err);
  });
}

const DEFAULT_STATE = {
  title: 'Application Help Day',
  welcomeMessage: "Choose what you're here to do.",
  services: [
    'Renewal of Passports',
    'Applications for Registration of Birth / Citizenship / Dual Citizenships',
    'Driving License Renewal',
    'Registration of Marriages / Death',
    'Application for Marriage, Death Certificate extracts',
    'Attestations',
    'Power of Attorneys',
    'Affidavits',
    'Legalization of Documents certified by the Ministry for Foreign Affairs, Denmark'
  ],
  lastIssued: 0,
  nowServing: 0,
  lastRecallAt: null,
  registrationPaused: false,
  pausedMessage: "We're not issuing new numbers right now. Please check back shortly.",
  updatedAt: Date.now(),
  visitors: [] // { number, name, phone, service, registeredAt, calledAt }
};

function mergeWithDefaults(parsed) {
  return {
    ...DEFAULT_STATE,
    ...parsed,
    services: Array.isArray(parsed.services) ? parsed.services : DEFAULT_STATE.services,
    visitors: Array.isArray(parsed.visitors) ? parsed.visitors : []
  };
}

async function loadState() {
  if (usingUpstash) {
    try {
      const raw = await upstashGet(REDIS_KEY);
      if (raw) return mergeWithDefaults(JSON.parse(raw));
      return { ...DEFAULT_STATE };
    } catch (e) {
      console.error('Could not load state from Upstash, starting from defaults:', e.message);
      return { ...DEFAULT_STATE };
    }
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return mergeWithDefaults(JSON.parse(raw));
  } catch (e) {
    return { ...DEFAULT_STATE };
  }
}

function persist() {
  const json = JSON.stringify(state, null, 2);
  if (usingUpstash) {
    upstashSet(REDIS_KEY, json).catch(err => console.error('Failed to save state to Upstash:', err.message));
  }
  // Always also mirror to a local file — convenient for local use, and a
  // harmless (if ephemeral) extra copy when Upstash is the primary store.
  fs.writeFile(DATA_FILE, json, (err) => {
    if (err) console.error('Failed to save state.json locally:', err);
  });
}

let state = { ...DEFAULT_STATE };

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Fields safe to show on the public register/display screens — never
// includes visitor names, phone numbers, or what they need help with.
function publicState() {
  return {
    title: state.title,
    welcomeMessage: state.welcomeMessage,
    services: state.services,
    lastIssued: state.lastIssued,
    nowServing: state.nowServing,
    lastRecallAt: state.lastRecallAt,
    registrationPaused: state.registrationPaused,
    pausedMessage: state.pausedMessage,
    updatedAt: state.updatedAt
  };
}

function checkPassword(expected) {
  return (req, res, next) => {
    const supplied = req.headers['x-app-password'];
    if (supplied && supplied === expected) return next();
    res.status(401).json({ error: 'Wrong password' });
  };
}

const requireCall = checkPassword(CALL_PASSWORD);
const requireAdmin = checkPassword(ADMIN_PASSWORD);

/* ------------------------------------------------------------------ */
/* Public: register + display board                                    */
/* ------------------------------------------------------------------ */

app.get('/api/state', (req, res) => {
  res.json(publicState());
});

function isValidPhone(phone) {
  if (!/^[0-9+\-()\s]+$/.test(phone)) return false;
  const digitCount = (phone.match(/\d/g) || []).length;
  return digitCount >= 7 && digitCount <= 15;
}

app.post('/api/register', (req, res) => {
  if (state.registrationPaused) {
    return res.status(403).json({ error: state.pausedMessage || 'Registration is currently paused.' });
  }

  const name = ((req.body && req.body.name) || '').toString().trim().slice(0, 80);
  const phone = ((req.body && req.body.phone) || '').toString().trim().slice(0, 40);
  const service = ((req.body && req.body.service) || '').toString().trim().slice(0, 120);

  if (!name || !service) {
    return res.status(400).json({ error: 'Name and service are required.' });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: 'Enter a valid phone number (digits only, at least 7 digits).' });
  }

  state.lastIssued += 1;
  const number = state.lastIssued;
  const visitor = {
    number,
    name,
    phone,
    service,
    registeredAt: Date.now(),
    calledAt: null
  };
  state.visitors.push(visitor);
  state.updatedAt = Date.now();
  persist();
  appendVisitorToCsv(visitor);

  res.json({ number, state: publicState() });
});

/* ------------------------------------------------------------------ */
/* Call desk (password protected): call next / recall                  */
/* ------------------------------------------------------------------ */

app.post('/api/call/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
  res.json({ ok: password === CALL_PASSWORD });
});

app.get('/api/call/state', requireCall, (req, res) => {
  res.json(publicState());
});

app.post('/api/call/next', requireCall, (req, res) => {
  if (state.nowServing < state.lastIssued) {
    state.nowServing += 1;
    const visitor = state.visitors.find(v => v.number === state.nowServing);
    if (visitor) visitor.calledAt = Date.now();
    state.updatedAt = Date.now();
    persist();
  }
  res.json(publicState());
});

app.post('/api/call/recall', requireCall, (req, res) => {
  state.lastRecallAt = Date.now();
  state.updatedAt = Date.now();
  persist();
  res.json(publicState());
});

app.get('/api/call/visitors', requireCall, (req, res) => {
  res.json({ visitors: state.visitors });
});

/* ------------------------------------------------------------------ */
/* Admin (password protected): visitor list, event name, reset         */
/* ------------------------------------------------------------------ */

app.post('/api/admin/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
  res.json({ ok: password === ADMIN_PASSWORD });
});

app.get('/api/admin/visitors', requireAdmin, (req, res) => {
  res.json({
    title: state.title,
    nowServing: state.nowServing,
    lastIssued: state.lastIssued,
    visitors: state.visitors
  });
});

function visitorsToCsv(visitors) {
  const rows = visitors.map(v => [
    v.number,
    csvEscape(v.name),
    csvEscape(v.phone),
    csvEscape(v.service),
    new Date(v.registeredAt).toISOString(),
    v.calledAt ? new Date(v.calledAt).toISOString() : ''
  ].join(','));
  return CSV_HEADER + rows.join('\n') + (rows.length ? '\n' : '');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
}

app.get('/api/admin/export', requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="visitors.csv"');
  res.send(visitorsToCsv(state.visitors));
});

app.post('/api/admin/import', requireAdmin, (req, res) => {
  const csvText = (req.body && req.body.csv) || '';
  if (!csvText.trim()) {
    return res.status(400).json({ error: 'No CSV content received.' });
  }

  let rows;
  try {
    rows = parseCsv(csvText);
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse that file as CSV.' });
  }

  if (rows.length < 2) {
    return res.status(400).json({ error: 'The file needs a header row plus at least one visitor row.' });
  }

  const header = rows[0].map(h => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const idxNumber = col('number');
  const idxName = col('name');
  const idxPhone = col('phone');
  const idxService = col('service');
  const idxRegisteredAt = col('registeredat');
  const idxCalledAt = col('calledat');

  if ([idxNumber, idxName, idxPhone, idxService].includes(-1)) {
    return res.status(400).json({ error: 'The header row must include Number, Name, Phone, and Service columns.' });
  }

  const errors = [];
  const seenNumbers = new Set();
  const newVisitors = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1; // matches the row number a spreadsheet would show

    const numberStr = (r[idxNumber] || '').trim();
    const name = (r[idxName] || '').trim();
    const phone = (r[idxPhone] || '').trim();
    const service = (r[idxService] || '').trim();
    const registeredAtStr = idxRegisteredAt > -1 ? (r[idxRegisteredAt] || '').trim() : '';
    const calledAtStr = idxCalledAt > -1 ? (r[idxCalledAt] || '').trim() : '';

    const number = parseInt(numberStr, 10);
    if (!Number.isInteger(number) || number <= 0) {
      errors.push(`Row ${rowNum}: "${numberStr}" isn't a valid ticket number.`);
      continue;
    }
    if (seenNumbers.has(number)) {
      errors.push(`Row ${rowNum}: number ${number} is used more than once.`);
      continue;
    }
    if (!name || !phone || !service) {
      errors.push(`Row ${rowNum}: name, phone, and service can't be empty.`);
      continue;
    }

    let registeredAt = Date.now();
    if (registeredAtStr) {
      const parsed = Date.parse(registeredAtStr);
      if (isNaN(parsed)) {
        errors.push(`Row ${rowNum}: "${registeredAtStr}" isn't a valid date for RegisteredAt.`);
        continue;
      }
      registeredAt = parsed;
    }

    let calledAt = null;
    if (calledAtStr) {
      const parsed = Date.parse(calledAtStr);
      if (isNaN(parsed)) {
        errors.push(`Row ${rowNum}: "${calledAtStr}" isn't a valid date for CalledAt.`);
        continue;
      }
      calledAt = parsed;
    }

    seenNumbers.add(number);
    newVisitors.push({ number, name, phone, service, registeredAt, calledAt });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: `Import stopped — ${errors.length} problem${errors.length === 1 ? '' : 's'} found. Nothing was changed.`,
      details: errors.slice(0, 10)
    });
  }

  if (newVisitors.length === 0) {
    return res.status(400).json({ error: 'No valid visitor rows found in that file.' });
  }

  newVisitors.sort((a, b) => a.number - b.number);
  const maxNumber = newVisitors[newVisitors.length - 1].number;

  state.visitors = newVisitors;
  state.lastIssued = maxNumber;
  state.nowServing = Math.min(state.nowServing, maxNumber);
  state.updatedAt = Date.now();
  persist();

  res.json({ count: newVisitors.length, state: publicState() });
});

app.post('/api/admin/title', requireAdmin, (req, res) => {
  const title = ((req.body && req.body.title) || '').toString().trim().slice(0, 100);
  if (title) {
    state.title = title;
    persist();
  }
  res.json(publicState());
});

app.post('/api/admin/welcome', requireAdmin, (req, res) => {
  const message = ((req.body && req.body.message) || '').toString().trim().slice(0, 200);
  if (message) {
    state.welcomeMessage = message;
    persist();
  }
  res.json(publicState());
});

app.post('/api/admin/pause', requireAdmin, (req, res) => {
  state.registrationPaused = !!(req.body && req.body.paused);
  state.updatedAt = Date.now();
  persist();
  res.json(publicState());
});

app.post('/api/admin/pause-message', requireAdmin, (req, res) => {
  const message = ((req.body && req.body.message) || '').toString().trim().slice(0, 200);
  if (message) {
    state.pausedMessage = message;
    persist();
  }
  res.json(publicState());
});

app.post('/api/admin/services/add', requireAdmin, (req, res) => {
  const service = ((req.body && req.body.service) || '').toString().trim().slice(0, 120);
  if (service && !state.services.includes(service)) {
    state.services.push(service);
    state.updatedAt = Date.now();
    persist();
  }
  res.json(publicState());
});

app.post('/api/admin/services/remove', requireAdmin, (req, res) => {
  const service = ((req.body && req.body.service) || '').toString();
  state.services = state.services.filter(s => s !== service);
  state.updatedAt = Date.now();
  persist();
  res.json(publicState());
});

app.post('/api/admin/reset', requireAdmin, (req, res) => {
  state.lastIssued = 0;
  state.nowServing = 0;
  state.visitors = [];
  state.updatedAt = Date.now();
  persist();
  res.json(publicState());
});

async function start() {
  state = await loadState();
  ensureCsvFile();
  app.listen(PORT, () => {
    console.log(`Queue system running at http://localhost:${PORT}`);
    console.log(usingUpstash
      ? 'Persistent storage: Upstash (survives redeploys).'
      : 'Persistent storage: local file only (will NOT survive a fresh deploy on hosts with ephemeral disks, e.g. Render free tier).');
  });
}

start();