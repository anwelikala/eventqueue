const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'state.json');

const DEFAULT_STATE = {
  title: 'Application Help Day',
  lastIssued: 0,
  nowServing: 0,
  updatedAt: Date.now()
};

function loadState() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
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

// Read the current queue state.
app.get('/api/state', (req, res) => {
  res.json(state);
});

// A visitor pulls a new ticket number.
app.post('/api/register', (req, res) => {
  state.lastIssued += 1;
  state.updatedAt = Date.now();
  persist();
  res.json({ number: state.lastIssued, state });
});

// Staff calls the next waiting number.
app.post('/api/call-next', (req, res) => {
  if (state.nowServing < state.lastIssued) {
    state.nowServing += 1;
    state.updatedAt = Date.now();
    persist();
  }
  res.json(state);
});

// Staff re-announces the current number (bumps the display's pulse animation).
app.post('/api/recall', (req, res) => {
  state.updatedAt = Date.now();
  persist();
  res.json(state);
});

// Staff resets the whole queue back to zero for a new event.
app.post('/api/reset', (req, res) => {
  state.lastIssued = 0;
  state.nowServing = 0;
  state.updatedAt = Date.now();
  persist();
  res.json(state);
});

// Staff renames the event; shown on the register and display screens.
app.post('/api/title', (req, res) => {
  const title = ((req.body && req.body.title) || '').toString().trim().slice(0, 60);
  if (title) {
    state.title = title;
    persist();
  }
  res.json(state);
});

app.listen(PORT, () => {
  console.log(`Queue system running at http://localhost:${PORT}`);
});
