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
    <article className="metric-card">
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
    <section className="app-card">
      <div className="section-head">
        <div>
          <span>Weekly Summary</span>
          <h2>This week</h2>
        </div>
        <strong>{formatHours(weeklyMs)}</strong>
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

function HistoryView({ records }) {
  const rows = Object.entries(records)
    .map(([date, record]) => ({
      date,
      sessions: record.sessions.length,
      worked: calculateCompletedMs(record),
      breakTime: calculateBreakMs(record),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (rows.length === 0) {
    return (
      <section className="app-card">
        <div className="empty-state">
          <strong>No history yet</strong>
          <span>Your saved days will appear here after you clock in and out.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="app-card">
      <div className="section-head">
        <div>
          <span>Saved Records</span>
          <h2>History</h2>
        </div>
        <strong>{rows.length} days</strong>
      </div>

      <div className="history-list">
        {rows.map((row) => (
          <article className="history-row" key={row.date}>
            <div>
              <strong>{row.date}</strong>
              <span>{row.sessions} sessions / {formatHours(row.breakTime)} break</span>
            </div>
            <b>{formatHours(row.worked)}</b>
          </article>
        ))}
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
  const [activeView, setActiveView] = useState('today');

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
  const weeklyMs = getWeekDays(today).reduce((total, day) => {
    const key = formatDateKey(day);
    return total + calculateCompletedMs(records[key] ?? { sessions: [] });
  }, 0);

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
    <main className="page">
      <section className="app-frame" aria-label="WorkPulse time clock app">
        <header className="app-topbar">
          <div className="brand-mark">W</div>
          <div>
            <span>WorkPulse</span>
            <strong>{formatLongDate(today)}</strong>
          </div>
          <button className="icon-button" onClick={clearToday} title="Reset today" type="button">
            ↺
          </button>
        </header>

        <section className={activeSession ? 'status-card active' : 'status-card'}>
          <div className="status-copy">
            <span>{activeSession ? 'You are clocked in' : 'You are clocked out'}</span>
            <h1>{formatHours(totalMs)}</h1>
            <p>{activeSession ? `Started at ${formatClock(activeSession.in)}` : 'Tap In to start tracking work time'}</p>
          </div>
          <div className="time-now">
            <span>Now</span>
            <strong>{today.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
          </div>
        </section>

        <div className="view-area">
          {activeView === 'today' ? (
            <>
              <button className={activeSession ? 'punch-button out' : 'punch-button'} onClick={punch} type="button">
                <span>{activeSession ? 'Clock Out' : 'Clock In'}</span>
                <strong>{activeSession ? 'Out' : 'In'}</strong>
              </button>

              <section className="metrics-grid" aria-label="Daily hour totals">
                <StatCard label="Completed" value={formatHours(completedMs)} note="Closed sessions" />
                <StatCard label="Break" value={formatHours(breakMs)} note="Between shifts" />
                <StatCard label="Week" value={formatHours(weeklyMs)} note="Mon to Sun" />
              </section>

              <section className="app-card">
                <div className="section-head">
                  <div>
                    <span>Today Timeline</span>
                    <h2>{todayRecord.sessions.length ? `${todayRecord.sessions.length} sessions` : 'No sessions'}</h2>
                  </div>
                  <b>{dateKey}</b>
                </div>
                <Timeline sessions={todayRecord.sessions} />
              </section>
            </>
          ) : null}

          {activeView === 'week' ? <WeekTable records={records} today={today} /> : null}
          {activeView === 'history' ? <HistoryView records={records} /> : null}
          {activeView === 'more' ? (
            <section className="app-card">
              <div className="section-head">
                <div>
                  <span>Manage</span>
                  <h2>Options</h2>
                </div>
              </div>
              <div className="option-list">
                <button onClick={clearToday} type="button">
                  <span>↺</span>
                  Reset today
                </button>
                <button onClick={() => setRecords({})} type="button">
                  <span>×</span>
                  Clear all records
                </button>
              </div>
            </section>
          ) : null}
        </div>

        <nav className="bottom-tabs" aria-label="App navigation">
          <button className={activeView === 'today' ? 'active' : ''} onClick={() => setActiveView('today')} type="button">
            <span>⌂</span>
            Today
          </button>
          <button className={activeView === 'week' ? 'active' : ''} onClick={() => setActiveView('week')} type="button">
            <span>◷</span>
            Week
          </button>
          <button className={activeView === 'history' ? 'active' : ''} onClick={() => setActiveView('history')} type="button">
            <span>▦</span>
            History
          </button>
          <button className={activeView === 'more' ? 'active' : ''} onClick={() => setActiveView('more')} type="button">
            <span>⋯</span>
            More
          </button>
        </nav>
      </section>
    </main>
  );
}
