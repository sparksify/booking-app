import { useState, useEffect, useRef, useMemo } from 'react';
import Head from 'next/head';

// ─── Config ────────────────────────────────────────────────────────────────────
const CFG = {
  hostName:     process.env.NEXT_PUBLIC_HOST_NAME     || 'Steve Sparks',
  calTitle:     'Choose a time that works best for you',
  meetingTitle: process.env.NEXT_PUBLIC_MEETING_TITLE || '15-Minute Phone Call',
  duration:     parseInt(process.env.NEXT_PUBLIC_MEETING_DURATION || '15'),
  tz:           process.env.NEXT_PUBLIC_TIMEZONE_DISPLAY || 'Central Time',
  daysAhead:    14,
};

// ─── Question definitions ─────────────────────────────────────────────────────
const QUESTIONS = [
  { q: ()    => "What's your first name?",                   ph: 'Type your answer…', key: 'firstName', type: 'text'  },
  { q: (ans) => `Hi ${ans.firstName}! Last name?`,           ph: 'Type your answer…', key: 'lastName',  type: 'text'  },
  { q: ()    => 'Best phone number?',                        ph: 'Type your answer…', key: 'phone',     type: 'tel'   },
  { q: ()    => 'Email address?',                            ph: 'Type your answer…', key: 'email',     type: 'email' },
];

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON_SHORT   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isValidPhone(v) { return v.replace(/\D/g, '').length >= 7; }

function canAdvance(step, answers) {
  const q   = QUESTIONS[step];
  const val = (answers[q.key] || '').trim();
  if (!val) return false;
  if (q.key === 'phone') return isValidPhone(val);
  return true;
}

function generateWorkdays(daysAhead) {
  const days = [];
  const now  = new Date();
  let count  = 0;
  for (let i = 1; count < daysAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    days.push({
      dateStr: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
      dow:     DOW_NAMES[d.getDay()],
      mon:     MON_SHORT[d.getMonth()],
      day:     d.getDate(),
      month:   d.getMonth(),   // 0-indexed
      year:    d.getFullYear(),
    });
    count++;
  }
  return days;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BookingPage() {
  // phases: 'form' | 'calendar' | 'slots' | 'confirm' | 'booked'
  const [phase,   setPhase]   = useState('form');
  const [step,    setStep]    = useState(0);
  const [answers, setAnswers] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [days,    setDays]    = useState([]);
  const [slotMap, setSlotMap] = useState({});   // dateStr → { slots, loading, loaded }
  const [selDate, setSelDate] = useState(null); // day object from generateWorkdays
  const [selSlot, setSelSlot] = useState(null); // { h, m, label }
  const [booking, setBooking] = useState(false);
  const inputRef = useRef(null);

  // Generate workdays client-side (avoids SSR hydration mismatch)
  useEffect(() => { setDays(generateWorkdays(CFG.daysAhead)); }, []);

  // Facebook URL params → skip form, jump straight to calendar
  useEffect(() => {
    const p  = new URLSearchParams(window.location.search);
    const fn = p.get('first_name')   || p.get('firstName') || '';
    const ln = p.get('last_name')    || p.get('lastName')  || '';
    const em = p.get('email')        || '';
    const ph = p.get('phone_number') || p.get('phone')     || '';
    if (fn || em) {
      setAnswers({ firstName: fn, lastName: ln, phone: ph, email: em });
      setPhase('calendar');
    }
  }, []);

  // Auto-focus input on each form step
  useEffect(() => {
    if (phase !== 'form' || !inputRef.current) return;
    const el = inputRef.current;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { el.focus(); el.click(); } catch (_) {}
    }));
  }, [phase, step]);

  // Keyboard: Enter to advance form
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Enter' || phase !== 'form') return;
      e.preventDefault();
      if (canAdvance(step, answers)) doAdvance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Pre-fetch ALL 14 days simultaneously on calendar phase entry
  useEffect(() => {
    if (phase !== 'calendar' || days.length === 0) return;
    setSlotMap(prev => {
      const next = { ...prev };
      days.forEach(d => {
        if (!next[d.dateStr]) next[d.dateStr] = { slots: [], loading: true, loaded: false };
      });
      return next;
    });
    days.forEach(({ dateStr }) => {
      fetch(`/api/availability?date=${dateStr}`)
        .then(r => r.json())
        .then(data => setSlotMap(prev => ({ ...prev, [dateStr]: { slots: data.slots || [], loading: false, loaded: true } })))
        .catch(() => setSlotMap(prev => ({ ...prev, [dateStr]: { slots: [], loading: false, loaded: true } })));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, days]);

  // ── Actions ────────────────────────────────────────────────────────────────

  function doAdvance() {
    if (step + 1 >= QUESTIONS.length) setPhase('calendar');
    else setStep(s => s + 1);
  }
  function doRetreat() { if (step > 0) setStep(s => s - 1); }

  function pickDate(day) {
    setSelDate(day);
    setSelSlot(null);
    setPhase('slots');
  }

  function pickSlot(sl) {
    setSelSlot(sl);
    setPhase('confirm');
  }

  function editField(stepIndex) {
    setStep(stepIndex);
    setPhase('form');
  }

  async function confirmBooking() {
    if (!selDate || !selSlot || booking) return;
    setBooking(true);
    try {
      await fetch('/api/book', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: answers.firstName,
          lastName:  answers.lastName,
          email:     answers.email,
          phone:     answers.phone,
          date:      selDate.dateStr,
          h:         selSlot.h,
          m:         selSlot.m,
          label:     selSlot.label,
        }),
      });
    } catch (_) { /* still advance to booked screen */ }
    setBooking(false);
    setPhase('booked');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'form')
    return <FormPhase {...{ step, answers, setAnswers, doAdvance, doRetreat, inputRef }} />;
  if (phase === 'calendar')
    return <CalendarPhase days={days} slotMap={slotMap} onPickDate={pickDate} />;
  if (phase === 'slots')
    return <SlotsPhase day={selDate} slotMap={slotMap} onPickSlot={pickSlot} onBack={() => setPhase('calendar')} />;
  if (phase === 'confirm')
    return <ConfirmPhase selDate={selDate} selSlot={selSlot} booking={booking} onConfirm={confirmBooking} onBack={() => setPhase('slots')} answers={answers} onEditField={editField} />;
  return <BookedPhase answers={answers} selDate={selDate} selSlot={selSlot} />;
}

