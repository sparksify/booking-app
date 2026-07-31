import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { getSupabaseAdmin } from '@/lib/supabase';

/* ─── Segment options ─────────────────────────────────────────────────────── */
const LIQUID = ['Under $50k', '$50k – $100k', '$100k – $250k', '$250k – $500k', '$500k+'];
const NETWORTH = ['Under $100k', '$100k – $250k', '$250k – $500k', '$500k – $1M', '$1M+'];

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

/* ─── Calendar helpers ────────────────────────────────────────────────────── */
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function workdays(n) {
  const out = []; const d = new Date(); let guard = 0;
  while (out.length < n && guard < n * 3) {
    guard++; d.setDate(d.getDate() + 1);
    const dow = d.getDay(); if (dow === 0 || dow === 6) continue;
    out.push({ dateStr: d.toISOString().slice(0, 10), dow: DOW[dow], mon: MON[d.getMonth()], day: d.getDate() });
  }
  return out;
}

export default function Watch({ token, brand, tz, daysAhead, prefill }) {
  const ac = brand.accent || '#15803D';
  const [info, setInfo] = useState({ firstName: prefill.firstName, lastName: prefill.lastName, email: prefill.email, phone: prefill.phone });
  const [a, setA] = useState({ city: prefill.city, state: prefill.state, operated: prefill.operated, liquid: prefill.liquid, networth: prefill.networth });
  const setField = (k, v) => setA(s => ({ ...s, [k]: v }));

  // Progressive reveal
  const showOperated = a.city.trim() && a.state.trim();
  const showLiquid   = showOperated && a.operated;
  const showNet      = showLiquid && a.liquid;
  const complete     = !!(a.city.trim() && a.state.trim() && a.operated && a.liquid && a.networth);

  // Autosave questionnaire (debounced)
  const saveTimer = useRef(null);
  useEffect(() => {
    if (!token) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch('/api/watch/questionnaire', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, city: a.city, state: a.state, operatedBusiness: a.operated, liquidCapital: a.liquid, netWorth: a.networth }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [a, token]);

  /* ── Wistia (new web-component player): identity tag + watch tracking ── */
  useEffect(() => {
    const id = brand.wistiaVideoId;
    if (!id) return;
    // player.js runtime (once) + this media's module script.
    if (!document.getElementById('wistia-player-js')) {
      const p = document.createElement('script'); p.id = 'wistia-player-js'; p.src = 'https://fast.wistia.com/player.js'; p.async = true;
      document.body.appendChild(p);
    }
    const mid = `wistia-media-${id}`;
    if (!document.getElementById(mid)) {
      const m = document.createElement('script'); m.id = mid; m.src = `https://fast.wistia.com/embed/${id}.js`; m.async = true; m.type = 'module';
      document.body.appendChild(m);
    }
    // The JS Player API (_wq) still works with player.js — use it for email
    // identity tagging + watch-progress tracking.
    window._wq = window._wq || [];
    let lastSent = 0;
    window._wq.push({ id, onReady: (video) => {
      try { if (info.email) video.email(info.email); } catch {}
      try {
        video.bind('percentwatchedchanged', (pct) => {
          const p = Math.round((pct || 0) * 100);
          if (p - lastSent >= 5 || p >= 95) {
            lastSent = p;
            fetch('/api/watch/track', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, pct: p, seconds: Math.round(video.secondsWatched?.() || 0) }) }).catch(() => {});
          }
        });
      } catch {}
    }});
  }, [brand.wistiaVideoId]); // eslint-disable-line

  /* ── Booking calendar (revealed after questionnaire) ── */
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
    try {
      const r = await fetch(`/api/availability?date=${dateStr}&brand=${brand.slug}`);
      const d = await r.json();
      setSlots(d.slots || []);
    } catch { setSlots([]); }
    setSlotsLoading(false);
  }, [brand.slug]);

  useEffect(() => {
    if (complete && !selDate && days.length) { setSelDate(days[0]); fetchSlots(days[0].dateStr); }
  }, [complete, days, selDate, fetchSlots]);

  useEffect(() => { if (complete) setTimeout(() => calRef.current?.scrollIntoView({ behavior: 'smooth' }), 80); }, [complete]);

  const canBook = info.firstName.trim() && info.email.trim() && (info.phone || '').trim() && selSlot && selDate;

  async function book() {
    if (!canBook) return;
    setBooking(true); setBookErr('');
    try {
      const r = await fetch('/api/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: info.firstName, lastName: info.lastName, email: info.email, phone: info.phone,
          date: selDate.dateStr, h: selSlot.h, m: selSlot.m, label: selSlot.label,
          brand: brand.slug, lead_id: token, source: 'watch_funnel',
          liquid_capital: a.liquid, investment_level: a.liquid,
        }),
      });
      const d = await r.json();
      if (d.success) setBooked({ date: selDate, slot: selSlot });
      else setBookErr(d.error || 'Could not book. Please try another time.');
    } catch { setBookErr('Could not book. Please try again.'); }
    setBooking(false);
  }

  if (booked) {
    return (
      <>
        <Head><title>Booked — {brand.name}</title></Head>
        <div style={{ ...st.page, '--ac': ac }}>
          <div style={st.card}>
            <div style={{ textAlign: 'center', padding: '44px 28px' }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: ac, marginBottom: 10 }}>🎉 You're all set!</h1>
              <p style={{ fontSize: 15, color: '#475569', marginBottom: 20 }}>We're excited to talk with you.</p>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 18px', textAlign: 'left' }}>
                <div style={{ fontSize: 15, marginBottom: 8 }}>📅 <strong style={{ color: ac }}>{DOW[new Date(booked.date.dateStr + 'T12:00').getDay()]}, {booked.date.mon} {booked.date.day}</strong> · {booked.slot.label} {tz}</div>
                <div style={{ fontSize: 15 }}>📞 <strong style={{ color: ac }}>We'll call you at:</strong> {info.phone}</div>
              </div>
              <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 18 }}>No video link needed — your consultant will call you by phone.</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head><title>{brand.name} — Watch &amp; Book</title></Head>
      <style>{`* { box-sizing: border-box } body { margin:0; background:#EEF1F5 }`}</style>
      <div style={{ ...st.page, '--ac': ac }}>
        <div style={st.card}>
          {/* Video (Wistia web-component player) */}
          {brand.wistiaVideoId ? (
            <div style={st.videoWrap}
              dangerouslySetInnerHTML={{ __html: `<wistia-player media-id="${brand.wistiaVideoId}" aspect="1.7777777777777777" style="width:100%;height:100%;display:block"></wistia-player>` }} />
          ) : (
            <div style={{ ...st.videoWrap, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 14 }}>Video coming soon</div>
          )}

          <div style={{ padding: '22px 24px 32px' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: '0 0 4px' }}>A few quick questions</h1>
            <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 20px' }}>So we can make the most of our call. Then pick a time that works for you.</p>

            {/* Known info (pre-filled) */}
            <div style={st.knownBox}>
              <div style={st.knownLabel}>YOUR DETAILS</div>
              <div style={st.grid2}>
                <Field label="First name" value={info.firstName} onChange={v => setInfo(s => ({ ...s, firstName: v }))} />
                <Field label="Last name"  value={info.lastName}  onChange={v => setInfo(s => ({ ...s, lastName: v }))} />
              </div>
              <div style={st.grid2}>
                <Field label="Email" value={info.email} onChange={v => setInfo(s => ({ ...s, email: v }))} type="email" />
                <Field label="Phone" value={info.phone} onChange={v => setInfo(s => ({ ...s, phone: v }))} type="tel" />
              </div>
            </div>

            {/* Q1 city/state */}
            <Q n={1} label="Where do you want to open your franchise?">
              <div style={st.grid2}>
                <Field label="City"  value={a.city}  onChange={v => setField('city', v)} />
                <Field label="State" value={a.state} onChange={v => setField('state', v)} />
              </div>
            </Q>

            {/* Q2 operated business */}
            {showOperated && (
              <Q n={2} label="Have you ever owned or operated a business before?">
                <Choices options={['yes', 'no']} labels={['Yes', 'No']} value={a.operated} onPick={v => setField('operated', v)} ac={ac} />
              </Q>
            )}

            {/* Q3 liquid capital */}
            {showLiquid && (
              <Q n={3} label="How much liquid capital do you have available to invest?">
                <Choices options={LIQUID} value={a.liquid} onPick={v => setField('liquid', v)} ac={ac} wrap />
              </Q>
            )}

            {/* Q4 net worth */}
            {showNet && (
              <Q n={4} label="What's your estimated net worth?">
                <Choices options={NETWORTH} value={a.networth} onPick={v => setField('networth', v)} ac={ac} wrap />
              </Q>
            )}

            {/* Calendar — only after all questions answered */}
            {complete && (
              <div ref={calRef} style={{ marginTop: 26, paddingTop: 22, borderTop: '2px solid #F1F5F9' }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', margin: '0 0 4px' }}>Pick a time to talk</h2>
                <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 14px' }}>{brand.meetingTitle} · we'll call you by phone.</p>

                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10 }}>
                  {days.map(d => {
                    const on = selDate?.dateStr === d.dateStr;
                    return (
                      <button key={d.dateStr} onClick={() => { setSelDate(d); setSelSlot(null); fetchSlots(d.dateStr); }}
                        style={{ ...st.dayChip, ...(on ? { borderColor: ac, background: '#F0FDF4' } : {}) }}>
                        <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>{d.dow}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: on ? ac : '#0F172A' }}>{d.day}</div>
                        <div style={{ fontSize: 10, color: '#64748B' }}>{d.mon}</div>
                      </button>
                    );
                  })}
                </div>

                {slotsLoading ? <div style={st.msg}>Loading times…</div> : slots.length === 0 ? <div style={st.msg}>No times available — try another day.</div> : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8, marginTop: 8 }}>
                    {slots.map((sl, i) => {
                      const on = selSlot?.h === sl.h && selSlot?.m === sl.m;
                      return (
                        <button key={i} onClick={() => setSelSlot(sl)}
                          style={{ ...st.slot, ...(on ? { borderColor: ac, background: ac, color: '#fff' } : {}) }}>{sl.label}</button>
                      );
                    })}
                  </div>
                )}

                {selSlot && (
                  <button onClick={book} disabled={!canBook || booking}
                    style={{ ...st.bookBtn, background: ac, opacity: (!canBook || booking) ? 0.6 : 1 }}>
                    {booking ? 'Booking…' : `Book my call — ${selSlot.label}`}
                  </button>
                )}
                {bookErr && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 10 }}>{bookErr}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Small components ────────────────────────────────────────────────────── */
