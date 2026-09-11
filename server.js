const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'state.json');
const CSV_FILE = path.join(__dirname, 'visitors.csv');
const CSV_HEADER = 'Counter,TicketNumber,Name,Phone,Service,RegisteredAt,CalledAt,Completed\n';
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

function appendVisitorToCsv(visitor, counter) {
  const row = [
    csvEscape(counter ? counter.label : visitor.counterId),
    csvEscape(visitor.ticketNumber),
    csvEscape(visitor.name),
    csvEscape(visitor.phone),
    csvEscape(visitor.service),
    new Date(visitor.registeredAt).toISOString(),
    visitor.calledAt ? new Date(visitor.calledAt).toISOString() : '',
    visitor.helped ? 'true' : 'false'
  ].join(',') + '\n';
  fs.appendFile(CSV_FILE, row, (err) => {
    if (err) console.error('Failed to append to visitors.csv:', err);
  });
}

const DEFAULT_STATE = {
  title: 'Application Help Day',
  welcomeMessage: "Choose what you're here to do.",
  ticketMessage: "We'll help you in order.",
  privacyNotice: "Your name, phone number, and selected service are used only to manage today's queue and are deleted after the event.",
  multiCounterNotice: "If you need services from more than one counter, please get a number for each.",
  serviceNotice: "Please choose carefully — your selection determines which counter you'll be queued at.",

  // Each counter runs its own independent ticket sequence and its own
  // "now serving" number — so one counter being faster or slower than
  // another never affects the other's numbering.
  counters: [
    { id: 'counter1', label: 'A', prefix: 'A', lastIssued: 0, nowServing: 0, lastRecallAt: null, allowOther: false },
    { id: 'counter2', label: 'B', prefix: 'B', lastIssued: 0, nowServing: 0, lastRecallAt: null, allowOther: true }
  ],

  // Every service belongs to exactly one counter. "Other" is not a normal
  // service — it's a free-text option offered on whichever counter(s)
  // have allowOther: true (see the counters above).
  services: [
    { name: 'Passport', counterId: 'counter1' },
    { name: 'Emergency Travel Documents', counterId: 'counter1' },
    { name: 'Dual Citizenship', counterId: 'counter1' },
    { name: 'Registration of Marriages', counterId: 'counter1' },
    { name: 'Attestation / Legalization (PoA, Affidavits, No objections)', counterId: 'counter1' },
    { name: 'Government Leave Extensions', counterId: 'counter1' },
    { name: 'Life Certificates', counterId: 'counter1' },
    { name: 'Registration of Birth, Citizenship and Passport for Newborn', counterId: 'counter2' },
    { name: 'Late Birth and Citizenship', counterId: 'counter2' },
    { name: 'Driving License', counterId: 'counter2' },
    { name: 'Registration of Death', counterId: 'counter2' },
    { name: 'VISA matters', counterId: 'counter2' }
  ],

  registrationPaused: false,
  pausedMessage: "We're not issuing new numbers right now. Please check back shortly.",
  updatedAt: Date.now(),
  visitors: [] // { ticketNumber, counterId, counterSeq, name, phone, service, registeredAt, calledAt, helped }
};

function mergeWithDefaults(parsed) {
  return {
    ...DEFAULT_STATE,
    ...parsed,
    counters: Array.isArray(parsed.counters) ? parsed.counters : DEFAULT_STATE.counters,
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
    ticketMessage: state.ticketMessage,
    privacyNotice: state.privacyNotice,
    multiCounterNotice: state.multiCounterNotice,
    serviceNotice: state.serviceNotice,
    counters: state.counters,
    services: state.services,
    registrationPaused: state.registrationPaused,
    pausedMessage: state.pausedMessage,
    updatedAt: state.updatedAt
  };
}