// ─── Form phase (unchanged) ───────────────────────────────────────────────────
function FormPhase({ step, answers, setAnswers, doAdvance, doRetreat, inputRef }) {
  const total   = QUESTIONS.length;
  const pct     = Math.round(((step + 1) / (total + 1)) * 100);
  const q       = QUESTIONS[step];
  const val     = answers[q.key] || '';
  const can     = canAdvance(step, answers);
  const showErr = q.key === 'phone' && val.trim() && !isValidPhone(val);

  return (
    <>
      <Head><title>Schedule a Call</title></Head>
      <div className="tf-root">
        <div className="tf-pbar">
          <div className="tf-pbar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div key={step} className="tf-card in-down">
          <div className="tf-qnum">{step + 1} → {total}</div>
          <div className="tf-q">{q.q(answers)}</div>
          <input
            ref={inputRef}
            className="tf-input"
            type={q.type}
            placeholder={q.ph}
            value={val}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={e => setAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
          />
          {showErr && (
            <div style={{ fontSize: 12, color: '#EF4444', marginTop: 8 }}>Please enter at least 7 digits</div>
          )}
          <div className="tf-actions">
            <button className="tf-ok" disabled={!can} onClick={doAdvance}>OK <ArrowRight /></button>
            <span className="tf-hint">press <b>Enter ↵</b></span>
          </div>
        </div>
        <div className="tf-nav">
          <button className="tf-nav-btn" disabled={step === 0} onClick={doRetreat}><ChevronUp /></button>
          <button className="tf-nav-btn" disabled={!can} onClick={doAdvance}><ChevronDown /></button>
        </div>
        <div className="tf-counter"><b>{step + 1}</b> / {total}</div>
      </div>
    </>
  );
}

// ─── Calendar phase ───────────────────────────────────────────────────────────
function CalendarPhase({ days, slotMap, onPickDate }) {
  const todayMidnight = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); return t;
  }, []);

  const [vm, setVm] = useState(todayMidnight.getMonth());
  const [vy, setVy] = useState(todayMidnight.getFullYear());

  // Quick lookup: dateStr → day object
  const dayMap = useMemo(() => {
    const m = {};
    days.forEach(d => { m[d.dateStr] = d; });
    return m;
  }, [days]);

  const lastDay  = days[days.length - 1];
  const maxMonth = lastDay?.month ?? todayMidnight.getMonth();
  const maxYear  = lastDay?.year  ?? todayMidnight.getFullYear();

  const canPrev = vy > todayMidnight.getFullYear() || vm > todayMidnight.getMonth();
  const canNext = vy < maxYear || (vy === maxYear && vm < maxMonth);

  function changeMonth(delta) {
    let nm = vm + delta, ny = vy;
    if (nm > 11) { nm = 0; ny++; }
    if (nm < 0)  { nm = 11; ny--; }
    setVm(nm); setVy(ny);
  }

  const firstDow    = new Date(vy, vm, 1).getDay();
  const daysInMonth = new Date(vy, vm + 1, 0).getDate();

  return (
    <>
      <Head><title>Schedule a Call</title></Head>
      <div className="cv2-root">

        {/* Info bar */}
        <div className="cv2-infobar">
          <div className="cv2-infobar-title">{CFG.calTitle}</div>
          <div className="cv2-infobar-meta">
            <IcoClk size={13} /> 15 Minute Phone Conversation · {CFG.tz}
          </div>
        </div>

        {/* Month navigation */}
        <div className="cv2-month-nav">
          <button className="cv2-nav-btn" disabled={!canPrev} onClick={() => changeMonth(-1)} aria-label="Previous month">
            <ChevronLeft />
          </button>
          <span className="cv2-month-label">{MONTH_NAMES[vm]} {vy}</span>
          <button className="cv2-nav-btn" disabled={!canNext} onClick={() => changeMonth(1)} aria-label="Next month">
            <ChevronRight />
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="cv2-dow-row">
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={i} className="cv2-dow">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="cv2-grid">
          {/* Blank padding cells */}
          {Array.from({ length: firstDow }).map((_, i) => (
            <div key={`b${i}`} className="cv2-cell" />
          ))}
          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d       = i + 1;
            const dateStr = `${vy}-${String(vm+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const dt      = new Date(vy, vm, d, 0, 0, 0, 0);
            const isPast  = dt < todayMidnight;
            const isWe    = dt.getDay() === 0 || dt.getDay() === 6;
            const dayObj  = dayMap[dateStr];
            const info    = slotMap[dateStr];
            // Show as available while loading; hide only if confirmed 0 slots
            const noSlots = info?.loaded && info.slots.length === 0;
            const isAvail = !isPast && !isWe && !!dayObj && !noSlots;

            return (
              <div
                key={dateStr}
                className={`cv2-cell${isAvail ? ' cv2-cell-avail' : ' cv2-cell-dim'}`}
                onClick={isAvail ? () => onPickDate(dayObj) : undefined}
              >
                <span className="cv2-num">{d}</span>
                {isAvail && <span className="cv2-dot" />}
              </div>
            );
          })}
        </div>

        <div className="cv2-legend">
          <span className="cv2-ldot" />
          <span>Available — tap a date to see times</span>
        </div>
      </div>
    </>
  );
}

// ─── Slots phase ──────────────────────────────────────────────────────────────
function SlotsPhase({ day, slotMap, onPickSlot, onBack }) {
  if (!day) return null;
  const info             = slotMap[day.dateStr] || { slots: [], loading: true, loaded: false };
  const { slots, loading } = info;

  return (
    <>
      <Head><title>Schedule a Call</title></Head>
      <div className="sv2-root">

        {/* Header: back + date */}
        <div className="sv2-hdr">
          <button className="sv2-back" onClick={onBack} aria-label="Back to calendar">
            <ArrowLeft />
          </button>
          <div>
            <div className="sv2-hdr-date">{day.dow}, {day.mon} {day.day}</div>
            <div className="sv2-hdr-count">
              {loading ? 'Loading times…' : `${slots.length} times available · ${CFG.duration} min`}
            </div>
          </div>
        </div>

        {/* Slots or skeleton or empty */}
        <div className="sv2-body">
          {loading ? (
            <div className="sv2-grid">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="skel sv2-skel" style={{ animationDelay: `${i * 40}ms` }} />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <div className="slots-empty" style={{ minHeight: 300 }}>
              <div className="slots-empty-ico">😔</div>
              <div className="slots-empty-h">Fully booked</div>
              <div className="slots-empty-s">Try a different date</div>
              <button
                onClick={onBack}
                style={{ marginTop: 20, background: '#1877F2', color: '#fff', border: 'none', borderRadius: 20, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" }}
              >
                ← Pick another day
              </button>
            </div>
          ) : (
            <div className="sv2-grid">
              {slots.map(sl => (
                <button
                  key={`${sl.h}-${sl.m}`}
                  className="sv2-slot"
                  onClick={() => onPickSlot(sl)}
                >
                  {sl.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Confirm phase ────────────────────────────────────────────────────────────
function ConfirmPhase({ selDate, selSlot, booking, onConfirm, onBack, answers, onEditField }) {
  if (!selDate || !selSlot) return null;

  return (
    <>
      <Head><title>Confirm Your Booking</title></Head>
      <div className="cfm-root">

        {/* Header */}
        <div className="cfm-hdr">
          <button className="sv2-back" onClick={onBack} aria-label="Back to times">
            <ArrowLeft />
          </button>
          <span className="cfm-hdr-label">Review &amp; confirm</span>
        </div>

        {/* Body */}
        <div className="cfm-body">
          <div className="cfm-title">{CFG.meetingTitle}</div>
          <div className="cfm-sub">{CFG.duration} min · {CFG.tz}</div>

          {/* Date & Time */}
          <div className="cfm-card" style={{ marginBottom: 14 }}>
            <div className="cfm-row">
              <div className="cfm-row-ico"><IcoCal /></div>
              <div>
                <div className="cfm-row-lbl">Date</div>
                <div className="cfm-row-val">{selDate.dow}, {selDate.mon} {selDate.day}</div>
              </div>
            </div>
            <div className="cfm-row cfm-row-border">
              <div className="cfm-row-ico"><IcoClk /></div>
              <div>
                <div className="cfm-row-lbl">Time</div>
                <div className="cfm-row-val">{selSlot.label}</div>
              </div>
            </div>
          </div>

          {/* Contact info — tap pencil to edit */}
          <div className="cfm-card">
            <div className="cfm-row">
              <div className="cfm-row-ico"><IcoPerson /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cfm-row-lbl">Name</div>
                <div className="cfm-row-val-sm">{answers.firstName} {answers.lastName}</div>
              </div>
              <button className="cfm-edit-btn" onClick={() => onEditField(0)} aria-label="Edit name"><IcoPencil /></button>
            </div>
            <div className="cfm-row cfm-row-border">
              <div className="cfm-row-ico"><IcoPhone /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cfm-row-lbl">Phone</div>
                <div className="cfm-row-val-sm">{answers.phone}</div>
              </div>
              <button className="cfm-edit-btn" onClick={() => onEditField(2)} aria-label="Edit phone"><IcoPencil /></button>
            </div>
            <div className="cfm-row cfm-row-border">
              <div className="cfm-row-ico"><IcoMail /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cfm-row-lbl">Email</div>
                <div className="cfm-row-val-sm">{answers.email}</div>
              </div>
              <button className="cfm-edit-btn" onClick={() => onEditField(3)} aria-label="Edit email"><IcoPencil /></button>
            </div>
          </div>

          <button className="cfm-btn" disabled={booking} onClick={onConfirm}>
            {booking ? <><span className="bspin" /> Booking…</> : 'Confirm Booking'}
          </button>
          <button className="cfm-change" onClick={onBack}>Change time</button>
        </div>
      </div>
    </>
  );
}

// ─── Booked phase ─────────────────────────────────────────────────────────────
function BookedPhase({ answers, selDate, selSlot }) {
  const firstName = answers.firstName ? answers.firstName.trim() : '';

  return (
    <>
      <Head><title>You're Confirmed!</title></Head>
      <div className="bkd-root">
        <div className="bkd-wrap">

          {/* Check circle */}
          <div className="bkd-circle">
            <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
              <path d="M10 20l8 8 12-16" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Headline */}
          {firstName && <div className="bkd-thanks">Thanks, {firstName}!</div>}
          <div className="bkd-h">You're confirmed.</div>

          {/* Email callout */}
          <div className="bkd-email-line">
            We sent a calendar invite to<br />
            <strong>{answers.email}</strong>
          </div>

          {/* Appointment details card */}
          <div className="bkd-card">
            <div className="bkd-card-row">
              <div className="bkd-card-ico"><IcoCal /></div>
              <div>
                <div className="bkd-card-lbl">Date</div>
                <div className="bkd-card-val">{selDate?.dow}, {selDate?.mon} {selDate?.day}</div>
              </div>
            </div>
            <div className="bkd-card-row bkd-row-sep">
              <div className="bkd-card-ico"><IcoClk /></div>
              <div>
                <div className="bkd-card-lbl">Time</div>
                <div className="bkd-card-val">{selSlot?.label} · {CFG.duration} min · {CFG.tz}</div>
              </div>
            </div>
            <div className="bkd-card-row bkd-row-sep">
              <div className="bkd-card-ico"><IcoVid /></div>
              <div>
                <div className="bkd-card-lbl">Format</div>
                <div className="bkd-card-val">Video call — link in your invite</div>
              </div>
            </div>
          </div>

          <div className="bkd-foot">We look forward to speaking with you!</div>
        </div>
      </div>
    </>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const ArrowRight = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M13 8H3M8 3L3 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ChevronUp = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M8 3L3 8l5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ChevronDown = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M8 13l5-5-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IcoCal = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const IcoClk = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const IcoVid = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);
const IcoPencil = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IcoPerson = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const IcoPhone = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.18 6.18l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const IcoMail = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);
