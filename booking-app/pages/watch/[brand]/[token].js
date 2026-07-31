import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getLanding } from '@/lib/landings';

const LIQUID = ['Under $50k', '$50k – $100k', '$100k – $250k', '$250k – $500k', '$500k+'];
const NETWORTH = ['Under $100k', '$100k – $250k', '$250k – $500k', '$500k – $1M', '$1M+'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function getServerSideProps({ params }) {
  const slug  = (params?.brand || '').toLowerCase();
  const token = params?.token || '';
  const supabase = getSupabaseAdmin();
  const [{ data: brand }, { data: settings }, { data: lead }] = await Promise.all([
    supabase.from('brands').select('slug, name, wistia_video_id, meeting_title, accent_color').eq('slug', slug).maybeSingle(),
    supabase.from('settings').select('timezone, days_ahead').eq('id', 1).maybeSingle(),
    supabase.from('leads').select('first_name, last_name, email, phone, franchise_city, franchise_state, operated_business, net_worth, investment_level').eq('token', token).maybeSingle(),
  ]);
  if (!brand) return { notFound: true };
  return {
    props: {
      token,
      brand: { slug: brand.slug, name: brand.name || brand.slug, wistiaVideoId: brand.wistia_video_id || null, meetingTitle: brand.meeting_title || 'Discovery Call', accent: brand.accent_color || '#15803D' },
      tz: settings?.timezone || 'America/Chicago',
      daysAhead: settings?.days_ahead || 14,
      prefill: {
        firstName: lead?.first_name || '', lastName: lead?.last_name || '',
        email: lead?.email || '', phone: lead?.phone || '',
        city: lead?.franchise_city || '', state: lead?.franchise_state || '',
        operated: lead?.operated_business == null ? '' : (lead.operated_business ? 'yes' : 'no'),
        liquid: lead?.investment_level || '', networth: lead?.net_worth || '',
      },
    },
  };
}

function workdays(n) {
  const out = []; const d = new Date(); let guard = 0;
  while (out.length < n && guard < n * 3) {
    guard++; d.setDate(d.getDate() + 1);
    const dow = d.getDay(); if (dow === 0 || dow === 6) continue;
    out.push({ dateStr: d.toISOString().slice(0, 10), dow: DOW[dow], mon: MON[d.getMonth()], day: d.getDate() });
  }
  return out;
}

/* ── Load Wistia player + wire identity tag & watch tracking ── */
function useWistia(videoId, email, token, onProgress) {
  useEffect(() => {
    if (!videoId) return;
    if (!document.getElementById('wistia-player-js')) {
      const p = document.createElement('script'); p.id = 'wistia-player-js'; p.src = 'https://fast.wistia.com/player.js'; p.async = true; document.body.appendChild(p);
    }
    const mid = `wistia-media-${videoId}`;
    if (!document.getElementById(mid)) {
      const m = document.createElement('script'); m.id = mid; m.src = `https://fast.wistia.com/embed/${videoId}.js`; m.async = true; m.type = 'module'; document.body.appendChild(m);
    }
    window._wq = window._wq || [];
    let lastSent = 0;
    window._wq.push({ id: videoId, onReady: (video) => {
      try { if (email) video.email(email); } catch {}
      try {
        video.bind('percentwatchedchanged', (pct) => {
          const p = Math.round((pct || 0) * 100);
          try { onProgress && onProgress(p); } catch {}
          if (p - lastSent >= 5 || p >= 95) {
            lastSent = p;
            fetch('/api/watch/track', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, pct: p, seconds: Math.round(video.secondsWatched?.() || 0) }) }).catch(() => {});
          }
        });
      } catch {}
    }});
  }, [videoId]); // eslint-disable-line
}

