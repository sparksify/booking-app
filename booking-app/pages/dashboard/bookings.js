import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import Head from 'next/head';
import Link from 'next/link';
import { authOptions } from '../api/auth/[...nextauth]';

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) return { redirect: { destination: '/dashboard/login', permanent: false } };

  const { getSupabaseAdmin } = await import('@/lib/supabase');
  const supabase = getSupabaseAdmin();
  const { data: settingsRow } = await supabase
    .from('settings').select('brand_pitches').eq('id', 1).single();

  return { props: { session, brandPitches: settingsRow?.brand_pitches || {} } };
}

const FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'Next 2 Weeks' },
  { key: 'all',   label: 'All' },
];

const STATUS_META = {
  scheduled: { label: 'Scheduled',  color: '#0077C5', bg: '#E0EFF9', dot: '#0077C5' },
  showed:    { label: 'Showed',     color: '#1A7E24', bg: '#E3F4E5', dot: '#2CA01C' },
  'no-show': { label: 'No Show',    color: '#C23934', bg: '#FDECEA', dot: '#D4351B' },
  closed:    { label: 'Closed Won', color: '#5C35A8', bg: '#EEE9FA', dot: '#6B37BF' },
};

// ── Demo data ─────────────────────────────────────────────────────────────────
const DEMO = [
  {
    id: 'd1', first_name: 'Marcus', last_name: 'Thompson', email: 'marcus.t@email.com',
    phone: '(512) 555-0192',
    slot_start: (() => { const d = new Date(); d.setHours(9, 0); return d.toISOString(); })(),
    status: 'scheduled', investment_level: '$100k–$200k', assigned_to_email: 'steve@sparksify.com',
    meet_link: 'https://meet.google.com/abc-defg-hij',
  },
  {
    id: 'd2', first_name: 'Jennifer', last_name: 'Caldwell', email: 'jcaldwell@gmail.com',
    phone: '(214) 555-0847',
    slot_start: (() => { const d = new Date(); d.setHours(10, 30); return d.toISOString(); })(),
    status: 'showed', investment_level: '$50k–$100k', assigned_to_email: 'steve@sparksify.com',
    meet_link: null,
  },
  {
    id: 'd3', first_name: 'Robert', last_name: 'Kim', email: 'rob.kim@outlook.com',
    phone: '(713) 555-0334',
    slot_start: (() => { const d = new Date(); d.setHours(11, 45); return d.toISOString(); })(),
    status: 'no-show', investment_level: '$200k+', assigned_to_email: 'steve@sparksify.com',
    meet_link: null,
  },
  {
    id: 'd4', first_name: 'Angela', last_name: 'Rivera', email: 'angela.r@company.com',
    phone: '(469) 555-0561',
    slot_start: (() => { const d = new Date(); d.setHours(13, 0); return d.toISOString(); })(),
    status: 'closed', investment_level: '$100k–$200k', assigned_to_email: 'steve@sparksify.com',
    meet_link: 'https://meet.google.com/xyz-uvwx-rst',
  },
  {
    id: 'd5', first_name: 'David', last_name: 'Nguyen', email: 'dnguyen@email.com',
    phone: '(281) 555-0729',
    slot_start: (() => { const d = new Date(); d.setHours(14, 30); return d.toISOString(); })(),
    status: 'scheduled', investment_level: '$50k–$100k', assigned_to_email: 'steve@sparksify.com',
    meet_link: 'https://meet.google.com/lmn-opqr-stu',
  },
];

// ── Demo lead detail ──────────────────────────────────────────────────────────
function makeDemoLead(booking) {
  return {
    id: booking.id,
    first_name: booking.first_name,
    last_name:  booking.last_name,
    email:      booking.email,
    phone:      booking.phone,
    investment_level: booking.investment_level,
    status:     booking.status,
    franchise_interests: [
      { id: 'fi1', brand: 'Wet Fuel', developer_name: 'Janet Okafor', developer_phone: '(972) 555-0182', developer_email: 'janet.okafor@wetfuel.com' },
      { id: 'fi2', brand: 'Squeeze House', developer_name: 'Marcus Webb', developer_phone: '(214) 555-0299', developer_email: 'mwebb@squeezehouse.com' },
    ],
    notes:            'Very motivated buyer. Has previous business ownership experience. Interested in multi-unit.',
    raw_fields: {
      liquid_capital_to_get_started:                       '$100,000 – $250,000',
      have_you_ever_owned_or_managed_a_business_before:    'Yes',
    },
    bookings:    [booking],
    created_at:  new Date().toISOString(),
  };
}

