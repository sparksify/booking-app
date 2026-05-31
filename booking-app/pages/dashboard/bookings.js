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
              <Link href="/dashboard/bookings"  style={{ ...s.navLink, ...s.navActive }}>Bookings</Link>
              <Link href="/dashboard/leads"     style={s.navLink}>Leads</Link>
              <Link href="/dashboard/analytics" style={s.navLink}>Analytics</Link>
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
                  {bookings.map((b, i) => (
                    <BookingRow
                      key={b.id}
                      booking={b}
                      striped={i % 2 === 1}
                      busy={!!updating[b.id]}
                      selected={panelBooking?.id === b.id}
                      onRowClick={() => openPanel(b)}
                      onStatus={status => updateStatus(b, status)}
                    />
                  ))}
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

function BookingRow({ booking: b, striped, busy, selected, onRowClick, onStatus }) {
  const slot      = b.slot_start ? new Date(b.slot_start) : null;
  const dateLabel = slot ? slot.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
  const timeLabel = slot ? slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  const meta      = STATUS_META[b.status] || STATUS_META.scheduled;

  const rowBg = selected ? '#EBF4FF' : striped ? '#F8F9FA' : '#FFFFFF';

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
            style={{ display: 'block', fontSize: 11, color: '#0077C5', marginTop: 3 }}>
            📹 Join
          </a>
        )}
      </td>
      <td style={s.td} onClick={e => e.stopPropagation()}>
        {busy ? (
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>Saving…</span>
        ) : b.status === 'scheduled' ? (
          <div style={{ display: 'flex', gap: 5 }}>
            <QBBtn variant="success" onClick={() => onStatus('showed')}>Showed</QBBtn>
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
  const [cqSent,       setCqSent]       = useState(false);
  const [pitchOpen,    setPitchOpen]    = useState(false);
  const [pitchBrandIdx,setPitchBrandIdx]= useState(0);
  const [panelTab,     setPanelTab]     = useState('info');
  const [timeline,     setTimeline]     = useState([]);
  const [tlLoading,    setTlLoading]    = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (lead) {
      setNotes(lead.notes || '');
      const fi = lead.franchise_interests || [];
      setInterests(fi);
      setSelectedIdx(fi.length > 0 ? 0 : null);
    }
  }, [lead]);

  useEffect(() => {
    if (!open) {
      setShowEmail(false); setEmailSent(false); setPitchOpen(false); setBrandEditMode(false);
      setPanelTab('info'); setTimeline([]);
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
    if (isDemo) { setCqSent(true); setTimeout(() => setCqSent(false), 2500); return; }
    setCqSent(true);
    await fetch('/api/dashboard/send-cq', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bookingId: booking.id, email: booking.email }),
    }).catch(console.error);
    setTimeout(() => setCqSent(false), 2500);
  }

  const raw = lead?.raw_fields
    ? (typeof lead.raw_fields === 'string' ? JSON.parse(lead.raw_fields) : lead.raw_fields)
    : {};
  const liquidCapital = getField(raw, 'liquid_capital', 'liquid capital');
  const ownedBusiness = getField(raw, 'owned_business', 'owned or managed', 'managed a business', 'business before');

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
          >📋 Info</button>
          <button
            style={{ ...p.panelTab, ...(panelTab === 'timeline' ? p.panelTabActive : {}) }}
            onClick={openTimeline}
          >🕐 Timeline</button>
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
                <Row icon="📞" label="Phone">
                  <a href={`tel:${booking.phone}`} style={p.link}>{booking.phone || '—'}</a>
                </Row>
                <Row icon="✉️" label="Email">
                  <a href={`mailto:${booking.email}`} style={p.link}>{booking.email}</a>
                </Row>
                <Row icon="💰" label="Investment">
                  <span style={p.tag}>{booking.investment_level || '—'}</span>
                </Row>
                {liquidCapital && (
                  <Row icon="🏦" label="Liquid Cap.">
                    <span style={p.val}>{liquidCapital}</span>
                  </Row>
                )}
                {ownedBusiness && (
                  <Row icon="🏢" label="Owned Biz">
                    <span style={p.val}>{ownedBusiness}</span>
                  </Row>
                )}
              </PanelSection>

              {/* ── Booking ── */}
              <PanelSection title="Booking">
                <Row icon="📅" label="Scheduled">
                  <span style={p.val}>{slotLabel}</span>
                </Row>
                <Row icon="👤" label="Consultant">
                  <span style={p.val}>{booking.assigned_to_email || '—'}</span>
                </Row>
                {booking.meet_link && (
                  <Row icon="📹" label="Meet">
                    <a href={booking.meet_link} target="_blank" rel="noreferrer" style={p.link}>Join call →</a>
                  </Row>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {booking.status === 'scheduled' && (
                    <>
                      <QBBtn variant="success" onClick={() => onStatusChange('showed')}>Mark Showed</QBBtn>
                      <QBBtn variant="danger"  onClick={() => onStatusChange('no-show')}>Mark No-Show</QBBtn>
                    </>
                  )}
                  {booking.status === 'showed' && (
                    <QBBtn variant="primary" onClick={() => onStatusChange('closed')}>Mark Closed Won 🏆</QBBtn>
                  )}
                  <QBBtn variant="cq" onClick={sendCQ} disabled={cqSent}>
                    {cqSent ? '✓ CQ Sent' : 'Send CQ'}
                  </QBBtn>
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
                        <Row icon="👤" label="Name">
                          <span style={p.val}>{selectedFI.developer_name || <em style={{ color: '#9CA3AF' }}>Not set</em>}</span>
                        </Row>
                        <Row icon="📞" label="Phone">
                          {selectedFI.developer_phone
                            ? <a href={`tel:${selectedFI.developer_phone}`} style={p.link}>{selectedFI.developer_phone}</a>
                            : <em style={{ color: '#9CA3AF', fontSize: 13 }}>Not set</em>}
                        </Row>
                        <Row icon="✉️" label="Email">
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
              <PanelSection title="Notes">
                <textarea style={p.notesArea} rows={5}
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

// ─── Panel helper components ──────────────────────────────────────────────────

function PanelSection({ title, editMode, onEdit, onSave, onCancel, saving, saved, children }) {
  const hasEdit = onEdit !== undefined;
  return (
    <div style={p.section}>
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

function Row({ icon, label, children }) {
  return (
    <div style={p.row}>
      <span style={p.rowIcon}>{icon}</span>
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
  lead_submitted:            { emoji: '📝', label: 'Lead Submitted',            color: '#6B7280' },
  ghl_contact_created:       { emoji: '🔗', label: 'GHL Contact Created',       color: '#6B7280' },
  closebot_engaged:          { emoji: '🤖', label: 'CloseBot Engaged',          color: '#7C3AED' },
  booking_page_viewed:       { emoji: '👁',  label: 'Booking Page Viewed',       color: '#1D4ED8' },
  recommended_slot_shown:    { emoji: '⭐', label: 'Recommended Slot Shown',    color: '#1D4ED8' },
  recommended_slot_accepted: { emoji: '✅', label: 'Recommended Slot Accepted', color: '#16A34A' },
  recommended_slot_rejected: { emoji: '⏭',  label: 'Recommended Slot Skipped', color: '#B45309' },
  slot_selected:             { emoji: '📅', label: 'Slot Selected',             color: '#1D4ED8' },
  appointment_booked:        { emoji: '🎉', label: 'Appointment Booked',        color: '#16A34A' },
  confirmation_email_sent:   { emoji: '✉️', label: 'Confirmation Email Sent',   color: '#6B7280' },
  calendar_add_clicked:      { emoji: '📆', label: 'Calendar Add Clicked',      color: '#1D4ED8' },
  cq_email_sent:             { emoji: '📤', label: 'CQ Email Sent',             color: '#7C3AED' },
  appointment_showed:        { emoji: '🟢', label: 'Showed Up',                 color: '#16A34A' },
  appointment_no_show:       { emoji: '🔴', label: 'No Show',                   color: '#DC2626' },
  opportunity_closed:        { emoji: '🏆', label: 'Deal Closed',               color: '#7C3AED' },
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
        <div style={{ position: 'relative' }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute', left: 14, top: 8, bottom: 8,
            width: 2, background: '#E5E7EB', borderRadius: 2,
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {events.map((ev, i) => {
              const meta = EVENT_META[ev.event_type] || { emoji: '●', label: ev.event_type.replace(/_/g, ' '), color: '#6B7280' };
              const ts   = new Date(ev.created_at);
              const dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const timeStr = ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              const isLast = i === events.length - 1;

              return (
                <div key={ev.id} style={{ display: 'flex', gap: 12, paddingBottom: isLast ? 0 : 18 }}>
                  {/* Dot */}
                  <div style={{
                    width: 30, flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: 2,
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: meta.color + '1A',
                      border: `2px solid ${meta.color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, zIndex: 1,
                    }}>{meta.emoji}</div>
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2B3C' }}>{meta.label}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{dateStr} · {timeStr}</div>
                    {/* Show relevant event_data fields */}
                    {ev.event_data && Object.keys(ev.event_data).length > 0 && (
                      <div style={{
                        marginTop: 5, fontSize: 11, color: '#6B7280',
                        background: '#F9FAFB', borderRadius: 4, padding: '5px 8px',
                        border: '1px solid #E5E7EB',
                      }}>
                        {ev.event_data.source && <span>Source: <strong>{ev.event_data.source}</strong></span>}
                        {ev.event_data.provider && <span>Provider: <strong>{ev.event_data.provider}</strong></span>}
                        {ev.event_data.booking_source && <span>Via: <strong>{ev.event_data.booking_source}</strong></span>}
                        {ev.event_data.action && <span>Action: <strong>{ev.event_data.action}</strong></span>}
                        {ev.event_data.slot && <span>Slot: <strong>{new Date(ev.event_data.slot).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong></span>}
                        {ev.event_data.note && <span> · {ev.event_data.note}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function QBBtn({ variant, onClick, children, disabled }) {
  const [hover, setHover] = useState(false);
  const vs = {
    success: { color: '#1A7E24', bg: '#E3F4E5', hoverBg: '#C3E6C5', border: '#A8D5AA' },
    danger:  { color: '#C23934', bg: '#FDECEA', hoverBg: '#FFCDD2', border: '#EF9A9A' },
    primary: { color: '#0077C5', bg: '#E0EFF9', hoverBg: '#B3D4EE', border: '#90CAF9' },
    cq:      { color: '#5C35A8', bg: '#EEE9FA', hoverBg: '#DDD5F7', border: '#C5B8F0' },
    pitch:   { color: '#1A7E24', bg: '#E3F4E5', hoverBg: '#C3E6C5', border: '#A8D5AA' },
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

  header:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 50, background: '#33485E' },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 28 },
  logo:        { fontWeight: 600, fontSize: 15, color: '#FFFFFF', letterSpacing: '-0.2px', flexShrink: 0 },
  nav:         { display: 'flex', gap: 2 },
  navLink:     { fontSize: 13, color: '#A8BED0', textDecoration: 'none', padding: '7px 14px', borderRadius: 3, fontWeight: 400 },
  navActive:   { color: '#FFFFFF', background: 'rgba(255,255,255,.13)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  settingsLink:{ fontSize: 13, color: '#A8BED0', textDecoration: 'none', fontWeight: 400 },
  headerUser:  { fontSize: 13, color: '#A8BED0' },

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
  td:          { padding: '13px 14px', verticalAlign: 'middle' },
  empty:       { textAlign: 'center', padding: 56, color: '#9CA3AF', fontSize: 14 },
};

// ─── Panel styles ─────────────────────────────────────────────────────────────
const p = {
  panelHdr:       { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '20px 20px 16px', borderBottom: '1px solid #EBEBEB', flexShrink: 0 },
  avatar:         { width: 46, height: 46, borderRadius: '50%', background: '#33485E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, flexShrink: 0 },
  clientName:     { fontSize: 16, fontWeight: 600, color: '#1A2B3C', marginBottom: 2 },
  clientEmail:    { fontSize: 12, color: '#6B7280', marginBottom: 6 },
  statusBadge:    { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  closeBtn:       { background: 'none', border: 'none', fontSize: 18, color: '#9CA3AF', cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1, flexShrink: 0 },

  tabBar:         { display: 'flex', borderBottom: '1px solid #EBEBEB', flexShrink: 0, background: '#FAFAFA' },
  panelTab:       { flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 500, color: '#6B7280', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' },
  panelTabActive: { color: '#1D4ED8', borderBottom: '2px solid #1D4ED8', fontWeight: 600 },

  scrollBody:     { flex: 1, overflowY: 'auto', padding: '0 0 24px' },
  loadingMsg:     { textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 14 },

  section:        { padding: '16px 20px', borderBottom: '1px solid #F0F0F0' },
  sectionHdrRow:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle:   { fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.6px' },

  // Edit mode controls in section header
  editBtn:        { fontSize: 12, fontWeight: 500, color: '#0077C5', background: 'transparent', border: '1px solid #B3D4EE', borderRadius: 3, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit' },
  saveEditBtn:    { fontSize: 12, fontWeight: 600, color: '#fff', border: 'none', borderRadius: 3, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' },
  cancelEditBtn:  { fontSize: 12, fontWeight: 400, color: '#4A5568', background: '#F5F6F7', border: '1px solid #C8CDD2', borderRadius: 3, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' },

  fieldGroupLabel:{ fontSize: 10, fontWeight: 700, color: '#B0B8C4', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 },
  divider:        { borderTop: '1px solid #F0F0F0', margin: '12px 0' },

  row:            { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 13 },
  rowIcon:        { fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 },
  rowLabel:       { color: '#6B7280', width: 72, flexShrink: 0, fontSize: 12 },
  rowVal:         { color: '#1A2B3C', flex: 1 },
  link:           { color: '#0077C5', textDecoration: 'none', fontSize: 13 },
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
