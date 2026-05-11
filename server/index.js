import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'workpulse.json');
const JWT_SECRET = process.env.JWT_SECRET ?? 'workpulse-local-dev-secret';
const PORT = process.env.PORT ?? 4000;

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

async function readStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    const contents = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(contents);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { users: [] };
  }
}

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    employeeId: user.employeeId,
    workplace: user.workplace,
    location: user.location ?? null,
  };
}

function createToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '30d' });
}

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function sortSessions(sessions) {
  return [...sessions].sort((a, b) => Number(a.in) - Number(b.in));
}

function normalizeRecord(record) {
  return {
    sessions: sortSessions(record?.sessions ?? []),
    notes: record?.notes ?? '',
    focus: record?.focus ?? [],
  };
}

function hasSessionOverlap(sessions, inTime, outTime) {
  return sessions.some((session) => {
    const start = Number(session.in);
    const end = session.out ? Number(session.out) : Number.POSITIVE_INFINITY;
    return Number.isFinite(start) && inTime < end && outTime > start;
  });
}

function findUser(store, userId) {
  return store.users.find((user) => user.id === userId);
}

async function requireAuth(request, response, next) {
  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const store = await readStore();
    const user = findUser(store, payload.sub);

    if (!user) {
      return response.status(401).json({ message: 'User not found' });
    }

    request.store = store;
    request.user = user;
    return next();
  } catch {
    return response.status(401).json({ message: 'Please login again' });
  }
}

function updateUser(store, updatedUser) {
  store.users = store.users.map((user) => (user.id === updatedUser.id ? updatedUser : user));
}

app.get('/api/health', (request, response) => {
  response.json({ ok: true });
});

app.post('/api/auth/signup', async (request, response) => {
  const name = String(request.body.name ?? '').trim();
  const email = String(request.body.email ?? '').trim().toLowerCase();
  const password = String(request.body.password ?? '');
  const employeeId = String(request.body.employeeId ?? '').trim() || `EMP-${Date.now().toString().slice(-5)}`;

  if (!name || !email || password.length < 6) {
    return response.status(400).json({ message: 'Name, email, and a 6 character password are required' });
  }

  const store = await readStore();
  const exists = store.users.some((user) => user.email === email || user.employeeId === employeeId);

  if (exists) {
    return response.status(409).json({ message: 'Account already exists for this email or employee ID' });
  }

  const user = {
    id: randomUUID(),
    name,
    email,
    employeeId,
    workplace: 'Technopark Phase 1',
    location: null,
    passwordHash: await bcrypt.hash(password, 10),
    records: {},
    createdAt: Date.now(),
  };

  store.users.push(user);
  await writeStore(store);

  response.status(201).json({
    token: createToken(user),
    user: publicUser(user),
    records: user.records,
  });
});

app.post('/api/auth/login', async (request, response) => {
  const email = String(request.body.email ?? '').trim().toLowerCase();
  const password = String(request.body.password ?? '');
  const store = await readStore();
  const user = store.users.find((item) => item.email === email);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return response.status(401).json({ message: 'Invalid email or password' });
  }

  response.json({
    token: createToken(user),
    user: publicUser(user),
    records: user.records ?? {},
  });
});

app.get('/api/me', requireAuth, (request, response) => {
  response.json({
    user: publicUser(request.user),
    records: request.user.records ?? {},
  });
});

app.get('/api/records', requireAuth, (request, response) => {
  response.json({ records: request.user.records ?? {} });
});

app.put('/api/me/location', requireAuth, async (request, response) => {
  const workplace = String(request.body.workplace ?? '').trim();
  const latitude = Number(request.body.latitude);
  const longitude = Number(request.body.longitude);

  if (!workplace) {
    return response.status(400).json({ message: 'Location name is required' });
  }

  request.user.workplace = workplace;
  request.user.location = Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
  updateUser(request.store, request.user);
  await writeStore(request.store);

  response.json({ user: publicUser(request.user) });
});

