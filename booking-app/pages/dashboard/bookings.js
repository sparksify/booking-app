import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import Head from 'next/head';
import Link from 'next/link';
import { authOptions } from '../api/auth/[...nextauth]';

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) return { redirect: { destination: '/dashboard/login', permanent: false } };
  return { props: { session } };
}

const FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This Week' },
  { key: 'all',   label: 'All' },
];

const STATUS_META = {
  scheduled: { label: 'Scheduled',  color: '#0077C5', bg: '#E6F2FB', dot: '#0077C5' },
  showed:    { label: 'Showed',     color: '#1A7E24', bg: '#E6F4E7', dot: '#2CA01C' },
  'no-show': { label: 'No Show',    color: '#C23934', bg: '#FDECEA', dot: '#D4351B' },
  closed:    { label: 'Closed Won', color: '#5C35A8', bg: '#F0ECF9', dot: '#6B37BF' },
};

// ── Demo data shown when no real bookings exist ───────────────────────────────
const DEMO = [
  {
    id: 'd1', first_name: 'Marcus', last_name: 'Thompson', email: 'marcus.t@email.com',
    phone: '(512) 555-0192', slot_start: (() => { const d = new Date(); d.setHours(9, 0); return d.toISOString(); })(),
    status: 'scheduled', investment_level: '$100k–$200k', assigned_to_email: 'steve@sparksify.com',
    meet_link: 'https://meet.google.com/abc-defg-hij',
  },
  {
    id: 'd2', first_name: 'Jennifer', last_name: 'Caldwell', email: 'jcaldwell@gmail.com',
    phone: '(214) 555-0847', slot_start: (() => { const d = new Date(); d.setHours(10, 30); return d.toISOString(); })(),
    status: 'showed', investment_level: '$50k–$100k', assigned_to_email: 'steve@sparksify.com',
    meet_link: null,
  },
  {
    id: 'd3', first_name: 'Robert', last_name: 'Kim', email: 'rob.kim@outlook.com',
    phone: '(713) 555-0334', slot_start: (() => { const d = new Date(); d.setHours(11, 45); return d.toISOString(); })(),
    status: 'no-show', investment_level: '$200k+', assigned_to_email: 'steve@sparksify.com',
    meet_link: null,
  },
  {
    id: 'd4', first_name: 'Angela', last_name: 'Rivera', email: 'angela.r@company.com',
    phone: '(469) 555-0561', slot_start: (() => { const d = new Date(); d.setHours(13, 0); return d.toISOString(); })(),
    status: 'closed', investment_level: '$100k–$200k', assigned_to_email: 'steve@sparksify.com',
    meet_link: 'https://meet.google.com/xyz-uvwx-rst',
  },
  {
    id: 'd5', first_name: 'David', last_name: 'Nguyen', email: 'dnguyen@email.com',
    phone: '(281) 555-0729', slot_start: (() => { const d = new Date(); d.setHours(14, 30); return d.toISOString(); })(),
    status: 'scheduled', investment_level: '$50k–$100k', assigned_to_email: 'steve@sparksify.com',
    meet_link: 'https://meet.google.com/lmn-opqr-stu',
  },
  {
    id: 'd6', first_name: 'Samantha', last_name: 'Brooks', email: 'sbrooks@gmail.com',
    phone: '(972) 555-0418', slot_start: (() => { const d = new Date(); d.setHours(15, 15); return d.toISOString(); })(),
    status: 'showed', investment_level: '$200k+', assigned_to_email: 'steve@sparksify.com',
    meet_link: null,
  },
];

