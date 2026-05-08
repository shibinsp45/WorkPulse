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
  LogOut,
  MapPin,
  Plus,
  Save,
  Shield,
  Timer,
  User,
} from 'lucide-react';

const STORAGE_KEY = 'employee-hours-records-v1';
const TARGET_MS = 8 * 60 * 60 * 1000;
const WORKPLACE = 'Technopark Phase 1';
const EMPLOYEE_NAME = 'Shibin';

const focusTags = ['Development', 'Design', 'Meeting', 'Testing', 'Research', 'Other'];

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
    sessions: record?.sessions ?? [],
    notes: record?.notes ?? '',
    focus: record?.focus ?? [],
  };
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
    if (!previous.out) return total;
    return total + Math.max(0, session.in - previous.out);
  }, 0);
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
    const isLast = index === sessions.length - 1;
    const events = [
      {
        id: `${session.in}-in`,
        time: session.in,
        title: isFirst ? 'Check In' : 'Break End',
        icon: isFirst ? CheckCircle2 : Coffee,
        meta: WORKPLACE,
      },
    ];

    if (session.out) {
      events.push({
        id: `${session.out}-out`,
        time: session.out,
        title: isLast ? 'Check Out' : 'Break Start',
        icon: isLast ? LogOut : Coffee,
        meta: WORKPLACE,
      });
    }

    return events;
  });
}

function StatusBar({ now }) {
  return (
    <div className="status-bar">
      <span>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      <div>
        <span className="signal-dot" />
        <span className="signal-dot" />
        <span className="battery" />
      </div>
    </div>
  );
}

