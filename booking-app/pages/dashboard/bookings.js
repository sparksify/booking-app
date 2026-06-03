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
  { key: 'today',    label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week',     label: 'Next 2 Weeks' },
  { key: 'all',      label: 'All' },
];

const STATUS_META = {
  scheduled: { label: 'Scheduled',  color: '#2563EB', bg: '#EFF6FF', dot: '#2563EB' },
  showed:    { label: 'Showed',     color: '#059669', bg: '#D1FAE5', dot: '#059669' },
  'no-show': { label: 'No Show',    color: '#DC2626', bg: '#FEE2E2', dot: '#DC2626' },
  closed:    { label: 'Closed Won', color: '#7C3AED', bg: '#EDE9FE', dot: '#7C3AED' },
};

const DEMO = [
  { id: 'd1', first_name: 'Marcus',   last_name: 'Thompson', email: 'marcus.t@email.com',     phone: '(512) 555-0192', slot_start: (() => { const d = new Date(); d.setHours(9,  0); return d.toISOString(); })(), status: 'scheduled', investment_level: '$100k–$200k', assigned_to_email: 'steve@sparksify.com', meet_link: 'https://meet.google.com/abc-defg-hij', _source_display: 'Calendly',      event_name: 'Franchise Intro Call' },
  { id: 'd2', first_name: 'Jennifer', last_name: 'Caldwell',  email: 'jcaldwell@gmail.com',    phone: '(214) 555-0847', slot_start: (() => { const d = new Date(); d.setHours(10,30); return d.toISOString(); })(), status: 'showed',    investment_level: '$50k–$100k',  assigned_to_email: 'steve@sparksify.com', meet_link: null,                                                 _source_display: 'Calendly',      event_name: 'Franchise Intro Call' },
  { id: 'd3', first_name: 'Robert',   last_name: 'Kim',       email: 'rob.kim@outlook.com',    phone: '(713) 555-0334', slot_start: (() => { const d = new Date(); d.setHours(11,45); return d.toISOString(); })(), status: 'no-show',  investment_level: '$200k+',      assigned_to_email: 'steve@sparksify.com', meet_link: null,                                                 _source_display: 'GoHighLevel',   event_name: 'Franchise Intro Call' },
  { id: 'd4', first_name: 'Angela',   last_name: 'Rivera',    email: 'angela.r@company.com',   phone: '(469) 555-0561', slot_start: (() => { const d = new Date(); d.setHours(13, 0); return d.toISOString(); })(), status: 'closed',   investment_level: '$100k–$200k', assigned_to_email: 'steve@sparksify.com', meet_link: 'https://meet.google.com/xyz-uvwx-rst', _source_display: 'FranchiseBook', event_name: 'Franchise Discovery Call' },
  { id: 'd5', first_name: 'David',    last_name: 'Nguyen',    email: 'dnguyen@email.com',      phone: '(281) 555-0729', slot_start: (() => { const d = new Date(); d.setHours(14,30); return d.toISOString(); })(), status: 'scheduled', investment_level: '$50k–$100k',  assigned_to_email: 'steve@sparksify.com', meet_link: 'https://meet.google.com/lmn-opqr-stu', _source_display: 'GoHighLevel',   event_name: 'Franchise Intro Call' },
];

function makeDemoLead(booking) {
  return {
    id: booking.id, first_name: booking.first_name, last_name: booking.last_name,
    email: booking.email, phone: booking.phone, investment_level: booking.investment_level,
    status: booking.status,
    franchise_interests: [
      { id: 'fi1', brand: 'Wet Fuel', developer_name: 'Janet Okafor', developer_phone: '(972) 555-0182', developer_email: 'janet.okafor@wetfuel.com' },
      { id: 'fi2', brand: 'Squeeze House', developer_name: 'Marcus Webb', developer_phone: '(214) 555-0299', developer_email: 'mwebb@squeezehouse.com' },
    ],
    notes: 'Very motivated buyer. Has previous business ownership experience. Interested in multi-unit.',
    raw_fields: { liquid_capital_to_get_started: '$100,000 – $250,000', have_you_ever_owned_or_managed_a_business_before: 'Yes' },
    bookings: [booking], created_at: new Date().toISOString(),
  };
}

function getField(raw, ...keys) {
  if (!raw) return null;
  for (const key of keys) {
    const slug = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = Object.entries(raw).find(([k]) => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(slug));
    if (found) return found[1];
  }
  return null;
}

// ─── Sidebar line icons ───────────────────────────────────────────────────────
function SideIcon({ name }) {
  const p = { width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', style: { display: 'block' } };
  if (name === 'dashboard') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === 'leads')     return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  if (name === 'clients')   return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === 'meetings')  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (name === 'tasks')     return <svg {...p}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
  if (name === 'calendar')  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8.01" y2="14"/><line x1="12" y1="14" x2="12.01" y2="14"/><line x1="16" y1="14" x2="16.01" y2="14"/></svg>;
  if (name === 'reports')   return <svg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
  if (name === 'settings')  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
  if (name === 'help')      return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
  return null;
}