export default function BookingsDashboard() {
  const { data: session } = useSession();
  const [filter,   setFilter]   = useState('today');
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [updating, setUpdating] = useState({});
  const [isDemo,   setIsDemo]   = useState(false);

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

  async function updateStatus(booking, status) {
    if (isDemo) {
      setBookings(bs => bs.map(b => b.id === booking.id ? { ...b, status } : b));
      return;
    }
    setUpdating(u => ({ ...u, [booking.id]: true }));
    try {
      await fetch('/api/dashboard/update-booking-status', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, email: booking.email, status }),
      });
      setBookings(bs => bs.map(b => b.id === booking.id ? { ...b, status } : b));
    } catch (e) { console.error(e); }
    setUpdating(u => ({ ...u, [booking.id]: false }));
  }

  // Summary counts
  const counts = bookings.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <Head><title>Bookings — Dashboard</title></Head>
      <div style={s.page}>

        {/* ── Top nav ── */}
        <header style={s.header}>
          <div style={s.headerLeft}>
            <span style={s.logo}>⬡ FranchiseBook</span>
            <nav style={s.nav}>
              <Link href="/dashboard"           style={s.navLink}>Home</Link>
              <Link href="/dashboard/bookings"  style={{ ...s.navLink, ...s.navActive }}>Bookings</Link>
              <Link href="/dashboard/leads"     style={s.navLink}>Leads</Link>
              <Link href="/dashboard/analytics" style={s.navLink}>Analytics</Link>
            </nav>
          </div>
          <div style={s.headerRight}>
            <span style={s.headerUser}>{session?.user?.email}</span>
          </div>
        </header>

        <div style={s.body}>
          {/* ── Page title bar ── */}
          <div style={s.titleBar}>
            <div>
              <h1 style={s.pageTitle}>Bookings</h1>
              <p style={s.pageSubtitle}>Manage consultation calls and update outcomes</p>
            </div>
            <button onClick={load} style={s.refreshBtn}>↻ Refresh</button>
          </div>

          {/* ── Demo banner ── */}
          {isDemo && (
            <div style={s.demoBanner}>
              📋 <strong>Preview mode</strong> — No real bookings found for this period. Showing sample data so you can see the layout.
            </div>
          )}

          {/* ── Summary cards ── */}
          <div style={s.summaryRow}>
            {[
              { label: 'Scheduled', key: 'scheduled', icon: '📅' },
              { label: 'Showed',    key: 'showed',    icon: '✅' },
              { label: 'No Shows',  key: 'no-show',   icon: '❌' },
              { label: 'Closed Won',key: 'closed',    icon: '🏆' },
            ].map(({ label, key, icon }) => {
              const meta = STATUS_META[key];
              return (
                <div key={key} style={s.summaryCard}>
                  <div style={{ ...s.summaryDot, background: meta.dot }} />
                  <div style={s.summaryNum}>{counts[key] || 0}</div>
                  <div style={s.summaryLabel}>{icon} {label}</div>
                </div>
              );
            })}
          </div>

          {/* ── Filter tabs ── */}
          <div style={s.tabBar}>
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{ ...s.tab, ...(filter === f.key ? s.tabActive : {}) }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* ── Table ── */}
          <div style={s.card}>
            {loading ? (
              <div style={s.empty}>Loading…</div>
            ) : bookings.length === 0 ? (
              <div style={s.empty}>No bookings for this period.</div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr style={s.thead}>
                    <th style={s.th}>TIME</th>
                    <th style={s.th}>CLIENT</th>
                    <th style={s.th}>PHONE</th>
                    <th style={s.th}>INVESTMENT</th>
                    <th style={s.th}>REP</th>
                    <th style={s.th}>STATUS</th>
                    <th style={s.th}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b, i) => (
                    <BookingRow
                      key={b.id}
                      booking={b}
                      striped={i % 2 === 1}
                      busy={!!updating[b.id]}
                      onStatus={status => updateStatus(b, status)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function BookingRow({ booking: b, striped, busy, onStatus }) {
  const slot      = b.slot_start ? new Date(b.slot_start) : null;
  const dateLabel = slot ? slot.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
  const timeLabel = slot ? slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  const meta      = STATUS_META[b.status] || STATUS_META.scheduled;

  return (
    <tr style={{ ...s.tr, background: striped ? '#F7F8FA' : '#FFFFFF' }}>
      <td style={s.td}>
        <div style={{ fontWeight: 600, color: '#333', fontSize: 13 }}>{timeLabel}</div>
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{dateLabel}</div>
      </td>
      <td style={s.td}>
        <div style={{ fontWeight: 600, color: '#0077C5', fontSize: 13 }}>{b.first_name} {b.last_name}</div>
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{b.email}</div>
      </td>
      <td style={s.td}>
        <a href={`tel:${b.phone}`} style={{ color: '#333', fontSize: 13, textDecoration: 'none' }}>
          {b.phone || '—'}
        </a>
      </td>
      <td style={s.td}>
        <span style={{ fontSize: 12, color: '#444', background: '#F0F0F0', padding: '3px 8px', borderRadius: 4 }}>
          {b.investment_level || '—'}
        </span>
      </td>
      <td style={s.td}>
        <span style={{ fontSize: 13, color: '#555' }}>
          {b.assigned_to_email ? b.assigned_to_email.split('@')[0] : '—'}
        </span>
      </td>
      <td style={s.td}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
          color: meta.color, background: meta.bg,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot, display: 'inline-block' }} />
          {meta.label}
        </span>
        {b.meet_link && (
          <a href={b.meet_link} target="_blank" rel="noreferrer"
            style={{ display: 'block', fontSize: 11, color: '#0077C5', marginTop: 4 }}>
            📹 Join call
          </a>
        )}
      </td>
      <td style={s.td}>
        {busy ? (
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>Saving…</span>
        ) : b.status === 'scheduled' ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <QBBtn variant="success" onClick={() => onStatus('showed')}>Showed ✓</QBBtn>
            <QBBtn variant="danger"  onClick={() => onStatus('no-show')}>No-Show</QBBtn>
          </div>
        ) : b.status === 'showed' ? (
          <QBBtn variant="primary" onClick={() => onStatus('closed')}>Close Won 🏆</QBBtn>
        ) : (
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>
        )}
      </td>
    </tr>
  );
}

