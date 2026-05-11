import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Coffee,
  Download,
  FileText,
  HelpCircle,
  Home,
  LockKeyhole,
  Mail,
  LogOut,
  MapPin,
  Plus,
  Save,
  Shield,
  Timer,
  User,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const TOKEN_KEY = 'workpulse-auth-token';
const GUEST_KEY = 'workpulse-guest-session';
const GUEST_RECORDS_KEY = 'workpulse-guest-records';
const GUEST_USER_KEY = 'workpulse-guest-user';
const ONBOARDING_KEY = 'workpulse-onboarding-v2-done';
const TARGET_MS = 8 * 60 * 60 * 1000;
const WORKPLACE_RADIUS_METERS = 150;
const WORKPLACE = 'Technopark Phase 1';
const DETAIL_VIEWS = new Set(['notifications', 'notes', 'location', 'manual']);

const focusTags = ['Development', 'Design', 'Meeting', 'Testing', 'Research', 'Other'];

async function apiRequest(path, { body, method = 'GET', token } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message ?? 'Something went wrong');
  }

  return data;
}

function readJsonStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function defaultGuestUser() {
  return {
    id: 'guest',
    name: 'Guest User',
    email: '',
    employeeId: 'GUEST',
    workplace: WORKPLACE,
    location: null,
    isGuest: true,
  };
}

function readGuestUser() {
  return { ...defaultGuestUser(), ...readJsonStorage(GUEST_USER_KEY, {}) };
}