// ─── Source badge ─────────────────────────────────────────────────────────────
function SourceBadge({ source }) {
  const styles = {
    Calendly:      { color: '#6D28D9', background: '#F5F3FF', border: '1px solid #DDD6FE' },
    GoHighLevel:   { color: '#047857', background: '#ECFDF5', border: '1px solid #A7F3D0' },
    FranchiseBook: { color: '#1D4ED8', background: '#DBEAFE', border: '1px solid #BFDBFE' },
  };
  const src = source || 'FranchiseBook';
  const st = styles[src] || { color: '#374151', background: '#F3F4F6', border: '1px solid #E5E7EB' };
  return (
    <span style={{ ...st, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {src}
    </span>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function BookingsDashboard({ brandPitches = {} }) {
  const { data: session } = useSession();
  const [filter,       setFilter]       = useState('week');
  const [bookings,     setBookings]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [updating,     setUpdating]     = useState({});
  const [isDemo,       setIsDemo]       = useState(false);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [repFilter,    setRepFilter]    = useState([]);
  const [panelBooking, setPanelBooking] = useState(null);
  const [lead,         setLead]         = useState(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelOpen,    setPanelOpen]    = useState(false);

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

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') closePanel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  function openPanel(booking) {
    setPanelBooking(booking); setLead(null); setPanelOpen(true);
    if (isDemo) { setLead(makeDemoLead(booking)); return; }
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: booking.id, email: booking.email, status, assigned_user_id: booking.assigned_user_id || null }),
    }).catch(console.error);
    setBookings(bs => bs.map(b => b.id === booking.id ? { ...b, status } : b));
    if (panelBooking?.id === booking.id) setPanelBooking(b => ({ ...b, status }));
    setUpdating(u => ({ ...u, [booking.id]: false }));
  }

  function downloadCSV() {
    const headers = ['Time', 'Date', 'Name', 'Email', 'Phone', 'Liquid Capital', 'Consultant', 'Status'];
    const rows = filteredBookings.map(b => {
      const slot = b.slot_start ? new Date(b.slot_start) : null;
      return [
        slot ? slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
        slot ? slot.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
        `${b.first_name} ${b.last_name}`, b.email, b.phone || '',
        b.investment_level || '', b.assigned_to_email || '', b.status,
      ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',');
    });
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `meetings-${filter}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const allReps = [...new Set(bookings.map(b => b.assigned_to_email).filter(Boolean))];

  const filteredBookings = bookings
    .filter(b => repFilter.length === 0 || repFilter.includes(b.assigned_to_email))
    .filter(b => !sourceFilter || (b._source_display || 'FranchiseBook') === sourceFilter)
    .filter(b => !statusFilter || b.status === statusFilter);

  const displayBookings = filteredBookings.filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${b.first_name} ${b.last_name}`.toLowerCase().includes(q) || (b.email || '').toLowerCase().includes(q);
  });

  const counts = filteredBookings.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});
  const showRateDenom = (counts.showed || 0) + (counts['no-show'] || 0);
  const showRate = showRateDenom > 0 ? Math.round((counts.showed || 0) / showRateDenom * 100) + '%' : '0%';

  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  const userName = session?.user?.name || session?.user?.email?.split('@')[0] || 'User';
  const sessionInitial = (session?.user?.email?.[0] || 'U').toUpperCase();

  // Next up: first future scheduled meeting
  const now = new Date();
  const nextUp = displayBookings.find(b => b.status === 'scheduled' && b.slot_start && new Date(b.slot_start) > now);
  let nextUpTimeNum = '', nextUpAMPM = '', nextUpInLabel = '';
  if (nextUp) {
    const slot = new Date(nextUp.slot_start);
    const full = slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const parts = full.split(' ');
    nextUpTimeNum = parts[0];
    nextUpAMPM = parts[1] || '';
    const mins = Math.round((slot - now) / 60000);
    nextUpInLabel = mins < 60 ? `in ${mins} min` : `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  return (
    <>
      <Head><title>Meetings — FranchiseBook</title></Head>
      <div style={s.page}>

        {/* ── White Sidebar ── */}
        <aside style={s.sidebar}>
          {/* Logo */}
          <div style={s.sideLogoWrap}>
            <div style={s.sideLogoRow}>
              <div style={s.sideLogoIcon}>F</div>
              <span style={s.sideLogoText}>FranchiseBook</span>
            </div>
          </div>

          {/* Nav */}
          <nav style={s.sideNav}>
            {[
              { href: '/dashboard/analytics', label: 'Dashboard',   icon: 'dashboard' },
              { href: '/dashboard/leads',      label: 'Leads',       icon: 'leads' },
              { href: '/dashboard/prospects',  label: 'Clients',     icon: 'clients' },
              { href: '/dashboard/bookings',   label: 'Meetings',    icon: 'meetings', active: true },
              { href: '#',                     label: 'Tasks',       icon: 'tasks' },
              { href: '#',                     label: 'Calendar',    icon: 'calendar' },
              { href: '#',                     label: 'Reports',     icon: 'reports' },
              { href: '/dashboard/settings',   label: 'Settings',    icon: 'settings' },
            ].map(({ href, label, icon, active }) => (
              <Link key={label} href={href}
                style={{ ...s.sideNavItem, ...(active ? s.sideNavItemActive : {}) }}>
                <span style={{ color: active ? '#2563EB' : '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                  <SideIcon name={icon} />
                </span>
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          {/* Bottom */}
          <div style={s.sideBottom}>
            <div style={s.sideHelpRow}>
              <span style={{ color: '#9CA3AF', display: 'flex' }}><SideIcon name="help" /></span>
              <span style={{ fontSize: 13, color: '#6B7280' }}>Help</span>
            </div>
            <div style={s.sideUserRow}>
              <div style={s.sideUserAvatar}>{sessionInitial}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>Rep</div>
              </div>
              <span style={{ color: '#9CA3AF', fontSize: 14 }}>›</span>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div style={s.main}>

          {/* Top Bar */}
          <div style={s.topBar}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={s.topTitle}>Today's Meetings</span>
                <span style={{ fontSize: 18 }}>📅</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={s.topDate}>{todayLabel} ▾</span>
                <button style={s.topNavArrow}>‹</button>
                <button style={s.topNavArrow}>›</button>
              </div>
            </div>
            <div style={s.topActions}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
                <input
                  style={s.searchInput}
                  placeholder="Search meetings, clients, email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <button style={s.topBtn}>≡ Filters</button>
              <button onClick={load} style={s.topBtn}>↻ Refresh</button>
              <button onClick={downloadCSV} style={s.topBtnPrimary}>+ Export ▾</button>
            </div>
          </div>

          {/* Body */}
          <div style={s.body}>

            {/* Demo banner */}
            {isDemo && (
              <div style={s.demoBanner}>
                Preview mode — no real bookings found. Showing sample data.
              </div>
            )}

            {/* Stats row — connected */}
            <div style={s.statsCard}>
              {[
                { label: 'Scheduled', num: counts.scheduled   || 0, iconBg: '#DBEAFE', iconColor: '#2563EB', icon: '📅' },
                { label: 'Showed',    num: counts.showed      || 0, iconBg: '#D1FAE5', iconColor: '#059669', icon: '✓'  },
                { label: 'No-Shows',  num: counts['no-show']  || 0, iconBg: '#FEE2E2', iconColor: '#DC2626', icon: '✕'  },
                { label: 'Closed',    num: counts.closed      || 0, iconBg: '#EDE9FE', iconColor: '#7C3AED', icon: '🏆' },
                { label: 'Show Rate', num: showRate,               iconBg: '#DBEAFE', iconColor: '#2563EB', icon: '📈' },
              ].map((st, i) => (
                <div key={st.label} style={{ ...s.statCell, ...(i < 4 ? { borderRight: '1px solid #E5E7EB' } : {}) }}>
                  <div style={{ ...s.statIconCircle, background: st.iconBg, color: st.iconColor }}>
                    <span style={{ fontSize: 16 }}>{st.icon}</span>
                  </div>
                  <div>
                    <div style={s.statNum}>{st.num}</div>
                    <div style={s.statLabel}>{st.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Next Up */}
            {nextUp && (() => {
              const initials = `${nextUp.first_name?.[0] || ''}${nextUp.last_name?.[0] || ''}`.toUpperCase();
              return (
                <div style={s.nextUp}>
                  {/* Time */}
                  <div style={s.nextUpTimeCol}>
                    <div style={s.nextUpLabel}>NEXT UP</div>
                    <div style={s.nextUpTime}>
                      {nextUpTimeNum}
                      <span style={s.nextUpAMPM}> {nextUpAMPM}</span>
                    </div>
                    <div style={s.nextUpIn}>{nextUpInLabel}</div>
                  </div>

                  <div style={s.nextUpDivider} />

                  {/* Avatar + Info */}
                  <div style={s.nextUpAvatar}>{initials}</div>
                  <div style={s.nextUpInfo}>
                    <div style={{ marginBottom: 4 }}>
                      <SourceBadge source={nextUp._source_display || 'FranchiseBook'} />
                    </div>
                    <div style={s.nextUpName}>{nextUp.first_name} {nextUp.last_name}</div>
                    {nextUp.event_name && <div style={s.nextUpSub}>{nextUp.event_name}</div>}
                    {nextUp.assigned_to_email && (
                      <div style={s.nextUpRep}>
                        <span style={{ marginRight: 4 }}>👤</span>
                        {nextUp.assigned_to_email.split('@')[0]}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={s.nextUpActions}>
                    <button onClick={() => openPanel(nextUp)} style={s.nextUpBtnOutline}>
                      Open Details
                    </button>
                    <button
                      onClick={() => updateStatus(nextUp, 'showed')}
                      disabled={!!updating[nextUp.id]}
                      style={{ ...s.nextUpBtnFill, opacity: updating[nextUp.id] ? 0.7 : 1 }}
                    >
                      ✓ Mark Showed
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Filter bar */}
            <div style={s.filterBar}>
              {/* Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {/* All Meetings */}
                <button
                  onClick={() => setFilter('all')}
                  style={filter === 'all' ? s.filterPillActive : s.filterPillOutline}
                >
                  All Meetings
                  {filter === 'all' && (
                    <span style={s.filterPillBadge}>{displayBookings.length}</span>
                  )}
                </button>

                {/* Date filters */}
                {[
                  { key: 'today',    label: 'Today' },
                  { key: 'tomorrow', label: 'Tomorrow' },
                  { key: 'week',     label: 'Next 2 Weeks' },
                ].map(f => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    style={filter === f.key ? s.filterPillActive : s.filterPillOutline}>
                    {f.label}
                  </button>
                ))}

                {/* Source dropdown */}
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <select
                    value={sourceFilter}
                    onChange={e => setSourceFilter(e.target.value)}
                    style={s.filterSelect}
                  >
                    <option value="">All Sources</option>
                    <option value="Calendly">Calendly</option>
                    <option value="GoHighLevel">GoHighLevel</option>
                    <option value="FranchiseBook">FranchiseBook</option>
                  </select>
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6B7280', fontSize: 10 }}>▼</span>
                </div>

                {/* Status dropdown */}
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    style={s.filterSelect}
                  >
                    <option value="">All Statuses</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="showed">Showed</option>
                    <option value="no-show">No Show</option>
                    <option value="closed">Closed Won</option>
                  </select>
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6B7280', fontSize: 10 }}>▼</span>
                </div>

                <button style={s.filterMoreBtn}>≡ More Filters</button>
              </div>

              {/* Rep chips (right side) */}
              {allReps.length > 1 && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>Rep:</span>
                  {allReps.map(email => {
                    const name = email.split('@')[0];
                    const active = repFilter.includes(email);
                    return (
                      <button key={email}
                        onClick={() => setRepFilter(prev => prev.includes(email) ? prev.filter(r => r !== email) : [...prev, email])}
                        style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 20, border: `1.5px solid ${active ? '#2563EB' : '#E5E7EB'}`, background: active ? '#EFF6FF' : '#fff', color: active ? '#2563EB' : '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {name}
                      </button>
                    );
                  })}
                  {repFilter.length > 0 && (
                    <button onClick={() => setRepFilter([])} style={{ fontSize: 11, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>
                  )}
                </div>
              )}
            </div>

            {/* Table */}
            <div style={s.tableCard}>
              {loading ? (
                <div style={s.tableEmpty}>Loading…</div>
              ) : displayBookings.length === 0 ? (
                <div style={s.tableEmpty}>No meetings for this period.</div>
              ) : (
                <table style={s.table}>
                  <thead>
                    <tr>
                      {['Time', 'Client', 'Source / Type', 'Rep', 'Liquid Capital', 'Status', 'Actions'].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const nowMs = Date.now();
                      const inProgressId = (() => {
                        const cands = displayBookings.filter(b => {
                          const ms = b.slot_start ? new Date(b.slot_start).getTime() : 0;
                          return ms > 0 && ms <= nowMs && nowMs <= ms + 90 * 60_000;
                        });
                        if (!cands.length) return null;
                        return cands.reduce((a, b) => new Date(b.slot_start) > new Date(a.slot_start) ? b : a).id;
                      })();
                      let nowInserted = false;
                      return displayBookings.flatMap((b, i) => {
                        const slotMs = b.slot_start ? new Date(b.slot_start).getTime() : 0;
                        const rows = [];
                        if (!nowInserted && slotMs > nowMs) {
                          nowInserted = true;
                          rows.push(
                            <tr key="now-divider" style={{ pointerEvents: 'none' }}>
                              <td colSpan={7} style={{ padding: '2px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ flex: 1, height: 1, background: '#EF4444', opacity: 0.4 }} />
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#EF4444', letterSpacing: '.05em', textTransform: 'uppercase', flexShrink: 0 }}>Now</span>
                                  <div style={{ flex: 1, height: 1, background: '#EF4444', opacity: 0.4 }} />
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
                            inProgress={b.id === inProgressId}
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
        </div>

        {/* ── CRM Panel ── */}
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
  const timeLabel = slot ? slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';
  const dateLabel = slot ? slot.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const meta      = STATUS_META[b.status] || STATUS_META.scheduled;
  const initials  = `${b.first_name?.[0] || ''}${b.last_name?.[0] || ''}`.toUpperCase();

  const rowBg = selected ? '#EFF6FF' : inProgress ? '#F0FDF4' : striped ? '#FAFAFA' : '#fff';
  const firstTdBorder = selected ? { borderLeft: '3px solid #2563EB' } : { borderLeft: '3px solid transparent' };

  return (
    <tr style={{ ...s.tr, background: rowBg, cursor: 'pointer' }} onClick={onRowClick}>

      {/* Time */}
      <td style={{ ...s.td, ...firstTdBorder }}>
        <div style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>{timeLabel}</div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{dateLabel}</div>
        {inProgress && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: '#15803D', background: '#DCFCE7', border: '1px solid #BBF7D0' }}>
            ● Live
          </span>
        )}
      </td>

      {/* Client */}
      <td style={s.td}>
        <div style={{ fontWeight: 600, color: '#2563EB', fontSize: 13 }}>{b.first_name} {b.last_name}</div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{b.email}</div>
      </td>

      {/* Source / Type */}
      <td style={s.td}>
        <SourceBadge source={b._source_display || 'FranchiseBook'} />
        {b.event_name && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{b.event_name}</div>}
      </td>

      {/* Rep */}
      <td style={s.td}>
        {b.assigned_to_email ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#8B5CF6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
              {b.assigned_to_email[0]?.toUpperCase()}
            </div>
            <span style={{ fontSize: 13, color: '#374151' }}>
              {b.assigned_to_email.split('@')[0]}
            </span>
          </div>
        ) : <span style={{ color: '#D1D5DB' }}>—</span>}
      </td>

      {/* Liquid Capital */}
      <td style={s.td}>
        {b.investment_level
          ? <span style={{ fontSize: 12, color: '#374151' }}>{b.investment_level}</span>
          : <span style={{ color: '#D1D5DB' }}>—</span>}
      </td>

      {/* Status */}
      <td style={s.td}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: meta.color, background: meta.bg, border: `1px solid ${meta.dot}33` }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot, display: 'inline-block', flexShrink: 0 }} />
          {meta.label}
        </span>
      </td>

      {/* Actions — icon buttons */}
      <td style={s.td} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* Eye — open panel */}
          <button
            onClick={onRowClick}
            title="View details"
            style={s.iconBtn}
          >
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>

          {/* Calendar — join call */}
          <a
            href={b.meet_link || '#'}
            target={b.meet_link ? '_blank' : undefined}
            rel="noreferrer"
            onClick={e => { if (!b.meet_link) e.preventDefault(); }}
            title={b.meet_link ? 'Join call' : 'No link'}
            style={{ ...s.iconBtn, opacity: b.meet_link ? 1 : 0.35, textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </a>

          {/* Ellipsis */}
          <button title="More" style={s.iconBtn}>
            <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── CRM Side Panel ───────────────────────────────────────────────────────────
function CRMPanel({ booking, lead, loading, open, isDemo, brandPitches = {}, onClose, onStatusChange }) {
  const [notes,         setNotes]         = useState('');
  const [interests,     setInterests]     = useState([]);
  const [selectedIdx,   setSelectedIdx]   = useState(null);
  const [brandEditMode, setBrandEditMode] = useState(false);
  const [brandSaving,   setBrandSaving]   = useState(false);
  const [brandSaved,    setBrandSaved]    = useState(false);
  const [notesSaving,   setNotesSaving]   = useState(false);
  const [notesSaved,    setNotesSaved]    = useState(false);
  const [showEmail,     setShowEmail]     = useState(false);
  const [email,         setEmail]         = useState({ to: '', subject: '', body: '' });
  const [emailSent,     setEmailSent]     = useState(false);
  const [cqSent,        setCqSent]        = useState(!!booking?.cq_sent_at);
  const [cqReceived,    setCqReceived]    = useState(!!booking?.cq_received_at);
  const [cqRecvSaving,  setCqRecvSaving]  = useState(false);
  const [pitchOpen,     setPitchOpen]     = useState(false);
  const [pitchBrandIdx, setPitchBrandIdx] = useState(0);
  const [panelTab,      setPanelTab]      = useState('info');
  const [timeline,      setTimeline]      = useState([]);
  const [tlLoading,     setTlLoading]     = useState(false);
  const [ghlContact,        setGhlContact]        = useState(null);
  const [ghlContactLoading, setGhlContactLoading] = useState(false);
  const [ghlTags,        setGhlTags]        = useState([]);
  const [ghlTagsLoading, setGhlTagsLoading] = useState(false);
  const [newTagInput,    setNewTagInput]    = useState('');
  const [showTagInput,   setShowTagInput]   = useState(false);
  const [tagSaving,      setTagSaving]      = useState(false);
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

  useEffect(() => {
    setCqSent(!!booking?.cq_sent_at);
    setCqReceived(!!booking?.cq_received_at);
    setGhlTags([]); setNewTagInput(''); setShowTagInput(false); setTagSaving(false);
    setShowFollowUp(false); setFuDate(''); setFuNote(''); setFuTemp(3); setFuSaved(false);
    if (!booking?.email || isDemo) {
      if (isDemo) setGhlTags(['hot-lead', 'franchise-ready']);
      setGhlContact(null); return;
    }
    const ghlId = booking?.ghl_contact_id;
    const source = booking?._source_display;
    function applyContact(c) {
      setGhlContact(c); setGhlContactLoading(false);
      if (c?.tags?.length > 0) setGhlTags(c.tags);
      else {
        setGhlTagsLoading(true);
        fetch(`/api/dashboard/contact-tags?email=${encodeURIComponent(booking.email)}`)
          .then(r => r.json()).then(d => { setGhlTags(d.tags || []); setGhlTagsLoading(false); })
          .catch(() => setGhlTagsLoading(false));
      }
    }
    if (ghlId) {
      setGhlContactLoading(true);
      fetch(`/api/dashboard/ghl-contact-detail?contactId=${ghlId}`)
        .then(r => r.json()).then(d => applyContact(d.contact || null))
        .catch(() => { setGhlContact(null); setGhlContactLoading(false); });
    } else if (source === 'Calendly' && booking.email) {
      setGhlContactLoading(true);
      fetch(`/api/dashboard/ghl-contact-detail?email=${encodeURIComponent(booking.email)}`)
        .then(r => r.json()).then(d => applyContact(d.contact || null))
        .catch(() => { setGhlContact(null); setGhlContactLoading(false); });
    } else {
      setGhlContact(null); setGhlTagsLoading(true);
      fetch(`/api/dashboard/contact-tags?email=${encodeURIComponent(booking.email)}`)
        .then(r => r.json()).then(d => { setGhlTags(d.tags || []); setGhlTagsLoading(false); })
        .catch(() => setGhlTagsLoading(false));
    }
  }, [booking?.id]);

  useEffect(() => {
    if (!open) {
      setShowEmail(false); setEmailSent(false); setPitchOpen(false); setBrandEditMode(false);
      setPanelTab('info'); setTimeline([]); setShowFollowUp(false); setFuSaved(false);
      setNewTagInput(''); setShowTagInput(false); setGhlContact(null); setGhlContactLoading(false);
    }
  }, [open]);

  function openTimeline() {
    setPanelTab('timeline');
    if (timeline.length > 0 || tlLoading) return;
    setTlLoading(true);
    fetch(`/api/lead-events?email=${encodeURIComponent(booking.email)}`)
      .then(r => r.json()).then(d => { setTimeline(d.events || []); setTlLoading(false); })
      .catch(() => setTlLoading(false));
  }

  const selectedFI = selectedIdx !== null ? interests[selectedIdx] : null;
  function updateInterest(idx, field, value) {
    setInterests(prev => prev.map((fi, i) => i === idx ? { ...fi, [field]: value } : fi));
    if (field === 'developer_email' && idx === selectedIdx) setEmail(em => ({ ...em, to: value }));
  }
  function addBrand() {
    const newFI = { id: `fi_${Date.now()}`, brand: '', developer_name: '', developer_phone: '', developer_email: '' };
    setInterests(prev => [...prev, newFI]); setSelectedIdx(interests.length);
  }
  function removeBrand(idx) {
    const updated = interests.filter((_, i) => i !== idx);
    setInterests(updated);
    setSelectedIdx(updated.length === 0 ? null : Math.min(idx, updated.length - 1));
    saveInterestsToAPI(updated);
  }
  async function saveInterestsToAPI(data) {
    if (!lead || isDemo) return;
    await fetch('/api/dashboard/update-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lead.id, franchise_interests: data }) }).catch(console.error);
  }
  async function saveBrand() {
    setBrandSaving(true); await saveInterestsToAPI(interests); setBrandSaving(false);
    setBrandSaved(true); setTimeout(() => setBrandSaved(false), 2000);
  }
  async function saveNotes() {
    if (!lead || isDemo) { setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000); return; }
    setNotesSaving(true);
    await fetch('/api/dashboard/update-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lead.id, notes }) }).catch(console.error);
    setNotesSaving(false); setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000);
  }
  function sendEmail() { setEmailSent(true); setTimeout(() => { setEmailSent(false); setShowEmail(false); }, 2500); }
  async function sendCQ() {
    if (isDemo) { setCqSent(true); return; }
    setCqSent(true);
    await fetch('/api/dashboard/send-cq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: booking.id, email: booking.email, assigned_user_id: booking.assigned_user_id || null }) }).catch(console.error);
  }
  async function markCQReceived() {
    if (isDemo) { setCqReceived(true); return; }
    setCqRecvSaving(true);
    await fetch('/api/dashboard/mark-cq-received', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: booking.id, email: booking.email }) }).catch(console.error);
    setCqReceived(true); setCqRecvSaving(false);
  }
  async function addTag(tag) {
    const clean = tag.trim(); if (!clean || ghlTags.includes(clean)) return;
    setTagSaving(true); setGhlTags(prev => [...prev, clean]); setNewTagInput('');
    if (!isDemo) await fetch('/api/dashboard/contact-tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: booking.email, tags: [clean] }) }).catch(console.error);
    setTagSaving(false);
  }
  async function removeTag(tag) {
    setGhlTags(prev => prev.filter(t => t !== tag));
    if (!isDemo) await fetch('/api/dashboard/contact-tags', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: booking.email, tags: [tag] }) }).catch(console.error);
  }
  async function saveFollowUp() {
    setFuSaving(true);
    if (!isDemo) await fetch('/api/dashboard/schedule-followup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: booking.id, email: booking.email, follow_up_date: fuDate, note: fuNote || null, temperature: fuTemp }) }).catch(console.error);
    setFuSaving(false); setFuSaved(true); setTimeout(() => { setFuSaved(false); setShowFollowUp(false); }, 2200);
  }

  const raw = lead?.raw_fields ? (typeof lead.raw_fields === 'string' ? JSON.parse(lead.raw_fields) : lead.raw_fields) : {};
  const cf = ghlContact?.custom_fields || {};
  const liquidCapital = getField(raw, 'liquid_capital', 'liquid capital') || cf['Liquid Cash'] || cf['Cash Available'] || null;
  const ownedBusiness = getField(raw, 'owned_business', 'owned or managed', 'managed a business', 'business before') || cf['Owned Business'] || null;
  const territory = (() => {
    const city = lead?.location_city || ghlContact?.city;
    const state = lead?.location_state || ghlContact?.state;
    const zip = lead?.location_zip || ghlContact?.zip;
    const areaCode = lead?.location_area_code || ghlContact?.area_code;
    const locRaw = lead?.location_raw;
    const fbRaw = getField(raw, 'territory', 'area_of_interest', 'interested_area') || cf['Areas of Interest'] || cf['Territory Interest'];
    if (city || state) { const primary = [city, state].filter(Boolean).join(', '); const sub = zip || (areaCode ? `Area code ${areaCode}` : null); return { primary, sub }; }
    const fallback = locRaw || fbRaw; return fallback ? { primary: fallback, sub: null } : null;
  })();

  const meta = STATUS_META[booking.status] || STATUS_META.scheduled;
  const initials = `${booking.first_name?.[0] || ''}${booking.last_name?.[0] || ''}`.toUpperCase();
  const slot = booking.slot_start ? new Date(booking.slot_start) : null;
  const slotLabel = slot ? slot.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';
  const pitchBrands = interests.filter(fi => fi.brand && brandPitches[fi.brand]);
  const pitchFI = pitchBrands[pitchBrandIdx] || pitchBrands[0];
  const pitchText = pitchFI ? brandPitches[pitchFI.brand] : null;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.2)', zIndex: 100, opacity: open ? 1 : 0, transition: 'opacity .25s', pointerEvents: open ? 'auto' : 'none' }} />
      <div ref={panelRef} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,.10)', zIndex: 101, display: 'flex', flexDirection: 'column', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .25s cubic-bezier(.4,0,.2,1)', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" }}>

        {/* Header */}
        <div style={p.panelHdr}>
          <div style={p.avatar}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={p.clientName}>{booking.first_name} {booking.last_name}</div>
            <div style={{ fontSize: 12, color: '#6B7280' }}>{booking.email} {booking.phone ? `· ${booking.phone}` : ''}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              <SourceBadge source={booking._source_display || 'FranchiseBook'} />
              <span style={{ ...p.statusBadge, color: meta.color, background: meta.bg }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.dot, display: 'inline-block' }} />
                {meta.label}
              </span>
              {booking.health && <span style={{ ...p.statusBadge, color: booking.health.color, background: booking.health.bg }}>{booking.health.emoji} {booking.health.label}</span>}
            </div>
          </div>
          <button onClick={onClose} style={p.closeBtn}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={p.tabBar}>
          <button style={{ ...p.panelTab, ...(panelTab === 'info' ? p.panelTabActive : {}) }} onClick={() => setPanelTab('info')}>Info</button>
          <button style={{ ...p.panelTab, ...(panelTab === 'timeline' ? p.panelTabActive : {}) }} onClick={openTimeline}>Timeline</button>
        </div>

        {/* Body */}
        <div style={p.scrollBody}>
          {panelTab === 'timeline' ? (
            <TimelineView events={timeline} loading={tlLoading} bookingSource={booking.booking_source} />
          ) : loading ? (
            <div style={p.loadingMsg}>Loading…</div>
          ) : (
            <>
              {/* Quick Actions */}
              <div style={p.quickActions}>
                <div style={p.sectionTitle}>Quick Actions</div>
                {booking.status === 'scheduled' && (
                  <>
                    <button style={{ ...p.qaBtn, background: '#2563EB', color: '#fff', border: 'none', marginBottom: 8 }} onClick={() => onStatusChange('showed')}>
                      ✓ Mark Showed
                    </button>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={{ ...p.qaBtn, flex: 1, background: '#fff', color: '#374151', border: '1px solid #E5E7EB' }} onClick={() => setShowFollowUp(true)}>
                        📅 Reschedule
                      </button>
                      <button style={{ ...p.qaBtn, flex: 1, background: '#fff', color: '#374151', border: '1px solid #E5E7EB' }} onClick={() => { setPanelTab('info'); }}>
                        + Add Note
                      </button>
                    </div>
                    <button style={{ ...p.qaBtn, background: '#fff', color: '#6B7280', border: '1px solid #E5E7EB', marginTop: 8 }} onClick={() => onStatusChange('no-show')}>
                      ··· Mark No-Show
                    </button>
                  </>
                )}
                {booking.status === 'showed' && (
                  <button style={{ ...p.qaBtn, background: '#7C3AED', color: '#fff', border: 'none' }} onClick={() => onStatusChange('closed')}>
                    🏆 Mark Closed Won
                  </button>
                )}
                {(booking.status === 'no-show' || booking.status === 'closed') && (
                  <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '8px 0' }}>
                    {booking.status === 'closed' ? '🏆 Deal closed' : 'No further actions'}
                  </div>
                )}
              </div>

              {/* Contact */}
              <PanelSection title="Contact">
                {(() => { const phone = booking.phone || lead?.phone || ghlContact?.phone || ''; return <Row label="Phone"><a href={`tel:${phone}`} style={phone ? p.link : undefined}>{phone || '—'}</a></Row>; })()}
                <Row label="Email"><a href={`mailto:${booking.email}`} style={p.link}>{booking.email}</a></Row>
                <Row label="Scheduled"><span style={p.val}>{slotLabel}</span></Row>
                <Row label="Consultant"><span style={p.val}>{booking.assigned_to_email || ghlContact?.owner_name || '—'}</span></Row>
                {liquidCapital && <Row label="Liquid Cap."><span style={p.val}>{liquidCapital}</span></Row>}
                {ownedBusiness && <Row label="Owned Biz"><span style={p.val}>{ownedBusiness}</span></Row>}
                {territory && <Row label="Territory"><span style={p.val}>{territory.primary}{territory.sub && <span style={{ color: '#9CA3AF', fontSize: 11, marginLeft: 6 }}>{territory.sub}</span>}</span></Row>}
                {booking.meet_link && <Row label="Meet Link"><a href={booking.meet_link} target="_blank" rel="noreferrer" style={p.link}>Join call →</a></Row>}

                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #F0F0F0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <QBBtn variant="cq" onClick={sendCQ} disabled={cqSent}>{cqSent ? '✓ CQ Sent' : 'Send CQ'}</QBBtn>
                  {cqSent && !cqReceived && <QBBtn variant="pitch" onClick={markCQReceived} disabled={cqRecvSaving}>{cqRecvSaving ? 'Saving…' : 'Mark CQ Received'}</QBBtn>}
                  {cqReceived && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 3, fontSize: 12, fontWeight: 600, color: '#15803D', background: '#DCFCE7', border: '1px solid #BBF7D0' }}>✓ CQ Received</span>}
                </div>
              </PanelSection>

              {/* GHL Tags */}
              <PanelSection title="GHL Tags">
                {ghlTagsLoading ? <div style={{ fontSize: 12, color: '#9CA3AF' }}>Loading tags…</div> : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {ghlTags.map(tag => (
                      <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: '#EEF2FF', border: '1px solid #C7D2FE', color: '#3730A3', borderRadius: 20, padding: '2px 6px 2px 10px', fontSize: 11, fontWeight: 500 }}>
                        {tag}
                        <button onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', color: '#818CF8', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px', fontFamily: 'inherit' }}>×</button>
                      </span>
                    ))}
                    {!showTagInput && <button onClick={() => setShowTagInput(true)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1.5px dashed #CBD5E1', background: 'transparent', color: '#9CA3AF', cursor: 'pointer', fontSize: 16, lineHeight: '1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', padding: 0 }} title="Add tag">+</button>}
                    {showTagInput && (
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center', width: '100%', marginTop: 4 }}>
                        <input autoFocus style={{ ...p.input, flex: 1, padding: '4px 8px', fontSize: 12 }} placeholder="Tag name…" value={newTagInput} onChange={e => setNewTagInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && newTagInput.trim()) { addTag(newTagInput); setShowTagInput(false); setNewTagInput(''); } if (e.key === 'Escape') { setNewTagInput(''); setShowTagInput(false); } }} />
                        <button onClick={() => { if (newTagInput.trim()) { addTag(newTagInput); setNewTagInput(''); } setShowTagInput(false); }} disabled={tagSaving} style={{ ...p.editBtn, fontSize: 11, padding: '4px 10px' }}>{tagSaving ? '…' : 'Add'}</button>
                        <button onClick={() => { setNewTagInput(''); setShowTagInput(false); }} style={{ ...p.cancelEditBtn, fontSize: 11, padding: '4px 8px' }}>✕</button>
                      </div>
                    )}
                  </div>
                )}
              </PanelSection>

              {/* Franchise Brands */}
              <PanelSection title="Franchise Brands">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: interests.length > 0 ? 14 : 0 }}>
                  {interests.map((fi, i) => (
                    <div key={fi.id || i} style={{ display: 'flex', alignItems: 'center' }}>
                      <button onClick={() => { setSelectedIdx(i); setBrandEditMode(false); }} style={selectedIdx === i ? p.brandChipActive : p.brandChip}>{fi.brand || <em style={{ opacity: 0.6 }}>New Brand</em>}</button>
                      <button onClick={() => removeBrand(i)} style={p.brandChipX} title="Remove">×</button>
                    </div>
                  ))}
                  <button onClick={addBrand} style={p.addBrandBtn}>+ Brand</button>
                </div>
                {selectedFI && (
                  <div style={p.brandCard}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2B3C' }}>{selectedFI.brand || <em style={{ color: '#9CA3AF', fontWeight: 400 }}>Unnamed brand</em>}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setPitchBrandIdx(interests.indexOf(selectedFI)); setPitchOpen(true); }} style={{ ...p.editBtn, color: '#1A7E24', borderColor: '#A8D5AA', background: '#E3F4E5' }}>📞 Brand Pitch</button>
                        {!brandEditMode ? <button onClick={() => setBrandEditMode(true)} style={p.editBtn}>Edit</button>
                          : <><button onClick={async () => { await saveBrand(); setBrandEditMode(false); }} disabled={brandSaving} style={{ ...p.saveEditBtn, background: brandSaved ? '#2CA01C' : '#0077C5' }}>{brandSaving ? 'Saving…' : brandSaved ? '✓' : 'Save'}</button><button onClick={() => setBrandEditMode(false)} style={p.cancelEditBtn}>Cancel</button></>}
                      </div>
                    </div>
                    <div style={p.fieldGroupLabel}>Developer</div>
                    {brandEditMode ? (
                      <>
                        <div style={{ marginBottom: 8 }}><input style={p.input} placeholder="e.g. Wet Fuel" value={selectedFI.brand || ''} onChange={e => updateInterest(selectedIdx, 'brand', e.target.value)} /></div>
                        <div style={{ marginBottom: 8 }}><input style={p.input} placeholder="Developer name" value={selectedFI.developer_name || ''} onChange={e => updateInterest(selectedIdx, 'developer_name', e.target.value)} /></div>
                        <div style={{ marginBottom: 8 }}><input style={p.input} placeholder="(555) 000-0000" value={selectedFI.developer_phone || ''} onChange={e => updateInterest(selectedIdx, 'developer_phone', e.target.value)} /></div>
                        <div><input style={p.input} placeholder="developer@brand.com" value={selectedFI.developer_email || ''} onChange={e => updateInterest(selectedIdx, 'developer_email', e.target.value)} /></div>
                      </>
                    ) : (
                      <>
                        <Row label="Name"><span style={p.val}>{selectedFI.developer_name || <em style={{ color: '#9CA3AF' }}>Not set</em>}</span></Row>
                        <Row label="Phone">{selectedFI.developer_phone ? <a href={`tel:${selectedFI.developer_phone}`} style={p.link}>{selectedFI.developer_phone}</a> : <em style={{ color: '#9CA3AF', fontSize: 13 }}>Not set</em>}</Row>
                        <Row label="Email">{selectedFI.developer_email ? <a href={`mailto:${selectedFI.developer_email}`} style={p.link}>{selectedFI.developer_email}</a> : <em style={{ color: '#9CA3AF', fontSize: 13 }}>Not set</em>}</Row>
                      </>
                    )}
                  </div>
                )}
                {!selectedFI && interests.length === 0 && <div style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 8 }}>No brands added yet — click + Brand to add one.</div>}
                {selectedFI?.developer_email && <button onClick={() => setShowEmail(v => !v)} style={p.emailToggleBtn}>✉️ {showEmail ? 'Hide email' : 'Email developer'}</button>}
                {showEmail && selectedFI && (
                  <div style={p.emailBox}>
                    <div style={p.emailHeader}>New Email</div>
                    <div style={p.emailField}><span style={p.emailLabel}>To</span><input style={p.emailInput} value={email.to} onChange={e => setEmail(em => ({ ...em, to: e.target.value }))} placeholder="developer@brand.com" /></div>
                    <div style={p.emailField}><span style={p.emailLabel}>Subject</span><input style={p.emailInput} value={email.subject} onChange={e => setEmail(em => ({ ...em, subject: e.target.value }))} placeholder={`Re: ${booking.first_name} ${booking.last_name}`} /></div>
                    <textarea style={p.emailBody} rows={5} value={email.body} onChange={e => setEmail(em => ({ ...em, body: e.target.value }))} placeholder={`Hi ${selectedFI.developer_name || 'there'},\n\nI wanted to follow up…`} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={sendEmail} disabled={!email.to || emailSent} style={{ ...p.actionBtn, background: emailSent ? '#2CA01C' : '#0077C5', opacity: !email.to ? 0.5 : 1 }}>{emailSent ? '✓ Sent!' : 'Send Email'}</button>
                      <button onClick={() => setShowEmail(false)} style={p.cancelBtn}>Cancel</button>
                    </div>
                  </div>
                )}
              </PanelSection>

              {/* Notes */}
              <PanelSection title="Notes" bg="#FFFEF5">
                <textarea style={{ ...p.notesArea, background: '#FFFDF0' }} rows={5} value={notes} placeholder="Add notes about this client…" onChange={e => setNotes(e.target.value)} />
                <div style={{ marginTop: 10 }}>
                  <button onClick={saveNotes} disabled={notesSaving} style={{ ...p.actionBtn, background: notesSaved ? '#2CA01C' : '#0077C5' }}>{notesSaving ? 'Saving…' : notesSaved ? '✓ Saved' : 'Save Notes'}</button>
                </div>
              </PanelSection>
            </>
          )}
        </div>
      </div>

      {showFollowUp && <FollowUpModal booking={booking} fuDate={fuDate} setFuDate={setFuDate} fuNote={fuNote} setFuNote={setFuNote} fuTemp={fuTemp} setFuTemp={setFuTemp} fuSaving={fuSaving} fuSaved={fuSaved} onSave={saveFollowUp} onClose={() => setShowFollowUp(false)} />}

      {pitchOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setPitchOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 6, width: '100%', maxWidth: 520, boxShadow: '0 8px 40px rgba(0,0,0,.2)', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #EBEBEB' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2B3C' }}>📞 Phone Pitch</div>
                {pitchBrands.length > 1 && <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>{pitchBrands.map((fi, i) => <button key={fi.id} onClick={() => setPitchBrandIdx(i)} style={i === pitchBrandIdx ? p.brandChipActive : p.brandChip}>{fi.brand}</button>)}</div>}
                {pitchFI && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{pitchFI.brand}</div>}
              </div>
              <button onClick={() => setPitchOpen(false)} style={p.closeBtn}>✕</button>
            </div>
            <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              {pitchText ? <div style={{ fontSize: 14, color: '#1A2B3C', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{pitchText}</div>
                : <div style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', padding: '20px 0' }}>No pitch configured.<br /><a href="/dashboard" style={{ color: '#0077C5', textDecoration: 'none' }}>Set up pitches in Settings →</a></div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Follow-up Modal ──────────────────────────────────────────────────────────
const TEMP_LABELS = ['', 'Cold', 'Cool', 'Warm', 'Hot', 'On Fire'];
const TEMP_COLORS = ['', '#60A5FA', '#22D3EE', '#F59E0B', '#F97316', '#EF4444'];
const TEMP_BG     = ['', '#EFF6FF', '#ECFEFF', '#FFFBEB', '#FFF7ED', '#FEF2F2'];

function FollowUpModal({ booking, fuDate, setFuDate, fuNote, setFuNote, fuTemp, setFuTemp, fuSaving, fuSaved, onSave, onClose }) {
  const today = new Date().toISOString().split('T')[0];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 8, width: '100%', maxWidth: 440, boxShadow: '0 12px 48px rgba(0,0,0,.22)', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif", overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #EBEBEB' }}>
          <div><div style={{ fontSize: 15, fontWeight: 700, color: '#1A2B3C' }}>Schedule Follow-up</div><div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{booking.first_name} {booking.last_name} · {booking.email}</div></div>
          <button onClick={onClose} style={p.closeBtn}>✕</button>
        </div>
        <div style={{ padding: '20px 24px 24px' }}>
          {fuSaved ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 40 }}>✓</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#15803D', marginTop: 10 }}>Follow-up scheduled!</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>Added to your queue for {fuDate}</div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 18 }}><label style={p.editLabel}>Follow-up Date</label><input type="date" min={today} style={{ ...p.input, marginTop: 5, fontSize: 14 }} value={fuDate} onChange={e => setFuDate(e.target.value)} /></div>
              <div style={{ marginBottom: 18 }}>
                <label style={p.editLabel}>Likelihood to Engage</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
                  {[1,2,3,4,5].map(n => <button key={n} onClick={() => setFuTemp(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 30, lineHeight: 1, padding: '0 2px', color: fuTemp >= n ? TEMP_COLORS[fuTemp] : '#D1D5DB', transition: 'color .12s, transform .1s', transform: fuTemp === n ? 'scale(1.2)' : 'scale(1)' }}>★</button>)}
                </div>
                <div style={{ marginTop: 6, textAlign: 'center', fontSize: 12, fontWeight: 700, color: TEMP_COLORS[fuTemp], background: TEMP_BG[fuTemp], borderRadius: 20, padding: '3px 12px', display: 'inline-block', margin: '6px auto 0', width: '100%' }}>{TEMP_LABELS[fuTemp]}</div>
              </div>
              <div style={{ marginBottom: 22 }}><label style={p.editLabel}>Why follow up?</label><textarea style={{ ...p.notesArea, marginTop: 5, fontSize: 13 }} rows={3} placeholder="e.g. Wants to revisit after talking to spouse." value={fuNote} onChange={e => setFuNote(e.target.value)} /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onSave} disabled={!fuDate || fuSaving} style={{ ...p.actionBtn, flex: 1, background: !fuDate ? '#9CA3AF' : '#0077C5', cursor: !fuDate ? 'not-allowed' : 'pointer' }}>{fuSaving ? 'Scheduling…' : 'Schedule Follow-up'}</button>
                <button onClick={onClose} style={p.cancelBtn}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Panel helpers ────────────────────────────────────────────────────────────
function PanelSection({ title, bg, children }) {
  return (
    <div style={{ ...p.section, ...(bg ? { background: bg } : {}) }}>
      <div style={p.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}
function Row({ label, children }) {
  return <div style={p.row}>{label && <span style={p.rowLabel}>{label}</span>}<span style={p.rowVal}>{children}</span></div>;
}
function EditRow({ label, children }) {
  return <div style={{ marginBottom: 10 }}><label style={p.editLabel}>{label}</label>{children}</div>;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────
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
const SOURCE_LABELS = { direct: '🌐 Direct', facebook_lead: '📘 Facebook Lead', closebot: '🤖 CloseBot', sms: '💬 SMS', email: '📧 Email', retargeting: '🎯 Retargeting', calendly: '📅 Calendly', gohighlevel: '📋 GoHighLevel' };

function TimelineView({ events, loading, bookingSource }) {
  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Loading timeline…</div>;
  return (
    <div style={{ padding: '16px 20px' }}>
      {bookingSource && <div style={{ marginBottom: 18 }}><div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 6, letterSpacing: '.4px', fontWeight: 600 }}>BOOKING SOURCE</div><div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: '#F0F4FF', border: '1px solid #C7D7F8', fontSize: 13, fontWeight: 600, color: '#1D4ED8' }}>{SOURCE_LABELS[bookingSource] || bookingSource}</div></div>}
      {events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9CA3AF', fontSize: 13 }}>No events recorded yet.<br /><span style={{ fontSize: 12 }}>Events appear as the lead interacts with your system.</span></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {events.map((ev, i) => {
            const meta = EVENT_META[ev.event_type] || { label: ev.event_type.replace(/_/g, ' '), color: '#9CA3AF' };
            const ts = new Date(ev.created_at);
            const isLast = i === events.length - 1;
            const detail = ev.event_data?.slot ? new Date(ev.event_data.slot).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ev.event_data?.source ? ev.event_data.source.replace(/_/g, ' ') : ev.event_data?.note || null;
            return (
              <div key={ev.id} style={{ display: 'flex', gap: 14 }}>
                <div style={{ width: 16, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                  {!isLast && <div style={{ width: 1, flex: 1, background: '#E5E7EB', marginTop: 4 }} />}
                </div>
                <div style={{ flex: 1, paddingBottom: isLast ? 4 : 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', lineHeight: 1.3 }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                    {ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
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
    success:  { color: '#1A7E24', bg: '#E3F4E5', hoverBg: '#C3E6C5', border: '#A8D5AA' },
    warning:  { color: '#92400E', bg: '#FEF3C7', hoverBg: '#FDE68A', border: '#FCD34D' },
    danger:   { color: '#C23934', bg: '#FDECEA', hoverBg: '#FFCDD2', border: '#EF9A9A' },
    primary:  { color: '#0077C5', bg: '#E0EFF9', hoverBg: '#B3D4EE', border: '#90CAF9' },
    cq:       { color: '#5C35A8', bg: '#EEE9FA', hoverBg: '#DDD5F7', border: '#C5B8F0' },
    pitch:    { color: '#1A7E24', bg: '#E3F4E5', hoverBg: '#C3E6C5', border: '#A8D5AA' },
    followup: { color: '#374151', bg: '#F3F4F6', hoverBg: '#E5E7EB', border: '#D1D5DB' },
  }[variant];
  return <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 3, border: `1px solid ${vs.border}`, color: vs.color, background: hover ? vs.hoverBg : vs.bg, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background .15s', whiteSpace: 'nowrap', opacity: disabled ? 0.5 : 1 }}>{children}</button>;
}

// ─── Page styles ──────────────────────────────────────────────────────────────
const s = {
  page: { display: 'flex', minHeight: '100vh', background: '#F4F5F7', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },

  // White sidebar
  sidebar:          { width: 210, flexShrink: 0, background: '#fff', borderRight: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' },
  sideLogoWrap:     { padding: '20px 16px 16px', borderBottom: '1px solid #F3F4F6' },
  sideLogoRow:      { display: 'flex', alignItems: 'center', gap: 9 },
  sideLogoIcon:     { width: 30, height: 30, borderRadius: 8, background: '#2563EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 },
  sideLogoText:     { fontWeight: 700, fontSize: 14, color: '#111827', letterSpacing: '-0.2px' },
  sideNav:          { flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' },
  sideNavItem:      { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 7, fontSize: 13, fontWeight: 500, color: '#6B7280', textDecoration: 'none', transition: 'all .15s' },
  sideNavItemActive:{ background: '#EFF6FF', color: '#2563EB', fontWeight: 600 },
  sideBottom:       { borderTop: '1px solid #F3F4F6', padding: '8px 8px 16px' },
  sideHelpRow:      { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, cursor: 'pointer' },
  sideUserRow:      { display: 'flex', alignItems: 'center', gap: 9, padding: '10px 10px', borderRadius: 7, cursor: 'pointer', marginTop: 2 },
  sideUserAvatar:   { width: 30, height: 30, borderRadius: '50%', background: '#2563EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },

  // Main
  main:      { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  topBar:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: '#fff', borderBottom: '1px solid #E5E7EB', flexShrink: 0, gap: 16 },
  topTitle:  { fontSize: 20, fontWeight: 700, color: '#111827' },
  topDate:   { fontSize: 13, color: '#6B7280', fontWeight: 400, cursor: 'default' },
  topNavArrow:{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7280', fontSize: 14, fontFamily: 'inherit', padding: 0 },
  topActions:{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  searchInput:{ padding: '8px 12px 8px 32px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, color: '#374151', background: '#F9FAFB', fontFamily: 'inherit', outline: 'none', width: 260 },
  topBtn:    { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' },
  topBtnPrimary:{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  body:      { flex: 1, padding: '20px 24px', overflowY: 'auto' },
  demoBanner:{ background: '#FFFBF0', border: '1px solid #F5A623', borderLeft: '4px solid #F5A623', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#7D4E00', marginBottom: 16 },

  // Stats — one connected row
  statsCard:     { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, display: 'flex', marginBottom: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.04)' },
  statCell:      { flex: 1, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 },
  statIconCircle:{ width: 42, height: 42, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statNum:       { fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1, marginBottom: 3 },
  statLabel:     { fontSize: 12, color: '#6B7280', fontWeight: 500 },

  // Next Up
  nextUp:         { background: '#F0F7FF', border: '1px solid #BFDBFE', borderLeft: '4px solid #2563EB', borderRadius: 10, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20 },
  nextUpTimeCol:  { flexShrink: 0, minWidth: 110 },
  nextUpLabel:    { fontSize: 10, fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 4 },
  nextUpTime:     { fontSize: 36, fontWeight: 800, color: '#111827', lineHeight: 1 },
  nextUpAMPM:     { fontSize: 18, fontWeight: 500 },
  nextUpIn:       { fontSize: 13, color: '#2563EB', fontWeight: 600, marginTop: 4 },
  nextUpDivider:  { width: 1, height: 54, background: '#BFDBFE', flexShrink: 0 },
  nextUpAvatar:   { width: 46, height: 46, borderRadius: '50%', background: '#2563EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 },
  nextUpInfo:     { flex: 1, minWidth: 0 },
  nextUpName:     { fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 2 },
  nextUpSub:      { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  nextUpRep:      { fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center' },
  nextUpActions:  { display: 'flex', gap: 8, flexShrink: 0 },
  nextUpBtnOutline:{ padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1.5px solid #2563EB', background: '#fff', color: '#2563EB', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  nextUpBtnFill:   { padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  // Filters
  filterBar:         { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  filterPillActive:  { padding: '7px 16px', borderRadius: 20, background: '#2563EB', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' },
  filterPillOutline: { padding: '7px 16px', borderRadius: 20, background: '#fff', color: '#374151', border: '1px solid #E5E7EB', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  filterPillBadge:   { background: 'rgba(255,255,255,.3)', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 },
  filterSelect:      { appearance: 'none', WebkitAppearance: 'none', padding: '7px 28px 7px 12px', border: '1px solid #E5E7EB', borderRadius: 20, background: '#fff', fontSize: 13, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' },
  filterMoreBtn:     { padding: '7px 12px', background: 'none', border: 'none', fontSize: 13, color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  // Table
  tableCard:  { background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.04)' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:         { textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#9CA3AF', fontSize: 11, letterSpacing: '.4px', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB', textTransform: 'uppercase' },
  tr:         { borderBottom: '1px solid #F3F4F6', transition: 'background .1s' },
  td:         { padding: '14px 14px', verticalAlign: 'middle' },
  tableEmpty: { textAlign: 'center', padding: 56, color: '#9CA3AF', fontSize: 14 },
  iconBtn:    { width: 30, height: 30, borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'background .12s, border-color .12s' },
};

// ─── Panel styles ─────────────────────────────────────────────────────────────
const p = {
  panelHdr:      { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '20px 20px 14px', borderBottom: '1px solid #EBEBEB', flexShrink: 0 },
  avatar:        { width: 44, height: 44, borderRadius: '50%', background: '#2563EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 },
  clientName:    { fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 2 },
  statusBadge:   { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  closeBtn:      { background: 'none', border: 'none', fontSize: 18, color: '#9CA3AF', cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1, flexShrink: 0 },

  tabBar:        { display: 'flex', borderBottom: '1px solid #EBEBEB', flexShrink: 0, background: '#FAFAFA' },
  panelTab:      { flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 500, color: '#6B7280', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' },
  panelTabActive:{ color: '#2563EB', borderBottom: '2px solid #2563EB', fontWeight: 600 },

  scrollBody:    { flex: 1, overflowY: 'auto', padding: '0 0 24px' },
  loadingMsg:    { textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 14 },

  // Quick actions section
  quickActions:  { padding: '16px 20px', borderBottom: '1px solid #F0F0F0', background: '#FAFAFA' },

  section:       { padding: '16px 20px', borderBottom: '1px solid #F0F0F0' },
  sectionTitle:  { fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12 },

  // Quick action buttons
  qaBtn:         { width: '100%', padding: '11px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', display: 'block' },

  editBtn:       { fontSize: 12, fontWeight: 500, color: '#0077C5', background: 'transparent', border: '1px solid #B3D4EE', borderRadius: 3, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit' },
  saveEditBtn:   { fontSize: 12, fontWeight: 600, color: '#fff', border: 'none', borderRadius: 3, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' },
  cancelEditBtn: { fontSize: 12, fontWeight: 400, color: '#4A5568', background: '#F5F6F7', border: '1px solid #C8CDD2', borderRadius: 3, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' },

  fieldGroupLabel:{ fontSize: 10, fontWeight: 700, color: '#B0B8C4', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 },
  row:           { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14 },
  rowLabel:      { color: '#6B7280', width: 84, flexShrink: 0, fontSize: 13 },
  rowVal:        { color: '#1A2B3C', flex: 1 },
  link:          { color: '#2563EB', textDecoration: 'none', fontSize: 14 },
  val:           { fontSize: 13, color: '#1A2B3C' },
  input:         { width: '100%', padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' },
  editLabel:     { display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 },

  emailToggleBtn:{ marginTop: 12, padding: '7px 14px', background: '#F5F6F7', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#0077C5', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  emailBox:      { marginTop: 12, background: '#F8F9FA', border: '1px solid #D8DCE0', borderRadius: 4, padding: '14px 14px 12px' },
  emailHeader:   { fontSize: 12, fontWeight: 700, color: '#1A2B3C', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.4px' },
  emailField:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  emailLabel:    { fontSize: 11, color: '#6B7280', width: 44, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', flexShrink: 0 },
  emailInput:    { flex: 1, padding: '6px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none' },
  emailBody:     { width: '100%', padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' },
  actionBtn:     { padding: '8px 18px', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .2s' },
  cancelBtn:     { padding: '8px 14px', background: '#fff', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#4A5568', cursor: 'pointer', fontFamily: 'inherit' },
  notesArea:     { width: '100%', padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 },
  brandChip:     { padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 20, border: '1px solid #C8CDD2', background: '#F5F6F7', color: '#4A5568', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  brandChipActive:{ padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 20, border: '1px solid #2563EB', background: '#2563EB', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  brandChipX:    { padding: '2px 6px', fontSize: 14, lineHeight: 1, background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontFamily: 'inherit', marginLeft: -2 },
  addBrandBtn:   { padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 20, border: '1px dashed #C8CDD2', background: 'transparent', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' },
  brandCard:     { background: '#F8F9FA', border: '1px solid #E5E7EB', borderRadius: 4, padding: '14px 14px 12px', marginBottom: 12 },
};