function AppHeader({ activeView, now, setActiveView }) {
  const isBackView = ['notifications', 'notes'].includes(activeView);

  return (
    <header className="app-header">
      {isBackView ? (
        <button className="header-icon" onClick={() => setActiveView('home')} type="button">
          <ArrowLeft size={18} />
        </button>
      ) : (
        <div>
          <p>{getGreeting(now)},</p>
          <h1>{EMPLOYEE_NAME}</h1>
          <span>{formatLongDate(now)}</span>
        </div>
      )}

      {activeView === 'notifications' ? <h2>Notifications</h2> : null}
      {activeView === 'notes' ? <h2>Work Notes</h2> : null}

      {!isBackView ? (
        <button className="header-icon has-dot" onClick={() => setActiveView('notifications')} type="button">
          <Bell size={18} />
        </button>
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

function WorkplaceCard() {
  return (
    <section className="glass-card workplace-card">
      <div>
        <span className="eyebrow">Workplace</span>
        <h3>{WORKPLACE}</h3>
        <p>Within approved radius</p>
      </div>
      <div className="pin-button">
        <MapPin size={20} />
      </div>
    </section>
  );
}

function HomeScreen({ activeSession, breakMs, completedMs, punch, setActiveView, todayRecord, totalMs, weeklyMs }) {
  const remainingMs = Math.max(0, TARGET_MS - totalMs);
  const overtimeMs = Math.max(0, totalMs - TARGET_MS);
  const lastClosed = todayRecord.sessions.filter((session) => session.out).at(-1);

  return (
    <div className="screen-stack">
      <div className={activeSession ? 'state-pill checked-in' : 'state-pill checked-out'}>
        {activeSession ? 'Checked In' : 'Checked Out'}
      </div>

      {activeSession ? (
        <section className="glass-card live-card">
          <span className="eyebrow green">Live Timer</span>
          <strong>{formatTimer(totalMs)}</strong>
          <p>Working since {formatClock(activeSession.in)}</p>
          <small>On track</small>
        </section>
      ) : (
        <section className="empty-clock-card">
          <div className="clock-illustration">
            <Timer size={46} />
          </div>
          <h3>{lastClosed ? 'You are checked out' : 'Ready to start'}</h3>
          <p>{lastClosed ? 'Check in again to continue your hours.' : 'Tap check in to start tracking your work hours.'}</p>
        </section>
      )}

      <WorkplaceCard />

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

      <section className="quick-grid">
        <MetricCard icon={Clock3} label="Worked" value={formatHours(totalMs)} hint="Today" />
        <MetricCard icon={Timer} label="Remaining" value={formatHours(remainingMs)} hint="Target left" />
        <MetricCard icon={Coffee} label="Break" value={formatHours(breakMs)} hint="Away time" />
        <MetricCard icon={BarChart3} label="Week" value={formatHours(weeklyMs)} hint="Mon to Sun" />
      </section>

      <div className="action-row">
        <button className={activeSession ? 'primary-action danger' : 'primary-action'} onClick={punch} type="button">
          {activeSession ? 'Check Out' : 'Check In'}
        </button>
        <button className="secondary-action" onClick={punch} type="button">
          {activeSession ? 'Break' : 'Resume'}
        </button>
      </div>

      <section className="summary-card">
        <div className="section-title">
          <div>
            <span className="eyebrow">Today's summary</span>
            <h2>{formatHours(completedMs)}</h2>
          </div>
          <button onClick={() => setActiveView('notes')} type="button">
            Add Note
          </button>
        </div>
        <SummaryRow label="Check In" value={todayRecord.sessions[0] ? formatClock(todayRecord.sessions[0].in) : '--'} />
        <SummaryRow label="Check Out" value={lastClosed ? formatClock(lastClosed.out) : '--'} />
        <SummaryRow label="Break Time" value={formatHours(breakMs)} />
        <SummaryRow label="Overtime" value={formatHours(overtimeMs)} positive />
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

function ProfileScreen({ clearAll, setActiveView }) {
  const items = [
    { icon: User, label: 'Personal Information' },
    { icon: MapPin, label: 'Workplace and Location' },
    { icon: Clock3, label: 'Work Schedule', meta: '9:00 AM - 6:00 PM' },
    { icon: Bell, label: 'Notifications', action: () => setActiveView('notifications') },
    { icon: Shield, label: 'Data and Privacy' },
    { icon: Download, label: 'Export Data' },
    { icon: HelpCircle, label: 'Help and Support' },
  ];

  return (
    <div className="profile-screen">
      <section className="profile-hero">
        <div className="avatar">S</div>
        <div>
          <h2>{EMPLOYEE_NAME}</h2>
          <p>Employee ID: EMP1024</p>
          <span>Personal Plan</span>
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
      </section>
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

function SplashScreen({ onStart }) {
  return (
    <main className="splash-screen">
      <div className="splash-logo">
        <CheckCircle2 size={42} />
      </div>
      <h1>WorkPulse</h1>
      <p>Track your time. Stay productive.</p>
      <button onClick={onStart} type="button">Continue as Guest</button>
    </main>
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
  const [records, setRecords] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    } catch {
      return {};
    }
  });
  const [now, setNow] = useState(Date.now());
  const [activeView, setActiveView] = useState('home');
  const [showSplash, setShowSplash] = useState(() => localStorage.getItem('workpulse-started') !== 'true');

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

  function updateToday(updater) {
    setRecords((current) => {
      const record = getTodayRecord(current, dateKey);
      return {
        ...current,
        [dateKey]: updater(record),
      };
    });
  }

  function punch() {
    updateToday((record) => {
      const sessions = [...record.sessions];
      const activeIndex = sessions.findIndex((session) => !session.out);

      if (activeIndex >= 0) {
        sessions[activeIndex] = { ...sessions[activeIndex], out: Date.now() };
      } else {
        sessions.push({ in: Date.now(), out: null });
      }

      return { ...record, sessions };
    });
  }

  function saveNotes(notes, focus) {
    updateToday((record) => ({ ...record, notes, focus }));
    setActiveView('home');
  }

  function clearAll() {
    setRecords({});
    setActiveView('home');
  }

  function startApp() {
    localStorage.setItem('workpulse-started', 'true');
    setShowSplash(false);
  }

  if (showSplash) {
    return (
      <section className="phone-shell">
        <StatusBar now={today} />
        <SplashScreen onStart={startApp} />
      </section>
    );
  }

  return (
    <main className="page">
      <section className="phone-shell" aria-label="WorkPulse employee time tracker">
        <StatusBar now={today} />
        <AppHeader activeView={activeView} now={today} setActiveView={setActiveView} />

        <section className="content-area">
          {activeView === 'home' ? (
            <HomeScreen
              activeSession={activeSession}
              breakMs={breakMs}
              completedMs={completedMs}
              punch={punch}
              setActiveView={setActiveView}
              todayRecord={todayRecord}
              totalMs={totalMs}
              weeklyMs={weeklyMs}
            />
          ) : null}
          {activeView === 'timeline' ? <TimelineScreen records={records} today={today} todayRecord={todayRecord} /> : null}
          {activeView === 'reports' ? <ReportsScreen records={records} today={today} /> : null}
          {activeView === 'profile' ? <ProfileScreen clearAll={clearAll} setActiveView={setActiveView} /> : null}
          {activeView === 'notifications' ? <NotificationsScreen /> : null}
          {activeView === 'notes' ? <NotesScreen record={todayRecord} saveNotes={saveNotes} /> : null}
        </section>

        {!['notifications', 'notes'].includes(activeView) ? (
          <BottomNav activeView={activeView} setActiveView={setActiveView} />
        ) : null}
      </section>
    </main>
  );
}