function findCounter(counterId) {
  return state.counters.find(c => c.id === counterId);
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

function validateName(name) {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const parts = trimmed.split(' ').filter(Boolean);
  if (parts.length < 2) return 'Please enter both your first and last name.';
  const partPattern = /^[\p{L}'’\-.]+$/u;
  for (const part of parts) {
    if (!partPattern.test(part)) return 'Enter your name using letters only.';
    const lettersOnly = part.replace(/[^\p{L}]/gu, '').toLowerCase();
    if (lettersOnly.length > 0 && /^(.)\1+$/u.test(lettersOnly)) return 'Enter your name using letters only.';
  }
  const anyPartLongEnough = parts.some(p => p.replace(/[^\p{L}]/gu, '').length > 3);
  if (!anyPartLongEnough) return 'Your first or last name should be more than 3 characters.';
  return null;
}

app.post('/api/register', (req, res) => {
  if (state.registrationPaused) {
    return res.status(403).json({ error: state.pausedMessage || 'Registration is currently paused.' });
  }

  const name = ((req.body && req.body.name) || '').toString().trim().slice(0, 80);
  const phone = ((req.body && req.body.phone) || '').toString().trim().slice(0, 40);
  const rawService = ((req.body && req.body.service) || '').toString().trim().slice(0, 160);
  const counterId = ((req.body && req.body.counterId) || '').toString().trim();

  if (!name || !rawService) {
    return res.status(400).json({ error: 'Name and service are required.' });
  }
  const nameError = validateName(name);
  if (nameError) {
    return res.status(400).json({ error: nameError });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: 'Enter a valid phone number (digits only, at least 7 digits).' });
  }

  const counter = findCounter(counterId);
  if (!counter) {
    return res.status(400).json({ error: 'Please choose a valid service.' });
  }
  const knownService = state.services.some(s => s.counterId === counterId && s.name === rawService);
  if (!knownService && !counter.allowOther) {
    return res.status(400).json({ error: 'Please choose a valid service.' });
  }

  counter.lastIssued += 1;
  const counterSeq = counter.lastIssued;
  const ticketNumber = `${counter.prefix}-${String(counterSeq).padStart(3, '0')}`;
  const visitor = {
    ticketNumber,
    counterId,
    counterSeq,
    name,
    phone,
    service: rawService,
    registeredAt: Date.now(),
    calledAt: null,
    helped: false
  };
  state.visitors.push(visitor);
  state.updatedAt = Date.now();
  persist();
  appendVisitorToCsv(visitor, counter);

  res.json({ ticketNumber, counterId, counterSeq, service: visitor.service, state: publicState() });
});

/* ------------------------------------------------------------------ */
/* Call desk (password protected): call next / recall, per counter     */
/* ------------------------------------------------------------------ */

app.post('/api/call/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
  res.json({ ok: password === CALL_PASSWORD });
});

app.get('/api/call/state', requireCall, (req, res) => {
  res.json(publicState());
});

app.post('/api/call/next', requireCall, (req, res) => {
  const counter = findCounter((req.body && req.body.counterId || '').toString());
  if (!counter) return res.status(400).json({ error: 'Unknown counter.' });
  if (counter.nowServing < counter.lastIssued) {
    counter.nowServing += 1;
    const visitor = state.visitors.find(v => v.counterId === counter.id && v.counterSeq === counter.nowServing);
    if (visitor) visitor.calledAt = Date.now();
    state.updatedAt = Date.now();
    persist();
  }
  res.json(publicState());
});

app.post('/api/call/recall', requireCall, (req, res) => {
  const counter = findCounter((req.body && req.body.counterId || '').toString());
  if (!counter) return res.status(400).json({ error: 'Unknown counter.' });
  counter.lastRecallAt = Date.now();
  state.updatedAt = Date.now();
  persist();
  res.json(publicState());
});

app.get('/api/call/visitors', requireCall, (req, res) => {
  const counterId = (req.query.counterId || '').toString();
  const list = counterId ? state.visitors.filter(v => v.counterId === counterId) : state.visitors;
  res.json({ visitors: list });
});

