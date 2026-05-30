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
  page:        { minHeight: '100vh', background: '#F5F6F7', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },

  // QB dark nav — precise color from screenshot
  header:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 50, background: '#33485E' },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 28 },
  logo:        { fontWeight: 600, fontSize: 15, color: '#FFFFFF', letterSpacing: '-0.2px', flexShrink: 0 },
  nav:         { display: 'flex', gap: 2 },
  navLink:     { fontSize: 13, color: '#A8BED0', textDecoration: 'none', padding: '7px 14px', borderRadius: 3, fontWeight: 400 },
  navActive:   { color: '#FFFFFF', background: 'rgba(255,255,255,.13)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  headerUser:  { fontSize: 13, color: '#A8BED0' },

  // Body
  body:        { maxWidth: 1160, margin: '0 auto', padding: '24px 20px' },
  titleBar:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  pageTitle:   { fontSize: 20, fontWeight: 600, color: '#1A2B3C', margin: 0 },
  pageSubtitle:{ fontSize: 13, color: '#6B7280', margin: '3px 0 0' },
  refreshBtn:  { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 3, border: '1px solid #C8CDD2', background: '#FFFFFF', color: '#4A5568', cursor: 'pointer' },

  // Demo banner — matches QB's yellow notice banner exactly
  demoBanner:  { background: '#FFFBF0', border: '1px solid #F5A623', borderLeft: '4px solid #F5A623', borderRadius: 4, padding: '10px 14px', fontSize: 13, color: '#7D4E00', marginBottom: 18 },

  // Summary cards
  summaryRow:  { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 },
  summaryCard: { background: '#FFFFFF', border: '1px solid #D8DCE0', borderRadius: 4, padding: '16px 18px', position: 'relative', overflow: 'hidden' },
  summaryDot:  { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  summaryNum:  { fontSize: 28, fontWeight: 600, color: '#1A2B3C', lineHeight: 1 },
  summaryLabel:{ fontSize: 12, color: '#6B7280', marginTop: 5, fontWeight: 400 },

  // Tabs
  tabBar:      { display: 'flex', gap: 0, marginBottom: 14, background: '#FFFFFF', border: '1px solid #C8CDD2', borderRadius: 3, width: 'fit-content', overflow: 'hidden' },
  tab:         { padding: '7px 18px', border: 'none', borderRight: '1px solid #C8CDD2', background: 'transparent', color: '#4A5568', fontSize: 13, fontWeight: 400, cursor: 'pointer' },
  tabActive:   { background: '#0077C5', color: '#FFFFFF', fontWeight: 600 },

  // Table card
  card:        { background: '#FFFFFF', border: '1px solid #D8DCE0', borderRadius: 4, overflow: 'hidden' },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  thead:       { background: '#F5F6F7' },
  th:          { textAlign: 'left', padding: '9px 14px', fontWeight: 600, color: '#6B7280', fontSize: 11, letterSpacing: '.4px', borderBottom: '1px solid #D8DCE0' },
  tr:          { borderBottom: '1px solid #EBEBEB' },
  td:          { padding: '13px 14px', verticalAlign: 'middle' },

  empty:       { textAlign: 'center', padding: 56, color: '#9CA3AF', fontSize: 14 },
};
