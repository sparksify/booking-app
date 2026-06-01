import { useState, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import Head from 'next/head';
import Link from 'next/link';
import { authOptions } from '../api/auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = [
  { key: 'new',       label: 'New',       color: '#6366F1', bg: '#EEF2FF' },
  { key: 'booked',    label: 'Booked',    color: '#0EA5E9', bg: '#E0F2FE' },
  { key: 'showed',    label: 'Showed',    color: '#16A34A', bg: '#DCFCE7' },
  { key: 'no_show',   label: 'No Show',   color: '#F59E0B', bg: '#FEF3C7' },
  { key: 'qualified', label: 'Qualified', color: '#7C3AED', bg: '#EDE9FE' },
  { key: 'lost',      label: 'Lost',      color: '#DC2626', bg: '#FEE2E2' },
];

const INV_LABELS = {
  lt_100k:     { label: 'Under $100k',  color: '#92400E', bg: '#FEF3C7' },
  '100k_250k': { label: '$100k–$250k',  color: '#1D4ED8', bg: '#DBEAFE' },
  '250k_500k': { label: '$250k–$500k',  color: '#6D28D9', bg: '#EDE9FE' },
  gt_500k:     { label: 'Over $500k',   color: '#065F46', bg: '#D1FAE5' },
};

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Server-side data fetch ───────────────────────────────────────────────────

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) {
    return { redirect: { destination: '/dashboard/login', permanent: false } };
  }

  const supabase = getSupabaseAdmin();

  // Fetch leads joined with their booking (if any)
  const { data: leads } = await supabase
    .from('leads')
    .select(`
      id, token, first_name, last_name, email, phone,
      investment_level, raw_fields, status,
      fb_form_id, fb_ad_id, fb_campaign_id,
      ghl_contact_id, created_at,
      bookings (
        id, slot_start, assigned_to_email, meet_link, status
      )
    `)
    .order('created_at', { ascending: false })
    .limit(300);

  return {
    props: {
      session,
      initialLeads: leads || [],
      baseUrl: `https://${context.req.headers.host}`,
    },
  };
}

// ─── Leads Dashboard ─────────────────────────────────────────────────────────

