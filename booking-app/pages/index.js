import { useState, useEffect, useRef, forwardRef } from 'react';
import Head from 'next/head';

// ─── Config ────────────────────────────────────────────────────────────────────
const CFG = {
  hostName:     process.env.NEXT_PUBLIC_HOST_NAME     || 'Steve Sparks',
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
  const [phase,   setPhase]   = useState('form');
  const [step,    setStep]    = useState(0);
  const [answers, setAnswers] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  // selSlot now carries date info: { h, m, label, dateStr, dow, mon, day }
  const [selSlot, setSelSlot] = useState(null);
  const [slotMap, setSlotMap] = useState({});   // dateStr → { slots, loading, loaded }
  const [booking, setBooking] = useState(false);
  const [days,    setDays]    = useState([]);

  const inputRef = useRef(null);

  // Generate workdays client-side (avoids SSR hydration mismatch)
  useEffect(() => { setDays(generateWorkdays(CFG.daysAhead)); }, []);

  // Facebook URL params → skip form, jump to calendar
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

  // Pre-fetch ALL 14 days simultaneously when entering calendar phase
  useEffect(() => {
    if (phase !== 'calendar' || days.length === 0) return;

    // Mark all days as loading
    setSlotMap(prev => {
      const next = { ...prev };
      days.forEach(d => {
        if (!next[d.dateStr]) {
          next[d.dateStr] = { slots: [], loading: true, loaded: false };
        }
      });
      return next;
    });

    // Fire every fetch in parallel — each resolves independently
    days.forEach(({ dateStr }) => {
      fetch(`/api/availability?date=${dateStr}`)
        .then(r => r.json())
        .then(data => setSlotMap(prev => ({
          ...prev,
          [dateStr]: { slots: data.slots || [], loading: false, loaded: true },
        })))
        .catch(() => setSlotMap(prev => ({
          ...prev,
          [dateStr]: { slots: [], loading: false, loaded: true },
        })));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, days]);

  // ── Actions ────────────────────────────────────────────────────────────────

  function doAdvance() {
    if (step + 1 >= QUESTIONS.length) setPhase('calendar');
    else setStep(s => s + 1);
  }

  function doRetreat() {
    if (step > 0) setStep(s => s - 1);
  }

  async function confirmBooking() {
    if (!selSlot || booking) return;
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
          date:      selSlot.dateStr,
          h:         selSlot.h,
          m:         selSlot.m,
          label:     selSlot.label,
        }),
      });
    } catch (_) { /* continue to booked screen even on network error */ }
    setBooking(false);
    setPhase('booked');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'form')     return <FormPhase {...{ step, answers, setAnswers, doAdvance, doRetreat, inputRef }} />;
  if (phase === 'calendar') return <RiverPhase {...{ days, selSlot, setSelSlot, slotMap, booking, confirmBooking }} />;
  return <BookedPhase answers={answers} selSlot={selSlot} />;
}

// ─── Form phase (unchanged from v1) ──────────────────────────────────────────
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
            <div style={{ fontSize: 12, color: '#EF4444', marginTop: 8 }}>
              Please enter at least 7 digits
            </div>
          )}

          <div className="tf-actions">
            <button className="tf-ok" disabled={!can} onClick={doAdvance}>
              OK <ArrowRight />
            </button>
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