// ─── QB-style button ──────────────────────────────────────────────────────────

function QBBtn({ variant, onClick, children }) {
  const [hover, setHover] = useState(false);
  const styles = {
    success: { color: '#1A7E24', bg: '#E6F4E7', hoverBg: '#C8E6C9', border: '#A5D6A7' },
    danger:  { color: '#C23934', bg: '#FDECEA', hoverBg: '#FFCDD2', border: '#EF9A9A' },
    primary: { color: '#0077C5', bg: '#E6F2FB', hoverBg: '#BBDEFB', border: '#90CAF9' },
  }[variant];

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 4,
        border: `1px solid ${styles.border}`, color: styles.color,
        background: hover ? styles.hoverBg : styles.bg,
        cursor: 'pointer', transition: 'background .15s', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page:        { minHeight: '100vh', background: '#F7F8FA', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' },

  // Header — QB dark nav
  header:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 52, background: '#2D3E50', boxShadow: '0 2px 4px rgba(0,0,0,.2)' },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 32 },
  logo:        { fontWeight: 700, fontSize: 16, color: '#FFFFFF', letterSpacing: '-0.3px' },
  nav:         { display: 'flex', gap: 4 },
  navLink:     { fontSize: 13, color: '#B0C4D8', textDecoration: 'none', padding: '6px 12px', borderRadius: 4, fontWeight: 500 },
  navActive:   { color: '#FFFFFF', background: 'rgba(255,255,255,.12)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  headerUser:  { fontSize: 13, color: '#B0C4D8' },

  // Body
  body:        { maxWidth: 1140, margin: '0 auto', padding: '28px 24px' },
  titleBar:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  pageTitle:   { fontSize: 22, fontWeight: 700, color: '#1A2740', margin: 0 },
  pageSubtitle:{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' },
  refreshBtn:  { padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: '1px solid #D0D7DE', background: '#FFFFFF', color: '#333', cursor: 'pointer' },

  // Demo banner
  demoBanner:  { background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 6, padding: '10px 16px', fontSize: 13, color: '#5D4037', marginBottom: 20 },

  // Summary cards
  summaryRow:  { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 },
  summaryCard: { background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8, padding: '16px 20px', position: 'relative', boxShadow: '0 1px 3px rgba(0,0,0,.06)' },
  summaryDot:  { position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '8px 8px 0 0' },
  summaryNum:  { fontSize: 32, fontWeight: 700, color: '#1A2740', lineHeight: 1 },
  summaryLabel:{ fontSize: 12, color: '#6B7280', marginTop: 6, fontWeight: 500 },

  // Tabs — QB-style segmented control
  tabBar:      { display: 'flex', gap: 0, marginBottom: 16, background: '#FFFFFF', border: '1px solid #D0D7DE', borderRadius: 6, width: 'fit-content', overflow: 'hidden' },
  tab:         { padding: '8px 20px', border: 'none', borderRight: '1px solid #D0D7DE', background: 'transparent', color: '#555', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  tabActive:   { background: '#0077C5', color: '#FFFFFF' },

  // Table card
  card:        { background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  thead:       { background: '#F7F8FA' },
  th:          { textAlign: 'left', padding: '10px 16px', fontWeight: 700, color: '#6B7280', fontSize: 11, letterSpacing: '.5px', borderBottom: '1px solid #E5E7EB' },
  tr:          { borderBottom: '1px solid #F0F0F0' },
  td:          { padding: '14px 16px', verticalAlign: 'middle' },

  empty:       { textAlign: 'center', padding: 56, color: '#9CA3AF', fontSize: 14 },
};
