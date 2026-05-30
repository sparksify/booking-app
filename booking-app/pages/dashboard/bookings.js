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

const STATUS_LABELS = {
  scheduled: { label: 'Scheduled',  color: '#1D4ED8', bg: '#EFF6FF' },
  showed:    { label: 'Showed ✓',   color: '#15803D', bg: '#F0FDF4' },
  'no-show': { label: 'No-Show',    color: '#B91C1C', bg: '#FEF2F2' },
  closed:    { label: 'Closed 🏆',  color: '#7C3AED', bg: '#F5F3FF' },
};

export default function BookingsDashboard() {
  const { data: session } = useSession();
  const [filter,   setFilter]   = useState('today');
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [updating, setUpdating] = useState({}); // bookingId → true while saving

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/dashboard/bookings?filter=${filter}`)
      .then(r => r.json())
      .then(d => { setBookings(d.bookings || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(booking, status) {
    setUpdating(u => ({ ...u, [booking.id]: true }));
    try {
      await fetch('/api/dashboard/update-booking-status', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, email: booking.email, status }),
      });
      setBookings(bs => bs.map(b =>
        b.id === booking.id ? { ...b, status, lead_status: status } : b
      ));
    } catch (e) {
      console.error(e);
    }
    setUpdating(u => ({ ...u, [booking.id]: false }));
  }

  return (
    <>
      <Head><title>Bookings — Dashboard</title></Head>
      <div style={s.page}>
        <header style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={s.headerTitle}>Bookings</span>
            <Link href="/dashboard"           style={s.navLink}>← Dashboard</Link>
            <Link href="/dashboard/leads"     style={s.navLink}>Lead Pipeline</Link>
            <Link href="/dashboard/analytics" style={s.navLink}>Analytics</Link>
          </div>
          <span style={s.headerUser}>{session?.user?.email}</span>
        </header>

        <main style={s.main}>
          {/* Filter tabs */}
          <div style={s.tabs}>
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{ ...s.tab, ...(filter === f.key ? s.tabActive : {}) }}
              >
                {f.label}
              </button>
            ))}
            <button onClick={load} style={s.refreshBtn} title="Refresh">↻</button>
          </div>

          {loading ? (
            <div style={s.empty}>Loading…</div>
          ) : bookings.length === 0 ? (
            <div style={s.empty}>No bookings for this period.</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Time', 'Name', 'Phone', 'Investment', 'Rep', 'Status', 'Actions'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(b => (
                    <BookingRow
                      key={b.id}
                      booking={b}
                      busy={!!updating[b.id]}
                      onStatus={status => updateStatus(b, status)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

function BookingRow({ booking: b, busy, onStatus }) {
  const slotDate  = b.slot_start ? new Date(b.slot_start) : null;
  const dateLabel = slotDate
    ? slotDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : '—';
  const timeLabel = slotDate
    ? slotDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';

  const statusInfo = STATUS_LABELS[b.status] || STATUS_LABELS.scheduled;
  const isSettled  = b.status === 'showed' || b.status === 'no-show' || b.status === 'closed';

  return (
    <tr style={s.tr}>
      {/* Time */}
      <td style={s.td}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{dateLabel}</div>
        <div style={{ fontSize: 12, color: '#6B7280' }}>{timeLabel}</div>
      </td>

      {/* Name + email */}
      <td style={s.td}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{b.first_name} {b.last_name}</div>
        <div style={{ fontSize: 12, color: '#6B7280' }}>{b.email}</div>
      </td>

      {/* Phone */}
      <td style={s.td}>
        <a href={`tel:${b.phone}`} style={{ color: '#1D4ED8', fontSize: 13, textDecoration: 'none' }}>
          {b.phone || '—'}
        </a>
      </td>

      {/* Investment level */}
      <td style={s.td}>
        <span style={{ fontSize: 12, color: '#374151' }}>{b.investment_level || '—'}</span>
      </td>

      {/* Assigned rep */}
      <td style={s.td}>
        <span style={{ fontSize: 12, color: '#6B7280' }}>
          {b.assigned_to_email ? b.assigned_to_email.split('@')[0] : '—'}
        </span>
      </td>

      {/* Current status badge */}
      <td style={s.td}>
        <span style={{
          display:      'inline-block',
          padding:      '3px 10px',
          borderRadius: 20,
          fontSize:     12,
          fontWeight:   600,
          color:        statusInfo.color,
          background:   statusInfo.bg,
        }}>
          {statusInfo.label}
        </span>
        {b.meet_link && (
          <a
            href={b.meet_link}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'block', fontSize: 11, color: '#6B7280', marginTop: 4 }}
          >
            📹 Meet link
          </a>
        )}
      </td>

      {/* Action buttons */}
      <td style={s.td}>
        {busy ? (
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>Saving…</span>
        ) : b.status === 'scheduled' ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <ActionBtn color="#15803D" bg="#F0FDF4" border="#86EFAC" onClick={() => onStatus('showed')}>
              Showed ✓
            </ActionBtn>
            <ActionBtn color="#B91C1C" bg="#FEF2F2" border="#FCA5A5" onClick={() => onStatus('no-show')}>
              No-Show ✗
            </ActionBtn>
          </div>
        ) : b.status === 'showed' ? (
          <ActionBtn color="#7C3AED" bg="#F5F3FF" border="#C4B5FD" onClick={() => onStatus('closed')}>
            Mark Closed 🏆
          </ActionBtn>
        ) : (
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>
        )}
      </td>
    </tr>
  );
}

function ActionBtn({ color, bg, border, onClick, children }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding:      '5px 10px',
        fontSize:     12,
        fontWeight:   600,
        borderRadius: 6,
        border:       `1px solid ${border}`,
        color,
        background:   hover ? border : bg,
        cursor:       'pointer',
        transition:   'background .15s',
        whiteSpace:   'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page:       { minHeight: '100vh', background: '#F9FAFB', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' },
  header:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: 56, background: '#fff', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 10 },
  headerTitle:{ fontWeight: 700, fontSize: 16, color: '#111827' },
  headerUser: { fontSize: 13, color: '#6B7280' },
  navLink:    { fontSize: 13, color: '#1D4ED8', textDecoration: 'none' },
  main:       { maxWidth: 1100, margin: '0 auto', padding: '32px 24px' },
  empty:      { textAlign: 'center', padding: 64, color: '#6B7280', fontSize: 14 },

  tabs:       { display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center' },
  tab:        { padding: '8px 18px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  tabActive:  { background: '#1D4ED8', color: '#fff', borderColor: '#1D4ED8' },
  refreshBtn: { marginLeft: 'auto', padding: '6px 12px', border: '1px solid #E5E7EB', borderRadius: 8, background: '#fff', color: '#6B7280', fontSize: 16, cursor: 'pointer' },

  tableWrap:  { background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflowX: 'auto' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:         { textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap', fontSize: 12 },
  tr:         { borderBottom: '1px solid #F3F4F6' },
  td:         { padding: '14px 16px', color: '#111827', verticalAlign: 'middle' },
};
