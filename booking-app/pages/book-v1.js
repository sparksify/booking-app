import { useState, useEffect, useRef, useMemo } from 'react';
import Head from 'next/head';

// ─── Config (from env vars, set in Vercel dashboard) ─────────────────────────
const CFG = {
  hostName:     process.env.NEXT_PUBLIC_HOST_NAME     || 'Steve Sparks',
  hostRole:     process.env.NEXT_PUBLIC_HOST_ROLE     || 'Franchise Consultant',
  meetingTitle: process.env.NEXT_PUBLIC_MEETING_TITLE || 'Franchise Discovery Call',
  duration:     parseInt(process.env.NEXT_PUBLIC_MEETING_DURATION || '30'),
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
  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days = [];
  const now  = new Date();
  let count  = 0;
  for (let i = 1; count < daysAhead; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    days.push({
      dateStr: d.toISOString().split('T')[0],
      dow:     DOW[d.getDay()],
      mon:     MON[d.getMonth()],
      day:     d.getDate(),
    });
    count++;
  }
  return days;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BookingPage() {
  const [phase,    setPhase]    = useState('form');        // 'form' | 'calendar' | 'booked'
  const [step,     setStep]     = useState(0);
  const [answers,  setAnswers]  = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [selDate,  setSelDate]  = useState(null);          // { dateStr, dow, mon, day }
  const [selSlot,  setSelSlot]  = useState(null);          // { h, m, label }
  const [slotMap,  setSlotMap]  = useState({});            // dateStr → { slots, loading, loaded }
  const [booking,  setBooking]  = useState(false);
  const [days,     setDays]     = useState([]);

  const inputRef = useRef(null);

  // Generate workdays client-side (avoids SSR hydration mismatch)
  useEffect(() => {
    setDays(generateWorkdays(CFG.daysAhead));
  }, []);

  // Check for Facebook URL params (pre-fills form and jumps to calendar)
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

  // Fetch slots when a date is selected
  useEffect(() => {
    if (!selDate) return;
    const ds = selDate.dateStr;
    if (slotMap[ds]?.loaded) return;

    setSlotMap(prev => ({ ...prev, [ds]: { slots: [], loading: true, loaded: false } }));

    fetch(`/api/availability?date=${ds}`)
      .then(r => r.json())
      .then(data => setSlotMap(prev => ({
        ...prev,
        [ds]: { slots: data.slots || [], loading: false, loaded: true },
      })))
      .catch(() => setSlotMap(prev => ({
        ...prev,
        [ds]: { slots: [], loading: false, loaded: true },
      })));
  }, [selDate]);

  // ── Actions ────────────────────────────────────────────────────────────────

  function doAdvance() {
    const nextStep = step + 1;
    if (nextStep >= QUESTIONS.length) {
      setPhase('calendar');
    } else {
      setStep(nextStep);
    }
  }

  function doRetreat() {
    if (step > 0) setStep(s => s - 1);
  }

  function selectDate(day) {
    setSelDate(day);
    setSelSlot(null);
  }

  function toggleSlot(sl) {
    setSelSlot(prev => prev?.h === sl.h && prev?.m === sl.m ? null : sl);
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
    } catch (_) { /* continue to booked screen even on network error */ }
    setBooking(false);
    setPhase('booked');
  }

  // ── Renders ────────────────────────────────────────────────────────────────

  if (phase === 'form')     return <FormPhase     {...{ step, answers, setAnswers, doAdvance, doRetreat, inputRef }} />;
  if (phase === 'calendar') return <CalendarPhase {...{ days, selDate, selSlot, slotMap, booking, selectDate, toggleSlot, confirmBooking }} />;
  return <BookedPhase answers={answers} selDate={selDate} selSlot={selSlot} />;
}

// ─── Form phase ───────────────────────────────────────────────────────────────
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

        {/* key forces remount → re-triggers in-down animation on each step */}
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
            <div style={{ fontSize: 12, color: '#EF4444', marginTop: 8 }}>
              Please enter at least 7 digits
            </div>
          )}

          <div className="tf-actions">
            <button className="tf-ok" disabled={!can} onClick={doAdvance}>
              OK
              <ArrowRight />
            </button>
            <span className="tf-hint">press <b>Enter ↵</b></span>
          </div>
        </div>

        <div className="tf-nav">
          <button className="tf-nav-btn" disabled={step === 0} onClick={doRetreat}>
            <ChevronUp />
          </button>
          <button className="tf-nav-btn" disabled={!can} onClick={doAdvance}>
            <ChevronDown />
          </button>
        </div>

        <div className="tf-counter"><b>{step + 1}</b> / {total}</div>
      </div>
    </>
  );
}

