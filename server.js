const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'state.json');
const CSV_FILE = path.join(__dirname, 'visitors.csv');
const CSV_HEADER = 'Number,Name,Phone,Email,Service,RegisteredAt,CalledAt\n';

// Change these — either edit the defaults below, or (recommended) set
// CALL_PASSWORD and ADMIN_PASSWORD as environment variables on your host
// so you don't have to put real passwords in the code.
const CALL_PASSWORD = process.env.CALL_PASSWORD || 'call1234';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';

// Optional email confirmations — only active if all three SMTP_* variables
// are set (see README). ADMIN_EMAIL is optional; if set, every confirmation
// is BCC'd there too, which doubles as an off-server backup of every
// registration.
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

const emailEnabled = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
const transporter = emailEnabled ? nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
}) : null;

async function sendConfirmationEmail(visitor, eventTitle) {
  if (!emailEnabled || !visitor.email) return;
  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: visitor.email,
      bcc: ADMIN_EMAIL || undefined,
      subject: `Your number: ${String(visitor.number).padStart(3, '0')} — ${eventTitle}`,
      text: `Hi ${visitor.name || 'there'},\n\nYour number for "${visitor.service}" at ${eventTitle} is ${String(visitor.number).padStart(3, '0')}.\n\nWe'll help you in order — please watch the queue screen, or check back closer to your number.\n\nThanks for your patience.`
    });
  } catch (err) {
    console.error('Failed to send confirmation email:', err.message);
  }
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
    csvEscape(visitor.email),
    csvEscape(visitor.service),
    new Date(visitor.registeredAt).toISOString(),
    visitor.calledAt ? new Date(visitor.calledAt).toISOString() : ''
  ].join(',') + '\n';
  fs.appendFile(CSV_FILE, row, (err) => {
    if (err) console.error('Failed to append to visitors.csv:', err);
  });
}

ensureCsvFile();

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
  updatedAt: Date.now(),
  visitors: [] // { number, name, phone, service, registeredAt, calledAt }
};

function loadState() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...parsed,
      services: Array.isArray(parsed.services) ? parsed.services : DEFAULT_STATE.services,
      visitors: Array.isArray(parsed.visitors) ? parsed.visitors : []
    };
  } catch (e) {
    return { ...DEFAULT_STATE };
  }
}

function persist() {
  fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), (err) => {
    if (err) console.error('Failed to save state.json:', err);
  });
}

let state = loadState();

app.use(express.json());
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

app.post('/api/register', (req, res) => {
  const name = ((req.body && req.body.name) || '').toString().trim().slice(0, 80);
  const phone = ((req.body && req.body.phone) || '').toString().trim().slice(0, 40);
  const email = ((req.body && req.body.email) || '').toString().trim().slice(0, 100);
  const service = ((req.body && req.body.service) || '').toString().trim().slice(0, 120);

  state.lastIssued += 1;
  const number = state.lastIssued;
  const visitor = {
    number,
    name,
    phone,
    email,
    service,
    registeredAt: Date.now(),
    calledAt: null
  };
  state.visitors.push(visitor);
  state.updatedAt = Date.now();
  persist();
  appendVisitorToCsv(visitor);

  res.json({ number, state: publicState() });

  // Fire-and-forget — don't make the visitor wait on an email round trip.
  // Errors are caught and logged inside sendConfirmationEmail.
  sendConfirmationEmail(visitor, state.title);
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
  state.updatedAt = Date.now();
  persist();
  res.json(publicState());
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
    visitors: state.visitors,
    emailEnabled
  });
});

function visitorsToCsv(visitors) {
  const rows = visitors.map(v => [
    v.number,
    csvEscape(v.name),
    csvEscape(v.phone),
    csvEscape(v.email),
    csvEscape(v.service),
    new Date(v.registeredAt).toISOString(),
    v.calledAt ? new Date(v.calledAt).toISOString() : ''
  ].join(','));
  return CSV_HEADER + rows.join('\n') + (rows.length ? '\n' : '');
}

app.get('/api/admin/export', requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="visitors.csv"');
  res.send(visitorsToCsv(state.visitors));
});

app.post('/api/admin/title', requireAdmin, (req, res) => {
  const title = ((req.body && req.body.title) || '').toString().trim().slice(0, 60);
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

app.listen(PORT, () => {
  console.log(`Queue system running at http://localhost:${PORT}`);
});