// ─── River phase ──────────────────────────────────────────────────────────────
function RiverPhase({ days, selSlot, setSelSlot, slotMap, booking, confirmBooking }) {
  const [activeDateStr, setActiveDateStr] = useState(days[0]?.dateStr || null);

  const bodyRef  = useRef(null);
  const dayRefs  = useRef({});   // dateStr → DOM element
  const pillRefs = useRef({});   // dateStr → DOM element

  const loadedCount = Object.values(slotMap).filter(v => v.loaded).length;
  const allLoaded   = loadedCount >= days.length;

  // IntersectionObserver: highlight the pill of the day currently in view
  useEffect(() => {
    if (!bodyRef.current || days.length === 0) return;

    const observers = [];

    days.forEach(({ dateStr }) => {
      const el = dayRefs.current[dateStr];
      if (!el) return;

      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveDateStr(dateStr);
            // Scroll pill into view in the jump strip
            const pill = pillRefs.current[dateStr];
            if (pill) pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          }
        },
        {
          root: bodyRef.current,
          threshold: 0,
          rootMargin: '-5% 0px -70% 0px',  // trigger when header enters top ~25% of body
        }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach(o => o.disconnect());
  }, [days]);

  function scrollToDay(dateStr) {
    const el = dayRefs.current[dateStr];
    if (el && bodyRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function handleSlotClick(day, sl) {
    const alreadySelected =
      selSlot?.dateStr === day.dateStr &&
      selSlot?.h === sl.h &&
      selSlot?.m === sl.m;
    if (alreadySelected) {
      setSelSlot(null);
    } else {
      setSelSlot({ ...sl, dateStr: day.dateStr, dow: day.dow, mon: day.mon, day: day.day });
    }
  }

  return (
    <>
      <Head><title>Schedule a Call</title></Head>
      <div className="rv-root">

        {/* ── Info bar ─────────────────────────────────────────────── */}
        <div className="rv-infobar">
          <div className="rv-infobar-left">
            <span className="rv-infobar-title">{CFG.meetingTitle}</span>
            <span className="rv-infobar-meta">{CFG.duration} min · {CFG.tz}</span>
          </div>
          {!allLoaded && (
            <div className="rv-loading-pill">
              <span className="rv-loading-dot" />
              {loadedCount} / {days.length}
            </div>
          )}
          {allLoaded && (
            <div className="rv-ready-pill">
              <span className="rv-ready-check">✓</span> Ready
            </div>
          )}
        </div>

        {/* ── Jump strip ───────────────────────────────────────────── */}
        <div className="rv-jump">
          {days.map(d => {
            const info     = slotMap[d.dateStr];
            const hasSlots = info?.loaded && info.slots.length > 0;
            const isActive = d.dateStr === activeDateStr;
            return (
              <button
                key={d.dateStr}
                ref={el => { pillRefs.current[d.dateStr] = el; }}
                className={`rv-pill${isActive ? ' act' : ''}${hasSlots ? ' has' : ''}`}
                onClick={() => scrollToDay(d.dateStr)}
              >
                <span className="rv-pill-dow">{d.dow[0]}</span>
                <span className="rv-pill-day">{d.day}</span>
                {hasSlots && <span className="rv-pill-dot" />}
              </button>
            );
          })}
        </div>

        {/* ── River body ───────────────────────────────────────────── */}
        <div className="rv-body" ref={bodyRef}>
          {days.map(d => (
            <DaySection
              key={d.dateStr}
              day={d}
              info={slotMap[d.dateStr] || { slots: [], loading: true, loaded: false }}
              selSlot={selSlot}
              onSlotClick={(sl) => handleSlotClick(d, sl)}
              ref={el => { dayRefs.current[d.dateStr] = el; }}
            />
          ))}
          {/* Bottom spacer so last day scrolls up past the confirm bar */}
          <div style={{ height: selSlot ? 100 : 40 }} />
        </div>

        {/* ── Confirm bar ──────────────────────────────────────────── */}
        {selSlot && (
          <div className="cbar">
            <div>
              <div className="cbar-text">
                {selSlot.dow}, {selSlot.mon} {selSlot.day} · {selSlot.label}
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

// ─── Day section ──────────────────────────────────────────────────────────────
const DaySection = forwardRef(function DaySection({ day, info, selSlot, onSlotClick }, ref) {
  const { slots, loading, loaded } = info;
  const hasSlots    = loaded && slots.length > 0;
  const fullyBooked = loaded && slots.length === 0;

  return (
    <div className="rv-day" ref={ref}>

      {/* Sticky header */}
      <div className="rv-day-hdr">
        <span className="rv-day-hdr-name">{day.dow}, {day.mon} {day.day}</span>
        {loading    && <span className="rv-day-badge loading">Loading…</span>}
        {hasSlots   && <span className="rv-day-badge open">{slots.length} open</span>}
        {fullyBooked && <span className="rv-day-badge full">Fully booked</span>}
      </div>

      {/* Slots or skeleton or empty */}
      {loading ? (
        <div className="rv-day-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skel rv-skel" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      ) : fullyBooked ? (
        <div className="rv-day-empty">No availability — try another day</div>
      ) : (
        <div className="rv-day-grid">
          {slots.map(sl => {
            const on =
              selSlot?.dateStr === day.dateStr &&
              selSlot?.h === sl.h &&
              selSlot?.m === sl.m;
            return (
              <button
                key={`${sl.h}-${sl.m}`}
                className={`slot${on ? ' on' : ''}`}
                onClick={() => onSlotClick(sl)}
              >
                {sl.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

// ─── Booked phase ─────────────────────────────────────────────────────────────
function BookedPhase({ answers, selSlot }) {
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
            <div className="booked-row">📅 {selSlot?.dow}, {selSlot?.mon} {selSlot?.day}</div>
            <div className="booked-row">🕐 {selSlot?.label} · {CFG.duration} min · {CFG.tz}</div>
            <div className="booked-row">📹 Video call — link in your invite</div>
          </div>
          <div className="booked-foot">We look forward to speaking with you!</div>
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
