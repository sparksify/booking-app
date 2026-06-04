/**
 * /pages/[brand].js
 *
 * Dynamic brand booking page.
 * URL: bookkanso.co/[brand-slug]
 *   e.g. bookkanso.co/wetfuel
 *        bookkanso.co/gorilla-property
 *
 * This page is functionally identical to pages/index.js but:
 *   1. Brand config (headline, meeting title, duration) is loaded server-side
 *      from the brands table via getServerSideProps.
 *   2. The brand slug is passed to /api/availability and /api/book so that
 *      brand-specific rep filtering and weighted routing applies.
 *   3. The liquid_capital URL param (raw string from Facebook form) is passed
 *      to the book API so the routing engine can map it to a tier.
 *
 * Facebook Lead Ad thank-you URL format:
 *   https://bookkanso.co/wetfuel?first_name={{first_name}}&last_name={{last_name}}&phone={{phone_number}}&email={{email}}&liquid_capital={{liquid_capital}}
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { getSupabaseAdmin } from '@/lib/supabase';
import { initPixel, pixelTrack, pixelEvent } from '@/lib/fbPixel';

// ─── Server-side brand loading ────────────────────────────────────────────────

export async function getServerSideProps({ params, query }) {
  const slug = params?.brand?.toLowerCase();
  if (!slug) return { notFound: true };

  const supabase = getSupabaseAdmin();

  const [brandRes, settingsRes] = await Promise.all([
    supabase
      .from('brands')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle(),
    supabase
      .from('settings')
      .select('work_start, work_end, timezone, days_ahead, buffer_minutes, max_slots_per_day, hidden_slots_count, host_avatar_url')
      .eq('id', 1)
      .single(),
  ]);

  if (!brandRes.data) return { notFound: true };

  return {
    props: {
      brand:    brandRes.data,
      settings: settingsRes.data || {},
      // URL params pre-filled from Facebook Lead Ad
      prefill: {
        firstName:     query.first_name     || '',
        lastName:      query.last_name      || '',
        phone:         query.phone_number   || query.phone || '',
        email:         query.email          || '',
        liquidCapital: query.liquid_capital || '',  // raw string e.g. "$150,000 – $500,000"
        leadId:        query.lead_id        || '',
      },
    },
  };
}

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
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: eventType, session_id, lead_id: leadId || null, props }),
  }).catch(() => {});
}

function trackWithBooking(eventType, leadId, bookingId, props = {}) {
  const session_id = getSessionId();
  if (!session_id) return;
  fetch('/api/events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: eventType, session_id, lead_id: leadId || null, booking_id: bookingId || null, props }),
  }).catch(() => {});
}

function trackLead(email, eventType, eventData = {}, leadToken = null) {
  if (!email) return;
  fetch('/api/lead-events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, event_type: eventType, event_data: eventData, lead_id: leadToken }),
  }).catch(() => {});
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOW_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Helpers (identical to index.js) ─────────────────────────────────────────

function isValidPhone(v) { return v.replace(/\D/g, '').length >= 7; }

function formatPhone(p) {
  const d = (p || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return p;
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

function pad(n) { return String(n).padStart(2, '0'); }

function getDayLabel(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${DOW_NAMES[d.getDay()]}, ${MON_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function makeGcalUrl(selDate, selSlot, cfg) {
  const [yr, mo, dy] = selDate.dateStr.split('-').map(Number);
  const start = new Date(yr, mo - 1, dy, selSlot.h, selSlot.m);
  const end   = new Date(start.getTime() + cfg.duration * 60000);
  const fmt   = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const text  = encodeURIComponent(cfg.meetingTitle);
  const det   = encodeURIComponent(`Phone call with your advisor`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${fmt(start)}/${fmt(end)}&details=${det}`;
}

function canAdvance(step, answers, questions) {
  const q   = questions[step];
  const val = (answers[q.key] || '').trim();
  if (!val) return false;
  if (q.key === 'phone') return isValidPhone(val);
  return true;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrandBookingPage({ brand, settings, prefill }) {
  // Build CFG from brand + global settings
  const cfg = {
    brandSlug:    brand.slug,
    brandName:    brand.name,
    meetingTitle: brand.meeting_title   || '15-Minute Phone Call',
    duration:     brand.meeting_duration || 15,
    tz:           'Central Time',
    daysAhead:    settings.days_ahead   || 14,
    hostAvatarUrl: settings.host_avatar_url || null,
    // Booking page content
    headline:    brand.booking_headline    || `Book Your Free ${brand.name} Call`,
    subtitle:    brand.booking_subtitle    || 'Choose a time that works for you',
    description: brand.booking_description || '',
  };

  // Questions — prefill from URL params if provided
  const QUESTIONS = [
    { q: ()    => "What's your first name?",                ph: 'Type your answer…', key: 'firstName', type: 'text'  },
    { q: (ans) => `Hi ${ans.firstName}! Last name?`,        ph: 'Type your answer…', key: 'lastName',  type: 'text'  },
    { q: ()    => 'Best phone number?',                     ph: 'Type your answer…', key: 'phone',     type: 'tel'   },
    { q: ()    => 'Email address?',                         ph: 'Type your answer…', key: 'email',     type: 'email' },
  ];

  // ── State ──────────────────────────────────────────────────────────────────
  const [phase,      setPhase]      = useState('questions'); // 'questions' | 'calendar' | 'confirm' | 'booked'
  const [step,       setStep]       = useState(0);
  const [answers,    setAnswers]    = useState({
    firstName: prefill.firstName,
    lastName:  prefill.lastName,
    phone:     prefill.phone,
    email:     prefill.email,
  });
  const [inputVal,   setInputVal]   = useState('');
  const [workdays,   setWorkdays]   = useState([]);
  const [dayIdx,     setDayIdx]     = useState(0);
  const [slots,      setSlots]      = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotErr,    setSlotErr]    = useState('');
  const [selDate,    setSelDate]    = useState(null);
  const [selSlot,    setSelSlot]    = useState(null);
  const [booking,    setBooking]    = useState(false);
  const [bookErr,    setBookErr]    = useState('');
  const [bookedSlot, setBookedSlot] = useState(null);
  const [meetLink,   setMeetLink]   = useState(null);
  const [leadId,     setLeadId]     = useState(prefill.leadId || null);
  const [bookingId,  setBookingId]  = useState(null);
  const [editMode,   setEditMode]   = useState(false);

  const inputRef    = useRef(null);
  const calScrollRef = useRef(null);

  // Auto-advance if all questions are prefilled from URL
  useEffect(() => {
    const allFilled = QUESTIONS.every(q => {
      const val = (answers[q.key] || '').trim();
      if (!val) return false;
      if (q.key === 'phone') return isValidPhone(val);
      return true;
    });
    if (allFilled && phase === 'questions') {
      setPhase('calendar');
      track('booking_page_viewed', leadId);
    }
  }, []);

  useEffect(() => {
    if (phase === 'calendar') {
      const days = generateWorkdays(cfg.daysAhead);
      setWorkdays(days);
      if (days.length > 0) {
        setSelDate(days[0]);
        fetchSlots(days[0].dateStr);
      }
    }
  }, [phase]);

  const fetchSlots = useCallback(async (dateStr) => {
    setSlotsLoading(true);
    setSlotErr('');
    setSlots([]);
    try {
      const r = await fetch(`/api/availability?date=${dateStr}&brand=${cfg.brandSlug}`);
      const d = await r.json();
      setSlots(d.slots || []);
      if (!d.slots?.length) setSlotErr('No available times on this date.');
    } catch {
      setSlotErr('Could not load slots. Please try again.');
    }
    setSlotsLoading(false);
  }, [cfg.brandSlug]);

  function selectDay(day, idx) {
    setDayIdx(idx);
    setSelDate(day);
    setSelSlot(null);
    fetchSlots(day.dateStr);
    calScrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function confirmBooking() {
    if (!selDate || !selSlot) return;
    setBooking(true); setBookErr('');
    try {
      const payload = {
        firstName:      answers.firstName,
        lastName:       answers.lastName,
        email:          answers.email,
        phone:          answers.phone,
        date:           selDate.dateStr,
        h:              selSlot.h,
        m:              selSlot.m,
        label:          selSlot.label,
        brand:          cfg.brandSlug,
        liquid_capital: prefill.liquidCapital || null,
        lead_id:        leadId || null,
        source:         'brand_booking',
      };

      const r = await fetch('/api/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();

      if (!r.ok) { setBookErr(d.error || 'Booking failed.'); setBooking(false); return; }

      setBookedSlot({ date: selDate, slot: selSlot });
      setMeetLink(d.meetLink || null);
      setBookingId(d.bookingId || null);
      setPhase('booked');

      trackWithBooking('booking_confirmed', leadId, d.bookingId, { brand: cfg.brandSlug });
      trackLead(answers.email, 'booking_confirmed', { brand: cfg.brandSlug }, leadId);
      pixelEvent('Schedule');
    } catch (e) {
      setBookErr('Something went wrong. Please try again.');
    }
    setBooking(false);
  }

  function advanceQuestion() {
    if (!canAdvance(step, { ...answers, [QUESTIONS[step].key]: inputVal }, QUESTIONS)) return;
    const key = QUESTIONS[step].key;
    const updated = { ...answers, [key]: inputVal.trim() };
    setAnswers(updated);
    setInputVal('');
    if (step + 1 < QUESTIONS.length) {
      setStep(step + 1);
    } else {
      setPhase('calendar');
      track('booking_page_viewed', leadId);
      trackLead(updated.email, 'booking_page_viewed', { brand: cfg.brandSlug }, leadId);
    }
  }

  useEffect(() => {
    if (phase === 'questions' && inputRef.current) {
      inputRef.current.focus();
      // Pre-populate input if the current question already has an answer (from prefill)
      const key = QUESTIONS[step].key;
      if (answers[key] && !inputVal) setInputVal(answers[key]);
    }
  }, [step, phase]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'booked' && bookedSlot) {
    const { date: bd, slot: bs } = bookedSlot;
    return (
      <>
        <Head><title>Booked! — {cfg.brandName}</title></Head>
        <div style={ss.page}>
          <div style={ss.card}>
            <div style={{ textAlign: 'center', padding: '40px 24px' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                You're booked!
              </h1>
              <p style={{ fontSize: 15, color: '#475569', marginBottom: 4 }}>
                {cfg.meetingTitle}
              </p>
              <p style={{ fontSize: 14, color: '#64748B', marginBottom: 24 }}>
                {getDayLabel(bd.dateStr)} · {bs.label} {cfg.tz}
              </p>
              {meetLink && (
                <a href={meetLink} target="_blank" rel="noreferrer" style={{ display: 'inline-block', padding: '10px 24px', background: '#0057FF', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none', marginBottom: 16 }}>
                  Join Call →
                </a>
              )}
              <div style={{ marginTop: 12 }}>
                <a href={makeGcalUrl(bd, bs, cfg)} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#0057FF', textDecoration: 'none' }}>
                  + Add to Google Calendar
                </a>
              </div>
              <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 24 }}>
                A confirmation email is on its way to {answers.email}
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (phase === 'questions' || (phase === 'questions' && editMode)) {
    const q = QUESTIONS[step];
    const currentVal = inputVal || answers[q.key] || '';
    return (
      <>
        <Head><title>{cfg.brandName} — Book a Call</title></Head>
        <div style={ss.page}>
          <div style={ss.card}>
            <div style={{ padding: '32px 28px' }}>
              {cfg.headline && <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>{cfg.headline}</h1>}
              {cfg.subtitle && <p style={{ fontSize: 14, color: '#64748B', marginBottom: 24 }}>{cfg.subtitle}</p>}
              <div style={{ fontSize: 17, fontWeight: 600, color: '#0F172A', marginBottom: 16 }}>
                {q.q(answers)}
              </div>
              <input
                ref={inputRef}
                type={q.type}
                value={currentVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && advanceQuestion()}
                placeholder={q.ph}
                style={ss.input}
              />
              <button
                onClick={advanceQuestion}
                disabled={!canAdvance(step, { ...answers, [q.key]: currentVal }, QUESTIONS)}
                style={{ ...ss.btn, opacity: canAdvance(step, { ...answers, [q.key]: currentVal }, QUESTIONS) ? 1 : 0.4 }}
              >
                {step < QUESTIONS.length - 1 ? 'Next →' : 'See Available Times →'}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (phase === 'calendar' || phase === 'confirm') {
    return (
      <>
        <Head><title>{cfg.brandName} — Pick a Time</title></Head>
        <div style={ss.page}>
          <div style={ss.card}>
            {/* Header */}
            <div style={{ padding: '20px 24px 0', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>{cfg.meetingTitle}</div>
              <div style={{ fontSize: 13, color: '#64748B', paddingBottom: 14 }}>with {cfg.brandName} · {cfg.duration} min · {cfg.tz}</div>
            </div>

            <div style={{ padding: '16px 24px' }}>
              {/* Day strip */}
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, marginBottom: 4 }}>
                {workdays.map((d, i) => (
                  <button
                    key={d.dateStr}
                    onClick={() => selectDay(d, i)}
                    style={{
                      flexShrink: 0, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                      border: dayIdx === i ? '2px solid #0057FF' : '1px solid #E2E8F0',
                      background: dayIdx === i ? '#EFF6FF' : '#fff',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>{d.dow}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: dayIdx === i ? '#0057FF' : '#0F172A' }}>{d.day}</div>
                    <div style={{ fontSize: 10, color: '#64748B' }}>{d.mon}</div>
                  </button>
                ))}
              </div>

              {/* Slots */}
              <div ref={calScrollRef}>
                {slotsLoading ? (
                  <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8', fontSize: 13 }}>Loading…</div>
                ) : slotErr ? (
                  <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8', fontSize: 13 }}>{slotErr}</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                    {slots.map((sl, i) => (
                      <button
                        key={i}
                        onClick={() => { setSelSlot(sl); setPhase('confirm'); }}
                        style={{
                          padding: '10px 4px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: 13, fontWeight: 600, textAlign: 'center',
                          border: selSlot?.h === sl.h && selSlot?.m === sl.m ? '2px solid #0057FF' : '1px solid #E2E8F0',
                          background: selSlot?.h === sl.h && selSlot?.m === sl.m ? '#EFF6FF' : '#fff',
                          color: selSlot?.h === sl.h && selSlot?.m === sl.m ? '#0057FF' : '#0F172A',
                        }}
                      >
                        {sl.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm panel */}
              {phase === 'confirm' && selSlot && selDate && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '16px 18px', marginTop: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
                    {getDayLabel(selDate.dateStr)} · {selSlot.label} {cfg.tz}
                  </div>
                  <div style={{ fontSize: 13, color: '#475569', marginBottom: 14 }}>
                    {answers.firstName} {answers.lastName} · {formatPhone(answers.phone)}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={confirmBooking}
                      disabled={booking}
                      style={{ flex: 1, padding: '11px 0', background: '#0057FF', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: booking ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                    >
                      {booking ? 'Booking…' : 'Confirm Booking →'}
                    </button>
                    <button onClick={() => { setSelSlot(null); setPhase('calendar'); }} style={{ padding: '11px 16px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#475569', fontFamily: 'inherit' }}>
                      Back
                    </button>
                  </div>
                  {bookErr && <div style={{ marginTop: 8, fontSize: 12, color: '#DC2626' }}>{bookErr}</div>}
                  <button onClick={() => setPhase('questions')} style={{ marginTop: 10, fontSize: 12, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit' }}>
                    Edit contact info
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ss = {
  page:  { minHeight: '100vh', background: '#F1F5F9', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" },
  card:  { background: '#FFFFFF', borderRadius: 16, boxShadow: '0 4px 24px rgba(15,23,42,.10)', width: '100%', maxWidth: 480, overflow: 'hidden' },
  input: { width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid #E2E8F0', borderRadius: 8, fontFamily: 'inherit', outline: 'none', marginBottom: 14, boxSizing: 'border-box', color: '#0F172A' },
  btn:   { width: '100%', padding: '13px 0', background: '#0057FF', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
};
