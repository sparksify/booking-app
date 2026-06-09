import { useState, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import Head from 'next/head';
import Link from 'next/link';
import { authOptions } from '../api/auth/[...nextauth]';
import { guardDashboardPage } from '@/lib/pageAccess';
import { visibleNav } from '@/lib/nav';
import BrandLogo from '@/components/BrandLogo';
import SidebarUser from '@/components/SidebarUser';
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

const AVATAR_COLORS = {
  new:       { bg: '#EEF2FF', color: '#6366F1' },
  booked:    { bg: '#E0F2FE', color: '#0EA5E9' },
  showed:    { bg: '#DCFCE7', color: '#16A34A' },
  no_show:   { bg: '#FEF3C7', color: '#F59E0B' },
  qualified: { bg: '#EDE9FE', color: '#7C3AED' },
  lost:      { bg: '#FEE2E2', color: '#DC2626' },
};

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getSourceBadge(lead) {
  if (lead.fb_form_id)          return { label: 'Facebook',     color: '#1877F2', bg: '#EBF5FF' };
  const src = lead.source || '';
  if (src === 'calendly')       return { label: 'Calendly',     color: '#0F766E', bg: '#CCFBF1' };
  if (src === 'gohighlevel')    return { label: 'GoHighLevel',  color: '#7C3AED', bg: '#EDE9FE' };
  return                               { label: 'KANSO', color: '#1D4ED8', bg: '#DBEAFE' };
}

// ─── Server-side data fetch ───────────────────────────────────────────────────

export async function getServerSideProps(context) {
  const gate = await guardDashboardPage(context, '/dashboard/leads');
  if (gate.redirect) return gate;
  const { session, perms } = gate;

  const supabase = getSupabaseAdmin();

  // Fetch both tables in parallel
  const [{ data: leadsRaw }, { data: bookingsRaw }] = await Promise.all([
    supabase
      .from('leads')
      .select(`
        id, token, first_name, last_name, email, phone,
        investment_level, raw_fields, status,
        fb_form_id, fb_ad_id, fb_campaign_id,
        ghl_contact_id, created_at,
        bookings (id, slot_start, assigned_to_email, meet_link, status, booking_source)
      `)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('bookings')
      .select('id, first_name, last_name, email, phone, slot_start, assigned_to_email, meet_link, status, investment_level, created_at, booking_source')
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const leads    = leadsRaw   || [];
  const bookings = bookingsRaw || [];

  // Emails already covered by a lead record
  const leadEmails = new Set(leads.map(l => (l.email || '').toLowerCase()).filter(Boolean));

  // Convert orphan bookings (no lead record) into synthetic contact entries
  const orphanContacts = bookings
    .filter(b => b.email && !leadEmails.has(b.email.toLowerCase()))
    .map(b => ({
      id:               `b_${b.id}`,
      token:            null,
      first_name:       b.first_name || '',
      last_name:        b.last_name  || '',
      email:            b.email,
      phone:            b.phone      || '',
      investment_level: b.investment_level || null,
      raw_fields:       {},
      status:           'booked',
      fb_form_id:       null,
      ghl_contact_id:   null,
      source:           b.booking_source || 'direct',
      created_at:       b.created_at,
      bookings:         [{
        id: b.id, slot_start: b.slot_start,
        assigned_to_email: b.assigned_to_email,
        meet_link: b.meet_link, status: b.status,
        booking_source: b.booking_source,
      }],
    }));

  // Merge + sort by date descending
  const allContacts = [...leads, ...orphanContacts].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  return {
    props: {
      session,
      perms,
      platformLogo: gate.logo,
      navOrder: gate.navOrder,
      initialLeads: allContacts,
      baseUrl: `https://${context.req.headers.host}`,
    },
  };
}

// ─── Sidebar icon component ───────────────────────────────────────────────────

function SideIcon({ name }) {
  const p = { width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', style: { display: 'block' } };
  if (name === 'dashboard') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === 'leads')     return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  if (name === 'clients')   return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === 'meetings')  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (name === 'nurture')   return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
  if (name === 'settings')  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
  if (name === 'help')      return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
  if (name === 'cq')        return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9.5 13.5a2 2 0 1 1 2.5 1.9c-.4.15-.5.4-.5.8"/><line x1="11.5" y1="18" x2="11.51" y2="18"/></svg>;
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LeadsDashboard({ initialLeads, baseUrl, perms = {}, platformLogo = null, navOrder = null }) {
  const { data: session } = useSession();

  const [leads,        setLeads]       = useState(initialLeads);
  const [statusFilter, setStatus]      = useState('all');
  const [invFilter,    setInv]         = useState('all');
  const [search,       setSearch]      = useState('');
  const [expandedId,   setExpandedId]  = useState(null);
  const [updating,     setUpdating]    = useState(null);
  const [copied,       setCopied]      = useState(null);

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

  const counts = useMemo(() => {
    const c = { all: leads.length };
    STATUSES.forEach(st => { c[st.key] = leads.filter(l => l.status === st.key).length; });
    return c;
  }, [leads]);

  async function updateStatus(id, newStatus) {
    setUpdating(id);
    const isOrphan = String(id).startsWith('b_');
    const table    = isOrphan ? 'bookings' : 'leads';
    const realId   = isOrphan ? String(id).slice(2) : id;
    await fetch('/api/dashboard/leads', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: realId, status: newStatus, table }),
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

        {/* ── Sidebar ── */}
        <aside style={s.sidebar}>
          <div style={s.sideLogoWrap}>
            <div style={s.sideLogoRow}>
              <BrandLogo logo={platformLogo} />
            </div>
          </div>
          <nav style={s.sideNav}>
            {visibleNav(perms, navOrder).map(({ href, label, icon }) => {
              const active = href === '/dashboard/leads';
              return (
                <Link key={label} href={href} style={{ ...s.sideNavItem, ...(active ? s.sideNavItemActive : {}) }}>
                  <span style={{ color: active ? '#0057FF' : '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                    <SideIcon name={icon} />
                  </span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
          <div style={s.sideBottom}>
            <div style={s.sideHelpRow}>
              <span style={{ color: '#9CA3AF', display: 'flex' }}><SideIcon name="help" /></span>
              <span style={{ fontSize: 13, color: '#6B7280' }}>Help</span>
            </div>
            <SidebarUser />
          </div>
        </aside>

        {/* ── Main column ── */}
        <div style={s.mainCol}>
          <div style={s.topBar}>
            <div>
              <div style={s.topTitle}>Leads</div>
              <div style={s.topDate}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            </div>
            <div style={s.topActions}>
              {/* existing top-bar controls */}
            </div>
          </div>
          <div style={s.body}>

            {/* ── Control bar: title + status filters + investment dropdown ── */}
            <div style={s.controlBar}>
              <div style={s.controlLeft}>
                <span style={s.pageTitle}>All Contacts</span>
                <span style={s.totalBadge}>{leads.length.toLocaleString()}</span>
              </div>
              <div style={s.controlRight}>
                <div style={s.statusChips}>
                  <button
                    style={{ ...s.chip, ...(statusFilter === 'all' ? s.chipActiveAll : {}) }}
                    onClick={() => setStatus('all')}
                  >
                    All <span style={s.chipCount}>{counts.all}</span>
                  </button>
                  {STATUSES.map(st => (
                    <button
                      key={st.key}
                      style={{
                        ...s.chip,
                        ...(statusFilter === st.key
                          ? { background: st.bg, color: st.color, borderColor: st.color }
                          : {}),
                      }}
                      onClick={() => setStatus(statusFilter === st.key ? 'all' : st.key)}
                    >
                      {st.label}
                      {counts[st.key] > 0 && <span style={s.chipCount}>{counts[st.key]}</span>}
                    </button>
                  ))}
                </div>
                <select style={s.filterSelect} value={invFilter} onChange={e => setInv(e.target.value)}>
                  <option value="all">All investment levels</option>
                  {Object.entries(INV_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── Search bar ── */}
            <div style={s.searchWrap}>
              <div style={s.searchBox}>
                <svg style={s.searchIcon} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="8.5" cy="8.5" r="5.5" stroke="#9CA3AF" strokeWidth="1.5"/>
                  <path d="M13.5 13.5L17 17" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input
                  style={s.searchInput}
                  type="text"
                  placeholder="Search by name, email, or phone number…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoComplete="off"
                  spellCheck="false"
                />
                {search && (
                  <button style={s.clearBtn} onClick={() => setSearch('')} title="Clear">×</button>
                )}
              </div>
              <span style={s.resultCount}>{filtered.length.toLocaleString()} contact{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {/* ── Contact list ── */}
            {filtered.length === 0 ? (
              <div style={s.empty}>
                {leads.length === 0
                  ? 'No contacts yet. Leads from Facebook, KANSO, and other sources will appear here automatically.'
                  : 'No contacts match your search or filters.'}
              </div>
            ) : (
              <div style={s.list}>
                {filtered.map(lead => (
                  <ContactRow
                    key={lead.id}
                    lead={lead}
                    expanded={expandedId === lead.id}
                    onToggle={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                    onStatusChange={updateStatus}
                    updating={updating === lead.id}
                    onCopyLink={lead.token ? () => copyBookingLink(lead.token) : null}
                    linkCopied={copied === lead.token}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Contact Row ─────────────────────────────────────────────────────────────

function ContactRow({ lead, expanded, onToggle, onStatusChange, updating, onCopyLink, linkCopied }) {
  const status  = STATUSES.find(s => s.key === lead.status) || STATUSES[0];
  const inv     = lead.investment_level ? INV_LABELS[lead.investment_level] : null;
  const booking = lead.bookings?.[0] || null;
  const source  = getSourceBadge(lead);
  const avCol   = AVATAR_COLORS[lead.status] || AVATAR_COLORS.new;
  const initials = [lead.first_name?.[0], lead.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';

  const extraFields = Object.entries(lead.raw_fields || {}).filter(([k]) =>
    !['first_name','last_name','email','phone_number','phone'].includes(k)
  );

  return (
    <div style={{ ...s.row, opacity: updating ? 0.6 : 1, borderLeftColor: status.color }}>

      {/* Main row */}
      <div style={s.rowMain} onClick={onToggle}>

        {/* Avatar */}
        <div style={{ ...s.avatar, background: avCol.bg, color: avCol.color }}>{initials}</div>

        {/* Info */}
        <div style={s.rowBody}>
          <div style={s.contactName}>{lead.first_name} {lead.last_name}</div>
          <div style={s.contactSub}>
            {lead.email && <span style={s.contactEmail}>{lead.email}</span>}
            {lead.email && lead.phone && <span style={s.dot}>·</span>}
            {lead.phone && <span>{formatPhone(lead.phone)}</span>}
          </div>
          <div style={s.contactMeta}>
            <span style={s.metaDate}>{formatDate(lead.created_at)}</span>
            {booking?.slot_start && (
              <span style={s.bookingPill}>Booked · {formatSlot(booking.slot_start)}</span>
            )}
          </div>
        </div>

        {/* Badges */}
        <div style={s.rowRight}>
          <span style={{ ...s.srcBadge, color: source.color, background: source.bg }}>{source.label}</span>
          {inv && <span style={{ ...s.badge, color: inv.color, background: inv.bg }}>{inv.label}</span>}
          <span style={{ ...s.badge, color: status.color, background: status.bg }}>{status.label}</span>
          <span style={{ ...s.chevron, transform: expanded ? 'rotate(90deg)' : 'none' }}>›</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={s.detail}>

          {/* Actions */}
          <div style={s.detailActions}>
            {onCopyLink && (
              <button
                style={{ ...s.actionBtn, background: linkCopied ? '#16A34A' : '#1D4ED8', color: '#fff' }}
                onClick={onCopyLink}
              >
                {linkCopied ? '✓ Link copied' : 'Copy booking link'}
              </button>
            )}
            {lead.ghl_contact_id && (
              <a
                href={`https://app.gohighlevel.com/contacts/${lead.ghl_contact_id}`}
                target="_blank" rel="noreferrer"
                style={{ ...s.actionBtn, background: '#F3F4F6', color: '#374151', textDecoration: 'none' }}
              >
                Open in GHL →
              </a>
            )}
          </div>

          {/* Form answers */}
          {extraFields.length > 0 && (
            <div style={s.detailBlock}>
              <div style={s.blockTitle}>Form answers</div>
              {extraFields.map(([key, val]) => (
                <div key={key} style={s.kv}>
                  <span style={s.kvKey}>{key.replace(/_/g, ' ')}</span>
                  <span style={s.kvVal}>{String(val)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Booking info */}
          {booking?.slot_start && (
            <div style={{ ...s.detailBlock, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
              <div style={s.blockTitle}>Booked call</div>
              <div style={s.kv}>
                <span style={s.kvKey}>When</span>
                <span style={s.kvVal}>{formatSlot(booking.slot_start)}</span>
              </div>
              <div style={s.kv}>
                <span style={s.kvKey}>Rep</span>
                <span style={s.kvVal}>{booking.assigned_to_email || '—'}</span>
              </div>
              {booking.meet_link && (
                <div style={s.kv}>
                  <span style={s.kvKey}>Meet</span>
                  <a href={booking.meet_link} target="_blank" rel="noreferrer" style={s.link}>Join call →</a>
                </div>
              )}
            </div>
          )}

          {/* Status change */}
          <div style={s.moveRow}>
            <span style={s.moveLabel}>Move to</span>
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
  return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${fmtTime(d)}`;
}

function formatSlot(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${MON[d.getMonth()]} ${d.getDate()} · ${fmtTime(d)}`;
}

function fmtTime(d) {
  const h = d.getHours(), m = d.getMinutes();
  const p  = h >= 12 ? 'PM' : 'AM';
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
  page:        { display: 'flex', minHeight: '100vh', background: '#FAFBFD', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },

  // Sidebar
  sidebar:          { width: 210, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' },
  sideLogoWrap:     { padding: '20px 16px 16px', borderBottom: '1px solid #E2E8F0' },
  sideLogoRow:      { display: 'flex', alignItems: 'center', gap: 9 },
  sideLogoIcon:     { width: 30, height: 30, borderRadius: 8, background: '#0057FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 },
  sideLogoText:     { fontWeight: 700, fontSize: 14, color: '#0F172A', letterSpacing: '-0.2px' },
  sideNav:          { flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' },
  sideNavItem:      { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 7, fontSize: 13, fontWeight: 500, color: '#475569', textDecoration: 'none', transition: 'all .15s' },
  sideNavItemActive:{ background: '#EFF6FF', color: '#0057FF', fontWeight: 600 },
  sideBottom:       { borderTop: '1px solid #E2E8F0', padding: '8px 8px 16px' },
  sideHelpRow:      { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, cursor: 'pointer' },
  sideUserRow:      { display: 'flex', alignItems: 'center', gap: 9, padding: '10px 10px', borderRadius: 7, cursor: 'pointer', marginTop: 2 },
  sideUserAvatar:   { width: 30, height: 30, borderRadius: '50%', background: '#0057FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },

  // Main column
  mainCol:   { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  topBar:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', flexShrink: 0, gap: 16 },
  topTitle:  { fontSize: 20, fontWeight: 700, color: '#0F172A' },
  topDate:   { fontSize: 13, color: '#64748B', fontWeight: 400, marginTop: 2 },
  topActions:{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  body:      { flex: 1, padding: '16px 24px', overflowY: 'auto' },

  // Control bar
  controlBar:  { background: '#fff', borderBottom: '1px solid #D8DCE0', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', flexShrink: 0 },
  controlLeft: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  pageTitle:   { fontSize: 15, fontWeight: 600, color: '#1A2B3C' },
  totalBadge:  { fontSize: 11, fontWeight: 700, color: '#fff', background: '#6B7280', borderRadius: 20, padding: '2px 8px' },
  controlRight:{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' },
  statusChips: { display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' },
  chip:        { padding: '4px 11px', fontSize: 12, fontWeight: 500, color: '#6B7280', background: '#F5F6F7', border: '1px solid #D8DCE0', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4, lineHeight: 1.4 },
  chipActiveAll:{ background: '#E0EFF9', color: '#0077C5', borderColor: '#0077C5' },
  chipCount:   { fontWeight: 700, fontSize: 10, opacity: 0.7 },
  filterSelect:{ padding: '5px 10px', border: '1px solid #C8CDD2', borderRadius: 4, fontSize: 12, color: '#374151', background: '#fff', fontFamily: 'inherit', outline: 'none', cursor: 'pointer', marginLeft: 'auto' },

  // Search
  searchWrap:  { background: '#F2F3F5', borderBottom: '1px solid #D8DCE0', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  searchBox:   { flex: 1, maxWidth: 880, display: 'flex', alignItems: 'center', background: '#fff', border: '1.5px solid #C8CDD2', borderRadius: 7, padding: '0 14px', gap: 10 },
  searchIcon:  { width: 17, height: 17, flexShrink: 0 },
  searchInput: { flex: 1, border: 'none', outline: 'none', fontSize: 14, color: '#1A2B3C', padding: '12px 0', background: 'transparent', fontFamily: 'inherit' },
  clearBtn:    { background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9CA3AF', padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' },
  resultCount: { fontSize: 12, color: '#9CA3AF', flexShrink: 0 },

  // List
  list:        { display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 1080, margin: '0 auto' },
  empty:       { textAlign: 'center', padding: '60px 24px', fontSize: 14, color: '#9CA3AF', maxWidth: 440, margin: '0 auto', lineHeight: 1.7 },

  // Contact row card — colored left border accent
  row:         { background: '#fff', border: '1px solid #D8DCE0', borderLeft: '3px solid transparent', borderRadius: 5, overflow: 'hidden', transition: 'opacity .15s' },
  rowMain:     { display: 'flex', alignItems: 'center', padding: '11px 16px 11px 14px', cursor: 'pointer', gap: 13 },
  avatar:      { width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, letterSpacing: '-0.5px' },
  rowBody:     { flex: 1, minWidth: 0 },
  contactName: { fontSize: 14, fontWeight: 600, color: '#1A2B3C', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  contactSub:  { fontSize: 12, color: '#6B7280', display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 3, alignItems: 'center' },
  contactEmail:{ color: '#374151' },
  dot:         { color: '#D1D5DB' },
  contactMeta: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaDate:    { fontSize: 11, color: '#9CA3AF' },
  bookingPill: { fontSize: 11, fontWeight: 500, color: '#0077C5', background: '#E0EFF9', borderRadius: 10, padding: '2px 8px' },
  rowRight:    { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  srcBadge:    { fontSize: 10, fontWeight: 700, borderRadius: 3, padding: '2px 7px', whiteSpace: 'nowrap', letterSpacing: '.2px' },
  badge:       { fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap' },
  chevron:     { fontSize: 20, color: '#9CA3AF', transition: 'transform .2s', display: 'inline-block', lineHeight: 1, marginLeft: 2 },

  // Expanded detail
  detail:       { borderTop: '1px solid #EBEBEB', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, background: '#F8F9FA' },
  detailActions:{ display: 'flex', gap: 8, flexWrap: 'wrap' },
  actionBtn:    { padding: '7px 14px', borderRadius: 4, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  detailBlock:  { background: '#fff', border: '1px solid #D8DCE0', borderRadius: 5, padding: '10px 14px' },
  blockTitle:   { fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 },
  kv:           { display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 4 },
  kvKey:        { fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'capitalize', minWidth: 70, flexShrink: 0 },
  kvVal:        { fontSize: 13, color: '#1A2B3C' },
  link:         { fontSize: 13, color: '#0077C5', textDecoration: 'none', fontWeight: 500 },
  moveRow:      { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  moveLabel:    { fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.3px' },
  moveBtn:      { padding: '4px 11px', background: '#fff', border: '1px solid', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
};