// Helper — search raw_fields by keyword match
function getField(raw, ...keys) {
  if (!raw) return null;
  for (const key of keys) {
    const slug = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = Object.entries(raw).find(([k]) =>
      k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(slug)
    );
    if (found) return found[1];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function BookingsDashboard({ brandPitches = {} }) {
  const { data: session } = useSession();
  const [filter,   setFilter]   = useState('week');
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [updating, setUpdating] = useState({});
  const [isDemo,   setIsDemo]   = useState(false);

  // Panel state
  const [panelBooking, setPanelBooking] = useState(null);
  const [lead,         setLead]         = useState(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelOpen,    setPanelOpen]    = useState(false); // drives animation

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/dashboard/bookings?filter=${filter}`)
      .then(r => r.json())
      .then(d => {
        const real = d.bookings || [];
        if (real.length === 0) { setBookings(DEMO); setIsDemo(true); }
        else                   { setBookings(real); setIsDemo(false); }
        setLoading(false);
      })
      .catch(() => { setBookings(DEMO); setIsDemo(true); setLoading(false); });
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Close panel on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') closePanel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  function openPanel(booking) {
    setPanelBooking(booking);
    setLead(null);
    setPanelOpen(true);

    if (isDemo) {
      setLead(makeDemoLead(booking));
      return;
    }
    setPanelLoading(true);
    fetch(`/api/dashboard/lead-detail?email=${encodeURIComponent(booking.email)}`)
      .then(r => r.json())
      .then(d => { setLead(d.lead); setPanelLoading(false); })
      .catch(() => setPanelLoading(false));
  }

  function closePanel() {
    setPanelOpen(false);
    setTimeout(() => { setPanelBooking(null); setLead(null); }, 260);
  }

  async function updateStatus(booking, status) {
    if (isDemo) {
      setBookings(bs => bs.map(b => b.id === booking.id ? { ...b, status } : b));
      if (panelBooking?.id === booking.id) setPanelBooking(b => ({ ...b, status }));
      return;
    }
    setUpdating(u => ({ ...u, [booking.id]: true }));
    await fetch('/api/dashboard/update-booking-status', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bookingId: booking.id, email: booking.email, status }),
    }).catch(console.error);
    setBookings(bs => bs.map(b => b.id === booking.id ? { ...b, status } : b));
    if (panelBooking?.id === booking.id) setPanelBooking(b => ({ ...b, status }));
    setUpdating(u => ({ ...u, [booking.id]: false }));
  }

  const counts = bookings.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1; return acc;
  }, {});

  return (
    <>
      <Head><title>Bookings — FranchiseBook</title></Head>
      <div style={s.page}>

        {/* ── Header ── */}
        <header style={s.header}>
          <div style={s.headerLeft}>
            <span style={s.logo}>⬡ FranchiseBook</span>
            <nav style={s.nav}>
              <Link href="/dashboard/analytics"  style={s.navLink}>Analytics</Link>
              <Link href="/dashboard/bookings"   style={{ ...s.navLink, ...s.navActive }}>Bookings</Link>
              <Link href="/dashboard/leads"      style={s.navLink}>Leads</Link>
              <Link href="/dashboard/prospects"  style={s.navLink}>Prospecting</Link>
            </nav>
          </div>
          <div style={s.headerRight}>
            <Link href="/dashboard/settings" style={s.settingsLink}>⚙ Settings</Link>
            <span style={s.headerUser}>{session?.user?.email}</span>
          </div>
        </header>

        <div style={s.body}>
          {/* Title bar */}
          <div style={s.titleBar}>
            <div>
              <h1 style={s.pageTitle}>Bookings</h1>
              <p style={s.pageSubtitle}>Click any row to open the client panel</p>
            </div>
            <button onClick={load} style={s.refreshBtn}>↻ Refresh</button>
          </div>

          {/* Demo banner */}
          {isDemo && (
            <div style={s.demoBanner}>
              Preview mode — no real bookings found. Showing sample data. Click any row to try the panel.
            </div>
          )}

          {/* Summary cards */}
          <div style={s.summaryRow}>
            {[
              { label: 'Scheduled', key: 'scheduled', dot: '#0077C5' },
              { label: 'Showed',    key: 'showed',    dot: '#2CA01C' },
              { label: 'No Shows',  key: 'no-show',   dot: '#D4351B' },
              { label: 'Closed',    key: 'closed',    dot: '#6B37BF' },
            ].map(({ label, key, dot }) => (
              <div key={key} style={s.summaryCard}>
                <div style={{ ...s.summaryDot, background: dot }} />
                <div style={s.summaryNum}>{counts[key] || 0}</div>
                <div style={s.summaryLabel}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={s.tabBar}>
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{ ...s.tab, ...(filter === f.key ? s.tabActive : {}) }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Table */}
          <div style={s.card}>
            {loading ? (
              <div style={s.empty}>Loading…</div>
            ) : bookings.length === 0 ? (
              <div style={s.empty}>No bookings for this period.</div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr style={s.thead}>
                    {['Time', 'Client', 'Score', 'Investment', 'Consultant', 'Status', 'Actions'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const nowMs = Date.now();
                    let nowInserted = false;
                    return bookings.flatMap((b, i) => {
                      const slotMs = b.slot_start ? new Date(b.slot_start).getTime() : 0;
                      const inProgress = slotMs > 0 && slotMs <= nowMs && nowMs <= slotMs + 90 * 60_000;
                      const rows = [];
                      // Insert NOW divider before the first upcoming booking
                      if (!nowInserted && slotMs > nowMs) {
                        nowInserted = true;
                        rows.push(
                          <tr key="now-divider" style={{ background: 'transparent', pointerEvents: 'none' }}>
                            <td colSpan={7} style={{ padding: '2px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="bk-now-divider-dot" />
                                <div style={{ flex: 1, height: 1.5, background: '#EF4444', opacity: 0.5 }} />
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#EF4444', letterSpacing: '.05em', textTransform: 'uppercase', flexShrink: 0 }}>Now</span>
                                <div style={{ flex: 1, height: 1.5, background: '#EF4444', opacity: 0.5 }} />
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      rows.push(
                        <BookingRow
                          key={b.id}
                          booking={b}
                          striped={i % 2 === 1}
                          busy={!!updating[b.id]}
                          selected={panelBooking?.id === b.id}
                          onRowClick={() => openPanel(b)}
                          onStatus={status => updateStatus(b, status)}
                          inProgress={inProgress}
                        />
                      );
                      return rows;
                    });
                  })()}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── CRM Side Panel ── */}
        {panelBooking && (
          <CRMPanel
            booking={panelBooking}
            lead={lead}
            loading={panelLoading}
            open={panelOpen}
            isDemo={isDemo}
            brandPitches={brandPitches}
            onClose={closePanel}
            onStatusChange={status => updateStatus(panelBooking, status)}
          />
        )}
      </div>
    </>
  );
}

// ─── Table Row ────────────────────────────────────────────────────────────────

function BookingRow({ booking: b, striped, busy, selected, onRowClick, onStatus, inProgress }) {
  const slot      = b.slot_start ? new Date(b.slot_start) : null;
  const dateLabel = slot ? slot.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
  const timeLabel = slot ? slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  const meta      = STATUS_META[b.status] || STATUS_META.scheduled;

  const rowBg = selected ? '#EBF4FF' : inProgress ? '#F0FDF4' : striped ? '#F8F9FA' : '#FFFFFF';

  return (
    <tr
      style={{ ...s.tr, background: rowBg, cursor: 'pointer' }}
      onClick={onRowClick}
    >
      <td style={s.td}>
        <div style={{ fontWeight: 600, color: '#1A2B3C', fontSize: 13 }}>{timeLabel}</div>
        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{dateLabel}</div>
      </td>
      <td style={s.td}>
        <div style={{ fontWeight: 600, color: '#0077C5', fontSize: 13 }}>{b.first_name} {b.last_name}</div>
        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{b.email}</div>
      </td>
      <td style={s.td}>
        {b.health ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11 }}>{b.health.emoji}</span>
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: b.lead_score >= 75 ? '#1A7E24' : b.lead_score >= 50 ? '#856404' : '#C23934',
              }}>{b.lead_score ?? '—'}</span>
            </div>
            <div style={{ fontSize: 10, color: '#9CA3AF' }}>{b.show_probability ?? '—'}% show</div>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: '#C8CDD2' }}>—</span>
        )}
      </td>
      <td style={s.td}>
        <span style={{ fontSize: 11, color: '#4A5568', background: '#EAECEF', padding: '3px 8px', borderRadius: 3 }}>
          {b.investment_level || '—'}
        </span>
      </td>
      <td style={s.td}>
        <span style={{ fontSize: 13, color: '#4A5568' }}>
          {b.assigned_to_email ? b.assigned_to_email.split('@')[0] : '—'}
        </span>
      </td>
      <td style={s.td} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {inProgress && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              color: '#15803D', background: '#DCFCE7', border: '1px solid #BBF7D0',
            }}>
              <span className="in-progress-dot" />
              In progress
            </span>
          )}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            color: meta.color, background: meta.bg,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.dot, display: 'inline-block' }} />
            {meta.label}
          </span>
          {b.meet_link && (
            <a href={b.meet_link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              style={{ display: 'block', fontSize: 11, color: '#0077C5' }}>
              Join call →
            </a>
          )}
        </div>
      </td>
      <td style={s.td} onClick={e => e.stopPropagation()}>
        {busy ? (
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>Saving…</span>
        ) : b.status === 'scheduled' ? (
          <div style={{ display: 'flex', gap: 5 }}>
            <QBBtn variant="warning" onClick={() => onStatus('showed')}>Showed</QBBtn>
            <QBBtn variant="danger"  onClick={() => onStatus('no-show')}>No-Show</QBBtn>
          </div>
        ) : b.status === 'showed' ? (
          <QBBtn variant="primary" onClick={() => onStatus('closed')}>Close Won</QBBtn>
        ) : (
          <span style={{ fontSize: 12, color: '#C8CDD2' }}>—</span>
        )}
      </td>
    </tr>
  );
}

// ─── CRM Side Panel ───────────────────────────────────────────────────────────

function CRMPanel({ booking, lead, loading, open, isDemo, brandPitches = {}, onClose, onStatusChange }) {
  const [notes,        setNotes]        = useState('');
  const [interests,    setInterests]    = useState([]);  // franchise_interests array
  const [selectedIdx,  setSelectedIdx]  = useState(null);
  const [brandEditMode,setBrandEditMode]= useState(false);
  const [brandSaving,  setBrandSaving]  = useState(false);
  const [brandSaved,   setBrandSaved]   = useState(false);
  const [notesSaving,  setNotesSaving]  = useState(false);
  const [notesSaved,   setNotesSaved]   = useState(false);
  const [showEmail,    setShowEmail]    = useState(false);
  const [email,        setEmail]        = useState({ to: '', subject: '', body: '' });
  const [emailSent,    setEmailSent]    = useState(false);
  const [cqSent,       setCqSent]       = useState(!!booking?.cq_sent_at);
  const [cqReceived,   setCqReceived]   = useState(!!booking?.cq_received_at);
  const [cqRecvSaving, setCqRecvSaving] = useState(false);
  const [pitchOpen,    setPitchOpen]    = useState(false);
  const [pitchBrandIdx,setPitchBrandIdx]= useState(0);
  const [panelTab,     setPanelTab]     = useState('info');
  const [timeline,     setTimeline]     = useState([]);
  const [tlLoading,    setTlLoading]    = useState(false);

  // GHL tags
  const [ghlTags,        setGhlTags]        = useState([]);
  const [ghlTagsLoading, setGhlTagsLoading] = useState(false);
  const [newTagInput,    setNewTagInput]    = useState('');
  const [tagSaving,      setTagSaving]      = useState(false);

  // Follow-up modal
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [fuDate,       setFuDate]       = useState('');
  const [fuNote,       setFuNote]       = useState('');
  const [fuTemp,       setFuTemp]       = useState(3);
  const [fuSaving,     setFuSaving]     = useState(false);
  const [fuSaved,      setFuSaved]      = useState(false);

  const panelRef = useRef(null);

  useEffect(() => {
    if (lead) {
      setNotes(lead.notes || '');
      const fi = lead.franchise_interests || [];
      setInterests(fi);
      setSelectedIdx(fi.length > 0 ? 0 : null);
    }
  }, [lead]);

  // Sync CQ + tag + follow-up state when a different booking is opened
  useEffect(() => {
    setCqSent(!!booking?.cq_sent_at);
    setCqReceived(!!booking?.cq_received_at);
    // Reset tags
    setGhlTags([]);
    setNewTagInput('');
    setTagSaving(false);
    // Reset follow-up
    setShowFollowUp(false);
    setFuDate('');
    setFuNote('');
    setFuTemp(3);
    setFuSaved(false);
    // Fetch GHL tags
    if (!booking?.email || isDemo) {
      if (isDemo) setGhlTags(['hot-lead', 'franchise-ready']);
      return;
    }
    setGhlTagsLoading(true);
    fetch(`/api/dashboard/contact-tags?email=${encodeURIComponent(booking.email)}`)
      .then(r => r.json())
      .then(d => { setGhlTags(d.tags || []); setGhlTagsLoading(false); })
      .catch(() => setGhlTagsLoading(false));
  }, [booking?.id]);

  useEffect(() => {
    if (!open) {
      setShowEmail(false); setEmailSent(false); setPitchOpen(false); setBrandEditMode(false);
      setPanelTab('info'); setTimeline([]);
      setShowFollowUp(false); setFuSaved(false);
      setNewTagInput('');
    }
  }, [open]);

  function openTimeline() {
    setPanelTab('timeline');
    if (timeline.length > 0 || tlLoading) return;
    setTlLoading(true);
    fetch(`/api/lead-events?email=${encodeURIComponent(booking.email)}`)
      .then(r => r.json())
      .then(d => { setTimeline(d.events || []); setTlLoading(false); })
      .catch(() => setTlLoading(false));
  }

  const selectedFI = selectedIdx !== null ? interests[selectedIdx] : null;

  function updateInterest(idx, field, value) {
    setInterests(prev => prev.map((fi, i) => i === idx ? { ...fi, [field]: value } : fi));
    if (field === 'developer_email' && idx === selectedIdx) {
      setEmail(em => ({ ...em, to: value }));
    }
  }

  function addBrand() {
    const newFI = { id: `fi_${Date.now()}`, brand: '', developer_name: '', developer_phone: '', developer_email: '' };
    setInterests(prev => [...prev, newFI]);
    setSelectedIdx(interests.length);
  }

  function removeBrand(idx) {
    const updated = interests.filter((_, i) => i !== idx);
    setInterests(updated);
    const nextIdx = updated.length === 0 ? null : Math.min(idx, updated.length - 1);
    setSelectedIdx(nextIdx);
    saveInterestsToAPI(updated);
  }

  async function saveInterestsToAPI(data) {
    if (!lead || isDemo) return;
    await fetch('/api/dashboard/update-lead', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lead.id, franchise_interests: data }),
    }).catch(console.error);
  }

  async function saveBrand() {
    setBrandSaving(true);
    await saveInterestsToAPI(interests);
    setBrandSaving(false);
    setBrandSaved(true);
    setTimeout(() => setBrandSaved(false), 2000);
  }

  async function saveNotes() {
    if (!lead || isDemo) { setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000); return; }
    setNotesSaving(true);
    await fetch('/api/dashboard/update-lead', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lead.id, notes }),
    }).catch(console.error);
    setNotesSaving(false);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  }

  function sendEmail() {
    console.log('[email] sending to:', email.to, 'subject:', email.subject);
    setEmailSent(true);
    setTimeout(() => { setEmailSent(false); setShowEmail(false); }, 2500);
  }

  async function sendCQ() {
    if (isDemo) { setCqSent(true); return; }
    setCqSent(true);
    await fetch('/api/dashboard/send-cq', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bookingId: booking.id, email: booking.email }),
    }).catch(console.error);
  }

  async function markCQReceived() {
    if (isDemo) { setCqReceived(true); return; }
    setCqRecvSaving(true);
    await fetch('/api/dashboard/mark-cq-received', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bookingId: booking.id, email: booking.email }),
    }).catch(console.error);
    setCqReceived(true);
    setCqRecvSaving(false);
  }

  // ── GHL tag handlers ────────────────────────────────────────────────────────
  async function addTag(tag) {
    const clean = tag.trim();
    if (!clean || ghlTags.includes(clean)) return;
    setTagSaving(true);
    setGhlTags(prev => [...prev, clean]);
    setNewTagInput('');
    if (!isDemo) {
      await fetch('/api/dashboard/contact-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: booking.email, tags: [clean] }),
      }).catch(console.error);
    }
    setTagSaving(false);
  }

  async function removeTag(tag) {
    setGhlTags(prev => prev.filter(t => t !== tag));
    if (!isDemo) {
      await fetch('/api/dashboard/contact-tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: booking.email, tags: [tag] }),
      }).catch(console.error);
    }
  }

  // ── Follow-up handler ────────────────────────────────────────────────────────
  async function saveFollowUp() {
    setFuSaving(true);
    if (!isDemo) {
      await fetch('/api/dashboard/schedule-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: booking.id,
          email:      booking.email,
          follow_up_date: fuDate,
          note:        fuNote || null,
          temperature: fuTemp,
        }),
      }).catch(console.error);
    }
    setFuSaving(false);
    setFuSaved(true);
    setTimeout(() => { setFuSaved(false); setShowFollowUp(false); }, 2200);
  }

  const raw = lead?.raw_fields
    ? (typeof lead.raw_fields === 'string' ? JSON.parse(lead.raw_fields) : lead.raw_fields)
    : {};
  const liquidCapital = getField(raw, 'liquid_capital', 'liquid capital');
  const ownedBusiness = getField(raw, 'owned_business', 'owned or managed', 'managed a business', 'business before');

  // Territory / area of interest — structured if we have city/state, otherwise raw
  const territory = (() => {
    const city     = lead?.location_city;
    const state    = lead?.location_state;
    const zip      = lead?.location_zip;
    const areaCode = lead?.location_area_code;
    const locRaw   = lead?.location_raw;
    const fbRaw    = getField(raw, 'territory', 'area_of_interest', 'interested_area');
    if (city || state) {
      const primary = [city, state].filter(Boolean).join(', ');
      const sub     = zip || (areaCode ? `Area code ${areaCode}` : null);
      return { primary, sub };
    }
    const fallback = locRaw || fbRaw;
    return fallback ? { primary: fallback, sub: null } : null;
  })();

  const meta      = STATUS_META[booking.status] || STATUS_META.scheduled;
  const initials  = `${booking.first_name?.[0] || ''}${booking.last_name?.[0] || ''}`.toUpperCase();
  const slot      = booking.slot_start ? new Date(booking.slot_start) : null;
  const slotLabel = slot
    ? slot.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' · ' + slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '—';

  // Pitch modal data
  const pitchBrands = interests.filter(fi => fi.brand && brandPitches[fi.brand]);
  const pitchFI = pitchBrands[pitchBrandIdx] || pitchBrands[0];
  const pitchText = pitchFI ? brandPitches[pitchFI.brand] : null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.25)',
        zIndex: 100, opacity: open ? 1 : 0,
        transition: 'opacity .25s ease',
        pointerEvents: open ? 'auto' : 'none',
      }} />

      {/* Panel */}
      <div ref={panelRef} style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 440, background: '#fff',
        boxShadow: '-4px 0 24px rgba(0,0,0,.12)',
        zIndex: 101, display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform .25s cubic-bezier(.4,0,.2,1)',
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif",
      }}>

        {/* Panel header */}
        <div style={p.panelHdr}>
          <div style={p.avatar}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={p.clientName}>{booking.first_name} {booking.last_name}</div>
            <div style={p.clientEmail}>{booking.email}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ ...p.statusBadge, color: meta.color, background: meta.bg }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.dot, display: 'inline-block' }} />
                {meta.label}
              </span>
              {booking.health && (
                <span style={{ ...p.statusBadge, color: booking.health.color, background: booking.health.bg }}>
                  {booking.health.emoji} {booking.health.label} Confidence
                </span>
              )}
              {booking.lead_score != null && (
                <span style={{ fontSize: 11, color: '#6B7280' }}>
                  Score <strong style={{ color: booking.lead_score >= 75 ? '#1A7E24' : booking.lead_score >= 50 ? '#856404' : '#C23934' }}>{booking.lead_score}</strong>
                  {' · '}{booking.show_probability}% show prob
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={p.closeBtn} aria-label="Close">✕</button>
        </div>

        {/* Tab bar */}
        <div style={p.tabBar}>
          <button
            style={{ ...p.panelTab, ...(panelTab === 'info' ? p.panelTabActive : {}) }}
            onClick={() => setPanelTab('info')}
          >Info</button>
          <button
            style={{ ...p.panelTab, ...(panelTab === 'timeline' ? p.panelTabActive : {}) }}
            onClick={openTimeline}
          >Timeline</button>
        </div>

        {/* Scrollable body */}
        <div style={p.scrollBody}>
          {panelTab === 'timeline' ? (
            <TimelineView events={timeline} loading={tlLoading} bookingSource={booking.booking_source} />
          ) : loading ? (
            <div style={p.loadingMsg}>Loading client details…</div>
          ) : (
            <>
              {/* ── Contact ── */}
              <PanelSection title="Contact">
                <Row label="Phone">
                  <a href={`tel:${booking.phone}`} style={p.link}>{booking.phone || '—'}</a>
                </Row>
                <Row label="Email">
                  <a href={`mailto:${booking.email}`} style={p.link}>{booking.email}</a>
                </Row>
                {liquidCapital && (
                  <Row label="Liquid Cap.">
                    <span style={p.val}>{liquidCapital}</span>
                  </Row>
                )}
                {ownedBusiness && (
                  <Row label="Owned Biz">
                    <span style={p.val}>{ownedBusiness}</span>
                  </Row>
                )}
                {territory && (
                  <Row label="Territory">
                    <span style={p.val}>
                      {territory.primary}
                      {territory.sub && (
                        <span style={{ color: '#9CA3AF', fontSize: 11, marginLeft: 6 }}>{territory.sub}</span>
                      )}
                    </span>
                  </Row>
                )}

                {/* ── CQ tracking ── */}
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #F0F0F0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <QBBtn variant="cq" onClick={sendCQ} disabled={cqSent}>
                    {cqSent ? '✓ CQ Sent' : 'Send CQ'}
                  </QBBtn>
                  {cqSent && !cqReceived && (
                    <QBBtn variant="pitch" onClick={markCQReceived} disabled={cqRecvSaving}>
                      {cqRecvSaving ? 'Saving…' : 'Mark CQ Received'}
                    </QBBtn>
                  )}
                  {cqReceived && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 3, fontSize: 12, fontWeight: 600,
                      color: '#15803D', background: '#DCFCE7', border: '1px solid #BBF7D0',
                    }}>
                      ✓ CQ Received
                    </span>
                  )}
                </div>
                {/* CQ datestamp trail */}
                {(cqSent || cqReceived) && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600 }}>CQ Sent</span>
                    {booking.cq_sent_at && (
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                        {new Date(booking.cq_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {cqReceived && (
                      <>
                        <span style={{ fontSize: 10, color: '#D1D5DB' }}>→</span>
                        <span style={{ fontSize: 11, color: '#15803D', fontWeight: 600 }}>Received</span>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                          {booking.cq_received_at
                            ? new Date(booking.cq_received_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </PanelSection>

              {/* ── GHL Tags ── */}
              <PanelSection title="GHL Tags">
                {ghlTagsLoading ? (
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>Loading tags…</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: ghlTags.length ? 10 : 0 }}>
                      {ghlTags.length === 0 && (
                        <span style={{ fontSize: 12, color: '#9CA3AF' }}>No tags yet</span>
                      )}
                      {ghlTags.map(tag => (
                        <span key={tag} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 2,
                          background: '#EEF2FF', border: '1px solid #C7D2FE',
                          color: '#3730A3', borderRadius: 20,
                          padding: '2px 6px 2px 10px', fontSize: 11, fontWeight: 500,
                        }}>
                          {tag}
                          <button onClick={() => removeTag(tag)} style={{
                            background: 'none', border: 'none', color: '#818CF8',
                            cursor: 'pointer', fontSize: 15, lineHeight: 1,
                            padding: '0 2px', fontFamily: 'inherit',
                          }}>×</button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        style={{ ...p.input, flex: 1, padding: '5px 8px', fontSize: 12 }}
                        placeholder="Add tag…"
                        value={newTagInput}
                        onChange={e => setNewTagInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && newTagInput.trim()) addTag(newTagInput); }}
                      />
                      <button
                        onClick={() => addTag(newTagInput)}
                        disabled={!newTagInput.trim() || tagSaving}
                        style={{ ...p.editBtn, whiteSpace: 'nowrap', opacity: !newTagInput.trim() ? 0.5 : 1 }}
                      >
                        {tagSaving ? '…' : '+ Add'}
                      </button>
                    </div>
                  </>
                )}
              </PanelSection>

              {/* ── Booking ── */}
              <PanelSection title="Booking">
                <Row label="Scheduled">
                  <span style={p.val}>{slotLabel}</span>
                </Row>
                <Row label="Consultant">
                  <span style={p.val}>{booking.assigned_to_email || '—'}</span>
                </Row>
                {booking.meet_link && (
                  <Row label="Meet">
                    <a href={booking.meet_link} target="_blank" rel="noreferrer" style={p.link}>Join call →</a>
                  </Row>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {booking.status === 'scheduled' && (
                    <>
                      <QBBtn variant="warning" onClick={() => onStatusChange('showed')}>Mark Showed</QBBtn>
                      <QBBtn variant="danger"  onClick={() => onStatusChange('no-show')}>Mark No-Show</QBBtn>
                      <QBBtn variant="followup" onClick={() => setShowFollowUp(true)}>Follow Up</QBBtn>
                    </>
                  )}
                  {booking.status === 'showed' && (
                    <QBBtn variant="primary" onClick={() => onStatusChange('closed')}>Mark Closed Won</QBBtn>
                  )}
                </div>
              </PanelSection>

              {/* ── Franchise Brands ── */}
              <PanelSection title="Franchise Brands">
                {/* Brand chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: interests.length > 0 ? 14 : 0 }}>
                  {interests.map((fi, i) => (
                    <div key={fi.id || i} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                      <button
                        onClick={() => { setSelectedIdx(i); setBrandEditMode(false); }}
                        style={selectedIdx === i ? p.brandChipActive : p.brandChip}
                      >
                        {fi.brand || <em style={{ opacity: 0.6 }}>New Brand</em>}
                      </button>
                      <button
                        onClick={() => removeBrand(i)}
                        style={p.brandChipX}
                        title="Remove"
                      >×</button>
                    </div>
                  ))}
                  <button onClick={addBrand} style={p.addBrandBtn}>+ Brand</button>
                </div>

                {/* Selected brand detail */}
                {selectedFI && (
                  <div style={p.brandCard}>
                    {/* Card header row: brand name + action buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2B3C' }}>
                        {selectedFI.brand || <em style={{ color: '#9CA3AF', fontWeight: 400 }}>Unnamed brand</em>}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => { setPitchBrandIdx(interests.indexOf(selectedFI)); setPitchOpen(true); }}
                          style={{ ...p.editBtn, color: '#1A7E24', borderColor: '#A8D5AA', background: '#E3F4E5' }}
                        >
                          📞 Brand Pitch
                        </button>
                        {!brandEditMode
                          ? <button onClick={() => setBrandEditMode(true)} style={p.editBtn}>Edit</button>
                          : <>
                              <button onClick={async () => { await saveBrand(); setBrandEditMode(false); }}
                                disabled={brandSaving}
                                style={{ ...p.saveEditBtn, background: brandSaved ? '#2CA01C' : '#0077C5' }}>
                                {brandSaving ? 'Saving…' : brandSaved ? '✓' : 'Save'}
                              </button>
                              <button onClick={() => setBrandEditMode(false)} style={p.cancelEditBtn}>Cancel</button>
                            </>
                        }
                      </div>
                    </div>

                    {/* Brand / concept field */}
                    {brandEditMode ? (
                      <div style={{ marginBottom: 10 }}>
                        <label style={p.editLabel}>Brand / Concept</label>
                        <input style={p.input} placeholder="e.g. Wet Fuel"
                          value={selectedFI.brand || ''}
                          onChange={e => updateInterest(selectedIdx, 'brand', e.target.value)} />
                      </div>
                    ) : null}

                    {/* Developer info */}
                    <div style={p.fieldGroupLabel}>Developer</div>
                    {brandEditMode ? (
                      <>
                        <div style={{ marginBottom: 8 }}>
                          <input style={p.input} placeholder="Developer name"
                            value={selectedFI.developer_name || ''}
                            onChange={e => updateInterest(selectedIdx, 'developer_name', e.target.value)} />
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <input style={p.input} placeholder="(555) 000-0000"
                            value={selectedFI.developer_phone || ''}
                            onChange={e => updateInterest(selectedIdx, 'developer_phone', e.target.value)} />
                        </div>
                        <div style={{ marginBottom: 4 }}>
                          <input style={p.input} placeholder="developer@brand.com"
                            value={selectedFI.developer_email || ''}
                            onChange={e => updateInterest(selectedIdx, 'developer_email', e.target.value)} />
                        </div>
                      </>
                    ) : (
                      <>
                        <Row label="Name">
                          <span style={p.val}>{selectedFI.developer_name || <em style={{ color: '#9CA3AF' }}>Not set</em>}</span>
                        </Row>
                        <Row label="Phone">
                          {selectedFI.developer_phone
                            ? <a href={`tel:${selectedFI.developer_phone}`} style={p.link}>{selectedFI.developer_phone}</a>
                            : <em style={{ color: '#9CA3AF', fontSize: 13 }}>Not set</em>}
                        </Row>
                        <Row label="Email">
                          {selectedFI.developer_email
                            ? <a href={`mailto:${selectedFI.developer_email}`} style={p.link}>{selectedFI.developer_email}</a>
                            : <em style={{ color: '#9CA3AF', fontSize: 13 }}>Not set</em>}
                        </Row>
                      </>
                    )}
                  </div>
                )}

                {!selectedFI && interests.length === 0 && (
                  <div style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 8 }}>
                    No brands added yet — click + Brand to add one.
                  </div>
                )}

                {/* Email developer */}
                {selectedFI?.developer_email && (
                  <button onClick={() => setShowEmail(v => !v)} style={p.emailToggleBtn}>
                    ✉️ {showEmail ? 'Hide email' : 'Email developer'}
                  </button>
                )}

                {showEmail && selectedFI && (
                  <div style={p.emailBox}>
                    <div style={p.emailHeader}>New Email</div>
                    <div style={p.emailField}>
                      <span style={p.emailLabel}>To</span>
                      <input style={p.emailInput} value={email.to}
                        onChange={e => setEmail(em => ({ ...em, to: e.target.value }))}
                        placeholder="developer@brand.com" />
                    </div>
                    <div style={p.emailField}>
                      <span style={p.emailLabel}>Subject</span>
                      <input style={p.emailInput} value={email.subject}
                        onChange={e => setEmail(em => ({ ...em, subject: e.target.value }))}
                        placeholder={`Re: ${booking.first_name} ${booking.last_name}`} />
                    </div>
                    <textarea style={p.emailBody} rows={5} value={email.body}
                      onChange={e => setEmail(em => ({ ...em, body: e.target.value }))}
                      placeholder={`Hi ${selectedFI.developer_name || 'there'},\n\nI wanted to follow up regarding ${booking.first_name} ${booking.last_name}…`}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={sendEmail} disabled={!email.to || emailSent}
                        style={{ ...p.actionBtn, background: emailSent ? '#2CA01C' : '#0077C5', opacity: !email.to ? 0.5 : 1 }}>
                        {emailSent ? '✓ Sent!' : 'Send Email'}
                      </button>
                      <button onClick={() => setShowEmail(false)} style={p.cancelBtn}>Cancel</button>
                    </div>
                    {isDemo && (
                      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
                        Email integration coming soon — connect Resend to activate.
                      </p>
                    )}
                  </div>
                )}
              </PanelSection>

              {/* ── Notes ── */}
              <PanelSection title="Notes" bg="#FFFEF5">
                <textarea style={{ ...p.notesArea, background: '#FFFDF0' }} rows={5}
                  value={notes}
                  placeholder="Add notes about this client…"
                  onChange={e => setNotes(e.target.value)}
                />
                <div style={{ marginTop: 10 }}>
                  <button onClick={saveNotes} disabled={notesSaving}
                    style={{ ...p.actionBtn, background: notesSaved ? '#2CA01C' : '#0077C5' }}>
                    {notesSaving ? 'Saving…' : notesSaved ? '✓ Saved' : 'Save Notes'}
                  </button>
                </div>
              </PanelSection>
            </>
          )}
        </div>
      </div>

      {/* ── Follow-up Modal ── */}
      {showFollowUp && (
        <FollowUpModal
          booking={booking}
          fuDate={fuDate}       setFuDate={setFuDate}
          fuNote={fuNote}       setFuNote={setFuNote}
          fuTemp={fuTemp}       setFuTemp={setFuTemp}
          fuSaving={fuSaving}   fuSaved={fuSaved}
          onSave={saveFollowUp}
          onClose={() => setShowFollowUp(false)}
        />
      )}

      {/* ── Brand Pitch Modal ── */}
      {pitchOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }} onClick={() => setPitchOpen(false)}>
          <div style={{
            background: '#fff', borderRadius: 6, width: '100%', maxWidth: 520,
            boxShadow: '0 8px 40px rgba(0,0,0,.2)',
            fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif",
          }} onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #EBEBEB' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2B3C' }}>📞 Phone Pitch</div>
                {/* Brand tabs if multiple pitches */}
                {pitchBrands.length > 1 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {pitchBrands.map((fi, i) => (
                      <button key={fi.id} onClick={() => setPitchBrandIdx(i)}
                        style={i === pitchBrandIdx ? p.brandChipActive : p.brandChip}>
                        {fi.brand}
                      </button>
                    ))}
                  </div>
                )}
                {pitchFI && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{pitchFI.brand}</div>}
              </div>
              <button onClick={() => setPitchOpen(false)} style={p.closeBtn}>✕</button>
            </div>
            {/* Pitch body */}
            <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              {pitchText ? (
                <div style={{ fontSize: 14, color: '#1A2B3C', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {pitchText}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', padding: '20px 0' }}>
                  {interests.length === 0
                    ? 'No brands added to this lead yet.'
                    : `No pitch configured for ${interests[selectedIdx]?.brand || 'this brand'}.`}
                  <br />
                  <a href="/dashboard" style={{ color: '#0077C5', textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
                    Set up pitches in Settings →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Follow-up Modal ─────────────────────────────────────────────────────────

const TEMP_LABELS = ['', 'Cold', 'Cool', 'Warm', 'Hot', 'On Fire'];
const TEMP_COLORS = ['', '#60A5FA', '#22D3EE', '#F59E0B', '#F97316', '#EF4444'];
const TEMP_BG     = ['', '#EFF6FF', '#ECFEFF', '#FFFBEB', '#FFF7ED', '#FEF2F2'];

function FollowUpModal({ booking, fuDate, setFuDate, fuNote, setFuNote, fuTemp, setFuTemp, fuSaving, fuSaved, onSave, onClose }) {
  const today = new Date().toISOString().split('T')[0];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
        zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 8, width: '100%', maxWidth: 440,
          boxShadow: '0 12px 48px rgba(0,0,0,.22)',
          fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif",
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #EBEBEB' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1A2B3C' }}>Schedule Follow-up</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
              {booking.first_name} {booking.last_name} · {booking.email}
            </div>
          </div>
          <button onClick={onClose} style={p.closeBtn}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px 24px' }}>
          {fuSaved ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 40 }}>✓</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#15803D', marginTop: 10 }}>Follow-up scheduled!</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>Added to your queue for {fuDate}</div>
            </div>
          ) : (
            <>
              {/* Date */}
              <div style={{ marginBottom: 18 }}>
                <label style={p.editLabel}>Follow-up Date</label>
                <input
                  type="date"
                  min={today}
                  style={{ ...p.input, marginTop: 5, fontSize: 14 }}
                  value={fuDate}
                  onChange={e => setFuDate(e.target.value)}
                />
              </div>

              {/* Temperature — star rating */}
              <div style={{ marginBottom: 18 }}>
                <label style={p.editLabel}>Likelihood to Engage</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setFuTemp(n)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 30, lineHeight: 1, padding: '0 2px',
                      color: fuTemp >= n ? TEMP_COLORS[fuTemp] : '#D1D5DB',
                      transition: 'color .12s, transform .1s',
                      transform: fuTemp === n ? 'scale(1.2)' : 'scale(1)',
                    }}>★</button>
                  ))}
                </div>
                <div style={{
                  marginTop: 6, textAlign: 'center', fontSize: 12, fontWeight: 700,
                  color: TEMP_COLORS[fuTemp],
                  background: TEMP_BG[fuTemp],
                  borderRadius: 20, padding: '3px 12px', display: 'inline-block',
                  margin: '6px auto 0', width: '100%',
                }}>
                  {TEMP_LABELS[fuTemp]}
                </div>
              </div>

              {/* Note */}
              <div style={{ marginBottom: 22 }}>
                <label style={p.editLabel}>Why follow up?</label>
                <textarea
                  style={{ ...p.notesArea, marginTop: 5, fontSize: 13 }}
                  rows={3}
                  placeholder="e.g. Wants to revisit after talking to spouse. Interested in multi-unit Pilates Addiction."
                  value={fuNote}
                  onChange={e => setFuNote(e.target.value)}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={onSave}
                  disabled={!fuDate || fuSaving}
                  style={{
                    ...p.actionBtn,
                    flex: 1,
                    background: !fuDate ? '#9CA3AF' : '#0077C5',
                    cursor: !fuDate ? 'not-allowed' : 'pointer',
                  }}
                >
                  {fuSaving ? 'Scheduling…' : 'Schedule Follow-up'}
                </button>
                <button onClick={onClose} style={p.cancelBtn}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Panel helper components ──────────────────────────────────────────────────

function PanelSection({ title, bg, editMode, onEdit, onSave, onCancel, saving, saved, children }) {
  const hasEdit = onEdit !== undefined;
  return (
    <div style={{ ...p.section, ...(bg ? { background: bg } : {}) }}>
      <div style={p.sectionHdrRow}>
        <div style={p.sectionTitle}>{title}</div>
        {hasEdit && !editMode && (
          <button onClick={onEdit} style={p.editBtn}>Edit</button>
        )}
        {hasEdit && editMode && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onSave} disabled={saving}
              style={{ ...p.saveEditBtn, background: saved ? '#2CA01C' : '#0077C5' }}>
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
            </button>
            <button onClick={onCancel} style={p.cancelEditBtn}>Cancel</button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={p.row}>
      {label && <span style={p.rowLabel}>{label}</span>}
      <span style={p.rowVal}>{children}</span>
    </div>
  );
}

function EditRow({ label, children }) {
  return (
    <div style={p.editRow}>
      <label style={p.editLabel}>{label}</label>
      {children}
    </div>
  );
}

// ─── Timeline View ────────────────────────────────────────────────────────────

const EVENT_META = {
  lead_submitted:            { label: 'Lead Submitted',            color: '#9CA3AF' },
  ghl_contact_created:       { label: 'CRM Contact Created',       color: '#9CA3AF' },
  closebot_engaged:          { label: 'CloseBot Engaged',          color: '#7C3AED' },
  booking_page_viewed:       { label: 'Booking Page Viewed',       color: '#3B82F6' },
  recommended_slot_shown:    { label: 'Recommended Slot Shown',    color: '#3B82F6' },
  recommended_slot_accepted: { label: 'Slot Recommendation Taken', color: '#16A34A' },
  recommended_slot_rejected: { label: 'Slot Recommendation Skipped', color: '#D97706' },
  slot_selected:             { label: 'Slot Selected',             color: '#3B82F6' },
  appointment_booked:        { label: 'Appointment Booked',        color: '#16A34A' },
  confirmation_email_sent:   { label: 'Confirmation Email Sent',   color: '#9CA3AF' },
  calendar_add_clicked:      { label: 'Calendar Add Clicked',      color: '#3B82F6' },
  cq_email_sent:             { label: 'CQ Sent',                   color: '#7C3AED' },
  cq_received:               { label: 'CQ Received',               color: '#15803D' },
  appointment_showed:        { label: 'Showed Up',                 color: '#16A34A' },
  appointment_no_show:       { label: 'No Show',                   color: '#DC2626' },
  opportunity_closed:        { label: 'Deal Closed',               color: '#7C3AED' },
};

const SOURCE_LABELS = {
  direct:        '🌐 Direct',
  facebook_lead: '📘 Facebook Lead',
  closebot:      '🤖 CloseBot',
  sms:           '💬 SMS',
  email:         '📧 Email',
  retargeting:   '🎯 Retargeting',
};

function TimelineView({ events, loading, bookingSource }) {
  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Loading timeline…</div>;
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Booking source chip */}
      {bookingSource && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 6, letterSpacing: '.4px', fontWeight: 600 }}>BOOKING SOURCE</div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 20,
            background: '#F0F4FF', border: '1px solid #C7D7F8',
            fontSize: 13, fontWeight: 600, color: '#1D4ED8',
          }}>
            {SOURCE_LABELS[bookingSource] || bookingSource}
          </div>
        </div>
      )}

      {/* Event stream */}
      {events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9CA3AF', fontSize: 13 }}>
          No events recorded yet.<br />
          <span style={{ fontSize: 12 }}>Events will appear as the lead interacts with your system.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {events.map((ev, i) => {
            const meta   = EVENT_META[ev.event_type] || { label: ev.event_type.replace(/_/g, ' '), color: '#9CA3AF' };
            const ts     = new Date(ev.created_at);
            const dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const timeStr = ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const isLast  = i === events.length - 1;
            // One-line detail pulled from event_data
            const detail  = ev.event_data?.slot
              ? new Date(ev.event_data.slot).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              : ev.event_data?.source
                ? ev.event_data.source.replace(/_/g, ' ')
                : ev.event_data?.note || null;

            return (
              <div key={ev.id} style={{ display: 'flex', gap: 14 }}>
                {/* Dot + connector line */}
                <div style={{ width: 16, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                  {!isLast && <div style={{ width: 1, flex: 1, background: '#E5E7EB', marginTop: 4 }} />}
                </div>
                {/* Content */}
                <div style={{ flex: 1, paddingBottom: isLast ? 4 : 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', lineHeight: 1.3 }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                    {dateStr} · {timeStr}
                    {detail && <span style={{ marginLeft: 6, color: '#6B7280' }}>· {detail}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QBBtn({ variant, onClick, children, disabled }) {
  const [hover, setHover] = useState(false);
  const vs = {
    success: { color: '#1A7E24', bg: '#E3F4E5', hoverBg: '#C3E6C5', border: '#A8D5AA' },
    warning: { color: '#92400E', bg: '#FEF3C7', hoverBg: '#FDE68A', border: '#FCD34D' },
    danger:  { color: '#C23934', bg: '#FDECEA', hoverBg: '#FFCDD2', border: '#EF9A9A' },
    primary: { color: '#0077C5', bg: '#E0EFF9', hoverBg: '#B3D4EE', border: '#90CAF9' },
    cq:       { color: '#5C35A8', bg: '#EEE9FA', hoverBg: '#DDD5F7', border: '#C5B8F0' },
    pitch:    { color: '#1A7E24', bg: '#E3F4E5', hoverBg: '#C3E6C5', border: '#A8D5AA' },
    followup: { color: '#374151', bg: '#F3F4F6', hoverBg: '#E5E7EB', border: '#D1D5DB' },
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 3,
        border: `1px solid ${vs.border}`, color: vs.color,
        background: hover ? vs.hoverBg : vs.bg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background .15s', whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ─── Table styles ─────────────────────────────────────────────────────────────
const s = {
  page:        { minHeight: '100vh', background: '#F5F6F7', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },

  header:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 50, background: '#151719' },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 28 },
  logo:        { fontWeight: 600, fontSize: 15, color: '#FFFFFF', letterSpacing: '-0.2px', flexShrink: 0 },
  nav:         { display: 'flex', gap: 2 },
  navLink:     { fontSize: 13, color: '#9FA6B2', textDecoration: 'none', padding: '7px 14px', borderRadius: 3, fontWeight: 400 },
  navActive:   { color: '#FFFFFF', background: 'rgba(255,255,255,.13)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  settingsLink:{ fontSize: 13, color: '#9FA6B2', textDecoration: 'none', fontWeight: 400 },
  headerUser:  { fontSize: 13, color: '#9FA6B2' },

  body:        { maxWidth: 1160, margin: '0 auto', padding: '24px 20px' },
  titleBar:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  pageTitle:   { fontSize: 20, fontWeight: 600, color: '#1A2B3C', margin: 0 },
  pageSubtitle:{ fontSize: 13, color: '#6B7280', margin: '3px 0 0' },
  refreshBtn:  { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 3, border: '1px solid #C8CDD2', background: '#FFFFFF', color: '#4A5568', cursor: 'pointer' },

  demoBanner:  { background: '#FFFBF0', border: '1px solid #F5A623', borderLeft: '4px solid #F5A623', borderRadius: 4, padding: '10px 14px', fontSize: 13, color: '#7D4E00', marginBottom: 18 },

  summaryRow:  { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 },
  summaryCard: { background: '#FFFFFF', border: '1px solid #D8DCE0', borderRadius: 4, padding: '16px 18px', position: 'relative', overflow: 'hidden' },
  summaryDot:  { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  summaryNum:  { fontSize: 28, fontWeight: 600, color: '#1A2B3C', lineHeight: 1 },
  summaryLabel:{ fontSize: 12, color: '#6B7280', marginTop: 5, fontWeight: 400 },

  tabBar:      { display: 'flex', marginBottom: 14, background: '#FFFFFF', border: '1px solid #C8CDD2', borderRadius: 3, width: 'fit-content', overflow: 'hidden' },
  tab:         { padding: '7px 18px', border: 'none', borderRight: '1px solid #C8CDD2', background: 'transparent', color: '#4A5568', fontSize: 13, fontWeight: 400, cursor: 'pointer' },
  tabActive:   { background: '#0077C5', color: '#FFFFFF', fontWeight: 600 },

  card:        { background: '#FFFFFF', border: '1px solid #D8DCE0', borderRadius: 4, overflow: 'hidden' },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  thead:       { background: '#F5F6F7' },
  th:          { textAlign: 'left', padding: '9px 14px', fontWeight: 600, color: '#6B7280', fontSize: 11, letterSpacing: '.4px', borderBottom: '1px solid #D8DCE0' },
  tr:          { borderBottom: '1px solid #EBEBEB', transition: 'background .1s' },
  td:          { padding: '18px 14px', verticalAlign: 'middle' },
  empty:       { textAlign: 'center', padding: 56, color: '#9CA3AF', fontSize: 14 },
};

// ─── Panel styles ─────────────────────────────────────────────────────────────
const p = {
  panelHdr:       { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '20px 20px 16px', borderBottom: '1px solid #EBEBEB', flexShrink: 0 },
  avatar:         { width: 46, height: 46, borderRadius: '50%', background: '#151719', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, flexShrink: 0 },
  clientName:     { fontSize: 17, fontWeight: 600, color: '#1A2B3C', marginBottom: 2 },
  clientEmail:    { fontSize: 13, color: '#6B7280', marginBottom: 6 },
  statusBadge:    { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  closeBtn:       { background: 'none', border: 'none', fontSize: 18, color: '#9CA3AF', cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1, flexShrink: 0 },

  tabBar:         { display: 'flex', borderBottom: '1px solid #EBEBEB', flexShrink: 0, background: '#FAFAFA' },
  panelTab:       { flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 500, color: '#6B7280', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' },
  panelTabActive: { color: '#1D4ED8', borderBottom: '2px solid #1D4ED8', fontWeight: 600 },

  scrollBody:     { flex: 1, overflowY: 'auto', padding: '0 0 24px' },
  loadingMsg:     { textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 14 },

  section:        { padding: '16px 20px', borderBottom: '1px solid #F0F0F0' },
  sectionHdrRow:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle:   { fontSize: 12, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.6px' },

  // Edit mode controls in section header
  editBtn:        { fontSize: 12, fontWeight: 500, color: '#0077C5', background: 'transparent', border: '1px solid #B3D4EE', borderRadius: 3, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit' },
  saveEditBtn:    { fontSize: 12, fontWeight: 600, color: '#fff', border: 'none', borderRadius: 3, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' },
  cancelEditBtn:  { fontSize: 12, fontWeight: 400, color: '#4A5568', background: '#F5F6F7', border: '1px solid #C8CDD2', borderRadius: 3, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' },

  fieldGroupLabel:{ fontSize: 10, fontWeight: 700, color: '#B0B8C4', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 },
  divider:        { borderTop: '1px solid #F0F0F0', margin: '12px 0' },

  row:            { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11, fontSize: 14 },
  rowLabel:       { color: '#6B7280', width: 80, flexShrink: 0, fontSize: 13 },
  rowVal:         { color: '#1A2B3C', flex: 1 },
  link:           { color: '#0077C5', textDecoration: 'none', fontSize: 14 },
  tag:            { background: '#EAECEF', borderRadius: 3, padding: '2px 8px', fontSize: 12, color: '#4A5568' },
  val:            { fontSize: 13, color: '#1A2B3C' },

  editRow:        { marginBottom: 10 },
  editLabel:      { display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 },
  input:          { width: '100%', padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' },

  emailToggleBtn: { marginTop: 12, padding: '7px 14px', background: '#F5F6F7', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#0077C5', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  emailBox:       { marginTop: 12, background: '#F8F9FA', border: '1px solid #D8DCE0', borderRadius: 4, padding: '14px 14px 12px' },
  emailHeader:    { fontSize: 12, fontWeight: 700, color: '#1A2B3C', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.4px' },
  emailField:     { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  emailLabel:     { fontSize: 11, color: '#6B7280', width: 44, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', flexShrink: 0 },
  emailInput:     { flex: 1, padding: '6px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none' },
  emailBody:      { width: '100%', padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' },

  // Shared action button (email send, save notes, CQ sent)
  actionBtn:      { padding: '8px 18px', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .2s' },
  cancelBtn:      { padding: '8px 14px', background: '#fff', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#4A5568', cursor: 'pointer', fontFamily: 'inherit' },

  notesArea:      { width: '100%', padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 },

  // Brand chips
  brandChip:      { padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 20, border: '1px solid #C8CDD2', background: '#F5F6F7', color: '#4A5568', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  brandChipActive:{ padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 20, border: '1px solid #0077C5', background: '#0077C5', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  brandChipX:     { padding: '2px 6px', fontSize: 14, lineHeight: 1, background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontFamily: 'inherit', marginLeft: -2 },
  addBrandBtn:    { padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 20, border: '1px dashed #C8CDD2', background: 'transparent', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' },
  brandCard:      { background: '#F8F9FA', border: '1px solid #E5E7EB', borderRadius: 4, padding: '14px 14px 12px', marginBottom: 12 },
};