// ─── Calendar phase ───────────────────────────────────────────────────────────
function CalendarPhase({ days, selDate, selSlot, slotMap, booking, selectDate, toggleSlot, confirmBooking }) {
  const entry    = selDate ? slotMap[selDate.dateStr] : null;
  const loading  = entry?.loading ?? false;
  const slots    = entry?.slots   ?? [];
  const loaded   = entry?.loaded  ?? false;

  return (
    <>
      <Head><title>Schedule a Call</title></Head>
      <div className="cal-root">

        {/* Date strip */}
        <div className="date-wrap">
          <div className="date-strip">
            {days.map(d => {
              const on   = selDate?.dateStr === d.dateStr;
              const info = slotMap[d.dateStr];
              const hasDot = info?.loaded && info.slots.length > 0;
              return (
                <button
                  key={d.dateStr}
                  className={`dc${on ? ' on' : ''}`}
                  onClick={() => selectDate(d)}
                >
                  <span className="dc-dow">{d.dow}</span>
                  <span className="dc-num">{d.day}</span>
                  <span className="dc-mon">{d.mon}</span>
                  {hasDot && <span className="dc-dot" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Slot area */}
        <div className="slots-outer">
          {!selDate ? (
            <div className="slots-empty">
              <div className="slots-empty-ico">👆</div>
              <div className="slots-empty-h">Pick a date</div>
            </div>
          ) : loading ? (
            <div className="slots-grid">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="skel" style={{ animationDelay: `${i * 25}ms` }} />
              ))}
            </div>
          ) : !slots.length ? (
            <div className="slots-empty">
              <div className="slots-empty-ico">😔</div>
              <div className="slots-empty-h">No times available</div>
              <div className="slots-empty-s">Try a different date</div>
            </div>
          ) : (
            <>
              <div className="slots-hdr">
                {selDate.dow}, {selDate.mon} {selDate.day}
                <span className="slots-badge">{slots.length} open</span>
              </div>
              <div className="slots-grid">
                {slots.map(sl => {
                  const on = selSlot?.h === sl.h && selSlot?.m === sl.m;
                  return (
                    <button
                      key={`${sl.h}-${sl.m}`}
                      className={`slot${on ? ' on' : ''}`}
                      onClick={() => toggleSlot(sl)}
                    >
                      {sl.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Confirm bar */}
        {selSlot && selDate && (
          <div className="cbar">
            <div>
              <div className="cbar-text">
                {selDate.dow}, {selDate.mon} {selDate.day} · {selSlot.label}
              </div>
              <div className="cbar-sub">{CFG.duration} min · {CFG.tz}</div>
            </div>
            <button className="cbar-btn" disabled={booking} onClick={confirmBooking}>
              {booking ? <><span className="bspin" /> Booking…</> : 'Confirm →'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Booked phase ─────────────────────────────────────────────────────────────
function BookedPhase({ answers, selDate, selSlot }) {
  return (
    <>
      <Head><title>You're Confirmed!</title></Head>
      <div className="booked-root">
        <div className="booked-wrap">
          <div className="booked-check">
            <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
              <path d="M10 20l8 8 12-16" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="booked-h">You're confirmed!</div>
          <div className="booked-s">
            Calendar invite sent to <b>{answers.email}</b>
          </div>
          <div className="booked-card">
            <div className="booked-row">📅 {selDate?.dow}, {selDate?.mon} {selDate?.day}</div>
            <div className="booked-row">🕐 {selSlot?.label} · {CFG.duration} min · {CFG.tz}</div>
            <div className="booked-row">📹 Video call — link in your invite</div>
          </div>
          <div className="booked-foot">We look forward to speaking with you!</div>
        </div>
      </div>
    </>
  );
}

// ─── Icon components ──────────────────────────────────────────────────────────
const ArrowRight = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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
