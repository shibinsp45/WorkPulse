import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'employee-hours-records-v1';

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
    month: 'short',
    day: 'numeric',
  });
}

function formatHours(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${pad(minutes)}m`;
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

function getTodayRecord(records, dateKey) {
  return records[dateKey] ?? { sessions: [] };
}

function calculateWorkedMs(record, now) {
  return record.sessions.reduce((total, session) => {
    const out = session.out ?? now;
    return total + Math.max(0, out - session.in);
  }, 0);
}

function calculateCompletedMs(record) {
  return record.sessions.reduce((total, session) => {
    if (!session.out) return total;
    return total + Math.max(0, session.out - session.in);
  }, 0);
}

function calculateBreakMs(record) {
  return record.sessions.reduce((total, session, index, sessions) => {
    if (index === 0) return total;
    const previous = sessions[index - 1];
    if (!previous.out) return total;
    return total + Math.max(0, session.in - previous.out);
  }, 0);
}

function StatCard({ label, value, note }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

function Timeline({ sessions }) {
  if (sessions.length === 0) {
    return (
      <div className="empty-state">
        <strong>No punches yet</strong>
        <span>Press In when the employee starts work.</span>
      </div>
    );
  }

  return (
    <div className="timeline">
      {sessions.map((session, index) => (
        <div className="timeline-row" key={session.in}>
          <div className="timeline-marker">{index + 1}</div>
          <div>
            <span>In</span>
            <strong>{formatClock(session.in)}</strong>
          </div>
          <div>
            <span>Out</span>
            <strong>{session.out ? formatClock(session.out) : 'Running'}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}

function WeekTable({ records, today }) {
  const days = getWeekDays(today);
  const weeklyMs = days.reduce((total, day) => {
    const key = formatDateKey(day);
    return total + calculateCompletedMs(records[key] ?? { sessions: [] });
  }, 0);

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <span>Weekly Summary</span>
          <h2>{formatHours(weeklyMs)}</h2>
        </div>
        <p>Mon to Sun</p>
      </div>

      <div className="week-list">
        {days.map((day) => {
          const key = formatDateKey(day);
          const worked = calculateCompletedMs(records[key] ?? { sessions: [] });
          const isToday = key === formatDateKey(today);

          return (
            <div className={isToday ? 'week-row today' : 'week-row'} key={key}>
              <div>
                <strong>{day.toLocaleDateString([], { weekday: 'short' })}</strong>
                <span>{day.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
              </div>
              <b>{formatHours(worked)}</b>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function App() {
  const [records, setRecords] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    } catch {
      return {};
    }
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const today = useMemo(() => new Date(now), [now]);
  const dateKey = formatDateKey(today);
  const todayRecord = getTodayRecord(records, dateKey);
  const activeSession = todayRecord.sessions.find((session) => !session.out);
  const completedMs = calculateCompletedMs(todayRecord);
  const totalMs = calculateWorkedMs(todayRecord, now);
  const breakMs = calculateBreakMs(todayRecord);

  function punch() {
    setRecords((current) => {
      const record = getTodayRecord(current, dateKey);
      const sessions = [...record.sessions];
      const activeIndex = sessions.findIndex((session) => !session.out);

      if (activeIndex >= 0) {
        sessions[activeIndex] = { ...sessions[activeIndex], out: Date.now() };
      } else {
        sessions.push({ in: Date.now(), out: null });
      }

      return {
        ...current,
        [dateKey]: { sessions },
      };
    });
  }

  function clearToday() {
    setRecords((current) => {
      const next = { ...current };
      delete next[dateKey];
      return next;
    });
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p>Employee Time Clock</p>
          <h1>Daily and weekly working hours, calculated as employees punch in and out.</h1>
        </div>
        <div className="today-chip">
          <span>{formatLongDate(today)}</span>
          <strong>{today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
        </div>
      </section>

      <section className="dashboard">
        <div className="clock-panel">
          <div className="status-row">
            <span className={activeSession ? 'status-pill active' : 'status-pill'}>
              {activeSession ? 'Currently In' : 'Currently Out'}
            </span>
            <button className="text-button" onClick={clearToday} type="button">
              Reset today
            </button>
          </div>

          <div className="timer">
            <span>Current completed hours</span>
            <strong>{formatHours(totalMs)}</strong>
            <p>{activeSession ? `Session started at ${formatClock(activeSession.in)}` : 'Ready for the next In punch'}</p>
          </div>

          <button className={activeSession ? 'punch-button out' : 'punch-button'} onClick={punch} type="button">
            {activeSession ? 'Out' : 'In'}
          </button>

          <div className="stats-grid">
            <StatCard label="Completed" value={formatHours(completedMs)} note="Closed sessions" />
            <StatCard label="Break" value={formatHours(breakMs)} note="Time between Out and next In" />
            <StatCard label="Today Total" value={formatHours(totalMs)} note="Includes running session" />
          </div>
        </div>

        <section className="panel">
          <div className="panel-title">
            <div>
              <span>Today Timeline</span>
              <h2>{todayRecord.sessions.length} punches</h2>
            </div>
            <p>{dateKey}</p>
          </div>
          <Timeline sessions={todayRecord.sessions} />
        </section>

        <WeekTable records={records} today={today} />
      </section>
    </main>
  );
}