function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label style={st.fieldLabel}>{label}</label>
      <input style={st.input} type={type} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
function Q({ n, label, children }) {
  return (
    <div style={{ marginTop: 20, animation: 'none' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>{n}. {label}</div>
      {children}
    </div>
  );
}
function Choices({ options, labels, value, onPick, ac, wrap }) {
  return (
    <div style={{ display: 'flex', flexWrap: wrap ? 'wrap' : 'nowrap', gap: 8 }}>
      {options.map((opt, i) => {
        const on = value === opt;
        return (
          <button key={opt} onClick={() => onPick(opt)}
            style={{ padding: '10px 16px', borderRadius: 10, border: `1.5px solid ${on ? ac : '#CBD5E1'}`, background: on ? ac : '#fff', color: on ? '#fff' : '#334155', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {labels ? labels[i] : opt}
          </button>
        );
      })}
    </div>
  );
}

const st = {
  page: { minHeight: '100vh', background: '#EEF1F5', display: 'flex', justifyContent: 'center', padding: '18px 12px', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },
  card: { width: '100%', maxWidth: 620, background: '#fff', borderRadius: 16, boxShadow: '0 2px 24px rgba(15,23,42,.10)', overflow: 'hidden', alignSelf: 'flex-start' },
  videoWrap: { position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#0F172A' },
  knownBox: { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px', marginBottom: 6 },
  knownLabel: { fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.05em', marginBottom: 8 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 4 },
  fieldLabel: { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', margin: '6px 0 4px' },
  input: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', color: '#0F172A' },
  msg: { padding: '18px', textAlign: 'center', color: '#94A3B8', fontSize: 13 },
  dayChip: { flexShrink: 0, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid #E2E8F0', background: '#fff', fontFamily: 'inherit' },
  slot: { padding: '10px 4px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, textAlign: 'center', border: '1px solid #E2E8F0', background: '#fff', color: '#0F172A' },
  bookBtn: { width: '100%', marginTop: 16, padding: '13px 0', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
};