export default function LeadsDashboard({ initialLeads, baseUrl }) {
  const { data: session } = useSession();

  const [leads, setLeads]           = useState(initialLeads);
  const [statusFilter, setStatus]   = useState('all');
  const [invFilter, setInv]         = useState('all');
  const [search, setSearch]         = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [updating, setUpdating]     = useState(null);
  const [copied, setCopied]         = useState(null);

  // Filtered leads
  const filtered = useMemo(() => {
    let l = leads;
    if (statusFilter !== 'all') l = l.filter(x => x.status === statusFilter);
    if (invFilter    !== 'all') l = l.filter(x => x.investment_level === invFilter);
    if (search) {
      const q = search.toLowerCase();
      l = l.filter(x =>
        `${x.first_name} ${x.last_name} ${x.email} ${x.phone}`.toLowerCase().includes(q)
      );
    }
    return l;
  }, [leads, statusFilter, invFilter, search]);

  // Counts per status for badges
  const counts = useMemo(() => {
    const c = {};
    STATUSES.forEach(s => { c[s.key] = leads.filter(l => l.status === s.key).length; });
    return c;
  }, [leads]);

  async function updateStatus(id, newStatus) {
    setUpdating(id);
    await fetch('/api/dashboard/leads', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, status: newStatus }),
    });
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));
    setUpdating(null);
  }

  function copyBookingLink(token) {
    const url = `${baseUrl}/?t=${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <>
      <Head><title>Leads</title></Head>
      <div style={s.page}>

        {/* ── Header ── */}
        <header style={s.header}>
          <div style={s.headerLeft}>
            <span style={s.logo}>⬡ FranchiseBook</span>
            <nav style={s.nav}>
              <Link href="/dashboard/bookings"  style={s.navLink}>Bookings</Link>
              <Link href="/dashboard/leads"     style={{ ...s.navLink, ...s.navActive }}>Leads</Link>
              <Link href="/dashboard/analytics" style={s.navLink}>Analytics</Link>
            </nav>
          </div>
          <div style={s.headerRight}>
            <Link href="/dashboard/settings" style={s.navLink}>⚙ Settings</Link>
            <span style={s.headerUser}>{session?.user?.email}</span>
            <button style={s.signOutBtn} onClick={() => signOut({ callbackUrl: '/dashboard/login' })}>
              Sign out
            </button>
          </div>
        </header>

        {/* ── Status bar ── */}
        <div style={s.statusBar}>
          <button
            style={{ ...s.statusChip, ...(statusFilter === 'all' ? s.statusChipActive : {}) }}
            onClick={() => setStatus('all')}
          >
            All <span style={s.chipCount}>{leads.length}</span>
          </button>
          {STATUSES.map(st => (
            <button
              key={st.key}
              style={{
                ...s.statusChip,
                ...(statusFilter === st.key ? { ...s.statusChipActive, borderColor: st.color, color: st.color } : {}),
              }}
              onClick={() => setStatus(statusFilter === st.key ? 'all' : st.key)}
            >
              {st.label} <span style={s.chipCount}>{counts[st.key] || 0}</span>
            </button>
          ))}
        </div>

        {/* ── Filters ── */}
        <div style={s.toolbar}>
          <input
            style={s.searchInput}
            type="search"
            placeholder="Search name, email, phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select style={s.filterSelect} value={invFilter} onChange={e => setInv(e.target.value)}>
            <option value="all">All investment levels</option>
            {Object.entries(INV_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <span style={s.resultCount}>{filtered.length} leads</span>
        </div>

        {/* ── Leads list ── */}
        <main style={s.main}>
          {filtered.length === 0 ? (
            <div style={s.empty}>
              {leads.length === 0
                ? 'No leads yet. Once your Facebook webhook is live, leads will appear here automatically.'
                : 'No leads match your filters.'}
            </div>
          ) : (
            <div style={s.list}>
              {filtered.map(lead => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  expanded={expandedId === lead.id}
                  onToggle={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                  onStatusChange={updateStatus}
                  updating={updating === lead.id}
                  onCopyLink={() => copyBookingLink(lead.token)}
                  linkCopied={copied === lead.token}
                  baseUrl={baseUrl}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

// ─── Lead Row ─────────────────────────────────────────────────────────────────

function LeadRow({ lead, expanded, onToggle, onStatusChange, updating, onCopyLink, linkCopied, baseUrl }) {
  const status = STATUSES.find(s => s.key === lead.status) || STATUSES[0];
  const inv    = lead.investment_level ? INV_LABELS[lead.investment_level] : null;
  const booking = lead.bookings?.[0] || null;

  // Extra fields beyond core contact info
  const extraFields = Object.entries(lead.raw_fields || {}).filter(([k]) =>
    !['first_name','last_name','email','phone_number','phone'].includes(k)
  );

  return (
    <div style={{ ...s.row, opacity: updating ? 0.6 : 1 }}>
      {/* Main row */}
      <div style={s.rowMain} onClick={onToggle}>
        <div style={s.rowLeft}>
          <div style={s.leadName}>{lead.first_name} {lead.last_name}</div>
          <div style={s.leadContact}>
            {lead.email && <span>{lead.email}</span>}
            {lead.phone && <span style={s.dot}>·</span>}
            {lead.phone && <span>{formatPhone(lead.phone)}</span>}
          </div>
          <div style={s.leadMeta}>
            <span style={s.leadDate}>{formatDate(lead.created_at)}</span>
            {booking && (
              <span style={s.bookingPill}>📅 {formatSlot(booking.slot_start)}</span>
            )}
          </div>
        </div>
        <div style={s.rowRight}>
          {inv && (
            <span style={{ ...s.badge, color: inv.color, background: inv.bg }}>{inv.label}</span>
          )}
          <span style={{ ...s.badge, color: status.color, background: status.bg }}>{status.label}</span>
          <span style={{ ...s.chevron, transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={s.detail}>
          {/* Actions */}
          <div style={s.detailActions}>
            <button
              style={{ ...s.actionBtn, background: linkCopied ? '#16A34A' : '#1D4ED8', color: '#fff' }}
              onClick={onCopyLink}
            >
              {linkCopied ? '✓ Copied!' : '🔗 Copy booking link'}
            </button>
            {lead.ghl_contact_id && (
              <a
                href={`https://app.gohighlevel.com/contacts/${lead.ghl_contact_id}`}
                target="_blank"
                rel="noreferrer"
                style={{ ...s.actionBtn, background: '#F3F4F6', color: '#374151', textDecoration: 'none' }}
              >
                Open in GHL →
              </a>
            )}
          </div>

          {/* All form answers */}
          {extraFields.length > 0 && (
            <div style={s.rawFields}>
              <div style={s.rawTitle}>Form answers</div>
              {extraFields.map(([key, val]) => (
                <div key={key} style={s.rawRow}>
                  <span style={s.rawKey}>{key.replace(/_/g, ' ')}</span>
                  <span style={s.rawVal}>{val}</span>
                </div>
              ))}
            </div>
          )}

          {/* Booking info */}
          {booking && (
            <div style={s.bookingInfo}>
              <div style={s.rawTitle}>Booked call</div>
              <div style={s.rawRow}>
                <span style={s.rawKey}>Time</span>
                <span style={s.rawVal}>{formatSlot(booking.slot_start)}</span>
              </div>
              <div style={s.rawRow}>
                <span style={s.rawKey}>Rep</span>
                <span style={s.rawVal}>{booking.assigned_to_email || '—'}</span>
              </div>
              {booking.meet_link && (
                <div style={s.rawRow}>
                  <span style={s.rawKey}>Meet</span>
                  <a href={booking.meet_link} target="_blank" rel="noreferrer" style={s.link}>Join call →</a>
                </div>
              )}
            </div>
          )}

          {/* Move status */}
          <div style={s.moveRow}>
            <span style={s.moveLabel}>Move to:</span>
            {STATUSES.filter(st => st.key !== lead.status).map(st => (
              <button
                key={st.key}
                style={{ ...s.moveBtn, borderColor: st.color, color: st.color }}
                onClick={() => onStatusChange(lead.id, st.key)}
                disabled={updating}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${MON[d.getMonth()]} ${d.getDate()} at ${fmtTime(d)}`;
}

function formatSlot(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${MON[d.getMonth()]} ${d.getDate()} · ${fmtTime(d)}`;
}

function fmtTime(d) {
  const h = d.getHours(), m = d.getMinutes();
  const p = h >= 12 ? 'PM' : 'AM';
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${dh}:${String(m).padStart(2,'0')} ${p}`;
}

function formatPhone(p) {
  const d = (p || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return p;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page:         { minHeight: '100vh', background: '#F5F6F7', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif", color: '#1A2B3C', display: 'flex', flexDirection: 'column' },

  // QB dark header — precise color
  header:       { background: '#151719', padding: '0 20px', height: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, flexShrink: 0 },
  headerLeft:   { display: 'flex', alignItems: 'center', gap: 28 },
  logo:         { fontWeight: 600, fontSize: 15, color: '#FFFFFF', letterSpacing: '-0.2px', flexShrink: 0 },
  nav:          { display: 'flex', gap: 2 },
  navLink:      { fontSize: 13, color: '#9FA6B2', textDecoration: 'none', padding: '7px 14px', borderRadius: 3, fontWeight: 400 },
  navActive:    { color: '#FFFFFF', background: 'rgba(255,255,255,.13)' },
  headerRight:  { display: 'flex', alignItems: 'center', gap: 12 },
  headerUser:   { fontSize: 13, color: '#9FA6B2' },
  signOutBtn:   { fontSize: 12, fontWeight: 400, color: '#9FA6B2', background: 'transparent', border: '1px solid rgba(255,255,255,.18)', borderRadius: 3, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },

  // Status filter bar
  statusBar:    { background: '#fff', borderBottom: '1px solid #D8DCE0', padding: '9px 20px', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 },
  statusChip:   { padding: '5px 12px', fontSize: 12, fontWeight: 400, color: '#4A5568', background: '#F5F6F7', border: '1px solid #D8DCE0', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 },
  statusChipActive: { background: '#E0EFF9', color: '#0077C5', borderColor: '#0077C5' },
  chipCount:    { fontWeight: 600, opacity: 0.7 },

  // Toolbar
  toolbar:      { background: '#fff', borderBottom: '1px solid #D8DCE0', padding: '9px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  searchInput:  { flex: 1, maxWidth: 300, padding: '7px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1A2B3C' },
  filterSelect: { padding: '7px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', background: '#fff', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' },
  resultCount:  { fontSize: 12, color: '#9CA3AF', fontWeight: 400, marginLeft: 'auto' },

  // Lead list
  main:         { flex: 1, padding: '18px 20px' },
  list:         { display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 960, margin: '0 auto' },
  empty:        { textAlign: 'center', padding: '60px 24px', fontSize: 14, color: '#9CA3AF', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 },

  // Lead row card — QB white card, thin border, no shadow
  row:          { background: '#fff', border: '1px solid #D8DCE0', borderRadius: 4, overflow: 'hidden', transition: 'opacity .15s' },
  rowMain:      { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '13px 16px', cursor: 'pointer' },
  rowLeft:      { flex: 1, minWidth: 0 },
  leadName:     { fontSize: 14, fontWeight: 600, color: '#1A2B3C', marginBottom: 3 },
  leadContact:  { fontSize: 13, color: '#6B7280', display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 },
  dot:          { color: '#C8CDD2' },
  leadMeta:     { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  leadDate:     { fontSize: 11, color: '#9CA3AF' },
  bookingPill:  { fontSize: 11, fontWeight: 500, color: '#0077C5', background: '#E0EFF9', borderRadius: 10, padding: '2px 8px' },
  rowRight:     { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 12 },
  badge:        { fontSize: 10, fontWeight: 600, borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap' },
  chevron:      { fontSize: 16, color: '#9CA3AF', transition: 'transform .2s', display: 'inline-block', lineHeight: 1 },

  // Expanded detail
  detail:       { borderTop: '1px solid #EBEBEB', padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 12, background: '#F8F9FA' },
  detailActions:{ display: 'flex', gap: 8, flexWrap: 'wrap' },
  actionBtn:    { padding: '7px 14px', borderRadius: 3, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },

  rawFields:    { background: '#fff', border: '1px solid #D8DCE0', borderRadius: 4, padding: '10px 14px' },
  bookingInfo:  { background: '#E0EFF9', border: '1px solid #B3D4EE', borderRadius: 4, padding: '10px 14px' },
  rawTitle:     { fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 },
  rawRow:       { display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 4 },
  rawKey:       { fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'capitalize', minWidth: 100, flexShrink: 0 },
  rawVal:       { fontSize: 13, color: '#1A2B3C' },
  link:         { fontSize: 13, color: '#0077C5', textDecoration: 'none', fontWeight: 500 },

  moveRow:      { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  moveLabel:    { fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' },
  moveBtn:      { padding: '5px 12px', background: '#fff', border: '1px solid', borderRadius: 3, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
};
