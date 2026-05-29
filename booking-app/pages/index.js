import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

// ─── Config ────────────────────────────────────────────────────────────────────
const CFG = {
  hostName:     process.env.NEXT_PUBLIC_HOST_NAME     || 'Steve Sparks',
  hostTitle:    process.env.NEXT_PUBLIC_HOST_TITLE    || 'Franchise Consultant',
  meetingTitle: process.env.NEXT_PUBLIC_MEETING_TITLE || '15-Minute Franchise Discovery Call',
  duration:     parseInt(process.env.NEXT_PUBLIC_MEETING_DURATION || '15'),
  tz:           process.env.NEXT_PUBLIC_TIMEZONE_DISPLAY || 'Central Time',
  daysAhead:    14,
};

// ─── Questions ────────────────────────────────────────────────────────────────
const QUESTIONS = [
  { q: ()    => "What's your first name?",                 ph: 'Type your answer…', key: 'firstName', type: 'text'  },
  { q: (ans) => `Hi ${ans.firstName}! Last name?`,         ph: 'Type your answer…', key: 'lastName',  type: 'text'  },
  { q: ()    => 'Best phone number?',                      ph: 'Type your answer…', key: 'phone',     type: 'tel'   },
  { q: ()    => 'Email address?',                          ph: 'Type your answer…', key: 'email',     type: 'email' },
];

const DOW_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isValidPhone(v) { return v.replace(/\D/g, '').length >= 7; }

function formatPhone(p) {
  const d = (p || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return p;
}

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
      dow: DOW_NAMES[d.getDay()],
      mon: MON_SHORT[d.getMonth()],
      day: d.getDate(),
    });
    count++;
  }
  return days;
}

