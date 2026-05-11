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
  GripVertical,
  LockKeyhole,
  Mail,
  LogOut,
  MapPin,
  Moon,
  Pencil,
  Plus,
  Save,
  Shield,
  Sun,
  Timer,
  User,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const TOKEN_KEY = 'workpulse-auth-token';
const GUEST_KEY = 'workpulse-guest-session';
const GUEST_RECORDS_KEY = 'workpulse-guest-records';
const GUEST_USER_KEY = 'workpulse-guest-user';
const ONBOARDING_KEY = 'workpulse-onboarding-v2-done';
const THEME_KEY = 'workpulse-theme';
const DASHBOARD_ORDER_KEY = 'workpulse-dashboard-order';
const TARGET_MS = 8 * 60 * 60 * 1000;
const WORKPLACE_RADIUS_METERS = 150;
const WORKPLACE = 'Technopark Phase 1';
const DETAIL_VIEWS = new Set(['notifications', 'notes', 'location', 'manual', 'personal', 'schedule', 'privacy', 'export', 'support']);
const DASHBOARD_SECTIONS = ['hero', 'progress', 'notes', 'manual'];
const VIEW_TITLES = {
  home: 'Home',
  timeline: 'Timeline',
  reports: 'Reports',
  profile: 'Profile',
  notifications: 'Notifications',
  notes: 'Work Notes',
  location: 'Location',
  manual: 'Add Time',
  personal: 'Personal Info',
  schedule: 'Schedule',
  privacy: 'Privacy',
  export: 'Export Data',
  support: 'Support',
};

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
    const error = new Error(data.message ?? 'Something went wrong');
    error.data = data;
    throw error;
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

