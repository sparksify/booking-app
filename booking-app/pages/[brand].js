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
      .select('work_start, work_end, timezone, days_ahead, buffer_minutes, max_slots_per_day, hidden_slots_count, host_avatar_url, rep_avatars')
      .eq('id', 1)
      .single(),
  ]);

  if (!brandRes.data) return { notFound: true };

  // Drop unresolved merge tokens — if a value still looks like "{{first_name}}"
  // the substitution never happened, so it must never reach the form.
  const clean = v => {
    const s = (v || '').toString().trim();
    if (!s || /\{\{.*\}\}/.test(s) || /%7B%7B/i.test(s)) return '';
    return s;
  };
  // Facebook stores multiple-choice answers with underscores where spaces go
  // (e.g. "$50,000_-_$75,000"); turn them back into readable text.
  const cleanText = v => clean(v).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  return {
    props: {
      brand:    brandRes.data,
      settings: settingsRes.data || {},
      // URL params pre-filled from the Facebook Lead Ad redirect
      prefill: {
        firstName:     clean(query.first_name),
        lastName:      clean(query.last_name),
        phone:         clean(query.phone_number) || clean(query.phone),
        email:         clean(query.email),
        // Liquid capital comes from the FB "Cash Available?" question — accept
        // its real field name (cash_available) plus our own aliases.
        liquidCapital: cleanText(query.liquid_capital) || cleanText(query.cash_available)
                    || cleanText(query['cash_available?']) || cleanText(query.investment_level),
        leadId:        clean(query.lead_id),
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
    accent:       brand.accent_color    || '#16A34A',
    // Prefer the uploaded photo of the rep assigned to this calendar; fall back to the global host avatar.
    hostAvatarUrl: ((brand.rep_emails?.[0] && settings.rep_avatars?.[brand.rep_emails[0]]) || settings.host_avatar_url) || null,
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
  const [phase,      setPhase]      = useState('calendar'); // 'calendar' | 'confirm' | 'booked' — the question wizard is gone; contact fields live in the confirm panel
  const [step,       setStep]       = useState(0);
  const [answers,    setAnswers]    = useState({
    firstName: prefill.firstName,
    lastName:  prefill.lastName,
    phone:     prefill.phone,
    email:     prefill.email,
    goals:     '',
  });
  const [isDesktop,   setIsDesktop]   = useState(false);
  const [isMobile,    setIsMobile]    = useState(false);
  const [recommended, setRecommended] = useState(null);
  const dateStripRef = useRef(null);
  const setField = (k, v) => setAnswers(a => ({ ...a, [k]: v }));
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
        notes:          answers.goals || null,
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

  // Desktop detection (≥1024px) drives the combined layout; phone detection
  // (≤640px) makes the booking card fill the screen edge-to-edge instead of
  // floating on a gray background with side margins.
  useEffect(() => {
    const mqD = window.matchMedia('(min-width: 1024px)');
    const mqM = window.matchMedia('(max-width: 640px)');
    const upd = () => { setIsDesktop(mqD.matches); setIsMobile(mqM.matches); };
    upd();
    mqD.addEventListener ? mqD.addEventListener('change', upd) : mqD.addListener(upd);
    mqM.addEventListener ? mqM.addEventListener('change', upd) : mqM.addListener(upd);
    return () => {
      mqD.removeEventListener ? mqD.removeEventListener('change', upd) : mqD.removeListener(upd);
      mqM.removeEventListener ? mqM.removeEventListener('change', upd) : mqM.removeListener(upd);
    };
  }, []);

  // On phones: a framed app card that fills the screen with a small even gutter,
  // and the page itself is the ONLY scroller (the body is locked below) so the
  // whole thing can't be dragged around like loose content.
  const pageStyle = isMobile
    ? {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        overflowY: 'auto', overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch', touchAction: 'pan-y',
        padding: '10px', background: '#E9EDF2',
        fontFamily: ss.page.fontFamily,
      }
    : ss.page;
  const cardStyle = isMobile
    ? { ...ss.card, width: '100%', maxWidth: 'none', borderRadius: 16, boxShadow: '0 2px 16px rgba(15,23,42,.10)', minHeight: 'calc(100vh - 20px)' }
    : ss.card;

  // The redesigned single-screen layout is ONLY for the personal calendar.
  // Brand calendars (Facebook lead-ad destinations) keep the existing flow.
  const isPersonal = brand?.type === 'personal';

  // Skip the step-by-step question wizard entirely — both desktop (combined
  // form) and mobile (contact fields live in the confirm panel) go straight to
  // the calendar. Land visitors on available times, not a typeform.
  useEffect(() => {
    if (phase === 'questions') {
      setPhase('calendar');
      track('booking_page_viewed', leadId);
    }
  }, [phase]);

  // Capture the soonest slot as the "Recommended for you" suggestion.
  useEffect(() => {
    if (!recommended && selDate && workdays.length && selDate.dateStr === workdays[0].dateStr && slots.length) {
      setRecommended({ date: selDate, slot: slots[0] });
    }
  }, [slots, selDate, workdays, recommended]);

  function reserveRecommended() {
    if (!recommended) return;
    if (selDate?.dateStr !== recommended.date.dateStr) {
      const idx = workdays.findIndex(d => d.dateStr === recommended.date.dateStr);
      setDayIdx(idx >= 0 ? idx : 0);
      setSelDate(recommended.date);
      fetchSlots(recommended.date.dateStr);
    }
    setSelSlot(recommended.slot);
  }

  const canBook = !!(answers.firstName?.trim() && answers.lastName?.trim() && answers.email?.trim() && isValidPhone(answers.phone || '') && selSlot && selDate);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'booked' && bookedSlot) {
    const { date: bd, slot: bs } = bookedSlot;
    return (
      <>
        <Head><title>Booked! — {cfg.brandName}</title></Head>
        <div style={pageStyle}>
          <div style={cardStyle}>
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

  // ── Desktop, personal calendar only: single-screen 3-column layout ──────────
  if (isDesktop) {
    const slotSel = sl => selSlot && selSlot.h === sl.h && selSlot.m === sl.m;
    const scrollStrip = dir => dateStripRef.current?.scrollBy({ left: dir * 220, behavior: 'smooth' });
    return (
      <>
        <Head><title>{cfg.brandName} — Book a Call</title></Head>
        <div style={{ ...d.page, '--ac': cfg.accent, '--acL': cfg.accent + '1A', '--acB': cfg.accent + '55' }}>
          <div style={d.shell}>

            {/* LEFT — info */}
            <div style={d.left}>
              <h1 style={d.h1}>{cfg.headline || "Let’s see if this could be a fit."}</h1>
              <p style={d.sub}>{cfg.subtitle || `A quick ${cfg.duration}-minute call to learn about your needs and see how I can help.`}</p>
              <div style={d.metaList}>
                <div style={d.metaRow}><span style={d.metaIc}><DIc name="clock" /></span>{cfg.duration} minutes</div>
                <div style={d.metaRow}><span style={d.metaIc}><DIc name="phone" /></span>Phone call</div>
                <div style={d.metaRow}><span style={d.metaIc}><DIc name="globe" /></span>{cfg.tz}</div>
              </div>
              <div style={d.expectTitle}>What to expect</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 26 }}>
                {['Brief discovery of your goals', `Explore how ${cfg.brandName} can help`, 'Answer your questions'].map(t => (
                  <div key={t} style={d.expectRow}><span style={d.checkIc}><DIc name="check" size={13} /></span>{t}</div>
                ))}
              </div>
              <div style={d.consultCard}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {cfg.hostAvatarUrl
                    ? <img src={cfg.hostAvatarUrl} alt="" style={d.avatar} />
                    : <div style={{ ...d.avatar, background: 'var(--ac, #15803D)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{(cfg.brandName || 'A')[0]}</div>}
                  <div>
                    <div style={{ fontWeight: 700, color: '#0F172A' }}>{cfg.brandName}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <span style={{ color: 'var(--ac, #16A34A)', letterSpacing: 1, fontSize: 13 }}>★★★★★</span>
                      <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>4.9</span>
                    </div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #EEF2F6', marginTop: 14, paddingTop: 12, fontSize: 11.5, color: '#94A3B8' }}>Trusted by founders and teams</div>
              </div>
            </div>

            {/* MIDDLE — calendar ⇄ form, sliding within the card */}
            <div style={d.mid}>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', width: '200%', transition: 'transform .32s cubic-bezier(.4,0,.2,1)', transform: selSlot ? 'translateX(-50%)' : 'translateX(0)' }}>

                  {/* Panel 1 — calendar */}
                  <div style={{ width: '50%', flexShrink: 0, boxSizing: 'border-box', paddingRight: 4 }}>
                    {recommended && (
                      <>
                        <div style={d.recoLabel}><DIc name="spark" size={16} /> Recommended for you</div>
                        <div style={d.recoCard}>
                          <span style={d.recoStar}><DIc name="star" size={18} /></span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{getDayLabel(recommended.date.dateStr)} at {recommended.slot.label}</div>
                            <div style={{ fontSize: 12.5, color: '#64748B' }}>Usually a great time to connect</div>
                          </div>
                          <button style={d.reserveBtn} onClick={reserveRecommended}>Reserve this time</button>
                        </div>
                      </>
                    )}
                    <div style={d.midSection}>Select a date</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button style={d.arrow} onClick={() => scrollStrip(-1)}><DIc name="chevL" size={16} /></button>
                      <div ref={dateStripRef} style={d.dateStrip}>
                        {workdays.map((day, i) => (
                          <button key={day.dateStr} onClick={() => selectDay(day, i)} style={{ ...d.dayChip, ...(dayIdx === i ? d.dayChipOn : {}) }}>
                            <div style={{ fontSize: 12, color: dayIdx === i ? 'var(--ac, #15803D)' : '#64748B', fontWeight: 600 }}>{day.dow}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: dayIdx === i ? 'var(--ac, #15803D)' : '#0F172A' }}>{day.mon} {day.day}</div>
                          </button>
                        ))}
                      </div>
                      <button style={d.arrow} onClick={() => scrollStrip(1)}><DIc name="chevR" size={16} /></button>
                    </div>
                    <div style={d.availTitle}>Available times{selDate ? ` for ${getDayLabel(selDate.dateStr)}` : ''}</div>
                    {slotsLoading ? (
                      <div style={d.slotsMsg}>Loading…</div>
                    ) : slotErr ? (
                      <div style={d.slotsMsg}>{slotErr}</div>
                    ) : (
                      <div style={d.slotGrid}>
                        {slots.map((sl, i) => (
                          <button key={i} onClick={() => setSelSlot(sl)} style={{ ...d.slot, ...(slotSel(sl) ? d.slotOn : {}) }}>
                            {sl.label}
                            {slotSel(sl) && <span style={{ color: 'var(--ac, #15803D)' }}><DIc name="check" size={15} /></span>}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={d.tzRow}><span style={{ color: 'var(--ac, #16A34A)' }}><DIc name="globe" size={16} /></span> Time zone&nbsp;<strong style={{ color: '#334155', fontWeight: 600 }}>{cfg.tz} (US &amp; Canada)</strong></div>
                    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>All times are shown in your local time zone.</div>
                  </div>

                  {/* Panel 2 — form (slides in over the date/time area) */}
                  <div style={{ width: '50%', flexShrink: 0, boxSizing: 'border-box', paddingLeft: 4 }}>
                    <button style={d.backBtn} onClick={() => setSelSlot(null)}><DIc name="chevL" size={14} /> Back to times</button>
                    <h2 style={{ ...d.h2, marginTop: 10 }}>Tell us about yourself</h2>
                    <p style={d.rsub}>So we can make the most of our time together.</p>
                    {selDate && selSlot && (
                      <div style={d.drawerTimeChip}>
                        <span style={{ color: 'var(--ac, #16A34A)', display: 'flex' }}><DIc name="check" size={16} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ac, #15803D)' }}>{getDayLabel(selDate.dateStr)} at {selSlot.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--ac, #16A34A)' }}>{cfg.tz}</div>
                        </div>
                        <button style={d.changeBtn} onClick={() => setSelSlot(null)}>Change</button>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><label style={d.label}>First name</label><input style={d.input} value={answers.firstName} onChange={e => setField('firstName', e.target.value)} placeholder="First name" /></div>
                      <div><label style={d.label}>Last name</label><input style={d.input} value={answers.lastName} onChange={e => setField('lastName', e.target.value)} placeholder="Last name" /></div>
                    </div>
                    <label style={d.label}>Email</label>
                    <input style={d.input} type="email" value={answers.email} onChange={e => setField('email', e.target.value)} placeholder="you@example.com" />
                    <label style={d.label}>Phone</label>
                    <input style={d.input} type="tel" value={answers.phone} onChange={e => setField('phone', e.target.value)} placeholder="(555) 123-4567" />
                    <label style={d.label}>Goals or questions <span style={{ color: '#94A3B8', fontWeight: 400 }}>(optional)</span></label>
                    <textarea style={{ ...d.input, minHeight: 80, resize: 'vertical' }} maxLength={250} value={answers.goals} onChange={e => setField('goals', e.target.value)} placeholder="What would you like to achieve in this call?" />
                    <div style={{ textAlign: 'right', fontSize: 11, color: '#94A3B8', marginTop: -8, marginBottom: 14 }}>{(answers.goals || '').length}/250</div>
                    <button style={{ ...d.bookBtn, opacity: canBook && !booking ? 1 : 0.5, cursor: canBook && !booking ? 'pointer' : 'not-allowed' }} disabled={!canBook || booking} onClick={confirmBooking}>
                      {booking ? 'Booking…' : 'Book My Call →'}
                    </button>
                    {bookErr && <div style={{ marginTop: 10, fontSize: 13, color: '#DC2626' }}>{bookErr}</div>}
                    <div style={d.secure}><DIc name="lock" size={13} /> Your information is secure and will only be used to schedule and prepare for our call.</div>
                  </div>

                </div>
              </div>
            </div>

          </div>
          <div style={d.footer}>Powered by <strong style={{ color: '#475569', fontWeight: 700 }}>Kanso</strong>&nbsp; ·&nbsp; © 2026 Kanso</div>
        </div>
      </>
    );
  }

  if (phase === 'calendar' || phase === 'confirm') {
    return (
      <>
        <Head>
          <title>{cfg.brandName} — Pick a Time</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        </Head>
        <style>{`
          html, body { margin: 0; padding: 0; background: #E9EDF2; }
          * { box-sizing: border-box; }
          /* On phones: pin the body completely so it cannot be dragged in any
             direction. iOS Safari ignores overflow:hidden alone, so we fix its
             position; the page div above is the single vertical-only scroller. */
          @media (max-width: 640px) {
            html { height: 100%; }
            body {
              position: fixed;
              top: 0; left: 0; right: 0; bottom: 0;
              width: 100%; height: 100%;
              overflow: hidden;
              overscroll-behavior: none;
            }
          }
        `}</style>
        <div style={pageStyle}>
          <div style={cardStyle}>
            {/* Header */}
            <div style={{ padding: '20px 24px 0', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>{cfg.meetingTitle}</div>
              <div style={{ fontSize: 13, color: '#64748B', paddingBottom: 14 }}>with {cfg.brandName} · {cfg.duration} min · {cfg.tz}</div>
            </div>

            <div style={{ padding: '16px 24px' }}>
              {/* Recommended for you */}
              {recommended && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0057FF', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <DIc name="spark" size={15} /> Recommended for you
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F0F6FF', border: '1px solid #BFD3FF', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{getDayLabel(recommended.date.dateStr)} at {recommended.slot.label}</div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>Usually a great time to connect</div>
                    </div>
                    <button
                      onClick={() => { reserveRecommended(); setPhase('confirm'); }}
                      style={{ padding: '9px 14px', background: '#0057FF', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                    >
                      Reserve
                    </button>
                  </div>
                </div>
              )}

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
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>
                    {getDayLabel(selDate.dateStr)} · {selSlot.label} {cfg.tz}
                  </div>
                  {(() => {
                    const mLabel = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', margin: '10px 0 4px' };
                    const mInput = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 16, fontFamily: 'inherit', color: '#0F172A', background: '#fff' };
                    return (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <label style={mLabel}>First name</label>
                            <input style={mInput} value={answers.firstName} onChange={e => setField('firstName', e.target.value)} placeholder="First name" />
                          </div>
                          <div>
                            <label style={mLabel}>Last name</label>
                            <input style={mInput} value={answers.lastName} onChange={e => setField('lastName', e.target.value)} placeholder="Last name" />
                          </div>
                        </div>
                        <label style={mLabel}>Email</label>
                        <input style={mInput} type="email" inputMode="email" value={answers.email} onChange={e => setField('email', e.target.value)} placeholder="you@example.com" />
                        <label style={mLabel}>Phone</label>
                        <input style={mInput} type="tel" inputMode="tel" value={answers.phone} onChange={e => setField('phone', e.target.value)} placeholder="(555) 123-4567" />
                        <label style={mLabel}>Goals or questions <span style={{ color: '#94A3B8', fontWeight: 400 }}>(optional)</span></label>
                        <textarea style={{ ...mInput, minHeight: 72, resize: 'vertical' }} maxLength={250} value={answers.goals} onChange={e => setField('goals', e.target.value)} placeholder="What would you like to achieve in this call?" />
                      </>
                    );
                  })()}
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button
                      onClick={confirmBooking}
                      disabled={!canBook || booking}
                      style={{ flex: 1, padding: '11px 0', background: '#0057FF', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: (!canBook || booking) ? 'not-allowed' : 'pointer', opacity: (!canBook || booking) ? 0.5 : 1, fontFamily: 'inherit' }}
                    >
                      {booking ? 'Booking…' : 'Confirm Booking →'}
                    </button>
                    <button onClick={() => { setSelSlot(null); setPhase('calendar'); }} style={{ padding: '11px 16px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#475569', fontFamily: 'inherit' }}>
                      Back
                    </button>
                  </div>
                  {bookErr && <div style={{ marginTop: 8, fontSize: 12, color: '#DC2626' }}>{bookErr}</div>}
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

// ─── Desktop (personal calendar) icons + styles ────────────────────────────────
function DIc({ name, size = 18 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', style: { display: 'block' } };
  switch (name) {
    case 'clock':  return <svg {...p}><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>;
    case 'phone':  return <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
    case 'globe':  return <svg {...p}><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></svg>;
    case 'check':  return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>;
    case 'star':   return <svg {...{ ...p, fill: 'currentColor', stroke: 'none' }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case 'spark':  return <svg {...{ ...p, fill: 'currentColor', stroke: 'none' }}><path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2z"/></svg>;
    case 'chevL':  return <svg {...p}><polyline points="15 18 9 12 15 6"/></svg>;
    case 'chevR':  return <svg {...p}><polyline points="9 18 15 12 9 6"/></svg>;
    case 'lock':   return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
    default: return null;
  }
}

const GREEN = 'var(--ac, #15803D)';
const d = {
  page:  { minHeight: '100vh', background: '#F4F5F7', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" },
  footer:{ marginTop: 18, fontSize: 12, color: '#94A3B8', letterSpacing: '.2px' },
  shell: { display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 0, width: '100%', maxWidth: 1000, background: '#fff', borderRadius: 20, boxShadow: '0 8px 40px rgba(15,23,42,.10)', overflow: 'hidden' },

  left:  { padding: '40px 34px', borderRight: '1px solid #EEF2F6' },
  h1:    { fontSize: 30, fontWeight: 800, color: '#0F172A', lineHeight: 1.15, margin: 0, letterSpacing: '-0.5px' },
  sub:   { fontSize: 14.5, color: '#64748B', lineHeight: 1.6, margin: '14px 0 26px' },
  metaList: { display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 24, borderBottom: '1px solid #EEF2F6', marginBottom: 22 },
  metaRow:  { display: 'flex', alignItems: 'center', gap: 12, fontSize: 14.5, color: '#0F172A', fontWeight: 500 },
  metaIc:   { color: GREEN, display: 'flex' },
  expectTitle: { fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 14 },
  expectRow:   { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: '#475569' },
  checkIc:     { width: 18, height: 18, borderRadius: '50%', background: 'var(--acL, #DCFCE7)', color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  consultCard: { border: '1px solid #E5E7EB', borderRadius: 14, padding: 16, background: '#fff' },
  avatar:      { width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },

  mid:    { padding: '36px 34px', minWidth: 0 },
  recoLabel: { display: 'flex', alignItems: 'center', gap: 6, color: GREEN, fontWeight: 700, fontSize: 14, marginBottom: 12 },
  recoCard:  { display: 'flex', alignItems: 'center', gap: 14, border: `1.5px solid ${'var(--acB, #BBF7D0)'}`, background: 'var(--acL, #F0FDF4)', borderRadius: 14, padding: '16px 18px', marginBottom: 28 },
  recoStar:  { width: 40, height: 40, borderRadius: '50%', background: 'var(--ac, #16A34A)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  reserveBtn:{ background: 'var(--ac, #16A34A)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  midSection:{ fontSize: 17, fontWeight: 700, color: '#0F172A', marginBottom: 12 },
  arrow:     { width: 34, height: 34, flexShrink: 0, borderRadius: '50%', border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  dateStrip: { display: 'flex', gap: 8, overflowX: 'auto', flex: 1, minWidth: 0, scrollbarWidth: 'none', padding: '2px 0' },
  dayChip:   { flexShrink: 0, minWidth: 64, padding: '10px 12px', borderRadius: 12, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' },
  dayChipOn: { border: `2px solid ${GREEN}`, background: 'var(--acL, #F0FDF4)' },
  availTitle:{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '26px 0 14px' },
  slotsMsg:  { padding: '24px 0', color: '#94A3B8', fontSize: 14 },
  slotGrid:  { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 },
  slot:      { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px 8px', borderRadius: 12, border: '1px solid #E2E8F0', background: '#fff', color: '#0F172A', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  slotOn:    { border: `2px solid ${GREEN}`, background: 'var(--acL, #F0FDF4)', color: GREEN },
  tzRow:     { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: '#64748B', marginTop: 26, paddingTop: 18, borderTop: '1px solid #EEF2F6' },

  right:  { padding: '40px 34px', borderLeft: '1px solid #EEF2F6' },
  h2:     { fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 },
  rsub:   { fontSize: 13.5, color: '#64748B', margin: '8px 0 22px' },
  label:  { display: 'block', fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 7, marginTop: 14 },
  input:  { width: '100%', boxSizing: 'border-box', padding: '12px 13px', fontSize: 14, border: '1px solid #E2E8F0', borderRadius: 10, fontFamily: 'inherit', outline: 'none', color: '#0F172A' },
  bookBtn:{ width: '100%', padding: '15px 0', background: 'var(--ac, #16A34A)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, fontFamily: 'inherit', marginTop: 6 },
  secure: { display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, color: '#94A3B8', marginTop: 16, lineHeight: 1.5 },

  backBtn:       { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--ac, #16A34A)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 },
  drawerTimeChip:{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--acL, #F0FDF4)', border: '1px solid var(--acB, #BBF7D0)', borderRadius: 10, padding: '10px 12px', margin: '14px 0 18px' },
  changeBtn:     { background: 'none', border: 'none', color: 'var(--ac, #16A34A)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', flexShrink: 0 },
};