// ─── Calendar helpers ─────────────────────────────────────────────────────────
function makeGcalUrl(selDate, selSlot) {
  const [yr, mo, dy] = selDate.dateStr.split('-').map(Number);
  const start = new Date(yr, mo - 1, dy, selSlot.h, selSlot.m);
  const end   = new Date(start.getTime() + CFG.duration * 60000);
  const fmt   = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const text  = encodeURIComponent(CFG.meetingTitle);
  const det   = encodeURIComponent(`Phone call with ${CFG.hostName}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${fmt(start)}/${fmt(end)}&details=${det}`;
}

function downloadIcs(selDate, selSlot, answers) {
  const [yr, mo, dy] = selDate.dateStr.split('-').map(Number);
  const start = new Date(yr, mo - 1, dy, selSlot.h, selSlot.m);
  const end   = new Date(start.getTime() + CFG.duration * 60000);
  const fmtLocal = d =>
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') +
    'T' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    '00';
  const uid = `${Date.now()}@sparksify`;
  const phone = answers.phone ? ` We will call you at ${answers.phone}.` : '';
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Steve Sparks//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${fmtLocal(start)}`,
    `DTEND:${fmtLocal(end)}`,
    `SUMMARY:${CFG.meetingTitle}`,
    `DESCRIPTION:Phone call with ${CFG.hostName}.${phone}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'franchise-discovery-call.ics';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BookingPage() {
  // phases: 'form' | 'picking' | 'booked'
  const [phase,   setPhase]   = useState('form');
  const [step,    setStep]    = useState(0);
  const [answers, setAnswers] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [days,    setDays]    = useState([]);
  const [slotMap, setSlotMap] = useState({});
  const [selDate, setSelDate] = useState(null);
  const [selSlot, setSelSlot] = useState(null);
  const [booking, setBooking] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setDays(generateWorkdays(CFG.daysAhead)); }, []);

  // Facebook URL params → skip form
  useEffect(() => {
    const p  = new URLSearchParams(window.location.search);
    const fn = p.get('first_name')   || p.get('firstName') || '';
    const ln = p.get('last_name')    || p.get('lastName')  || '';
    const em = p.get('email')        || '';
    const ph = p.get('phone_number') || p.get('phone')     || '';
    if (fn || em) {
      setAnswers({ firstName: fn, lastName: ln, phone: ph, email: em });
      setPhase('picking');
    }
  }, []);

  // Auto-focus form input
  useEffect(() => {
    if (phase !== 'form' || !inputRef.current) return;
    const el = inputRef.current;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { el.focus(); } catch (_) {}
    }));
  }, [phase, step]);

  // Keyboard Enter for form
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Enter' || phase !== 'form') return;
      e.preventDefault();
      if (canAdvance(step, answers)) doAdvance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Pre-fetch all slot availability when entering picking phase
  useEffect(() => {
    if (phase !== 'picking' || days.length === 0) return;
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

  function doAdvance() {
    if (step + 1 >= QUESTIONS.length) setPhase('picking');
    else setStep(s => s + 1);
  }
  function doRetreat() { if (step > 0) setStep(s => s - 1); }

  function pickDate(day) { setSelDate(day); setSelSlot(null); }
  function pickSlot(sl)  { setSelSlot(sl); }

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
    } catch (_) {}
    setBooking(false);
    setPhase('booked');
  }

  if (phase === 'form')
    return <FormPhase {...{ step, answers, setAnswers, doAdvance, doRetreat, inputRef }} />;
  if (phase === 'picking')
    return <PickingPhase days={days} slotMap={slotMap} selDate={selDate} selSlot={selSlot}
             onPickDate={pickDate} onPickSlot={pickSlot} onConfirm={confirmBooking} booking={booking} />;
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

// ─── Picking phase (date strip + inline slots) ────────────────────────────────
function PickingPhase({ days, slotMap, selDate, selSlot, onPickDate, onPickSlot, onConfirm, booking }) {
  const info    = selDate ? (slotMap[selDate.dateStr] || { slots: [], loading: true, loaded: false }) : null;
  const slots   = info?.slots   || [];
  const loading = info?.loading ?? false;

  const initials = CFG.hostName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <>
      <Head><title>Schedule a Call — {CFG.hostName}</title></Head>
      <div className="pk-root">

        {/* Header */}
        <div className="pk-profile-wrap">
          <div className="pk-headline">Choose a Time That Works Best for You</div>
          <div className="pk-meeting-title">{CFG.meetingTitle}</div>
          <div className="pk-desc">Quick conversation. No pressure. We'll answer your questions and help you see if this is a fit.</div>
          <div className="pk-meta-row">
            <span className="pk-meta-item"><IcoClk size={14} /> {CFG.duration} min</span>
            <span className="pk-meta-item"><IcoPhone size={14} /> Phone call</span>
            <span className="pk-meta-item"><IcoGlobe size={14} /> {CFG.tz}</span>
          </div>
        </div>

        {/* Date strip */}
        <div className="pk-strip-label">SELECT A DATE</div>
        <div className="pk-date-wrap">
          <div className="pk-date-strip">
            {days.map(d => {
              const info    = slotMap[d.dateStr];
              const noSlots = info?.loaded && info.slots.length === 0;
              if (noSlots) return null;
              const isOn = selDate?.dateStr === d.dateStr;
              return (
                <button key={d.dateStr} className={`pk-dc${isOn ? ' on' : ''}`} onClick={() => onPickDate(d)}>
                  <span className="pk-dc-dow">{d.dow}</span>
                  <span className="pk-dc-num">{d.day}</span>
                  <span className="pk-dc-mon">{d.mon}</span>
                  <span className="pk-dc-dot" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Slots area */}
        <div className="pk-slots-outer">
          {!selDate ? (
            <div className="pk-empty">
              <div className="pk-empty-ico">👆</div>
              <div className="pk-empty-h">Pick a date above</div>
              <div className="pk-empty-s">Available times will appear here</div>
            </div>
          ) : loading ? (
            <>
              <div className="pk-slots-hdr">
                <span className="pk-slots-date">{selDate.dow}, {selDate.mon} {selDate.day}</span>
              </div>
              <div className="pk-slots-grid">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="skel pk-skel" style={{ animationDelay: `${i * 40}ms` }} />
                ))}
              </div>
            </>
          ) : slots.length === 0 ? (
            <div className="pk-empty">
              <div className="pk-empty-ico">😔</div>
              <div className="pk-empty-h">Fully booked</div>
              <div className="pk-empty-s">Try a different date</div>
            </div>
          ) : (
            <>
              <div className="pk-slots-hdr">
                <span className="pk-slots-date">{selDate.dow}, {selDate.mon} {selDate.day}</span>
                <span className="pk-slots-badge">{slots.length} open</span>
              </div>
              <div className="pk-slots-grid">
                {slots.map(sl => {
                  const isOn = selSlot?.h === sl.h && selSlot?.m === sl.m;
                  return (
                    <button
                      key={`${sl.h}-${sl.m}`}
                      className={`pk-slot${isOn ? ' on' : ''}`}
                      onClick={() => onPickSlot(sl)}
                    >
                      {sl.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Bottom bar — appears when a slot is selected */}
        {selSlot && selDate && (
          <div className="pk-cbar">
            <div className="pk-cbar-info">
              {selDate.dow}, {selDate.mon} {selDate.day} · {selSlot.label} · {CFG.duration} min
            </div>
            <button className="pk-cbar-btn" onClick={onConfirm} disabled={booking}>
              {booking ? <><span className="bspin" /> Confirming…</> : 'Reserve My Spot'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Booked phase ─────────────────────────────────────────────────────────────
function BookedPhase({ answers, selDate, selSlot }) {
  const gcalUrl = selDate && selSlot ? makeGcalUrl(selDate, selSlot) : '#';

  return (
    <>
      <Head><title>You're Confirmed!</title></Head>
      <div className="bkd-root">
        <div className="bkd-wrap">

          {/* Green check */}
          <div className="bkd-circle">
            <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
              <path d="M10 20l8 8 12-16" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="bkd-thanks">Thanks, {answers.firstName}!</div>
          <div className="bkd-h">Your Call Is Confirmed</div>

          <div className="bkd-email-line">
            We've sent a calendar invitation to<br />
            <strong>{answers.email}</strong>
          </div>

          {/* Appointment card */}
          <div className="bkd-card">
            <div className="bkd-card-row">
              <div className="bkd-card-ico"><IcoCal /></div>
              <div className="bkd-card-val">{selDate?.dow}, {selDate?.mon} {selDate?.day}</div>
            </div>
            <div className="bkd-card-row bkd-row-sep">
              <div className="bkd-card-ico"><IcoClk /></div>
              <div className="bkd-card-val">{selSlot?.label} · {CFG.duration} min · {CFG.tz}</div>
            </div>
            <div className="bkd-card-row bkd-row-sep">
              <div className="bkd-card-ico"><IcoPhone /></div>
              <div>
                <div className="bkd-card-val">Phone Call</div>
                <div className="bkd-card-sub">We'll call you at {formatPhone(answers.phone)}</div>
              </div>
            </div>
          </div>

          <div className="bkd-foot">We look forward to speaking with you!</div>

          {/* Add to calendar */}
          <div className="bkd-cal-label">ADD TO YOUR CALENDAR</div>
          <div className="bkd-cal-list">
            <a className="bkd-cal-row" href={gcalUrl} target="_blank" rel="noreferrer">
              <div className="bkd-cal-ico"><IcoCalGoogle /></div>
              <div style={{ flex: 1 }}>
                <div className="bkd-cal-name">Google Calendar</div>
                <div className="bkd-cal-desc">Opens in Google Calendar</div>
              </div>
              <ChevronRight />
            </a>
            <button className="bkd-cal-row" onClick={() => downloadIcs(selDate, selSlot, answers)}>
              <div className="bkd-cal-ico"><IcoCalApple /></div>
              <div style={{ flex: 1 }}>
                <div className="bkd-cal-name">Apple Calendar</div>
                <div className="bkd-cal-desc">Downloads .ics file</div>
              </div>
              <ChevronRight />
            </button>
            <button className="bkd-cal-row" onClick={() => downloadIcs(selDate, selSlot, answers)}>
              <div className="bkd-cal-ico"><IcoCalOutlook /></div>
              <div style={{ flex: 1 }}>
                <div className="bkd-cal-name">Outlook</div>
                <div className="bkd-cal-desc">Downloads .ics file</div>
              </div>
              <ChevronRight />
            </button>
          </div>

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
const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
const IcoPhone = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.18 6.18l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const IcoGlobe = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);
const IcoCalGoogle = () => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <rect width="36" height="36" rx="8" fill="#fff" stroke="#E4E6EB" strokeWidth="1"/>
    <rect x="4" y="4" width="28" height="28" rx="4" fill="#4285F4"/>
    <rect x="4" y="4" width="28" height="10" rx="4" fill="#1A73E8"/>
    <rect x="4" y="10" width="28" height="4" fill="#1A73E8"/>
    <text x="18" y="27" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="Arial,sans-serif">G</text>
  </svg>
);
const IcoCalApple = () => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <rect width="36" height="36" rx="8" fill="#fff" stroke="#E4E6EB" strokeWidth="1"/>
    <rect x="4" y="4" width="28" height="28" rx="4" fill="#FF3B30"/>
    <rect x="4" y="4" width="28" height="9" rx="4" fill="#CC2018"/>
    <rect x="4" y="9" width="28" height="4" fill="#CC2018"/>
    <text x="18" y="27" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="Arial,sans-serif">A</text>
  </svg>
);
const IcoCalOutlook = () => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <rect width="36" height="36" rx="8" fill="#fff" stroke="#E4E6EB" strokeWidth="1"/>
    <rect x="4" y="4" width="28" height="28" rx="4" fill="#0078D4"/>
    <text x="18" y="27" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="Arial,sans-serif">O</text>
  </svg>
);
