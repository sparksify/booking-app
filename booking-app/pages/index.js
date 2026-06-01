import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { initPixel, pixelTrack, pixelEvent } from '@/lib/fbPixel';

// ─── Event tracking ───────────────────────────────────────────────────────────

function getSessionId() {
  if (typeof window === 'undefined') return null;
  let sid = sessionStorage.getItem('bk_sid');
  if (!sid) {
    sid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
    sessionStorage.setItem('bk_sid', sid);
  }
  return sid;
}

function track(eventType, leadId, props = {}) {
  const session_id = getSessionId();
  if (!session_id) return;
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: eventType, session_id, lead_id: leadId || null, props }),
  }).catch(() => {});
}

function trackWithBooking(eventType, leadId, bookingId, props = {}) {
  const session_id = getSessionId();
  if (!session_id) return;
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: eventType, session_id, lead_id: leadId || null, booking_id: bookingId || null, props }),
  }).catch(() => {});
}

// Lead attribution tracking — requires a known email
function trackLead(email, eventType, eventData = {}, leadToken = null) {
  if (!email) return;
  fetch('/api/lead-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, event_type: eventType, event_data: eventData, lead_id: leadToken }),
  }).catch(() => {});
}

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
  for (let i = 0; count < daysAhead; i++) {
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

// ─── Guided booking helpers ───────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

function getDayLabel(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr + 'T00:00:00'); // midnight → avoids 0.5-day rounding trap
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${DOW_NAMES[d.getDay()]}, ${MON_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function hoursLabel(h) {
  if (h < 24) return `In about ${Math.round(h)} hours`;
  const days = Math.floor(h / 24);
  return `In ${days} day${days > 1 ? 's' : ''}`;
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
  const [phase,          setPhase]          = useState('form');
  const [step,           setStep]           = useState(0);
  const [answers,        setAnswers]        = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [investmentLevel, setInvestmentLevel] = useState('');
  const [days,           setDays]           = useState([]);
  const [slotMap,        setSlotMap]        = useState({});
  const [selDate,        setSelDate]        = useState(null);
  const [selSlot,        setSelSlot]        = useState(null);
  const [booking,        setBooking]        = useState(false);
  const [calExpanded,    setCalExpanded]    = useState(false);
  const [recommended,    setRecommended]    = useState(null);
  const [alternatives,   setAlternatives]   = useState([]);
  const [leadId,         setLeadId]         = useState(null);
  const [leadToken,      setLeadToken]      = useState(null);
  const [bookingSource,  setBookingSource]  = useState('direct');
  const inputRef = useRef(null);

  useEffect(() => { setDays(generateWorkdays(CFG.daysAhead)); }, []);

  // Init FB Pixel and fire page_view on mount
  useEffect(() => {
    initPixel();
    track('page_view', null, { path: window.location.pathname });
  }, []);

  // Token or URL params → pre-fill lead data and skip the form
  useEffect(() => {
    const p      = new URLSearchParams(window.location.search);
    const token  = p.get('t');
    const source = p.get('source') || 'direct';
    setBookingSource(source);

    if (token) {
      setLeadToken(token);
      // New architecture: fetch lead from database via token
      fetch(`/api/lead?t=${encodeURIComponent(token)}`)
        .then(r => r.ok ? r.json() : null)
        .then(lead => {
          if (!lead) return;
          if (lead.id) setLeadId(lead.id);
          if (lead.investment_level) setInvestmentLevel(lead.investment_level);
          const newAnswers = {
            firstName: lead.first_name  || '',
            lastName:  lead.last_name   || '',
            phone:     lead.phone       || '',
            email:     lead.email       || '',
          };
          setAnswers(newAnswers);
          pixelTrack('Lead', { content_name: 'Booking Page', content_category: 'Franchise' });
          // Log booking_page_viewed to lead timeline
          if (lead.email) {
            trackLead(lead.email, 'booking_page_viewed', { source }, token);
          }
          setPhase('picking');
        })
        .catch(() => {});
      return;
    }

    // Fallback: direct URL params (backward compat / manual testing)
    const fn  = p.get('first_name')       || p.get('firstName') || '';
    const ln  = p.get('last_name')        || p.get('lastName')  || '';
    const em  = p.get('email')            || '';
    const ph  = p.get('phone_number')     || p.get('phone')     || '';
    const inv = p.get('investment_level') || p.get('investment')|| p.get('budget') || '';
    if (inv) setInvestmentLevel(inv);
    if (fn || em) {
      setAnswers({ firstName: fn, lastName: ln, phone: ph, email: em });
      if (em) trackLead(em, 'booking_page_viewed', { source });
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
    // Reset guided state on entry
    setCalExpanded(false);
    setRecommended(null);
    setAlternatives([]);
    setSelDate(null);
    setSelSlot(null);
    setSlotMap(prev => {
      const next = { ...prev };
      days.forEach(d => {
        if (!next[d.dateStr]) next[d.dateStr] = { slots: [], loading: true, loaded: false };
      });
      return next;
    });
    days.forEach(({ dateStr }) => {
      const inv = investmentLevel ? `&investment_level=${encodeURIComponent(investmentLevel)}` : '';
      fetch(`/api/availability?date=${dateStr}${inv}`)
        .then(r => r.json())
        .then(data => setSlotMap(prev => ({ ...prev, [dateStr]: { slots: data.slots || [], loading: false, loaded: true } })))
        .catch(() => setSlotMap(prev => ({ ...prev, [dateStr]: { slots: [], loading: false, loaded: true } })));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, days]);

  // Smart slot selection — runs as slotMap fills in
  useEffect(() => {
    if (phase !== 'picking') return;
    const now = new Date();
    const candidates = [];
    const WINDOW_HRS = 7 * 24; // score window: 7 days

    for (const day of days.slice(0, 7)) {
      const info = slotMap[day.dateStr];
      if (!info?.loaded) continue;
      for (const slot of info.slots) {
        const slotDate  = new Date(`${day.dateStr}T${pad(slot.h)}:${pad(slot.m)}:00`);
        const hoursAway = (slotDate - now) / 3600000;
        if (hoursAway < 1.5) continue; // skip slots < 90 min from now
        // Score: 9-12 best (3), 12-15 good (2), else (1); sooner = bonus
        const timeScore = slot.h >= 9 && slot.h < 12 ? 3 : slot.h >= 12 && slot.h < 15 ? 2 : 1;
        const nearScore = Math.max(0, WINDOW_HRS - hoursAway) / WINDOW_HRS;
        candidates.push({
          ...slot,
          dateStr: day.dateStr,
          dow: day.dow,
          mon: day.mon,
          dayNum: day.day,
          hoursAway,
          score: timeScore + nearScore,
          dayLabel: getDayLabel(day.dateStr),
        });
      }
    }

    if (!candidates.length) return;
    // Pick the best slot per distinct day so alternatives span different days
    const byDay = {};
    for (const c of candidates) {
      if (!byDay[c.dateStr] || c.score > byDay[c.dateStr].score) byDay[c.dateStr] = c;
    }
    const dayBests = Object.values(byDay).sort((a, b) => b.score - a.score);
    const top = dayBests[0];
    setRecommended(top);
    setAlternatives(dayBests.slice(1, 5));
    // Track that the recommended slot was shown
    if (top) {
      track('recommended_shown', leadId, { dateStr: top.dateStr, h: top.h, m: top.m, label: top.label });
      if (answers.email) trackLead(answers.email, 'recommended_slot_shown', { slot: `${top.dateStr}T${pad(top.h)}:${pad(top.m)}` }, leadToken);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotMap, phase]);

  function doAdvance() {
    if (step + 1 >= QUESTIONS.length) setPhase('picking');
    else setStep(s => s + 1);
  }
  function doRetreat() { if (step > 0) setStep(s => s - 1); }

  function pickDate(day) { setSelDate(day); setSelSlot(null); }
  function pickSlot(sl)  { setSelSlot(sl); }

  // Select a slot from the guided view (slot has dateStr + slot fields)
  function pickGuidedSlot(slot) {
    const day = days.find(d => d.dateStr === slot.dateStr);
    if (day) { setSelDate(day); setSelSlot({ h: slot.h, m: slot.m, label: slot.label }); }
  }

  async function confirmBooking() {
    if (!selDate || !selSlot || booking) return;
    setBooking(true);
    try {
      const res = await fetch('/api/book', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName:        answers.firstName,
          lastName:         answers.lastName,
          email:            answers.email,
          phone:            answers.phone,
          date:             selDate.dateStr,
          h:                selSlot.h,
          m:                selSlot.m,
          label:            selSlot.label,
          investment_level: investmentLevel || undefined,
          lead_id:          leadId || undefined,
          source:           bookingSource || 'direct',
        }),
      });
      const data = res.ok ? await res.json() : {};
      trackWithBooking('booking_completed', leadId, data.bookingId || null, {
        dateStr: selDate.dateStr, h: selSlot.h, m: selSlot.m, source: 'calendar',
      });
      pixelTrack('Schedule', { content_name: 'Appointment Booked', content_category: 'Franchise' });
    } catch (_) {}
    setBooking(false);
    setPhase('booked');
  }

  // Book the recommended slot directly (no footer step)
  async function reserveRecommended() {
    if (!recommended || booking) return;
    const day = days.find(d => d.dateStr === recommended.dateStr);
    if (!day) return;
    setSelDate(day);
    setSelSlot({ h: recommended.h, m: recommended.m, label: recommended.label });
    setBooking(true);
    track('recommended_accepted', leadId, { dateStr: recommended.dateStr, h: recommended.h, m: recommended.m });
    if (answers.email) trackLead(answers.email, 'recommended_slot_accepted', { slot: `${recommended.dateStr}T${pad(recommended.h)}:${pad(recommended.m)}` }, leadToken);
    try {
      const res = await fetch('/api/book', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName:        answers.firstName,
          lastName:         answers.lastName,
          email:            answers.email,
          phone:            answers.phone,
          date:             recommended.dateStr,
          h:                recommended.h,
          m:                recommended.m,
          label:            recommended.label,
          investment_level: investmentLevel || undefined,
          lead_id:          leadId || undefined,
          source:           bookingSource || 'direct',
        }),
      });
      const data = res.ok ? await res.json() : {};
      trackWithBooking('booking_completed', leadId, data.bookingId || null, {
        dateStr: recommended.dateStr, h: recommended.h, m: recommended.m, source: 'recommended',
      });
      pixelTrack('Schedule', { content_name: 'Appointment Booked', content_category: 'Franchise' });
    } catch (_) {}
    setBooking(false);
    setPhase('booked');
  }

  if (phase === 'form')
    return <FormPhase {...{ step, answers, setAnswers, doAdvance, doRetreat, inputRef }} />;
  if (phase === 'picking')
    return <PickingPhase
      days={days} slotMap={slotMap} selDate={selDate} selSlot={selSlot}
      onPickDate={pickDate} onPickSlot={pickSlot} onConfirm={confirmBooking} booking={booking}
      calExpanded={calExpanded} onToggleCal={() => {
        const opening = !calExpanded;
        setCalExpanded(opening);
        if (opening) {
          track('calendar_opened', leadId);
          if (recommended) {
            track('recommended_rejected', leadId, { dateStr: recommended.dateStr, h: recommended.h, m: recommended.m });
            if (answers.email) trackLead(answers.email, 'recommended_slot_rejected', { slot: `${recommended.dateStr}T${pad(recommended.h)}:${pad(recommended.m)}` }, leadToken);
          }
        }
      }}
      recommended={recommended} alternatives={alternatives}
      onPickGuidedSlot={(slot) => {
        pickGuidedSlot(slot);
        track('slot_selected', leadId, { dateStr: slot.dateStr, h: slot.h, m: slot.m, source: 'guided' });
        if (answers.email) trackLead(answers.email, 'slot_selected', { slot: `${slot.dateStr}T${pad(slot.h)}:${pad(slot.m)}`, source: 'guided' }, leadToken);
      }}
      onReserveRecommended={reserveRecommended}
      answers={answers}
      leadId={leadId}
    />;
  return (
    <BookedPhase
      answers={answers}
      selDate={selDate}
      selSlot={selSlot}
      leadId={leadId}
      onCalendarAdd={(provider) => {
        track('calendar_add_clicked', leadId, { provider });
        if (answers.email) trackLead(answers.email, 'calendar_add_clicked', { provider }, leadToken);
      }}
    />
  );
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

// ─── Picking phase — guided booking V2 ───────────────────────────────────────
function PickingPhase({
  days, slotMap, selDate, selSlot, onPickDate, onPickSlot, onConfirm, booking,
  calExpanded, onToggleCal, recommended, alternatives, onPickGuidedSlot,
  onReserveRecommended, answers,
}) {
  const [recExpanded, setRecExpanded] = useState(true);
  const slotsLoaded = Object.values(slotMap).some(v => v.loaded);

  // The footer only shows when an alternative (or calendar slot) is chosen,
  // NOT when the recommended card is the selection (it books directly).
  const altOrCalSelected = selSlot && selDate && !(
    recommended &&
    selDate.dateStr === recommended.dateStr &&
    selSlot.h === recommended.h &&
    selSlot.m === recommended.m
  );

  // Wrappers that also collapse the recommended card
  function pickAlt(slot) { onPickGuidedSlot(slot); setRecExpanded(false); }
  function pickCalSlot(sl) { onPickSlot(sl); setRecExpanded(false); }

  // Full calendar date/slot rendering (used inside expanded section)
  const calDateInfo  = selDate ? (slotMap[selDate.dateStr] || { slots: [], loading: true }) : null;
  const calSlots     = calDateInfo?.slots   || [];
  const calLoading   = calDateInfo?.loading ?? false;

  return (
    <>
      <Head><title>Schedule a Call — {CFG.hostName}</title></Head>
      <div className="pk-root">

        {/* ── Header ── */}
        <div className="pk-profile-wrap">
          <div className="pk-headline">
            {answers?.firstName
              ? `${answers.firstName}, let's get your consultation scheduled.`
              : 'Choose a Time That Works Best for You'}
          </div>
          <div className="pk-meeting-title">{CFG.meetingTitle}</div>
          <div className="pk-desc">Quick conversation. No pressure. We'll answer your questions and help you see if this is a fit.</div>
          <div className="pk-meta-row">
            <span className="pk-meta-item"><IcoClk size={14} /> {CFG.duration} min</span>
            <span className="pk-meta-item"><IcoPhone size={14} /> Phone call</span>
            <span className="pk-meta-item"><IcoGlobe size={14} /> {CFG.tz}</span>
          </div>
        </div>

        {/* ── Guided body ── */}
        <div className="gd-body">

          {/* Loading — slots not yet ready */}
          {!slotsLoaded && (
            <div className="gd-loading">
              <span className="bspin" style={{ marginRight: 10 }} />
              Finding available times…
            </div>
          )}

          {/* Recommended slot — expanded or minimized */}
          {slotsLoaded && recommended && (
            recExpanded ? (
              <div className="gd-rec">
                <div className="gd-rec-hdr">
                  <span className="gd-rec-tag">⭐ Recommended</span>
                  <button className="gd-rec-collapse" onClick={() => setRecExpanded(false)} title="Minimize">▲</button>
                </div>
                <div className="gd-rec-time">{recommended.dayLabel} at {recommended.label}</div>
                <div className="gd-rec-sub">{hoursLabel(recommended.hoursAway)} · {CFG.tz}</div>
                <button className="gd-rec-btn" onClick={onReserveRecommended} disabled={booking}>
                  {booking ? <><span className="bspin" /> Confirming…</> : 'Reserve This Time'}
                </button>
              </div>
            ) : (
              <button className="gd-rec-min" onClick={() => setRecExpanded(true)}>
                <span className="gd-rec-min-text">Recommended · {recommended.dayLabel} · {recommended.label}</span>
                <span className="gd-rec-min-arrow">▾</span>
              </button>
            )
          )}

          {/* No slots found — push to full calendar */}
          {slotsLoaded && !recommended && (
            <div className="gd-no-near">
              <p>No upcoming openings found.</p>
              <p>Use the full calendar below to find a time that works.</p>
            </div>
          )}

          {/* Other time toggle */}
          {slotsLoaded && (
            <button className="gd-cal-toggle" onClick={onToggleCal}>
              <IcoCal />
              <span style={{ flex: 1 }}>{calExpanded ? 'Hide' : '📆 Choose Another Time'}</span>
              <span style={{ display:'inline-block', transition:'transform .2s', transform: calExpanded ? 'rotate(180deg)' : 'none' }}>▾</span>
            </button>
          )}

          {/* ── Full calendar (expanded) ── */}
          {calExpanded && (
            <div className="gd-full-cal">
              <div className="pk-strip-label">SELECT A DATE</div>
              <div className="pk-date-wrap">
                <div className="pk-date-strip">
                  {days.map(d => {
                    const di = slotMap[d.dateStr];
                    if (di?.loaded && di.slots.length === 0) return null;
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

              {!selDate ? (
                <div className="pk-empty" style={{ paddingBottom: 8 }}>
                  <div className="pk-empty-ico">👆</div>
                  <div className="pk-empty-h">Pick a date above</div>
                  <div className="pk-empty-s">Available times will appear here</div>
                </div>
              ) : calLoading ? (
                <div className="pk-slots-grid" style={{ padding: '0 16px' }}>
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="skel pk-skel" style={{ animationDelay: `${i * 40}ms` }} />
                  ))}
                </div>
              ) : calSlots.length === 0 ? (
                <div className="pk-empty" style={{ paddingBottom: 8 }}>
                  <div className="pk-empty-ico">😔</div>
                  <div className="pk-empty-h">Fully booked</div>
                  <div className="pk-empty-s">Try a different date</div>
                </div>
              ) : (
                <div className="pk-slots-outer" style={{ marginTop: 0 }}>
                  <div className="pk-slots-hdr">
                    <span className="pk-slots-date">{selDate.dow}, {selDate.mon} {selDate.day}</span>
                    <span className="pk-slots-badge">{calSlots.length} open</span>
                  </div>
                  <div className="pk-slots-grid">
                    {calSlots.map(sl => {
                      const isOn = selSlot?.h === sl.h && selSlot?.m === sl.m && selDate?.dateStr === selDate?.dateStr;
                      return (
                        <button key={`${sl.h}-${sl.m}`} className={`pk-slot${isOn ? ' on' : ''}`} onClick={() => pickCalSlot(sl)}>
                          {sl.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Bottom bar — appears when an alternative or calendar slot is selected ── */}
        {altOrCalSelected && (
          <div className="pk-cbar">
            <div className="pk-cbar-info">
              <span className="pk-cbar-date">{selDate.dow}, {selDate.mon} {selDate.day}</span>
              {' · '}{selSlot.label} · {CFG.duration} min
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
function BookedPhase({ answers, selDate, selSlot, leadId, onCalendarAdd }) {
  const gcalUrl = selDate && selSlot ? makeGcalUrl(selDate, selSlot) : '#';
  function trackCalAdd(provider) {
    track('calendar_add_clicked', leadId, { provider });
    if (onCalendarAdd) onCalendarAdd(provider);
  }

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

          {/* What Happens Next */}
          <div className="bkd-next">
            <div className="bkd-next-title">What Happens Next?</div>
            <div className="bkd-next-item"><span className="bkd-next-check">✓</span> Add this event to your calendar</div>
            <div className="bkd-next-item"><span className="bkd-next-check">✓</span> Check your email for confirmation</div>
            <div className="bkd-next-item"><span className="bkd-next-check">✓</span> We'll call you at your scheduled time</div>
          </div>

          {/* Add to calendar */}
          <div className="bkd-cal-label">ADD TO YOUR CALENDAR</div>
          <div className="bkd-cal-list">
            <a className="bkd-cal-row" href={gcalUrl} target="_blank" rel="noreferrer" onClick={() => trackCalAdd('google')}>
              <div className="bkd-cal-ico"><IcoCalGoogle /></div>
              <div style={{ flex: 1 }}>
                <div className="bkd-cal-name">Google Calendar</div>
                <div className="bkd-cal-desc">Opens in Google Calendar</div>
              </div>
              <ChevronRight />
            </a>
            <button className="bkd-cal-row" onClick={() => { trackCalAdd('apple'); downloadIcs(selDate, selSlot, answers); }}>
              <div className="bkd-cal-ico"><IcoCalApple /></div>
              <div style={{ flex: 1 }}>
                <div className="bkd-cal-name">Apple Calendar</div>
                <div className="bkd-cal-desc">Downloads .ics file</div>
              </div>
              <ChevronRight />
            </button>
            <button className="bkd-cal-row" onClick={() => { trackCalAdd('outlook'); downloadIcs(selDate, selSlot, answers); }}>
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