function readDashboardOrder() {
  const stored = readJsonStorage(DASHBOARD_ORDER_KEY, DASHBOARD_SECTIONS);

  if (!Array.isArray(stored)) {
    return DASHBOARD_SECTIONS;
  }

  const valid = stored.filter((item) => DASHBOARD_SECTIONS.includes(item));
  return [...valid, ...DASHBOARD_SECTIONS.filter((item) => !valid.includes(item))];
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

function AppHeader({ activeView, now, onBack, setActiveView, theme, toggleTheme, user }) {
  const isBackView = DETAIL_VIEWS.has(activeView);
  const isHomeView = activeView === 'home';
  const title = VIEW_TITLES[activeView] ?? 'WorkPulse';
  const workplace = user?.workplace ?? WORKPLACE;

  if (!isHomeView) {
    return (
      <header className={isBackView ? 'app-header compact-header detail-header' : 'app-header compact-header'}>
        <div className="compact-header-top">
          <button className="location-chip location-chip-button" onClick={() => setActiveView('location')} type="button" aria-label="Edit workplace location">
            <MapPin size={13} />
            {workplace}
            <Pencil size={12} />
          </button>
          <div className="header-actions compact-actions">
            <button className="header-utility-action" onClick={() => setActiveView('manual')} type="button">
              <Clock3 size={15} />
              Add Time
            </button>
            <button className="header-icon has-dot" onClick={() => setActiveView('notifications')} type="button" aria-label="Open notifications">
              <Bell size={18} />
            </button>
          </div>
        </div>

        <div className="compact-header-bottom">
          {isBackView ? (
            <button className="header-icon" onClick={onBack} type="button" aria-label="Go back">
              <ArrowLeft size={18} />
            </button>
          ) : null}
          <h2>{title}</h2>
        </div>
      </header>
    );
  }

  return (
    <header className="app-header">
      <div className="header-copy">
        <button className="location-chip location-chip-button" onClick={() => setActiveView('location')} type="button" aria-label="Edit workplace location">
          <MapPin size={13} />
          {workplace}
          <Pencil size={12} />
        </button>
        <div>
          <p>{getGreeting(now)},</p>
          <h1>{user?.name ?? 'Employee'}</h1>
          <span>{formatLongDate(now)}</span>
        </div>
      </div>

      <div className="header-actions">
        <button className="header-icon" onClick={toggleTheme} type="button" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button className="header-icon has-dot" onClick={() => setActiveView('notifications')} type="button" aria-label="Open notifications">
          <Bell size={18} />
        </button>
      </div>
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
  return (
    <section className="glass-card workplace-card">
      <div className="workplace-main">
        <div>
          <span className="eyebrow">Workplace</span>
          <h3>{user?.workplace ?? WORKPLACE}</h3>
        </div>
      </div>
    </section>
  );
}

function ManualTimeShortcut({ compact = false, setActiveView }) {
  if (compact) {
    return (
      <div className="manual-inline-card">
        <span>Missed a punch?</span>
        <button onClick={() => setActiveView('manual')} type="button">
          <Clock3 size={15} />
          Add manually
        </button>
      </div>
    );
  }

  return (
    <section className="manual-shortcut-card">
      <div className="manual-shortcut-icon">
        <Clock3 size={20} />
      </div>
      <div>
        <span className="eyebrow">Forgot to punch?</span>
        <strong>Add time manually</strong>
        <p>Enter punch-in and punch-out time later.</p>
      </div>
      <button onClick={() => setActiveView('manual')} type="button" aria-label="Add time manually">
        <Plus size={16} />
        Add
      </button>
    </section>
  );
}

function DashboardPanel({ children, dragId, dropId, id, moveSection, setDragId, setDropId }) {
  return (
    <div
      className={`home-panel panel-${id}${dragId === id ? ' dragging' : ''}${dropId === id ? ' drop-target' : ''}`}
      draggable
      onDragEnd={() => {
        setDragId('');
        setDropId('');
      }}
      onDragEnter={() => {
        if (dragId && dragId !== id) {
          setDropId(id);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={() => setDragId(id)}
      onDrop={(event) => {
        event.preventDefault();
        moveSection(dragId, id);
        setDragId('');
        setDropId('');
      }}
    >
      <div className="panel-drag-handle" aria-hidden="true">
        <GripVertical size={16} />
      </div>
      {children}
    </div>
  );
}

function HomeScreen({ activeSession, breakMs, completedMs, dashboardOrder, distanceMeters, liveLocation, onBreak, punchIn, punchOut, setActiveView, setDashboardOrder, todayRecord, totalMs, user, weeklyMs }) {
  const remainingMs = Math.max(0, TARGET_MS - totalMs);
  const overtimeMs = Math.max(0, totalMs - TARGET_MS);
  const lastClosed = todayRecord.sessions.filter((session) => session.out && session.outReason !== 'break').at(-1);
  const notePreview = todayRecord.notes?.trim();
  const [dragId, setDragId] = useState('');
  const [dropId, setDropId] = useState('');

  function moveSection(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;

    setDashboardOrder((current) => {
      const next = [...current];
      const sourceIndex = next.indexOf(sourceId);
      const targetIndex = next.indexOf(targetId);

      if (sourceIndex < 0 || targetIndex < 0) {
        return current;
      }

      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, sourceId);
      return next;
    });
  }

  const sections = {
    hero: activeSession ? (
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
        <strong>{formatTimer(totalMs)}</strong>
        <small className="idle-timer-copy">{lastClosed ? 'Tracked today' : 'Timer ready'}</small>
        <h3>{onBreak ? 'Break in progress' : lastClosed ? 'You are checked out' : 'Ready to start'}</h3>
        <p>{onBreak ? 'Punch in when you are back. We will count the gap as break time.' : lastClosed ? 'Punch in again to continue your hours.' : 'Tap punch in to start tracking your work hours.'}</p>
        <button className="ready-punch-button" onClick={punchIn} type="button">
          Punch In
        </button>
        <ManualTimeShortcut compact setActiveView={setActiveView} />
      </section>
    ),
    progress: (
      <section className="progress-overview-card">
        <div className="progress-overview-top">
          <div>
            <span className="eyebrow">Today's target</span>
            <strong>8h 00m</strong>
            <p>Standard work hours</p>
          </div>
          <div className="progress-ring" style={{ '--progress': `${Math.min(100, (totalMs / TARGET_MS) * 100)}%` }}>
            <span>{Math.min(100, Math.floor((totalMs / TARGET_MS) * 100))}%</span>
          </div>
        </div>
        <div className="progress-summary-grid">
          <SummaryRow label="Worked" value={formatHours(completedMs)} />
          <SummaryRow label="Remaining" value={formatHours(remainingMs)} />
          <SummaryRow label="Break" value={formatHours(breakMs)} />
          <SummaryRow label="Overtime" value={formatHours(overtimeMs)} positive />
          <SummaryRow label="Check In" value={todayRecord.sessions[0] ? formatClock(todayRecord.sessions[0].in) : '--'} />
          <SummaryRow label="Check Out" value={lastClosed ? formatClock(lastClosed.out) : '--'} />
        </div>
        <div className="section-actions">
          <button onClick={() => setActiveView('manual')} type="button">
            Missing Punches
          </button>
          <button onClick={() => setActiveView('notes')} type="button">
            Add Note
          </button>
        </div>
      </section>
    ),
    notes: (
      <section className="notes-todo-card">
        <div className="section-title">
          <div>
            <span className="eyebrow">Notes and To-Do</span>
            <h2>{notePreview ? 'Today plan' : 'Add your work notes'}</h2>
          </div>
        </div>
        <div className="note-preview">
          <p>{notePreview || 'Capture your priorities, meetings, or follow-ups so the day feels easier to track.'}</p>
        </div>
        <div className="todo-tags">
          {(todayRecord.focus?.length ? todayRecord.focus : ['No focus tags yet']).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <button className="secondary-action notes-open-action" onClick={() => setActiveView('notes')} type="button">
          Open Notes
        </button>
      </section>
    ),
    manual: (
      <section className="manual-entry-card">
        <div className="manual-entry-icon">
          <Clock3 size={22} />
        </div>
        <div>
          <span className="eyebrow">Manual time</span>
          <h2>Add missed punches</h2>
          <p>Forgot to punch in or out? Add the completed time later without leaving your dashboard flow.</p>
        </div>
        <div className="manual-entry-stats">
          <MetricCard icon={BarChart3} label="Week" value={formatHours(weeklyMs)} hint="Mon to Sun" />
        </div>
        <button className="primary-action" onClick={() => setActiveView('manual')} type="button">
          <Plus size={18} />
          Add Manual Time
        </button>
      </section>
    ),
  };
  const orderedSections = [...dashboardOrder.filter((item) => sections[item]), ...Object.keys(sections).filter((item) => !dashboardOrder.includes(item))];

  return (
    <div className="screen-stack home-stack">
      {orderedSections.map((sectionId) => (
        <DashboardPanel
          dragId={dragId}
          dropId={dropId}
          id={sectionId}
          key={sectionId}
          moveSection={moveSection}
          setDragId={setDragId}
          setDropId={setDropId}
        >
          {sections[sectionId]}
        </DashboardPanel>
      ))}
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
        <button type="button" aria-label="Open calendar">
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

function getWeeklyHoursSeries(records, today) {
  return getWeekDays(today).map((day) => {
    const key = formatDateKey(day);
    return {
      key,
      label: day.toLocaleDateString([], { weekday: 'short' }),
      shortLabel: day.toLocaleDateString([], { weekday: 'narrow' }),
      value: calculateCompletedMs(records[key] ?? { sessions: [] }),
    };
  });
}

function WeeklyChartsPanel({ series }) {
  const [mode, setMode] = useState('bar');
  const maxValue = Math.max(TARGET_MS, ...series.map((item) => item.value), 1);
  const bestDay = [...series].sort((a, b) => b.value - a.value)[0];
  const width = 460;
  const height = 220;
  const paddingX = 24;
  const paddingY = 20;
  const drawableWidth = width - paddingX * 2;
  const drawableHeight = height - paddingY * 2;
  const totalWeekHours = series.reduce((total, item) => total + item.value, 0);
  const stepX = series.length > 1 ? drawableWidth / (series.length - 1) : 0;
  const points = series.map((item, index) => {
    const x = paddingX + stepX * index;
    const y = height - paddingY - (item.value / maxValue) * drawableHeight;
    return { ...item, x, y };
  });
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
  const areaPoints = [
    `${paddingX},${height - paddingY}`,
    ...points.map((point) => `${point.x},${point.y}`),
    `${paddingX + stepX * Math.max(points.length - 1, 0)},${height - paddingY}`,
  ].join(' ');
  const guideLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <section className="chart-card combined-chart-card">
      <div className="chart-header">
        <div>
          <span className="eyebrow">Weekly hours</span>
          <h3>{mode === 'bar' ? 'Bar chart' : 'Line chart'}</h3>
        </div>
        <div className="chart-toggle" role="tablist" aria-label="Chart type">
          <button
            aria-pressed={mode === 'bar'}
            className={mode === 'bar' ? 'active' : ''}
            onClick={() => setMode('bar')}
            type="button"
          >
            Bar view
          </button>
          <button
            aria-pressed={mode === 'line'}
            className={mode === 'line' ? 'active' : ''}
            onClick={() => setMode('line')}
            type="button"
          >
            Line view
          </button>
        </div>
      </div>

      <div className="chart-summary-strip">
        <div>
          <span>Week total</span>
          <strong>{formatHours(totalWeekHours)}</strong>
        </div>
        <div>
          <span>Best day</span>
          <strong>{bestDay ? `${bestDay.label} · ${formatHours(bestDay.value)}` : '--'}</strong>
        </div>
      </div>

      {mode === 'bar' ? (
        <div className="chart-bars">
          {series.map((item) => {
            const barHeight = Math.max(14, Math.min(132, (item.value / maxValue) * 132));
            return (
              <div className="bar-item" key={item.key}>
                <small>{item.shortLabel}</small>
                <div className="bar-track">
                  <span style={{ height: barHeight }} />
                </div>
                <b>{formatHours(item.value)}</b>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <svg aria-label="Weekly line graph" role="img" viewBox={`0 0 ${width} ${height}`}>
            {guideLines.map((guide) => {
              const y = height - paddingY - drawableHeight * guide;
              return <line className="chart-guide" key={guide} x1={paddingX} x2={width - paddingX} y1={y} y2={y} />;
            })}
            <polygon className="chart-area" points={areaPoints} />
            <polyline className="chart-line" points={linePoints} />
            {points.map((point) => (
              <circle className="chart-point" cx={point.x} cy={point.y} key={point.key} r="4.5" />
            ))}
          </svg>

          <div className="chart-label-row">
            {points.map((point) => (
              <div className="chart-label" key={point.key}>
                <span>{point.shortLabel}</span>
                <strong>{formatHours(point.value)}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ReportsScreen({ records, today }) {
  const monthKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
  const monthRecords = Object.entries(records).filter(([date]) => date.startsWith(monthKey));
  const totalMs = monthRecords.reduce((total, [, record]) => total + calculateCompletedMs(record), 0);
  const breakMs = monthRecords.reduce((total, [, record]) => total + calculateBreakMs(record), 0);
  const presentDays = monthRecords.filter(([, record]) => normalizeRecord(record).sessions.length > 0).length;
  const weeklySeries = getWeeklyHoursSeries(records, today);

  return (
    <div className="screen-stack reports-grid">
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

      <WeeklyChartsPanel series={weeklySeries} />
    </div>
  );
}

function ProfileScreen({ clearAll, logout, setActiveView, user }) {
  const items = [
    { icon: User, label: 'Personal Information', action: () => setActiveView('personal') },
    { icon: MapPin, label: 'Workplace and Location', action: () => setActiveView('location') },
    { icon: Clock3, label: 'Manual Time Entry', action: () => setActiveView('manual') },
    { icon: Clock3, label: 'Work Schedule', meta: '9:00 AM - 6:00 PM', action: () => setActiveView('schedule') },
    { icon: Bell, label: 'Notifications', action: () => setActiveView('notifications') },
    { icon: Shield, label: 'Data and Privacy', action: () => setActiveView('privacy') },
    { icon: Download, label: 'Export Data', action: () => setActiveView('export') },
    { icon: HelpCircle, label: 'Help and Support', action: () => setActiveView('support') },
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

function DetailCard({ children, icon: Icon, title }) {
  return (
    <section className="detail-card">
      {Icon ? (
        <div className="detail-card-icon">
          <Icon size={22} />
        </div>
      ) : null}
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}

function PersonalInformationScreen({ user }) {
  return (
    <div className="detail-screen">
      <DetailCard icon={User} title="Profile">
        <SummaryRow label="Name" value={user.name || 'Employee'} />
        <SummaryRow label="Employee ID" value={user.employeeId || '--'} />
        <SummaryRow label="Email" value={user.email || 'Guest mode'} />
        <SummaryRow label="Account Type" value={user.isGuest ? 'Guest' : 'Signed in'} />
      </DetailCard>
      <DetailCard icon={MapPin} title="Workplace">
        <SummaryRow label="Location Name" value={user.workplace || WORKPLACE} />
        <SummaryRow label="Pinned Location" value={user.location ? `${user.location.latitude}, ${user.location.longitude}` : 'Not saved'} />
      </DetailCard>
    </div>
  );
}

function WorkScheduleScreen() {
  return (
    <div className="detail-screen">
      <DetailCard icon={Clock3} title="Default Schedule">
        <SummaryRow label="Work Window" value="9:00 AM - 6:00 PM" />
        <SummaryRow label="Daily Target" value="8h 00m" />
        <SummaryRow label="Week" value="Monday to Sunday" />
      </DetailCard>
      <DetailCard icon={Coffee} title="Break Handling">
        <p className="detail-copy">When you punch out and return later, WorkPulse asks whether that gap should be counted as break time.</p>
      </DetailCard>
    </div>
  );
}

function DataPrivacyScreen({ clearAll, isGuest }) {
  return (
    <div className="detail-screen">
      <DetailCard icon={Shield} title="Data and Privacy">
        <SummaryRow label="Mode" value={isGuest ? 'Guest device storage' : 'Account backend storage'} />
        <SummaryRow label="Location" value="Used only for workplace prompts" />
        <SummaryRow label="Export" value="Available anytime" />
      </DetailCard>
      <section className="danger-card">
        <div>
          <h2>Clear records</h2>
          <p>This removes your tracked sessions and notes for this profile.</p>
        </div>
        <button onClick={clearAll} type="button">Clear All Records</button>
      </section>
    </div>
  );
}

function ExportDataScreen({ records, user }) {
  const totalDays = Object.keys(records).length;
  const totalSessions = Object.values(records).reduce((total, record) => total + normalizeRecord(record).sessions.length, 0);

  function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      user,
      records,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `workpulse-export-${formatDateKey(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="detail-screen">
      <DetailCard icon={Download} title="Export Data">
        <SummaryRow label="Tracked Days" value={totalDays} />
        <SummaryRow label="Sessions" value={totalSessions} />
        <SummaryRow label="Format" value="JSON" />
        <button className="primary-action detail-primary" onClick={exportData} type="button">
          <Download size={18} />
          Download Export
        </button>
      </DetailCard>
    </div>
  );
}

function HelpSupportScreen() {
  return (
    <div className="detail-screen">
      <DetailCard icon={HelpCircle} title="Help and Support">
        <SummaryRow label="Punch In" value="Starts live timer" />
        <SummaryRow label="Punch Out" value="Stops current session" />
        <SummaryRow label="Manual Time" value="Adds missed sessions" />
        <SummaryRow label="Location" value="Pin workplace for prompts" />
      </DetailCard>
      <DetailCard icon={CircleAlert} title="Tips">
        <p className="detail-copy">Use manual time only for missed punches. If you add overlapping time anyway, totals may double count that period.</p>
      </DetailCard>
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
  const [canAddAnyway, setCanAddAnyway] = useState(false);
  const [status, setStatus] = useState('');
  const inAt = parseLocalDateTime(form.date, form.inTime);
  const outAt = parseLocalDateTime(form.date, form.outTime);
  const previewMs = inAt && outAt && outAt > inAt ? outAt - inAt : 0;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
    setCanAddAnyway(false);
    setStatus('');
  }

  async function submit(event, allowOverlap = false) {
    event.preventDefault();
    const result = await saveManualSession(form, { allowOverlap });

    if (!result.ok) {
      setError(result.message);
      setCanAddAnyway(Boolean(result.canOverride));
      return;
    }

    setError('');
    setCanAddAnyway(false);
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

        {error ? (
          <section className="manual-alert">
            <CircleAlert size={20} />
            <div>
              <strong>{error}</strong>
              {canAddAnyway ? <p>This may double count part of your total hours.</p> : null}
            </div>
            {canAddAnyway ? (
              <button onClick={(event) => submit(event, true)} type="button">
                Add Anyway
              </button>
            ) : null}
          </section>
        ) : null}
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
  const hasPinnedLocation = Boolean(coords);

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
        setWorkplace(`Pinned Location (${nextCoords.latitude}, ${nextCoords.longitude})`);
        setStatus('Live location fetched and pinned on the map.');
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

      <section className={hasPinnedLocation ? 'map-preview pinned' : 'map-preview'}>
        <div className="map-canvas" aria-hidden="true">
          <span className="map-road main" />
          <span className="map-road side" />
          <span className="map-zone one" />
          <span className="map-zone two" />
          <div className="map-pin">
            <MapPin size={26} />
          </div>
        </div>
        <div className="map-caption">
          <strong>{hasPinnedLocation ? 'Location pinned on map' : 'No map pin yet'}</strong>
          <p>{hasPinnedLocation ? `${coords.latitude}, ${coords.longitude}` : 'Fetch live location to drop your workplace pin.'}</p>
        </div>
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
          Fetch Live Location
        </button>
        <button className="primary-action" onClick={() => saveLocation(workplace, coords)} type="button">
          Save Pinned Location
        </button>
      </div>
    </div>
  );
}

function NotificationsScreen() {
  const [filter, setFilter] = useState('all');
  const [readIds, setReadIds] = useState([]);
  const [dismissedIds, setDismissedIds] = useState([]);
  const notifications = [
    { id: 'auto-check-in', icon: CheckCircle2, title: 'Auto Check-In', body: 'You arrived at workplace', time: '9:12 AM', tone: 'green', unread: true },
    { id: 'break-reminder', icon: Coffee, title: 'Reminder', body: 'Do not forget to take a break', time: '11:30 AM', tone: 'blue', unread: true },
    { id: 'idle-alert', icon: CircleAlert, title: 'Idle Alert', body: 'Inactive for 20 minutes', time: '1:50 PM', tone: 'orange', unread: false },
    { id: 'auto-check-out', icon: LogOut, title: 'Auto Check-Out', body: 'You left workplace', time: '6:48 PM', tone: 'red', unread: true },
    { id: 'daily-summary', icon: FileText, title: 'Daily Summary', body: 'Tap to view your report', time: 'Yesterday', tone: 'purple', unread: false },
  ];
  const activeNotifications = notifications.filter((item) => !dismissedIds.includes(item.id));
  const unreadCount = activeNotifications.filter((item) => item.unread && !readIds.includes(item.id)).length;
  const visibleNotifications = activeNotifications.filter((item) => (
    filter === 'all' || (item.unread && !readIds.includes(item.id))
  ));
  const emptyTitle = activeNotifications.length === 0
    ? 'Notifications cleared'
    : 'No unread notifications';
  const emptyCopy = activeNotifications.length === 0
    ? 'New alerts will appear here.'
    : 'You are all caught up.';

  function markAsRead() {
    setReadIds(activeNotifications.map((item) => item.id));
  }

  function clearNotifications() {
    setDismissedIds(notifications.map((item) => item.id));
    setReadIds(notifications.map((item) => item.id));
  }

  return (
    <div className="screen-stack">
      <div className="segment" role="tablist" aria-label="Notification filter">
        <button aria-pressed={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')} type="button">All</button>
        <button aria-pressed={filter === 'unread'} className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')} type="button">
          Unread {unreadCount ? `(${unreadCount})` : ''}
        </button>
      </div>
      <div className="notification-toolbar" aria-label="Notification actions">
        <button disabled={!unreadCount} onClick={markAsRead} type="button">
          Mark as read
        </button>
        <button className="danger" disabled={!activeNotifications.length} onClick={clearNotifications} type="button">
          Clear
        </button>
      </div>
      <section className="notification-list" aria-live="polite">
        {visibleNotifications.length === 0 ? (
          <div className="empty-state compact">
            <strong>{emptyTitle}</strong>
            <span>{emptyCopy}</span>
          </div>
        ) : null}
        {visibleNotifications.map((item) => {
          const Icon = item.icon;
          return (
            <article className={item.unread && !readIds.includes(item.id) ? 'notification-row unread' : 'notification-row'} key={item.id}>
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
        <button type="button" aria-label="Add photo">
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
    <main className="splash-screen minimal-splash">
      <section className="splash-copy" aria-label="WorkPulse splash screen">
        <WorkPulseLogo />
        <h1>WorkPulse</h1>
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
  const [returnView, setReturnView] = useState('home');
  const [dashboardOrder, setDashboardOrder] = useState(() => readDashboardOrder());
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) ?? 'light');
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
    const timer = window.setTimeout(() => setShowSplash(false), 2000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(DASHBOARD_ORDER_KEY, JSON.stringify(dashboardOrder));
  }, [dashboardOrder]);

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

  async function saveManualSession({ date, inTime, outTime }, { allowOverlap = false } = {}) {
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

      if (hasSessionOverlap(record.sessions, inAt, outAt) && !allowOverlap) {
        return { ok: false, message: 'Manual time overlaps an existing session', canOverride: true };
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
        body: { allowOverlap, in: inAt, out: outAt },
      });
      setRecords(data.records ?? {});
      return { ok: true };
    } catch (error) {
      setActionError(error.message);
      return { ok: false, message: error.message, canOverride: Boolean(error.data?.canOverride) };
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

    if (!window.confirm('Clear all WorkPulse records for this profile? This cannot be undone.')) {
      return;
    }

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

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  function navigateView(nextView) {
    if (DETAIL_VIEWS.has(nextView)) {
      setReturnView(DETAIL_VIEWS.has(activeView) ? returnView : activeView);
    } else {
      setReturnView(nextView);
    }

    setActiveView(nextView);
  }

  function closeDetailView() {
    setActiveView(returnView || 'home');
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
          onBack={closeDetailView}
          now={today}
          setActiveView={navigateView}
          theme={theme}
          toggleTheme={toggleTheme}
          user={user}
        />

        <section className="content-area">
          {actionError ? <div className="action-error">{actionError}</div> : null}
          {activeView === 'home' ? (
            <HomeScreen
              activeSession={activeSession}
              breakMs={breakMs}
              completedMs={completedMs}
              dashboardOrder={dashboardOrder}
              distanceMeters={distanceMeters}
              liveLocation={liveLocation}
              onBreak={onBreak}
              punchIn={requestPunchIn}
              punchOut={punchOut}
              setActiveView={navigateView}
              setDashboardOrder={setDashboardOrder}
              todayRecord={todayRecord}
              totalMs={totalMs}
              user={user}
              weeklyMs={weeklyMs}
            />
          ) : null}
          {activeView === 'timeline' ? <TimelineScreen records={records} today={today} todayRecord={todayRecord} /> : null}
          {activeView === 'reports' ? <ReportsScreen records={records} today={today} /> : null}
          {activeView === 'profile' ? <ProfileScreen clearAll={clearAll} logout={logout} setActiveView={navigateView} user={user} /> : null}
          {activeView === 'notifications' ? <NotificationsScreen /> : null}
          {activeView === 'notes' ? <NotesScreen record={todayRecord} saveNotes={saveNotes} /> : null}
          {activeView === 'location' ? <LocationScreen saveLocation={saveLocation} user={user} /> : null}
          {activeView === 'manual' ? <ManualTimeScreen dateKey={dateKey} saveManualSession={saveManualSession} /> : null}
          {activeView === 'personal' ? <PersonalInformationScreen user={user} /> : null}
          {activeView === 'schedule' ? <WorkScheduleScreen /> : null}
          {activeView === 'privacy' ? <DataPrivacyScreen clearAll={clearAll} isGuest={isGuest} /> : null}
          {activeView === 'export' ? <ExportDataScreen records={records} user={user} /> : null}
          {activeView === 'support' ? <HelpSupportScreen /> : null}
        </section>

        <BottomNav activeView={activeView} setActiveView={navigateView} />
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