function readGuestRecords() {
  return readJsonStorage(GUEST_RECORDS_KEY, {});
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatClock(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLongDate(date) {
  return date.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatHours(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${pad(minutes)}m`;
}

function formatTimer(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + offset);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getWeekDays(date) {
  const first = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => {
    const next = new Date(first);
    next.setDate(first.getDate() + index);
    return next;
  });
}

function normalizeRecord(record) {
  return {
    sessions: [...(record?.sessions ?? [])].sort((a, b) => Number(a.in) - Number(b.in)),
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

function getTodayRecord(records, dateKey) {
  return normalizeRecord(records[dateKey]);
}

function calculateWorkedMs(record, now) {
  return normalizeRecord(record).sessions.reduce((total, session) => {
    const out = session.out ?? now;
    return total + Math.max(0, out - session.in);
  }, 0);
}

function calculateCompletedMs(record) {
  return normalizeRecord(record).sessions.reduce((total, session) => {
    if (!session.out) return total;
    return total + Math.max(0, session.out - session.in);
  }, 0);
}

function calculateBreakMs(record) {
  return normalizeRecord(record).sessions.reduce((total, session, index, sessions) => {
    if (index === 0) return total;
    const previous = sessions[index - 1];
    if (!previous.out || previous.outReason !== 'break') return total;
    return total + Math.max(0, session.in - previous.out);
  }, 0);
}

function calculateDistanceMeters(a, b) {
  if (!a || !b) return null;

  const earthRadius = 6371000;
  const toRadians = (value) => (value * Math.PI) / 180;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const haversine = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;

  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
}

function formatDistance(meters) {
  if (meters === null) return 'Not available';
  if (meters < 1000) return `${meters} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

function parseLocalDateTime(date, time) {
  const value = new Date(`${date}T${time}`);
  const timestamp = value.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getGreeting(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getDailyEvents(sessions) {
  return sessions.flatMap((session, index) => {
    const isFirst = index === 0;
    const previous = sessions[index - 1];
    const events = [
      {
        id: `${session.in}-in`,
        time: session.in,
        title: !isFirst && previous?.outReason === 'break' ? 'Break End' : 'Check In',
        icon: !isFirst && previous?.outReason === 'break' ? Coffee : CheckCircle2,
        meta: WORKPLACE,
      },
    ];

    if (session.out) {
      events.push({
        id: `${session.out}-out`,
        time: session.out,
        title: session.outReason === 'break' ? 'Break Start' : 'Check Out',
        icon: session.outReason === 'break' ? Coffee : LogOut,
        meta: WORKPLACE,
      });
    }

    return events;
  });
}

function WorkPulseLogo({ compact = false }) {
  return (
    <div className={compact ? 'workpulse-logo compact' : 'workpulse-logo'}>
      <div className="logo-ring">
        <Clock3 size={compact ? 22 : 36} />
        <CheckCircle2 className="logo-check" size={compact ? 15 : 22} />
      </div>
    </div>
  );
}

function AppHeader({ activeView, now, setActiveView, user }) {
  const isBackView = DETAIL_VIEWS.has(activeView);

  return (
    <header className={isBackView ? 'app-header detail-header' : 'app-header'}>
      {isBackView ? (
        <button className="header-icon" onClick={() => setActiveView('home')} type="button">
          <ArrowLeft size={18} />
        </button>
      ) : (
        <div className="header-copy">
          <div className="location-chip">
            <MapPin size={13} />
            {user?.workplace ?? WORKPLACE}
          </div>
          <div>
            <p>{getGreeting(now)},</p>
            <h1>{user?.name ?? 'Employee'}</h1>
            <span>{formatLongDate(now)}</span>
          </div>
        </div>
      )}

      {activeView === 'notifications' ? <h2>Notifications</h2> : null}
      {activeView === 'notes' ? <h2>Work Notes</h2> : null}
      {activeView === 'location' ? <h2>Location</h2> : null}
      {activeView === 'manual' ? <h2>Add Time</h2> : null}

      {!isBackView ? (
        <div className="header-actions">
          <button className="header-icon has-dot" onClick={() => setActiveView('notifications')} type="button">
            <Bell size={18} />
          </button>
        </div>
      ) : (
        <button className="header-action" onClick={() => setActiveView('home')} type="button">
          Done
        </button>
      )}
    </header>
  );
}

function MetricCard({ label, value, hint, icon: Icon }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">
        <Icon size={18} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{hint}</p>
    </article>
  );
}

function WorkplaceCard({ distanceMeters, liveLocation, setActiveView, user }) {
  const hasSavedLocation = Boolean(user?.location);
  const locationCopy = hasSavedLocation
    ? `${formatDistance(distanceMeters)} / ${distanceMeters !== null && distanceMeters <= WORKPLACE_RADIUS_METERS ? 'within range' : 'outside range'}`
    : liveLocation
      ? 'Live location active'
      : 'Allow location';

  return (
    <section className="glass-card workplace-card">
      <div className="workplace-main">
        <div>
          <span className="eyebrow">Workplace</span>
          <h3>{user?.workplace ?? WORKPLACE}</h3>
          <p>{locationCopy}</p>
        </div>
        <button className="pin-button" onClick={() => setActiveView('location')} type="button">
          <MapPin size={20} />
        </button>
      </div>
      <div className="workplace-live">
        <div>
          <span className="eyebrow">Live Location</span>
          {liveLocation ? (
            <strong>Live location active</strong>
          ) : (
            <button className="location-inline-action" onClick={() => setActiveView('location')} type="button">
              Allow Location
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function HomeScreen({ activeSession, breakMs, completedMs, distanceMeters, liveLocation, onBreak, punchIn, punchOut, setActiveView, todayRecord, totalMs, user, weeklyMs }) {
  const remainingMs = Math.max(0, TARGET_MS - totalMs);
  const overtimeMs = Math.max(0, totalMs - TARGET_MS);
  const lastClosed = todayRecord.sessions.filter((session) => session.out && session.outReason !== 'break').at(-1);

  return (
    <div className="screen-stack home-stack">
      {activeSession ? (
        <section className="glass-card live-card">
          <span className="eyebrow green">Live Timer</span>
          <strong>{formatTimer(totalMs)}</strong>
          <p>Working since {formatClock(activeSession.in)}</p>
          <small>On track</small>
          <button className="ready-punch-button danger" onClick={punchOut} type="button">
            Punch Out
          </button>
        </section>
      ) : (
        <section className="empty-clock-card">
          <div className="clock-illustration">
            <Timer size={46} />
          </div>
          <h3>{onBreak ? 'Break in progress' : lastClosed ? 'You are checked out' : 'Ready to start'}</h3>
          <p>{onBreak ? 'Punch in when you are back. We will count the gap as break time.' : lastClosed ? 'Punch in again to continue your hours.' : 'Tap punch in to start tracking your work hours.'}</p>
          <button className="ready-punch-button" onClick={punchIn} type="button">
            Punch In
          </button>
        </section>
      )}

      <WorkplaceCard distanceMeters={distanceMeters} liveLocation={liveLocation} setActiveView={setActiveView} user={user} />

      <section className="target-card">
        <span className="eyebrow">Today target</span>
        <div>
          <strong>8h 00m</strong>
          <p>Standard work hours</p>
        </div>
        <div className="progress-ring" style={{ '--progress': `${Math.min(100, (totalMs / TARGET_MS) * 100)}%` }}>
          <span>{Math.min(100, Math.floor((totalMs / TARGET_MS) * 100))}%</span>
        </div>
      </section>

      <section className="summary-card">
        <div className="section-title">
          <div>
            <span className="eyebrow">Today's summary</span>
            <h2>{formatHours(completedMs)}</h2>
          </div>
          <div className="section-actions">
            <button onClick={() => setActiveView('manual')} type="button">
              Add Time
            </button>
            <button onClick={() => setActiveView('notes')} type="button">
              Add Note
            </button>
          </div>
        </div>
        <SummaryRow label="Check In" value={todayRecord.sessions[0] ? formatClock(todayRecord.sessions[0].in) : '--'} />
        <SummaryRow label="Check Out" value={lastClosed ? formatClock(lastClosed.out) : '--'} />
        <SummaryRow label="Break Time" value={formatHours(breakMs)} />
        <SummaryRow label="Overtime" value={formatHours(overtimeMs)} positive />
      </section>

      <section className="quick-grid">
        <MetricCard icon={Clock3} label="Worked" value={formatHours(totalMs)} hint="Today" />
        <MetricCard icon={Timer} label="Remaining" value={formatHours(remainingMs)} hint="Target left" />
        <MetricCard icon={Coffee} label="Break" value={formatHours(breakMs)} hint="Away time" />
        <MetricCard icon={BarChart3} label="Week" value={formatHours(weeklyMs)} hint="Mon to Sun" />
      </section>
    </div>
  );
}

function SummaryRow({ label, positive = false, value }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong className={positive ? 'positive' : ''}>{value}</strong>
    </div>
  );
}

function TimelineScreen({ records, today, todayRecord }) {
  const weekDays = getWeekDays(today);
  const events = getDailyEvents(todayRecord.sessions);

  return (
    <div className="screen-stack">
      <div className="month-title">
        <h2>Timeline</h2>
        <button type="button">
          <CalendarDays size={18} />
        </button>
      </div>

      <section className="date-strip">
        {weekDays.map((day) => {
          const key = formatDateKey(day);
          const isToday = key === formatDateKey(today);
          return (
            <div className={isToday ? 'date-chip active' : 'date-chip'} key={key}>
              <span>{day.toLocaleDateString([], { weekday: 'short' })}</span>
              <strong>{day.getDate()}</strong>
            </div>
          );
        })}
      </section>

      <section className="timeline-card">
        {events.length === 0 ? (
          <div className="empty-state compact">
            <strong>No timeline yet</strong>
            <span>Your check in and check out events will appear here.</span>
          </div>
        ) : (
          events.map((event) => {
            const Icon = event.icon;
            return (
              <article className="event-row" key={event.id}>
                <div className="event-time">{formatClock(event.time)}</div>
                <div className="event-line">
                  <span />
                </div>
                <div className="event-content">
                  <Icon size={17} />
                  <div>
                    <strong>{event.title}</strong>
                    <span>{event.meta}</span>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      <HistoryList records={records} />
    </div>
  );
}

function HistoryList({ records }) {
  const rows = Object.entries(records)
    .map(([date, record]) => ({
      date,
      breakTime: calculateBreakMs(record),
      sessions: normalizeRecord(record).sessions.length,
      worked: calculateCompletedMs(record),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (rows.length === 0) return null;

  return (
    <section className="history-card">
      <div className="section-title">
        <div>
          <span className="eyebrow">Recent days</span>
          <h2>History</h2>
        </div>
      </div>
      {rows.map((row) => (
        <article className="history-row" key={row.date}>
          <div>
            <strong>{row.date}</strong>
            <span>{row.sessions} sessions, {formatHours(row.breakTime)} break</span>
          </div>
          <b>{formatHours(row.worked)}</b>
        </article>
      ))}
    </section>
  );
}

function ReportsScreen({ records, today }) {
  const monthKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
  const monthRecords = Object.entries(records).filter(([date]) => date.startsWith(monthKey));
  const totalMs = monthRecords.reduce((total, [, record]) => total + calculateCompletedMs(record), 0);
  const breakMs = monthRecords.reduce((total, [, record]) => total + calculateBreakMs(record), 0);
  const presentDays = monthRecords.filter(([, record]) => normalizeRecord(record).sessions.length > 0).length;
  const weekDays = getWeekDays(today);

  return (
    <div className="screen-stack">
      <section className="analytics-hero">
        <div>
          <span>Total Work Hours</span>
          <strong>{formatHours(totalMs)}</strong>
          <p>{presentDays} present days this month</p>
        </div>
        <div className="progress-ring large" style={{ '--progress': `${Math.min(120, (totalMs / (160 * 60 * 60 * 1000)) * 100)}%` }}>
          <span>{Math.max(0, Math.floor((totalMs / (160 * 60 * 60 * 1000)) * 100))}%</span>
        </div>
      </section>

      <section className="insight-card">
        <h2>Insights</h2>
        <SummaryRow label="Present Days" value={presentDays} />
        <SummaryRow label="Total Break Time" value={formatHours(breakMs)} />
        <SummaryRow label="Average Day" value={presentDays ? formatHours(totalMs / presentDays) : '0h 00m'} />
        <SummaryRow label="Overtime" value={formatHours(Math.max(0, totalMs - presentDays * TARGET_MS))} positive />
      </section>

      <section className="chart-card">
        {weekDays.map((day) => {
          const key = formatDateKey(day);
          const value = calculateCompletedMs(records[key] ?? { sessions: [] });
          const height = Math.max(12, Math.min(104, (value / TARGET_MS) * 104));
          return (
            <div className="bar-item" key={key}>
              <div className="bar-track">
                <span style={{ height }} />
              </div>
              <small>{day.toLocaleDateString([], { weekday: 'narrow' })}</small>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function ProfileScreen({ clearAll, logout, setActiveView, user }) {
  const items = [
    { icon: User, label: 'Personal Information' },
    { icon: MapPin, label: 'Workplace and Location', action: () => setActiveView('location') },
    { icon: Clock3, label: 'Manual Time Entry', action: () => setActiveView('manual') },
    { icon: Clock3, label: 'Work Schedule', meta: '9:00 AM - 6:00 PM' },
    { icon: Bell, label: 'Notifications', action: () => setActiveView('notifications') },
    { icon: Shield, label: 'Data and Privacy' },
    { icon: Download, label: 'Export Data' },
    { icon: HelpCircle, label: 'Help and Support' },
  ];

  return (
    <div className="profile-screen">
      <section className="profile-hero">
        <div className="avatar">{user.name?.[0]?.toUpperCase() ?? 'W'}</div>
        <div>
          <h2>{user.name}</h2>
          <p>Employee ID: {user.employeeId}</p>
          <span>{user.workplace ?? WORKPLACE}</span>
        </div>
      </section>

      <section className="settings-list">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.label} onClick={item.action} type="button">
              <Icon size={18} />
              <span>{item.label}</span>
              {item.meta ? <small>{item.meta}</small> : null}
              <ChevronRight size={17} />
            </button>
          );
        })}
        <button onClick={() => setActiveView('notes')} type="button">
          <FileText size={18} />
          <span>Work Notes</span>
          <ChevronRight size={17} />
        </button>
        <button className="logout-row" onClick={clearAll} type="button">
          <LogOut size={18} />
          <span>Clear All Records</span>
        </button>
        <button className="logout-row" onClick={logout} type="button">
          <LogOut size={18} />
          <span>Log Out</span>
        </button>
      </section>
    </div>
  );
}

function ManualTimeScreen({ dateKey, saveManualSession }) {
  const [form, setForm] = useState({
    date: dateKey,
    inTime: '09:00',
    outTime: '18:00',
  });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const inAt = parseLocalDateTime(form.date, form.inTime);
  const outAt = parseLocalDateTime(form.date, form.outTime);
  const previewMs = inAt && outAt && outAt > inAt ? outAt - inAt : 0;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
    setStatus('');
  }

  async function submit(event) {
    event.preventDefault();
    const result = await saveManualSession(form);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setStatus('Manual time added to your records');
    setForm((current) => ({
      ...current,
      inTime: '',
      outTime: '',
    }));
  }

  return (
    <div className="manual-screen">
      <section className="manual-card">
        <div className="manual-icon">
          <Clock3 size={34} />
        </div>
        <h2>Forgot to punch?</h2>
        <p>Add a completed punch-in and punch-out time. It will update your daily total, weekly total, timeline, and reports.</p>
      </section>

      <form className="manual-form" onSubmit={submit}>
        <label className="manual-field">
          <span>Date</span>
          <input
            max={dateKey}
            onChange={(event) => updateField('date', event.target.value)}
            type="date"
            value={form.date}
          />
        </label>

        <div className="manual-time-grid">
          <label className="manual-field">
            <span>Punch In</span>
            <input
              onChange={(event) => updateField('inTime', event.target.value)}
              type="time"
              value={form.inTime}
            />
          </label>
          <label className="manual-field">
            <span>Punch Out</span>
            <input
              onChange={(event) => updateField('outTime', event.target.value)}
              type="time"
              value={form.outTime}
            />
          </label>
        </div>

        <section className="manual-preview">
          <SummaryRow label="Manual Hours" value={previewMs ? formatHours(previewMs) : '--'} />
          <SummaryRow label="Entry Type" value="Completed session" />
        </section>

        {error ? <p className="form-error">{error}</p> : null}
        {status ? <p className="location-status success">{status}</p> : null}

        <button className="primary-action" type="submit">
          <Save size={18} />
          Save Manual Time
        </button>
      </form>
    </div>
  );
}

function LocationScreen({ saveLocation, user }) {
  const [workplace, setWorkplace] = useState(user.workplace ?? WORKPLACE);
  const [coords, setCoords] = useState(user.location ?? null);
  const [status, setStatus] = useState('');

  function fetchLocation() {
    if (!navigator.geolocation) {
      setStatus('Location is not supported in this browser.');
      return;
    }

    setStatus('Fetching location...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCoords = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        };
        setCoords(nextCoords);
        setWorkplace(`Current Location (${nextCoords.latitude}, ${nextCoords.longitude})`);
        setStatus('Location fetched. Save to use it.');
      },
      () => {
        setStatus('Unable to fetch location. Please allow location access or add it manually.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="location-screen">
      <section className="location-card">
        <div className="location-map">
          <MapPin size={38} />
        </div>
        <h2>Work Location</h2>
        <p>Add your workplace manually or let the browser fetch your current location.</p>
      </section>

      <label className="location-field">
        <span>Location name</span>
        <input
          onChange={(event) => setWorkplace(event.target.value)}
          placeholder="Technopark Phase 1"
          value={workplace}
        />
      </label>

      {coords ? (
        <section className="coordinate-card">
          <SummaryRow label="Latitude" value={coords.latitude} />
          <SummaryRow label="Longitude" value={coords.longitude} />
        </section>
      ) : null}

      {status ? <p className="location-status">{status}</p> : null}

      <div className="location-actions">
        <button className="secondary-action" onClick={fetchLocation} type="button">
          Fetch Location
        </button>
        <button className="primary-action" onClick={() => saveLocation(workplace, coords)} type="button">
          Save Location
        </button>
      </div>
    </div>
  );
}

function NotificationsScreen() {
  const notifications = [
    { icon: CheckCircle2, title: 'Auto Check-In', body: 'You arrived at workplace', time: '9:12 AM', tone: 'green' },
    { icon: Coffee, title: 'Reminder', body: 'Do not forget to take a break', time: '11:30 AM', tone: 'blue' },
    { icon: CircleAlert, title: 'Idle Alert', body: 'Inactive for 20 minutes', time: '1:50 PM', tone: 'orange' },
    { icon: LogOut, title: 'Auto Check-Out', body: 'You left workplace', time: '6:48 PM', tone: 'red' },
    { icon: FileText, title: 'Daily Summary', body: 'Tap to view your report', time: 'Yesterday', tone: 'purple' },
  ];

  return (
    <div className="screen-stack">
      <div className="segment">
        <button className="active" type="button">All</button>
        <button type="button">Unread</button>
      </div>
      <section className="notification-list">
        {notifications.map((item) => {
          const Icon = item.icon;
          return (
            <article className="notification-row" key={item.title}>
              <div className={`notice-icon ${item.tone}`}>
                <Icon size={18} />
              </div>
              <div>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </div>
              <small>{item.time}</small>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function NotesScreen({ record, saveNotes }) {
  const [notes, setNotes] = useState(record.notes);
  const [selectedTags, setSelectedTags] = useState(record.focus);

  useEffect(() => {
    setNotes(record.notes);
    setSelectedTags(record.focus);
  }, [record.focus, record.notes]);

  function toggleTag(tag) {
    setSelectedTags((current) => (
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag]
    ));
  }

  return (
    <div className="notes-screen">
      <label className="note-field">
        <span>What did you work on today?</span>
        <textarea
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Add notes about your work, tasks, meetings, or achievements..."
          value={notes}
        />
      </label>

      <section className="focus-section">
        <h3>Your Focus</h3>
        <div className="focus-tags">
          {focusTags.map((tag) => (
            <button className={selectedTags.includes(tag) ? 'active' : ''} key={tag} onClick={() => toggleTag(tag)} type="button">
              {tag}
            </button>
          ))}
        </div>
      </section>

      <section className="photo-box">
        <h3>Add Photos</h3>
        <button type="button">
          <Plus size={24} />
        </button>
      </section>

      <button className="primary-action save-note" onClick={() => saveNotes(notes, selectedTags)} type="button">
        <Save size={18} />
        Save Note
      </button>
    </div>
  );
}

function AuthScreen({ error, loading, mode, onGuest, onSubmit, setMode }) {
  const [form, setForm] = useState({
    name: '',
    employeeId: '',
    email: '',
    password: '',
  });
  const [guestName, setGuestName] = useState('');
  const [guestNameError, setGuestNameError] = useState('');
  const [guestNameOpen, setGuestNameOpen] = useState(false);
  const isSignup = mode === 'signup';

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit(form);
  }

  function startGuest() {
    if (!guestNameOpen) {
      setGuestNameOpen(true);
      setGuestNameError('');
      return;
    }

    const cleanName = guestName.trim();
    if (!cleanName) {
      setGuestNameError('Enter your name to continue as guest');
      return;
    }

    onGuest(cleanName);
  }

  return (
    <main className="auth-screen">
      <div className="auth-brand">
        <div className="mini-logo">
          <CheckCircle2 size={24} />
        </div>
        <div>
          <h1>{isSignup ? 'Create Account' : 'Welcome back'}</h1>
          <p>{isSignup ? 'Set up your WorkPulse profile' : 'Login to continue tracking time'}</p>
        </div>
      </div>

      <div className="auth-toggle">
        <button className={!isSignup ? 'active' : ''} onClick={() => setMode('login')} type="button">
          Login
        </button>
        <button className={isSignup ? 'active' : ''} onClick={() => setMode('signup')} type="button">
          Sign Up
        </button>
      </div>

      <form className="auth-form" onSubmit={submit}>
        {isSignup ? (
          <>
            <label>
              <User size={17} />
              <input
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Full Name"
                value={form.name}
              />
            </label>
            <label>
              <Shield size={17} />
              <input
                onChange={(event) => updateField('employeeId', event.target.value)}
                placeholder="Employee ID"
                value={form.employeeId}
              />
            </label>
          </>
        ) : null}

        <label>
          <Mail size={17} />
          <input
            onChange={(event) => updateField('email', event.target.value)}
            placeholder="Email"
            type="email"
            value={form.email}
          />
        </label>
        <label>
          <LockKeyhole size={17} />
          <input
            minLength={6}
            onChange={(event) => updateField('password', event.target.value)}
            placeholder="Password"
            type="password"
            value={form.password}
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button className="primary-action auth-submit" disabled={loading} type="submit">
          {loading ? 'Please wait...' : isSignup ? 'Sign Up' : 'Login'}
        </button>
      </form>

      <div className="guest-entry">
        <span>or continue without an account</span>
        {guestNameOpen ? (
          <label className="guest-name-field">
            <User size={17} />
            <input
              autoComplete="name"
              autoFocus
              onChange={(event) => {
                setGuestName(event.target.value);
                setGuestNameError('');
              }}
              placeholder="Your name"
              value={guestName}
            />
          </label>
        ) : null}
        {guestNameError ? <p className="form-error">{guestNameError}</p> : null}
        <button onClick={startGuest} type="button">
          {guestNameOpen ? 'Start Guest Mode' : 'Continue as Guest'}
        </button>
      </div>
    </main>
  );
}

function SplashScreen() {
  return (
    <main className="splash-screen">
      <section className="splash-visual" aria-hidden="true">
        <WorkPulseLogo />
        <div className="splash-preview-card">
          <span>Today</span>
          <strong>08:00</strong>
          <small>Work target</small>
        </div>
      </section>
      <section className="splash-copy">
        <h1>WorkPulse</h1>
        <p>Track your time. Stay productive.</p>
        <div className="splash-loader">
          <span />
          Opening app
        </div>
      </section>
    </main>
  );
}

function OnboardingScreen({ onDone }) {
  const slides = [
    {
      icon: Timer,
      title: 'Track work hours',
      body: 'Punch in and out with a clean daily timer built for personal work tracking.',
    },
    {
      icon: Coffee,
      title: 'Smart break checks',
      body: 'When you return after a gap, WorkPulse asks whether that time was a break.',
    },
    {
      icon: MapPin,
      title: 'Save your workplace',
      body: 'Add a location manually or fetch it from your device when you allow access.',
    },
  ];
  const [step, setStep] = useState(0);
  const slide = slides[step];
  const Icon = slide.icon;
  const isLast = step === slides.length - 1;

  function next() {
    if (isLast) {
      onDone();
      return;
    }

    setStep((current) => current + 1);
  }

  return (
    <main className="onboarding-screen">
      <div className="onboarding-top">
        <WorkPulseLogo compact />
        <button onClick={onDone} type="button">Skip</button>
      </div>

      <section className="onboarding-visual">
        <div className="onboarding-orbit">
          <Icon size={48} />
        </div>
      </section>

      <section className="onboarding-copy">
        <div className="onboarding-dots">
          {slides.map((item, index) => (
            <span className={index === step ? 'active' : ''} key={item.title} />
          ))}
        </div>
        <h1>{slide.title}</h1>
        <p>{slide.body}</p>
      </section>

      <button className="primary-action onboarding-action" onClick={next} type="button">
        {isLast ? 'Start WorkPulse' : 'Next'}
      </button>
    </main>
  );
}

function BreakPrompt({ gapMs, onAnswer }) {
  return (
    <div className="modal-backdrop">
      <section className="confirm-card">
        <div className="confirm-icon">
          <Coffee size={24} />
        </div>
        <h2>Was this a break?</h2>
        <p>
          You were away for <strong>{formatHours(gapMs)}</strong> between punch out and this punch in.
        </p>
        <div className="confirm-actions">
          <button className="primary-action" onClick={() => onAnswer(true)} type="button">
            Yes, count break
          </button>
          <button className="secondary-action" onClick={() => onAnswer(false)} type="button">
            No
          </button>
        </div>
      </section>
    </div>
  );
}

function ArrivalPrompt({ distanceMeters, onDismiss, onPunchIn, workplace }) {
  return (
    <div className="modal-backdrop">
      <section className="confirm-card">
        <div className="confirm-icon">
          <MapPin size={24} />
        </div>
        <h2>You are at work</h2>
        <p>
          You reached <strong>{workplace}</strong>. You are {formatDistance(distanceMeters)} and currently punched out.
        </p>
        <div className="confirm-actions">
          <button className="primary-action" onClick={onPunchIn} type="button">
            Punch In
          </button>
          <button className="secondary-action" onClick={onDismiss} type="button">
            Later
          </button>
        </div>
      </section>
    </div>
  );
}

function BottomNav({ activeView, setActiveView }) {
  const items = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'timeline', label: 'Timeline', icon: CalendarDays },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <div className="nav-brand">
        <WorkPulseLogo compact />
        <div>
          <strong>WorkPulse</strong>
          <span>Time dashboard</span>
        </div>
      </div>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button className={activeView === item.id ? 'active' : ''} key={item.id} onClick={() => setActiveView(item.id)} type="button">
            <Icon size={20} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function App() {
  const storedGuest = localStorage.getItem(GUEST_KEY) === 'true';
  const [isGuest, setIsGuest] = useState(storedGuest);
  const [records, setRecords] = useState(() => (storedGuest ? readGuestRecords() : {}));
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [user, setUser] = useState(() => (storedGuest ? readGuestUser() : null));
  const [now, setNow] = useState(Date.now());
  const [activeView, setActiveView] = useState('home');
  const [showSplash, setShowSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem(ONBOARDING_KEY) !== 'true');
  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loadingSession, setLoadingSession] = useState(Boolean(token) && !storedGuest);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [breakPrompt, setBreakPrompt] = useState(null);
  const [arrivalPrompt, setArrivalPrompt] = useState(false);
  const [arrivalDismissed, setArrivalDismissed] = useState(false);
  const [liveLocation, setLiveLocation] = useState(null);
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1300);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    if (!navigator.geolocation) {
      setLocationError('Live location is not supported in this browser.');
      return undefined;
    }

    setLocationError('');
    const watcher = navigator.geolocation.watchPosition(
      (position) => {
        setLiveLocation({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy),
        });
        setLocationError('');
      },
      () => {
        setLocationError('Allow location access to enable arrival punch-in prompts.');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 15000,
      },
    );

    return () => navigator.geolocation.clearWatch(watcher);
  }, [user]);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      if (isGuest) {
        setLoadingSession(false);
        return;
      }

      if (!token) {
        setLoadingSession(false);
        return;
      }

      try {
        const data = await apiRequest('/api/me', { token });
        if (!isMounted) return;
        setUser(data.user);
        setRecords(data.records ?? {});
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        if (!isMounted) return;
        setToken('');
        setUser(null);
        setRecords({});
      } finally {
        if (isMounted) setLoadingSession(false);
      }
    }

    loadSession();
    return () => {
      isMounted = false;
    };
  }, [isGuest, token]);

  useEffect(() => {
    if (!isGuest) return;
    localStorage.setItem(GUEST_RECORDS_KEY, JSON.stringify(records));
  }, [isGuest, records]);

  useEffect(() => {
    if (!isGuest || !user) return;
    localStorage.setItem(GUEST_USER_KEY, JSON.stringify(user));
  }, [isGuest, user]);

  const today = useMemo(() => new Date(now), [now]);
  const dateKey = formatDateKey(today);
  const todayRecord = getTodayRecord(records, dateKey);
  const activeSession = todayRecord.sessions.find((session) => !session.out);
  const lastSession = todayRecord.sessions.at(-1);
  const onBreak = !activeSession && lastSession?.out && lastSession.outReason === 'break';
  const distanceMeters = calculateDistanceMeters(liveLocation, user?.location);
  const completedMs = calculateCompletedMs(todayRecord);
  const totalMs = calculateWorkedMs(todayRecord, now);
  const breakMs = calculateBreakMs(todayRecord);
  const weeklyMs = getWeekDays(today).reduce((total, day) => {
    const key = formatDateKey(day);
    return total + calculateCompletedMs(records[key] ?? { sessions: [] });
  }, 0);

  useEffect(() => {
    const insideWorkplace = distanceMeters !== null && distanceMeters <= WORKPLACE_RADIUS_METERS;

    if (activeSession || !insideWorkplace) {
      setArrivalPrompt(false);
    }

    if (!insideWorkplace) {
      setArrivalDismissed(false);
    }

    if (!activeSession && insideWorkplace && !arrivalDismissed) {
      setArrivalPrompt(true);
    }
  }, [activeSession, arrivalDismissed, distanceMeters]);

  function updateGuestToday(updater) {
    setRecords((current) => {
      const record = getTodayRecord(current, dateKey);
      return {
        ...current,
        [dateKey]: updater(record),
      };
    });
  }

  async function handleAuth(form) {
    setLoadingAuth(true);
    setAuthError('');

    try {
      const data = await apiRequest(`/api/auth/${authMode}`, {
        method: 'POST',
        body: form,
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(ONBOARDING_KEY, 'true');
      localStorage.removeItem(GUEST_KEY);
      setToken(data.token);
      setIsGuest(false);
      setUser(data.user);
      setRecords(data.records ?? {});
      setShowSplash(false);
      setShowOnboarding(false);
      setActiveView('home');
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setLoadingAuth(false);
    }
  }

  function startGuestMode(name) {
    const guestUser = {
      ...readGuestUser(),
      name: name.trim(),
    };
    localStorage.setItem(GUEST_KEY, 'true');
    localStorage.setItem(ONBOARDING_KEY, 'true');
    localStorage.setItem(GUEST_USER_KEY, JSON.stringify(guestUser));
    localStorage.removeItem(TOKEN_KEY);
    setIsGuest(true);
    setToken('');
    setUser(guestUser);
    setRecords(readGuestRecords());
    setAuthError('');
    setActionError('');
    setShowSplash(false);
    setShowOnboarding(false);
    setActiveView('home');
  }

  function requestPunchIn() {
    const previous = todayRecord.sessions.filter((session) => session.out).at(-1);
    const gapMs = previous ? now - previous.out : 0;

    setArrivalPrompt(false);

    if (previous && gapMs > 60 * 1000) {
      setBreakPrompt({ gapMs });
      return;
    }

    punchIn('checkout');
  }

  async function punchIn(previousOutReason = 'checkout') {
    setActionError('');

    if (isGuest) {
      if (activeSession) {
        setActionError('You are already punched in');
        return;
      }

      updateGuestToday((record) => {
        const sessions = [...record.sessions];
        const previousIndex = sessions.reduce((foundIndex, session, index) => (
          session.out ? index : foundIndex
        ), -1);

        if (previousIndex >= 0) {
          sessions[previousIndex] = {
            ...sessions[previousIndex],
            outReason: previousOutReason,
          };
        }

        sessions.push({ in: Date.now(), out: null, outReason: null });
        return { ...record, sessions };
      });
      setArrivalPrompt(false);
      setArrivalDismissed(true);
      return;
    }

    try {
      const data = await apiRequest('/api/punch/in', {
        method: 'POST',
        token,
        body: { dateKey, previousOutReason, time: Date.now() },
      });
      setRecords(data.records ?? {});
      setArrivalPrompt(false);
      setArrivalDismissed(true);
    } catch (error) {
      setActionError(error.message);
    }
  }

  async function punchOut() {
    setActionError('');

    if (isGuest) {
      if (!activeSession) {
        setActionError('You need to punch in first');
        return;
      }

      updateGuestToday((record) => {
        const sessions = [...record.sessions];
        const activeIndex = sessions.findIndex((session) => !session.out);

        if (activeIndex >= 0) {
          sessions[activeIndex] = {
            ...sessions[activeIndex],
            out: Date.now(),
            outReason: 'checkout',
          };
        }

        return { ...record, sessions };
      });
      setArrivalDismissed(false);
      return;
    }

    try {
      const data = await apiRequest('/api/punch/out', {
        method: 'POST',
        token,
        body: { dateKey, reason: 'checkout', time: Date.now() },
      });
      setRecords(data.records ?? {});
      setArrivalDismissed(false);
    } catch (error) {
      setActionError(error.message);
    }
  }

  async function answerBreakPrompt(isBreak) {
    setBreakPrompt(null);
    await punchIn(isBreak ? 'break' : 'checkout');
  }

  async function saveManualSession({ date, inTime, outTime }) {
    setActionError('');
    const cleanDate = String(date ?? '').trim();
    const inAt = parseLocalDateTime(cleanDate, inTime);
    const outAt = parseLocalDateTime(cleanDate, outTime);

    if (!cleanDate || !inTime || !outTime || inAt === null || outAt === null) {
      return { ok: false, message: 'Choose a date, punch in time, and punch out time' };
    }

    if (cleanDate > dateKey) {
      return { ok: false, message: 'Manual time cannot be added for a future date' };
    }

    if (outAt <= inAt) {
      return { ok: false, message: 'Punch out must be after punch in' };
    }

    if (isGuest) {
      const record = getTodayRecord(records, cleanDate);

      if (hasSessionOverlap(record.sessions, inAt, outAt)) {
        return { ok: false, message: 'Manual time overlaps an existing session' };
      }

      setRecords((current) => {
        const currentRecord = getTodayRecord(current, cleanDate);
        return {
          ...current,
          [cleanDate]: {
            ...currentRecord,
            sessions: [
              ...currentRecord.sessions,
              { in: inAt, out: outAt, outReason: 'checkout', manual: true },
            ].sort((a, b) => Number(a.in) - Number(b.in)),
          },
        };
      });
      return { ok: true };
    }

    try {
      const data = await apiRequest(`/api/records/${encodeURIComponent(cleanDate)}/sessions`, {
        method: 'POST',
        token,
        body: { in: inAt, out: outAt },
      });
      setRecords(data.records ?? {});
      return { ok: true };
    } catch (error) {
      setActionError(error.message);
      return { ok: false, message: error.message };
    }
  }

  async function saveNotes(notes, focus) {
    setActionError('');

    if (isGuest) {
      updateGuestToday((record) => ({ ...record, notes, focus }));
      setActiveView('home');
      return;
    }

    try {
      const data = await apiRequest(`/api/records/${dateKey}/notes`, {
        method: 'PUT',
        token,
        body: { focus, notes },
      });
      setRecords(data.records ?? {});
      setActiveView('home');
    } catch (error) {
      setActionError(error.message);
    }
  }

  async function clearAll() {
    setActionError('');

    if (isGuest) {
      setRecords({});
      setActiveView('home');
      return;
    }

    try {
      const data = await apiRequest('/api/records', {
        method: 'DELETE',
        token,
      });
      setRecords(data.records ?? {});
      setActiveView('home');
    } catch (error) {
      setActionError(error.message);
    }
  }

  async function saveLocation(workplace, location) {
    setActionError('');

    if (isGuest) {
      setUser((current) => ({
        ...(current ?? defaultGuestUser()),
        workplace,
        location: location ?? null,
      }));
      setActiveView('home');
      return;
    }

    try {
      const data = await apiRequest('/api/me/location', {
        method: 'PUT',
        token,
        body: {
          workplace,
          latitude: location?.latitude,
          longitude: location?.longitude,
        },
      });
      setUser(data.user);
      setActiveView('home');
    } catch (error) {
      setActionError(error.message);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(GUEST_KEY);
    setIsGuest(false);
    setToken('');
    setUser(null);
    setRecords({});
    setActiveView('home');
  }

  function finishOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowOnboarding(false);
  }

  if (showSplash) {
    return (
      <main className="page">
        <section className="phone-shell intro-shell">
          <SplashScreen />
        </section>
      </main>
    );
  }

  if (loadingSession) {
    return (
      <main className="page">
        <section className="phone-shell intro-shell">
          <div className="loading-screen">Loading WorkPulse...</div>
        </section>
      </main>
    );
  }

  if (showOnboarding && !user) {
    return (
      <main className="page">
        <section className="phone-shell intro-shell">
          <OnboardingScreen onDone={finishOnboarding} />
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page">
        <section className="phone-shell intro-shell">
          <AuthScreen
            error={authError}
            loading={loadingAuth}
            mode={authMode}
            onGuest={startGuestMode}
            onSubmit={handleAuth}
            setMode={setAuthMode}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section
        className={`phone-shell app-shell ${DETAIL_VIEWS.has(activeView) ? 'detail-shell' : ''}`}
        aria-label="WorkPulse employee time tracker"
      >
        <AppHeader
          activeView={activeView}
          now={today}
          setActiveView={setActiveView}
          user={user}
        />

        <section className="content-area">
          {actionError ? <div className="action-error">{actionError}</div> : null}
          {activeView === 'home' ? (
            <HomeScreen
              activeSession={activeSession}
              breakMs={breakMs}
              completedMs={completedMs}
              distanceMeters={distanceMeters}
              liveLocation={liveLocation}
              onBreak={onBreak}
              punchIn={requestPunchIn}
              punchOut={punchOut}
              setActiveView={setActiveView}
              todayRecord={todayRecord}
              totalMs={totalMs}
              user={user}
              weeklyMs={weeklyMs}
            />
          ) : null}
          {activeView === 'timeline' ? <TimelineScreen records={records} today={today} todayRecord={todayRecord} /> : null}
          {activeView === 'reports' ? <ReportsScreen records={records} today={today} /> : null}
          {activeView === 'profile' ? <ProfileScreen clearAll={clearAll} logout={logout} setActiveView={setActiveView} user={user} /> : null}
          {activeView === 'notifications' ? <NotificationsScreen /> : null}
          {activeView === 'notes' ? <NotesScreen record={todayRecord} saveNotes={saveNotes} /> : null}
          {activeView === 'location' ? <LocationScreen saveLocation={saveLocation} user={user} /> : null}
          {activeView === 'manual' ? <ManualTimeScreen dateKey={dateKey} saveManualSession={saveManualSession} /> : null}
        </section>

        <BottomNav activeView={activeView} setActiveView={setActiveView} />
        {breakPrompt ? <BreakPrompt gapMs={breakPrompt.gapMs} onAnswer={answerBreakPrompt} /> : null}
        {arrivalPrompt && !breakPrompt ? (
          <ArrivalPrompt
            distanceMeters={distanceMeters}
            onDismiss={() => {
              setArrivalPrompt(false);
              setArrivalDismissed(true);
            }}
            onPunchIn={requestPunchIn}
            workplace={user?.workplace ?? WORKPLACE}
          />
        ) : null}
      </section>
    </main>
  );
}