app.post('/api/punch/in', requireAuth, async (request, response) => {
  const date = String(request.body.dateKey ?? todayKey());
  const time = Number(request.body.time ?? Date.now());
  const previousOutReason = request.body.previousOutReason === 'break' ? 'break' : 'checkout';
  const user = request.user;
  const record = normalizeRecord(user.records?.[date]);
  const hasActive = record.sessions.some((session) => !session.out);

  if (hasActive) {
    return response.status(409).json({ message: 'You are already punched in' });
  }

  const previousClosed = [...record.sessions].reverse().find((session) => session.out);
  if (previousClosed) {
    previousClosed.outReason = previousOutReason;
  }

  record.sessions.push({ in: time, out: null, outReason: null });
  user.records = { ...(user.records ?? {}), [date]: record };
  updateUser(request.store, user);
  await writeStore(request.store);

  response.json({ records: user.records, record });
});

app.post('/api/punch/out', requireAuth, async (request, response) => {
  const date = String(request.body.dateKey ?? todayKey());
  const time = Number(request.body.time ?? Date.now());
  const reason = request.body.reason === 'break' ? 'break' : 'checkout';
  const user = request.user;
  const record = normalizeRecord(user.records?.[date]);
  const activeIndex = record.sessions.findIndex((session) => !session.out);

  if (activeIndex < 0) {
    return response.status(409).json({ message: 'You need to punch in first' });
  }

  record.sessions[activeIndex] = {
    ...record.sessions[activeIndex],
    out: time,
    outReason: reason,
  };
  user.records = { ...(user.records ?? {}), [date]: record };
  updateUser(request.store, user);
  await writeStore(request.store);

  response.json({ records: user.records, record });
});

app.post('/api/records/:date/sessions', requireAuth, async (request, response) => {
  const date = String(request.params.date ?? todayKey());
  const inTime = Number(request.body.in);
  const outTime = Number(request.body.out);
  const allowOverlap = Boolean(request.body.allowOverlap);
  const user = request.user;
  const record = normalizeRecord(user.records?.[date]);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return response.status(400).json({ message: 'Choose a valid date' });
  }

  if (!Number.isFinite(inTime) || !Number.isFinite(outTime) || outTime <= inTime) {
    return response.status(400).json({ message: 'Punch out must be after punch in' });
  }

  if (hasSessionOverlap(record.sessions, inTime, outTime) && !allowOverlap) {
    return response.status(409).json({ message: 'Manual time overlaps an existing session', canOverride: true });
  }

  record.sessions = sortSessions([
    ...record.sessions,
    {
      in: inTime,
      out: outTime,
      outReason: 'checkout',
      manual: true,
    },
  ]);
  user.records = { ...(user.records ?? {}), [date]: record };
  updateUser(request.store, user);
  await writeStore(request.store);

  response.json({ records: user.records, record });
});

app.put('/api/records/:date/notes', requireAuth, async (request, response) => {
  const user = request.user;
  const record = normalizeRecord(user.records?.[request.params.date]);
  record.notes = String(request.body.notes ?? '');
  record.focus = Array.isArray(request.body.focus) ? request.body.focus : [];
  user.records = { ...(user.records ?? {}), [request.params.date]: record };
  updateUser(request.store, user);
  await writeStore(request.store);

  response.json({ records: user.records, record });
});

app.delete('/api/records/:date', requireAuth, async (request, response) => {
  const user = request.user;
  const records = { ...(user.records ?? {}) };
  delete records[request.params.date];
  user.records = records;
  updateUser(request.store, user);
  await writeStore(request.store);

  response.json({ records });
});

app.delete('/api/records', requireAuth, async (request, response) => {
  request.user.records = {};
  updateUser(request.store, request.user);
  await writeStore(request.store);

  response.json({ records: {} });
});

app.listen(PORT, () => {
  console.log(`WorkPulse API running on http://127.0.0.1:${PORT}`);
});