/* ── The interactive conversion block: details + questionnaire + gated calendar ── */
function FunnelForm({ token, brand, tz, daysAhead, prefill, watchPct = 0 }) {
  const ac = brand.accent || '#15803D';
  const [info, setInfo] = useState({ firstName: prefill.firstName, lastName: prefill.lastName, email: prefill.email, phone: prefill.phone });
  const [a, setA] = useState({ city: prefill.city, state: prefill.state, operated: prefill.operated, liquid: prefill.liquid, networth: prefill.networth });
  const setField = (k, v) => setA(s => ({ ...s, [k]: v }));

  const showOperated = a.city.trim() && a.state.trim();
  const showLiquid   = showOperated && a.operated;
  const showNet      = showLiquid && a.liquid;
  const complete     = !!(a.city.trim() && a.state.trim() && a.operated && a.liquid && a.networth);

  const saveTimer = useRef(null);
  useEffect(() => {
    if (!token) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch('/api/watch/questionnaire', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, city: a.city, state: a.state, operatedBusiness: a.operated, liquidCapital: a.liquid, netWorth: a.networth }) }).catch(() => {});
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [a, token]);

  const [days] = useState(() => workdays(daysAhead));
  const [selDate, setSelDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selSlot, setSelSlot] = useState(null);
  const [booking, setBooking] = useState(false);
  const [bookErr, setBookErr] = useState('');
  const [booked, setBooked] = useState(null);
  const calRef = useRef(null);

  const fetchSlots = useCallback(async (dateStr) => {
    setSlotsLoading(true); setSlots([]);
    try { const r = await fetch(`/api/availability?date=${dateStr}&brand=${brand.slug}`); const d = await r.json(); setSlots(d.slots || []); }
    catch { setSlots([]); }
    setSlotsLoading(false);
  }, [brand.slug]);

  useEffect(() => { if (complete && !selDate && days.length) { setSelDate(days[0]); fetchSlots(days[0].dateStr); } }, [complete, days, selDate, fetchSlots]);
  useEffect(() => { if (complete) setTimeout(() => calRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80); }, [complete]);

  const canBook = info.firstName.trim() && info.email.trim() && (info.phone || '').trim() && selSlot && selDate;

  async function book() {
    if (!canBook) return;
    setBooking(true); setBookErr('');
    try {
      const r = await fetch('/api/book', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: info.firstName, lastName: info.lastName, email: info.email, phone: info.phone,
          date: selDate.dateStr, h: selSlot.h, m: selSlot.m, label: selSlot.label, brand: brand.slug, lead_id: token,
          source: 'watch_funnel', liquid_capital: a.liquid, investment_level: a.liquid }) });
      const d = await r.json();
      if (d.success) setBooked({ date: selDate, slot: selSlot });
      else setBookErr(d.error || 'Could not book. Please try another time.');
    } catch { setBookErr('Could not book. Please try again.'); }
    setBooking(false);
  }

  if (booked) {
    return (
      <div style={st.formCard}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: ac, margin: '0 0 8px' }}>🎉 You're all set!</h2>
        <p style={{ fontSize: 15, color: '#475569', margin: '0 0 16px' }}>We're excited to talk with you.</p>
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 15, marginBottom: 8 }}>📅 <strong style={{ color: ac }}>{DOW[new Date(booked.date.dateStr + 'T12:00').getDay()]}, {booked.date.mon} {booked.date.day}</strong> · {booked.slot.label} {tz}</div>
          <div style={{ fontSize: 15 }}>📞 <strong style={{ color: ac }}>We'll call you at:</strong> {info.phone}</div>
        </div>
        <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 14 }}>No video link needed — your consultant will call you by phone.</p>
      </div>
    );
  }

  return (
    <div style={st.formCard}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: '#7A5A00', textTransform: 'uppercase', marginBottom: 8 }}>Territory Availability</div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', margin: '0 0 6px', lineHeight: 1.1 }}>See if your market is still available.</h2>
      <p style={{ fontSize: 14.5, color: '#64748B', margin: '0 0 18px' }}>Answer a few quick questions below. If your market is open and there appears to be a fit, we'll show you the next step.</p>
      {watchPct >= 50 && !complete && (
        <div style={{ background: '#F0FDF4', border: `1px solid ${ac}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 14, color: '#166534', fontWeight: 600 }}>
          👏 You've seen the opportunity — finish the quick questions to check your market.
        </div>
      )}

      <div style={st.known}>
        <div style={st.knownLabel}>YOUR DETAILS</div>
        <div style={st.g2}>
          <Field label="First name" value={info.firstName} onChange={v => setInfo(s => ({ ...s, firstName: v }))} />
          <Field label="Last name"  value={info.lastName}  onChange={v => setInfo(s => ({ ...s, lastName: v }))} />
        </div>
        <div style={st.g2}>
          <Field label="Email" type="email" value={info.email} onChange={v => setInfo(s => ({ ...s, email: v }))} />
          <Field label="Phone" type="tel"  value={info.phone} onChange={v => setInfo(s => ({ ...s, phone: v }))} />
        </div>
      </div>

      <Q n={1} label="Where do you want to open your franchise?">
        <div style={st.g2}>
          <Field label="City"  value={a.city}  onChange={v => setField('city', v)} />
          <Field label="State" value={a.state} onChange={v => setField('state', v)} />
        </div>
      </Q>
      {showOperated && <Q n={2} label="Have you ever owned or operated a business before?"><Choices options={['yes', 'no']} labels={['Yes', 'No']} value={a.operated} onPick={v => setField('operated', v)} ac={ac} /></Q>}
      {showLiquid   && <Q n={3} label="How much liquid capital do you have to invest?"><Choices options={LIQUID} value={a.liquid} onPick={v => setField('liquid', v)} ac={ac} wrap /></Q>}
      {showNet      && <Q n={4} label="What's your estimated net worth?"><Choices options={NETWORTH} value={a.networth} onPick={v => setField('networth', v)} ac={ac} wrap /></Q>}

      {complete && (
        <div ref={calRef} style={{ marginTop: 24, paddingTop: 20, borderTop: '2px solid #F1F5F9' }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: '0 0 4px' }}>Pick a time to talk</h3>
          <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 12px' }}>{brand.meetingTitle} · we'll call you by phone.</p>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
            {days.map(d => {
              const on = selDate?.dateStr === d.dateStr;
              return (
                <button key={d.dateStr} onClick={() => { setSelDate(d); setSelSlot(null); fetchSlots(d.dateStr); }} style={{ ...st.day, ...(on ? { borderColor: ac, background: '#F0FDF4' } : {}) }}>
                  <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>{d.dow}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: on ? ac : '#0F172A' }}>{d.day}</div>
                  <div style={{ fontSize: 10, color: '#64748B' }}>{d.mon}</div>
                </button>
              );
            })}
          </div>
          {slotsLoading ? <div style={st.msg}>Loading times…</div> : slots.length === 0 ? <div style={st.msg}>No times available — try another day.</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8, marginTop: 6 }}>
              {slots.map((sl, i) => {
                const on = selSlot?.h === sl.h && selSlot?.m === sl.m;
                return <button key={i} onClick={() => setSelSlot(sl)} style={{ ...st.slot, ...(on ? { borderColor: ac, background: ac, color: '#fff' } : {}) }}>{sl.label}</button>;
              })}
            </div>
          )}
          {selSlot && <button onClick={book} disabled={!canBook || booking} style={{ ...st.book, background: ac, opacity: (!canBook || booking) ? 0.6 : 1 }}>{booking ? 'Checking…' : 'Check My Territory →'}</button>}
          {bookErr && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 10 }}>{bookErr}</div>}
        </div>
      )}
    </div>
  );
}

export default function Watch(props) {
  const { brand, token, prefill } = props;
  const ac = brand.accent || '#15803D';
  const landing = getLanding(brand.slug);
  const [watchPct, setWatchPct] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  useWistia(brand.wistiaVideoId, prefill.email, token, setWatchPct);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 480);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const scrollToForm = () => document.getElementById('territory')?.scrollIntoView({ behavior: 'smooth' });

  // Sticky "next step" bar — appears once they scroll past the video or hit 40% watched.
  const sticky = (scrolled || watchPct >= 40) ? (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60, background: '#0F151C', padding: '11px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12, boxShadow: '0 -4px 22px rgba(0,0,0,.22)' }}>
      <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Is your market still available?</span>
      <button onClick={scrollToForm} style={{ background: ac, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Check My Territory →</button>
    </div>
  ) : null;

  if (landing) {
    const html = landing.html.replace(/__WISTIA_ID__/g, brand.wistiaVideoId || '');
    const [before, after] = html.split('<!--KANSO_FORM-->');
    return (
      <>
        <Head>
          <title>{brand.name} — Franchise Opportunity</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
        </Head>
        <style dangerouslySetInnerHTML={{ __html: landing.css }} />
        <div style={{ paddingBottom: 68 }}>
          <div dangerouslySetInnerHTML={{ __html: before || '' }} />
          <section className="band on-tint close-tight" id="territory">
            <div className="wrap" style={{ maxWidth: 640 }}>
              <FunnelForm {...props} watchPct={watchPct} />
            </div>
          </section>
          <div dangerouslySetInnerHTML={{ __html: after || '' }} />
        </div>
        {sticky}
      </>
    );
  }

  // Simple funnel (brands without a custom landing)
  return (
    <>
      <Head><title>{brand.name} — Watch &amp; Book</title></Head>
      <style>{`* { box-sizing: border-box } body { margin:0; background:#EEF1F5 }`}</style>
      <div style={st.page}>
        <div style={st.card}>
          {brand.wistiaVideoId ? (
            <div style={st.videoWrap} dangerouslySetInnerHTML={{ __html: `<wistia-player media-id="${brand.wistiaVideoId}" aspect="1.7777777777777777" style="width:100%;height:100%;display:block"></wistia-player>` }} />
          ) : (
            <div style={{ ...st.videoWrap, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 14 }}>Video coming soon</div>
          )}
          <div style={{ padding: '22px 22px 30px' }} id="territory"><FunnelForm {...props} watchPct={watchPct} /></div>
        </div>
      </div>
      {sticky}
    </>
  );
}

/* ── small components ── */
function Field({ label, value, onChange, type = 'text' }) {
  return (<div><label style={st.fieldLabel}>{label}</label><input style={st.input} type={type} value={value} onChange={e => onChange(e.target.value)} /></div>);
}
function Q({ n, label, children }) {
  return (<div style={{ marginTop: 18 }}><div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 9 }}>{n}. {label}</div>{children}</div>);
}
function Choices({ options, labels, value, onPick, ac, wrap }) {
  return (
    <div style={{ display: 'flex', flexWrap: wrap ? 'wrap' : 'nowrap', gap: 8 }}>
      {options.map((opt, i) => {
        const on = value === opt;
        return <button key={opt} onClick={() => onPick(opt)} style={{ padding: '10px 16px', borderRadius: 10, border: `1.5px solid ${on ? ac : '#CBD5E1'}`, background: on ? ac : '#fff', color: on ? '#fff' : '#334155', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{labels ? labels[i] : opt}</button>;
      })}
    </div>
  );
}

const st = {
  page: { minHeight: '100vh', background: '#EEF1F5', display: 'flex', justifyContent: 'center', padding: '18px 12px', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },
  card: { width: '100%', maxWidth: 620, background: '#fff', borderRadius: 16, boxShadow: '0 2px 24px rgba(15,23,42,.10)', overflow: 'hidden', alignSelf: 'flex-start' },
  videoWrap: { position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#0F172A' },
  formCard: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '24px 22px', boxShadow: '0 2px 20px rgba(15,23,42,.06)', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },
  known: { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px', marginBottom: 4 },
  knownLabel: { fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.05em', marginBottom: 8 },
  g2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 4 },
  fieldLabel: { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', margin: '6px 0 4px' },
  input: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', color: '#0F172A' },
  msg: { padding: '16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 },
  day: { flexShrink: 0, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid #E2E8F0', background: '#fff', fontFamily: 'inherit' },
  slot: { padding: '10px 4px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, textAlign: 'center', border: '1px solid #E2E8F0', background: '#fff', color: '#0F172A' },
  book: { width: '100%', marginTop: 16, padding: '13px 0', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
};