function setVisitorHelped(req, res) {
  const ticketNumber = ((req.body && req.body.ticketNumber) || '').toString();
  const helped = !!(req.body && req.body.helped);
  const visitor = state.visitors.find(v => v.ticketNumber === ticketNumber);
  if (!visitor) {
    return res.status(404).json({ error: 'Visitor not found.' });
  }
  visitor.helped = helped;
  state.updatedAt = Date.now();
  persist();
  res.json({ visitors: state.visitors });
}
app.post('/api/call/visitors/helped', requireCall, setVisitorHelped);
app.post('/api/admin/visitors/helped', requireAdmin, setVisitorHelped);

/* ------------------------------------------------------------------ */
/* Admin (password protected)                                          */
/* ------------------------------------------------------------------ */

app.post('/api/admin/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
  res.json({ ok: password === ADMIN_PASSWORD });
});

app.get('/api/admin/visitors', requireAdmin, (req, res) => {
  res.json({
    title: state.title,
    counters: state.counters,
    visitors: state.visitors
  });
});

function visitorsToCsv(visitors) {
  const rows = visitors.map(v => {
    const counter = findCounter(v.counterId);
    return [
      csvEscape(counter ? counter.label : v.counterId),
      csvEscape(v.ticketNumber),
      csvEscape(v.name),
      csvEscape(v.phone),
      csvEscape(v.service),
      new Date(v.registeredAt).toISOString(),
      v.calledAt ? new Date(v.calledAt).toISOString() : '',
      v.helped ? 'true' : 'false'
    ].join(',');
  });
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
  const idxCounter = col('counter');
  const idxTicket = col('ticketnumber');
  const idxName = col('name');
  const idxPhone = col('phone');
  const idxService = col('service');
  const idxRegisteredAt = col('registeredat');
  const idxCalledAt = col('calledat');
  const idxHelped = col('completed') > -1 ? col('completed') : col('helped'); // accept either header name

  if ([idxCounter, idxTicket, idxName, idxPhone, idxService].includes(-1)) {
    return res.status(400).json({ error: 'The header row must include Counter, TicketNumber, Name, Phone, and Service columns.' });
  }

  const errors = [];
  const seenTickets = new Set();
  const newVisitors = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;

    const counterLabel = (r[idxCounter] || '').trim();
    const ticketNumber = (r[idxTicket] || '').trim();
    const name = (r[idxName] || '').trim();
    const phone = (r[idxPhone] || '').trim();
    const service = (r[idxService] || '').trim();
    const registeredAtStr = idxRegisteredAt > -1 ? (r[idxRegisteredAt] || '').trim() : '';
    const calledAtStr = idxCalledAt > -1 ? (r[idxCalledAt] || '').trim() : '';
    const helpedStr = idxHelped > -1 ? (r[idxHelped] || '').trim().toLowerCase() : '';

    const counter = state.counters.find(c => c.label.toLowerCase() === counterLabel.toLowerCase());
    if (!counter) {
      errors.push(`Row ${rowNum}: "${counterLabel}" doesn't match a known counter.`);
      continue;
    }
    if (!ticketNumber) {
      errors.push(`Row ${rowNum}: TicketNumber can't be blank.`);
      continue;
    }
    if (seenTickets.has(ticketNumber)) {
      errors.push(`Row ${rowNum}: ticket number ${ticketNumber} is used more than once.`);
      continue;
    }
    const seqMatch = ticketNumber.match(/(\d+)\s*$/);
    if (!seqMatch) {
      errors.push(`Row ${rowNum}: couldn't find a number at the end of "${ticketNumber}".`);
      continue;
    }
    const counterSeq = parseInt(seqMatch[1], 10);
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

    seenTickets.add(ticketNumber);
    const helped = ['true', 'yes', '1'].includes(helpedStr);
    newVisitors.push({ ticketNumber, counterId: counter.id, counterSeq, name, phone, service, registeredAt, calledAt, helped });
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

  newVisitors.sort((a, b) => a.counterId === b.counterId ? a.counterSeq - b.counterSeq : a.counterId.localeCompare(b.counterId));

  state.visitors = newVisitors;
  state.counters.forEach(counter => {
    const seqs = newVisitors.filter(v => v.counterId === counter.id).map(v => v.counterSeq);
    const maxSeq = seqs.length ? Math.max(...seqs) : 0;
    counter.lastIssued = maxSeq;
    counter.nowServing = Math.min(counter.nowServing, maxSeq);
  });
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

app.post('/api/admin/ticket-message', requireAdmin, (req, res) => {
  const message = ((req.body && req.body.message) || '').toString().trim().slice(0, 150);
  if (message) {
    state.ticketMessage = message;
    persist();
  }
  res.json(publicState());
});

app.post('/api/admin/privacy-notice', requireAdmin, (req, res) => {
  const message = ((req.body && req.body.message) || '').toString().trim().slice(0, 250);
  if (message) {
    state.privacyNotice = message;
    persist();
  }
  res.json(publicState());
});

app.post('/api/admin/multi-counter-notice', requireAdmin, (req, res) => {
  const message = ((req.body && req.body.message) || '').toString().trim().slice(0, 200);
  if (message) {
    state.multiCounterNotice = message;
    persist();
  }
  res.json(publicState());
});

app.post('/api/admin/service-notice', requireAdmin, (req, res) => {
  const message = ((req.body && req.body.message) || '').toString().trim().slice(0, 200);
  if (message) {
    state.serviceNotice = message;
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
  const name = ((req.body && req.body.service) || '').toString().trim().slice(0, 160);
  const counterId = ((req.body && req.body.counterId) || '').toString();
  const counter = findCounter(counterId);
  if (!name || !counter) {
    return res.status(400).json({ error: 'Service name and counter are required.' });
  }
  if (!state.services.some(s => s.name === name)) {
    state.services.push({ name, counterId });
    state.updatedAt = Date.now();
    persist();
  }
  res.json(publicState());
});

app.post('/api/admin/services/remove', requireAdmin, (req, res) => {
  const name = ((req.body && req.body.service) || '').toString();
  state.services = state.services.filter(s => s.name !== name);
  state.updatedAt = Date.now();
  persist();
  res.json(publicState());
});

app.post('/api/admin/counters/add', requireAdmin, (req, res) => {
  const label = ((req.body && req.body.label) || '').toString().trim().slice(0, 40);
  const prefix = ((req.body && req.body.prefix) || '').toString().trim().slice(0, 6);
  const allowOther = !!(req.body && req.body.allowOther);
  if (!label || !prefix) {
    return res.status(400).json({ error: 'Label and prefix are required.' });
  }
  const id = 'counter_' + Date.now().toString(36);
  state.counters.push({ id, label, prefix, lastIssued: 0, nowServing: 0, lastRecallAt: null, allowOther });
  state.updatedAt = Date.now();
  persist();
  res.json(publicState());
});

app.post('/api/admin/counters/update', requireAdmin, (req, res) => {
  const id = ((req.body && req.body.id) || '').toString();
  const counter = findCounter(id);
  if (!counter) return res.status(404).json({ error: 'Counter not found.' });
  if (req.body.label) counter.label = req.body.label.toString().trim().slice(0, 40);
  if (req.body.prefix) counter.prefix = req.body.prefix.toString().trim().slice(0, 6);
  if (typeof req.body.allowOther === 'boolean') counter.allowOther = req.body.allowOther;
  state.updatedAt = Date.now();
  persist();
  res.json(publicState());
});

app.post('/api/admin/counters/remove', requireAdmin, (req, res) => {
  const id = ((req.body && req.body.id) || '').toString();
  const counter = findCounter(id);
  if (!counter) return res.status(404).json({ error: 'Counter not found.' });
  const hasServices = state.services.some(s => s.counterId === id);
  const hasVisitors = state.visitors.some(v => v.counterId === id);
  if (hasServices || hasVisitors) {
    return res.status(400).json({ error: "Move or remove this counter's services and visitors first." });
  }
  state.counters = state.counters.filter(c => c.id !== id);
  state.updatedAt = Date.now();
  persist();
  res.json(publicState());
});

app.post('/api/admin/reset', requireAdmin, (req, res) => {
  state.counters.forEach(c => {
    c.lastIssued = 0;
    c.nowServing = 0;
    c.lastRecallAt = null;
  });
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
