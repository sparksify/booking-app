import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

// ── Pipeline stage definitions ─────────────────────────────────────────────────
const STAGES = [
  null,
  { label: 'Intro Call',              short: 'Intro Call',   color: '#9F1239', bg: '#FFF1F2', border: '#FECDD3', bar: '#FB7185' },
  { label: 'Unit Economics',          short: 'Unit Econ',    color: '#C2410C', bg: '#FFF7ED', border: '#FED7AA', bar: '#FB923C' },
  { label: 'FDD Review & Territory',  short: 'FDD Review',   color: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE', bar: '#A78BFA' },
  { label: 'Confirmation Day Invite', short: 'Conf. Invite', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', bar: '#60A5FA' },
  { label: 'Committed',               short: 'Committed',    color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0', bar: '#34D399' },
];

const SENTIMENTS = {
  positive: { label: 'Positive',  emoji: '👍', color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  neutral:  { label: 'Neutral',   emoji: '😐', color: '#92400E', bg: '#FEF3C7', border: '#FCD34D' },
  concerns: { label: 'Concerns',  emoji: '⚠️', color: '#B45309', bg: '#FEF9C3', border: '#FDE047' },
  passed:   { label: 'Passed',    emoji: '❌', color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
};

const DECAY = {
  good:    { label: 'On track',   color: '#15803D', bg: '#DCFCE7', dot: '#22C55E' },
  warning: { label: 'Due soon',   color: '#92400E', bg: '#FEF3C7', dot: '#F59E0B' },
  urgent:  { label: 'Overdue',    color: '#B91C1C', bg: '#FEE2E2', dot: '#EF4444' },
};

// ── Demo data ──────────────────────────────────────────────────────────────────
const now = Date.now();
const daysAgo = d => new Date(now - d * 86400000).toISOString();

const DEMO_CLIENTS = [
  {
    id: 'n1', first_name: 'William', last_name: 'Brooks',
    email: 'william.brooks@email.com', phone: '(512) 555-0192',
    status: 'active', funding_intro_done: false,
    last_contacted_at: daysAgo(9), entered_at: daysAgo(18),
    days_since_contact: 9, days_in_process: 18, decay: 'urgent', max_stage: 2,
    funding_needed: true,
    notes: 'Very motivated. Liquid capital ready. Spouse fully on board.',
    brands: [
      { id: 'b1', nurture_client_id: 'n1', brand_name: 'Pilates Addiction', stage: 2, sentiment: 'positive', note: 'Loved unit economics call. Ready to review FDD next.', developer_name: 'Sarah Mitchell', developer_phone: '(800) 555-0101', developer_email: 'smitchell@pilatesaddiction.com' },
      { id: 'b2', nurture_client_id: 'n1', brand_name: 'Squeeze House',     stage: 1, sentiment: 'neutral',  note: 'Intro call with developer scheduled next week.', developer_name: '', developer_phone: '', developer_email: '' },
    ],
    touchpoints: [
      { id: 't1', medium: 'call',  note: 'Discussed Pilates Addiction unit economics. Very excited about margins.', created_at: daysAgo(9),  created_by: 'steve@sparksify.com' },
      { id: 't2', medium: 'email', note: 'Sent FDD overview doc and territory map.',                               created_at: daysAgo(14), created_by: 'steve@sparksify.com' },
    ],
  },
  {
    id: 'n2', first_name: 'Jennifer', last_name: 'Caldwell',
    email: 'jcaldwell@gmail.com', phone: '(214) 555-0847',
    status: 'active', funding_intro_done: true,
    last_contacted_at: daysAgo(3), entered_at: daysAgo(30),
    days_since_contact: 3, days_in_process: 30, decay: 'good', max_stage: 3,
    funding_needed: false,
    notes: 'Moving fast. Attorney reviewing FDD. Funding intro done with Capital One Franchise.',
    brands: [
      { id: 'b3', nurture_client_id: 'n2', brand_name: 'Freecoat Nails', stage: 3, sentiment: 'positive', note: 'FDD under review with attorney. Territory mapped — loves Austin area.', developer_name: 'Jason Park', developer_phone: '(888) 555-0202', developer_email: 'jpark@freecoat.com' },
    ],
    touchpoints: [
      { id: 't3', medium: 'call',  note: 'FDD update. Attorney has territory exclusivity question.', created_at: daysAgo(3), created_by: 'steve@sparksify.com' },
      { id: 't4', medium: 'email', note: 'Sent financing options overview.', created_at: daysAgo(8), created_by: 'steve@sparksify.com' },
    ],
  },
  {
    id: 'n3', first_name: 'Marcus', last_name: 'Thompson',
    email: 'marcus.t@email.com', phone: '(713) 555-0334',
    status: 'active', funding_intro_done: false,
    last_contacted_at: daysAgo(7), entered_at: daysAgo(12),
    days_since_contact: 7, days_in_process: 12, decay: 'warning', max_stage: 2,
    funding_needed: true,
    notes: 'Comparing two brands. Needs nudge to move forward.',
    brands: [
      { id: 'b4', nurture_client_id: 'n3', brand_name: 'Wet Fuel',        stage: 2, sentiment: 'neutral',  note: 'Unit econ call done. Comparing to Anytime Fitness.', developer_name: 'Derek Wise', developer_phone: '(877) 555-0303', developer_email: 'dwise@wetfuel.com' },
      { id: 'b5', nurture_client_id: 'n3', brand_name: 'Anytime Fitness', stage: 1, sentiment: null,       note: 'Intro call not yet scheduled with developer.', developer_name: '', developer_phone: '', developer_email: '' },
    ],
    touchpoints: [
      { id: 't5', medium: 'text', note: 'Quick check-in. Said he is busy but will call developer this week.', created_at: daysAgo(7), created_by: 'steve@sparksify.com' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────

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

export default function NurturePage() {
  const { data: session } = useSession();
  const [clients,        setClients]        = useState([]);
  const [stats,          setStats]          = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [isDemo,         setIsDemo]         = useState(false);
  const [queueMode,      setQueueMode]      = useState(false);
  const [queueWorkIdx,   setQueueWorkIdx]   = useState(null); // null = list view, number = full-page working mode
  const [viewMode,       setViewMode]       = useState('list'); // 'list' | 'kanban'
  const [fullPageClient, setFullPageClient] = useState(null);   // full-page client view (all entry points)

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/dashboard/nurture-clients')
      .then(r => r.json())
      .then(d => {
        const real = d.clients || [];
        if (real.length === 0) {
          setClients(DEMO_CLIENTS);
          setStats({ total: 3, urgent: 1, warning: 1, good: 1, funding_needed: 2 });
          setIsDemo(true);
        } else {
          setClients(real);
          setStats(d.stats);
          setIsDemo(false);
        }
        setLoading(false);
      })
      .catch(() => {
        setClients(DEMO_CLIENTS);
        setStats({ total: 3, urgent: 1, warning: 1, good: 1, funding_needed: 2 });
        setIsDemo(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  function enterQueue()         { setQueueMode(true); setQueueWorkIdx(null); }
  function exitQueue()          { setQueueMode(false); setQueueWorkIdx(null); load(); }
  function startQueueWork(idx)  { setQueueWorkIdx(idx ?? 0); }
  function exitQueueWork()      { setQueueWorkIdx(null); }

  function updateClientLocally(id, patch) {
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    setFullPageClient(prev => prev?.id === id ? { ...prev, ...patch } : prev);
  }

  function selectClient(c) { setFullPageClient(c); }

  const activeClients  = clients.filter(c => c.status === 'active');
  // Clients due today = overdue (urgent) + due soon (warning) + never contacted
  const queueClients  = activeClients.filter(c =>
    c.decay === 'urgent' || c.decay === 'warning' || c.days_since_contact === null
  );
  // Sorted queue (urgent first, then warning, then never-contacted) — shared by QueueView + working mode
  const decayOrder = { urgent: 0, warning: 1 };
  const sortedQueue = [...queueClients].sort((a, b) => (decayOrder[a.decay] ?? 2) - (decayOrder[b.decay] ?? 2));

  return (
    <>
      <Head><title>In-Process Nurture — KANSO</title></Head>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        * { box-sizing: border-box; }
        .nurture-row:hover { background: #F0F4FF !important; cursor: pointer; }
        .nurture-row-selected { background: #EFF6FF !important; }
        .nurture-kanban-card:hover { background: #F5F8FF !important; border-color: #BFDBFE !important; }
      `}</style>

      {/* ── Kanban card full-page view ── */}
      {fullPageClient && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#F3F4F6', overflow: 'auto' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '20px 20px 60px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <button onClick={() => setFullPageClient(null)} style={s.ghostBtn}>← Back to Kanban</button>
            <button onClick={() => setFullPageClient(null)} style={{ ...s.ghostBtn, color: '#9CA3AF' }}>✕ Close</button>
          </div>
          <QueueCard
            client={fullPageClient}
            isDemo={isDemo}
            onNext={() => setFullPageClient(null)}
            onUpdate={(patch) => updateClientLocally(fullPageClient.id, patch)}
            onRefresh={load}
          />
        </div>
        </div>
      )}

      {/* ── Full-page queue working mode — covers header + everything ── */}
      {queueMode && queueWorkIdx !== null && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#F3F4F6', overflow: 'auto' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '20px 20px 60px' }}>
          {/* Minimal top bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <button onClick={exitQueueWork} style={s.ghostBtn}>← Back to queue list</button>
            {sortedQueue.length > 0 && (
              <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>
                Client {Math.min(queueWorkIdx + 1, sortedQueue.length)} of {sortedQueue.length}
              </span>
            )}
            <button onClick={exitQueue} style={{ ...s.ghostBtn, color: '#9CA3AF' }}>✕ Exit queue</button>
          </div>

          {queueWorkIdx < sortedQueue.length ? (
            <QueueCard
              client={sortedQueue[queueWorkIdx]}
              isDemo={isDemo}
              onNext={() => {
                const next = queueWorkIdx + 1;
                setQueueWorkIdx(next >= sortedQueue.length ? sortedQueue.length : next);
              }}
              onUpdate={(patch) => updateClientLocally(sortedQueue[queueWorkIdx].id, patch)}
              onRefresh={load}
            />
          ) : (
            <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginTop: 16 }}>Queue complete!</div>
              <div style={{ fontSize: 14, color: '#9CA3AF', marginTop: 8 }}>
                You worked through all {sortedQueue.length} client{sortedQueue.length !== 1 ? 's' : ''} in today's queue.
              </div>
              <button onClick={exitQueue} style={{ ...s.primaryBtn, marginTop: 24, padding: '10px 24px' }}>← Back to all clients</button>
            </div>
          )}
        </div>
        </div>
      )}

      <div style={s.page}>
        {/* ── Sidebar ── */}
        <aside style={s.sidebar}>
          <div style={s.sideLogoWrap}>
            <div style={s.sideLogoRow}>
              <div style={s.sideLogoIcon}>K</div>
              <span style={s.sideLogoText}>KANSO</span>
            </div>
          </div>
          <nav style={s.sideNav}>
            {[
              { href: '/dashboard/analytics', label: 'Dashboard',   icon: 'dashboard' },
              { href: '/dashboard/leads',     label: 'Leads',       icon: 'leads' },
              { href: '/dashboard/prospects', label: 'Prospecting', icon: 'clients' },
              { href: '/dashboard/bookings',  label: 'Meetings',    icon: 'meetings' },
              { href: '/dashboard/cq-recovery', label: 'CQ Recovery', icon: 'cq' },
              { href: '/dashboard/nurture',   label: 'Nurture',     icon: 'nurture', active: true },
              { href: '/dashboard/settings',  label: 'Settings',    icon: 'settings' },
            ].map(({ href, label, icon, active }) => (
              <Link key={label} href={href} style={{ ...s.sideNavItem, ...(active ? s.sideNavItemActive : {}) }}>
                <span style={{ color: active ? '#0057FF' : '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                  <SideIcon name={icon} />
                </span>
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <div style={s.sideBottom}>
            <div style={s.sideHelpRow}>
              <span style={{ color: '#9CA3AF', display: 'flex' }}><SideIcon name="help" /></span>
              <span style={{ fontSize: 13, color: '#6B7280' }}>Help</span>
            </div>
            <div style={s.sideUserRow}>
              <div style={s.sideUserAvatar}>{(session?.user?.email?.[0] || 'U').toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {session?.user?.name || session?.user?.email?.split('@')[0] || 'User'}
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>Rep</div>
              </div>
              <span style={{ color: '#9CA3AF', fontSize: 14 }}>›</span>
            </div>
          </div>
        </aside>

        {/* ── Main column ── */}
        <div style={s.mainCol}>
          {/* Top bar */}
          <div style={s.topBar}>
            <div>
              <div style={s.topTitle}>Nurture</div>
              <div style={s.topDate}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            </div>
            <div style={s.topActions}>
              {isDemo && <span style={s.demoBadge}>Preview</span>}
              {/* View mode toggle */}
              <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 6, padding: 2 }}>
                {[['list', '≡ List'], ['kanban', '⊞ Kanban']].map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    style={{
                      padding: '5px 13px', fontSize: 12, fontWeight: 600, borderRadius: 4,
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      background: viewMode === mode ? '#fff' : 'transparent',
                      color: viewMode === mode ? '#111827' : '#6B7280',
                      boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                      transition: 'all .15s',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={load} style={s.ghostBtn}>↻ Refresh</button>
              <button
                onClick={enterQueue}
                style={{ ...s.primaryBtn, opacity: queueClients.length === 0 ? 0.5 : 1 }}
                disabled={queueClients.length === 0}
              >
                Today's Queue {queueClients.length > 0 ? `(${queueClients.length})` : ''}
              </button>
            </div>
          </div>

          {/* Page body */}
          <div style={s.pageBody}>
            {/* Demo banner */}
            {isDemo && (
              <div style={s.demoBanner}>
                Preview mode — no nurture clients yet. Click "Mark CQ Received" on any booking to auto-add clients to this queue.
              </div>
            )}

            {/* Pipeline stage graph */}
            {!loading && activeClients.length > 0 && (
              <PipelineGraph clients={activeClients} />
            )}

            {/* Main content */}
            {loading ? (
              <div style={s.loadingWrap}>
                <div style={s.spinner} />
                <div style={s.loadingText}>Loading nurture queue…</div>
              </div>
            ) : queueMode ? (
              <QueueView
                clients={activeClients}
                isDemo={isDemo}
                onExit={exitQueue}
                onStartWorking={startQueueWork}
                selectedId={fullPageClient?.id}
                onSelect={selectClient}
                onUpdate={updateClientLocally}
                onRefresh={load}
              />
            ) : viewMode === 'kanban' ? (
              <KanbanView
                clients={clients}
                isDemo={isDemo}
                selectedId={fullPageClient?.id}
                onSelect={selectClient}
                onOpenFullPage={(c) => setFullPageClient(c)}
                onUpdate={updateClientLocally}
                onRefresh={load}
              />
            ) : (
              <ListView
                clients={clients}
                isDemo={isDemo}
                selectedId={fullPageClient?.id}
                onSelect={selectClient}
                onEnterQueue={enterQueue}
                onUpdate={updateClientLocally}
                onRefresh={load}
              />
            )}
          </div>
        </div>
      </div>

    </>
  );
}

// ─── Pipeline Stage Graph ──────────────────────────────────────────────────────

function PipelineGraph({ clients }) {
  const counts = [0, 0, 0, 0, 0];
  clients.forEach(c => {
    const idx = (c.max_stage || 1) - 1;
    if (idx >= 0 && idx < 5) counts[idx]++;
  });
  const total = clients.length;

  return (
    <div style={{ background: '#fff', border: '1px solid #E8EAED', borderRadius: 10, padding: '16px 20px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.07em' }}>
          Pipeline Distribution
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#F3F4F6', padding: '3px 10px', borderRadius: 20 }}>
          {total} active client{total !== 1 ? 's' : ''}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        {STAGES.slice(1).map((stage, i) => {
          const count  = counts[i];
          const active = count > 0;
          const isLast = i === 4;

          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              {/* Stage block */}
              <div style={{
                flex: 1,
                background: active ? stage.bg : '#FAFAFA',
                border: `1px solid ${active ? stage.border : '#EBEBEB'}`,
                borderLeft: `4px solid ${active ? stage.bar : '#E0E0E0'}`,
                borderRadius: 8,
                padding: '12px 16px',
                transition: 'all .2s',
                minWidth: 0,
              }}>
                <div style={{
                  fontSize: 9, fontWeight: 800, color: active ? stage.color : '#C0C0C0',
                  textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {i + 1} · {stage.short}
                </div>
                <div style={{
                  fontSize: 30, fontWeight: 800, lineHeight: 1,
                  color: active ? stage.color : '#D8D8D8',
                }}>
                  {count}
                </div>
                <div style={{
                  fontSize: 10, marginTop: 3,
                  color: active ? stage.color : '#D0D0D0',
                  fontWeight: 500, opacity: 0.85,
                }}>
                  {count === 1 ? 'client' : 'clients'}
                </div>
              </div>

              {/* Chevron connector */}
              {!isLast && (
                <div style={{
                  fontSize: 16, color: '#D1D5DB', padding: '0 6px',
                  flexShrink: 0, lineHeight: 1, userSelect: 'none',
                }}>
                  ›
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Kanban View ───────────────────────────────────────────────────────────────

function KanbanView({ clients, isDemo, selectedId, onSelect, onOpenFullPage, onUpdate, onRefresh }) {
  const active   = clients.filter(c => c.status === 'active');
  const archived = clients.filter(c => c.status !== 'active');

  return (
    <div>
      {/* Stage columns */}
      <div style={{ display: 'flex', gap: 10, paddingBottom: 24, alignItems: 'flex-start' }}>
        {STAGES.slice(1).map((stage, i) => {
          const stageNum     = i + 1;
          const stageClients = active.filter(c => (c.max_stage || 1) === stageNum);

          return (
            <div key={stageNum} style={{
              flex: '1 1 0', minWidth: 0,
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Column header */}
              <div style={{
                background: '#fff', border: `1px solid ${stage.border}`,
                borderTop: `3px solid ${stage.bar}`,
                borderRadius: '8px 8px 0 0',
                padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                      Stage {stageNum}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: stage.color, marginTop: 1, lineHeight: 1.2 }}>
                      {stage.label}
                    </div>
                  </div>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: stageClients.length > 0 ? stage.bg : '#F3F4F6',
                    border: `1.5px solid ${stageClients.length > 0 ? stage.border : '#E5E7EB'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800,
                    color: stageClients.length > 0 ? stage.color : '#C0C0C0',
                    flexShrink: 0,
                  }}>
                    {stageClients.length}
                  </div>
                </div>
              </div>

              {/* Cards area */}
              <div style={{
                flex: 1, background: stageClients.length > 0 ? '#F7F8FA' : '#FAFAFA',
                border: `1px solid ${stage.border}`, borderTop: 'none',
                borderRadius: '0 0 8px 8px',
                padding: 8, display: 'flex', flexDirection: 'column', gap: 7,
                minHeight: 120,
              }}>
                {stageClients.length === 0 ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: '#D1D5DB' }}>
                    No clients here
                  </div>
                ) : (
                  stageClients.map(c => (
                    <KanbanCard
                      key={c.id}
                      client={c}
                      stage={stage}
                      isSelected={selectedId === c.id}
                      onSelect={() => onOpenFullPage ? onOpenFullPage(c) : onSelect(c)}
                      isDemo={isDemo}
                      onUpdate={onUpdate}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Archived clients */}
      {archived.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, color: '#9CA3AF', cursor: 'pointer', fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase' }}>
            Archived / Closed ({archived.length})
          </summary>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {archived.map(c => (
              <div
                key={c.id}
                onClick={() => onSelect(c)}
                style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#6B7280', cursor: 'pointer', opacity: 0.7 }}
              >
                {c.first_name} {c.last_name} · {c.status}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function KanbanCard({ client: c, stage, isSelected, onSelect, isDemo, onUpdate }) {
  const decay = DECAY[c.decay] || DECAY.good;

  async function markClosed(e) {
    e.stopPropagation();
    onUpdate(c.id, { status: 'closed' });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, status: 'closed' }),
      }).catch(console.error);
    }
  }

  return (
    <div
      className="nurture-kanban-card"
      onClick={onSelect}
      style={{
        background: isSelected ? '#EFF6FF' : '#fff',
        border: `1px solid ${isSelected ? '#93C5FD' : '#E5E7EB'}`,
        borderRadius: 7, padding: '10px 11px', cursor: 'pointer',
        transition: 'all .15s', boxShadow: '0 1px 3px rgba(0,0,0,.04)',
      }}
    >
      {/* Name row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', lineHeight: 1.3, flex: 1 }}>
          {c.first_name} {c.last_name}
        </div>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: decay.dot,
          flexShrink: 0, marginTop: 3, display: 'inline-block',
        }} />
      </div>

      {/* Last contact */}
      <div style={{ fontSize: 10, color: decay.color, fontWeight: 600, marginTop: 3 }}>
        {c.days_since_contact === null ? 'Never contacted' : `${c.days_since_contact}d since last touch`}
      </div>

      {/* Brand pills */}
      {(c.brands || []).length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {c.brands.map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, color: '#374151',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
              }}>
                {b.brand_name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Badges row */}
      <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
        {!c.funding_intro_done && c.funding_needed && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: '#6D28D9', background: '#F5F3FF',
            padding: '2px 6px', borderRadius: 6, border: '1px solid #DDD6FE',
          }}>Funding</span>
        )}
        {c.funding_intro_done && (
          <span style={{
            fontSize: 9, fontWeight: 600, color: '#15803D', background: '#DCFCE7',
            padding: '2px 6px', borderRadius: 6,
          }}>✓ Funding</span>
        )}
        <span style={{
          fontSize: 9, fontWeight: 600, color: '#9CA3AF',
          marginLeft: 'auto',
        }}>{c.days_in_process}d in</span>
      </div>

      {/* Quick action */}
      <div style={{ marginTop: 9, paddingTop: 8, borderTop: '1px solid #F3F4F6' }}>
        <button
          onClick={markClosed}
          style={{
            width: '100%', padding: '5px 0', fontSize: 10, fontWeight: 600,
            background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 5,
            color: '#15803D', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Closed Won
        </button>
      </div>
    </div>
  );
}

// ─── List View ─────────────────────────────────────────────────────────────────

function ListView({ clients, isDemo, selectedId, onSelect, onEnterQueue, onUpdate, onRefresh }) {
  const active   = clients.filter(c => c.status === 'active');
  const archived = clients.filter(c => c.status !== 'active');

  if (active.length === 0) {
    return (
      <div style={{ ...s.card, padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>No active clients</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 6 }}>
          When you click "Mark CQ Received" on a booking, the client will appear here.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={s.card}>
        <table style={s.table}>
          <thead>
            <tr>
              {['Client', 'Franchise(s) & Stage', 'Last Contact', 'Days In', 'Funding', 'Status', 'Next Indicated Step'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.map((c, i) => (
              <ListRow
                key={c.id}
                client={c}
                striped={i % 2 === 1}
                isSelected={selectedId === c.id}
                isDemo={isDemo}
                onSelect={() => onSelect(c)}
                onUpdate={onUpdate}
                onRefresh={onRefresh}
              />
            ))}
          </tbody>
        </table>
      </div>

      {archived.length > 0 && (
        <details style={{ marginTop: 20 }}>
          <summary style={{ fontSize: 12, color: '#9CA3AF', cursor: 'pointer', fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase' }}>
            Archived / Closed ({archived.length})
          </summary>
          <div style={{ ...s.card, marginTop: 8, opacity: 0.7 }}>
            <table style={s.table}>
              <tbody>
                {archived.map((c, i) => (
                  <ListRow key={c.id} client={c} striped={i % 2 === 1} isDemo={isDemo} onSelect={() => onSelect(c)} onUpdate={onUpdate} onRefresh={onRefresh} readOnly />
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function ListRow({ client: c, striped, isSelected, isDemo, onSelect, onUpdate, onRefresh, readOnly }) {
  const decay = DECAY[c.decay] || DECAY.good;
  const bg    = isSelected ? '#EFF6FF' : striped ? '#F9FAFB' : '#fff';

  async function archive(e) {
    e.stopPropagation();
    onUpdate(c.id, { status: 'archived' });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, status: 'archived' }),
      }).catch(console.error);
    }
  }

  async function markClosed(e) {
    e.stopPropagation();
    onUpdate(c.id, { status: 'closed' });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, status: 'closed' }),
      }).catch(console.error);
    }
  }

  return (
    <tr
      className={`nurture-row${isSelected ? ' nurture-row-selected' : ''}`}
      style={{ background: bg, borderBottom: '1px solid #F3F4F6' }}
      onClick={onSelect}
    >
      {/* Client */}
      <td style={s.td}>
        <div style={{ fontWeight: 600, color: '#111827', fontSize: 13 }}>
          {c.first_name} {c.last_name}
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{c.email}</div>
        {c.phone && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{c.phone}</div>}
      </td>

      {/* Brands + stage */}
      <td style={s.td}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(c.brands || []).map(b => {
            const stage = STAGES[b.stage];
            return (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#374151', fontWeight: 500, minWidth: 100 }}>{b.brand_name}</span>
                {stage && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                    color: stage.color, background: stage.bg, border: `1px solid ${stage.border}`,
                    whiteSpace: 'nowrap',
                  }}>
                    {b.stage} · {stage.short}
                  </span>
                )}
              </div>
            );
          })}
          {(!c.brands || c.brands.length === 0) && (
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>No brands added</span>
          )}
        </div>
      </td>

      {/* Last contact */}
      <td style={s.td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: decay.dot, flexShrink: 0, display: 'inline-block' }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: decay.color }}>
              {c.days_since_contact === null ? 'Never' : `${c.days_since_contact}d ago`}
            </div>
            <div style={{ fontSize: 10, color: '#9CA3AF' }}>{decay.label}</div>
          </div>
        </div>
      </td>

      {/* Days in process */}
      <td style={s.td}>
        <span style={{ fontSize: 13, color: '#374151' }}>{c.days_in_process}d</span>
      </td>

      {/* Funding */}
      <td style={s.td}>
        {c.funding_intro_done ? (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#15803D', background: '#DCFCE7', padding: '2px 8px', borderRadius: 10 }}>✓ Done</span>
        ) : c.funding_needed ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', background: '#F5F3FF', padding: '2px 8px', borderRadius: 10, border: '1px solid #DDD6FE' }}>Needed</span>
        ) : (
          <span style={{ fontSize: 11, color: '#D1D5DB' }}>—</span>
        )}
      </td>

      {/* Status */}
      <td style={s.td}>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
          color: c.status === 'active' ? '#1D4ED8' : '#6B7280',
          background: c.status === 'active' ? '#EFF6FF' : '#F3F4F6',
        }}>
          {c.status}
        </span>
      </td>

      {/* Next Action */}
      <td style={{ ...s.td, maxWidth: 220 }}>
        {!readOnly && (() => {
          const maxStage = (c.brands || []).length ? Math.max(...(c.brands || []).map(b => b.stage)) : 1;
          const na = getNextAction(c, c.funding_intro_done, maxStage);
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#374151', lineHeight: 1.3 }}>{na.label}</span>
            </div>
          );
        })()}
      </td>
    </tr>
  );
}

// ─── Nurture Side Panel ────────────────────────────────────────────────────────

function NurturePanel({ client: c, isDemo, onClose, onUpdate, onRefresh }) {
  const [brands,            setBrands]            = useState(c.brands || []);
  const [touchpoints,       setTouchpoints]       = useState(c.touchpoints || []);
  const [milestones,        setMilestones]        = useState(c.milestones || {});
  const [medium,            setMedium]            = useState('call');
  const [tpNote,            setTpNote]            = useState('');
  const [logging,           setLogging]           = useState(false);
  const [loggedMsg,         setLoggedMsg]         = useState('');
  const [notesSaving,       setNotesSaving]       = useState(false);
  const [notesSaved,        setNotesSaved]        = useState(false);
  const [clientNotes,       setClientNotes]       = useState(c.notes || '');
  const [showEmail,         setShowEmail]         = useState(false);
  const [showFundingModal,  setShowFundingModal]  = useState(false);
  const [showAttorneyModal, setShowAttorneyModal] = useState(false);

  // Reset when client changes
  useEffect(() => {
    setBrands(c.brands || []);
    setTouchpoints(c.touchpoints || []);
    setMilestones(c.milestones || {});
    setClientNotes(c.notes || '');
    setTpNote('');
    setLoggedMsg('');
    setNotesSaved(false);
  }, [c.id]);

  const decay    = DECAY[c.decay] || DECAY.good;
  const maxStage = brands.length ? Math.max(...brands.map(b => b.stage)) : 1;

  async function saveMilestone(key, data) {
    const updated = { ...milestones, [key]: data };
    setMilestones(updated);
    onUpdate({ milestones: updated });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, milestones: updated }),
      }).catch(console.error);
    }
  }

  async function logTouchpoint() {
    if (!tpNote.trim()) return;
    setLogging(true);
    const newTP = {
      id: `tp_${Date.now()}`, nurture_client_id: c.id, medium, note: tpNote.trim(),
      created_at: new Date().toISOString(), created_by: 'me',
    };
    setTouchpoints(prev => [newTP, ...prev]);
    setTpNote('');
    onUpdate({ last_contacted_at: newTP.created_at, decay: 'good', days_since_contact: 0 });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-touchpoint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nurture_client_id: c.id, medium, note: tpNote.trim() }),
      }).catch(console.error);
    }
    setLogging(false);
    setLoggedMsg(`${medium.charAt(0).toUpperCase() + medium.slice(1)} logged ✓`);
    setTimeout(() => setLoggedMsg(''), 3000);
  }

  async function updateBrandField(brandId, brandName, fields) {
    setBrands(prev => prev.map(b => b.id === brandId ? { ...b, ...fields } : b));
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-brand', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nurture_client_id: c.id, brand_name: brandName, ...fields }),
      }).catch(console.error);
    }
  }

  async function saveNotes() {
    setNotesSaving(true);
    onUpdate({ notes: clientNotes });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, notes: clientNotes }),
      }).catch(console.error);
    }
    setNotesSaving(false);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  }

  async function archiveClient() {
    onUpdate({ status: 'archived' });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, status: 'archived' }),
      }).catch(console.error);
    }
    onClose();
  }

  async function closedWon() {
    onUpdate({ status: 'closed' });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, status: 'closed' }),
      }).catch(console.error);
    }
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div style={s.panelBackdrop} onClick={onClose} />

      {/* Panel */}
      <div style={s.panel}>
        {/* Panel header */}
        <div style={s.panelHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={s.avatarSm}>{c.first_name?.[0]}{c.last_name?.[0]}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{c.first_name} {c.last_name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: decay.dot, display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: decay.color, fontWeight: 600 }}>
                  {c.days_since_contact === null ? 'Never contacted' : `${c.days_since_contact}d since last touch`}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={s.panelBody}>

          {/* Contact info */}
          <div style={s.panelSection}>
            <div style={s.sectionLabel}>Contact</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
              {c.phone && (
                <a href={`tel:${c.phone}`} style={s.contactRow}>
                  <span style={s.contactIcon}></span>
                  <span style={{ fontSize: 13, color: '#374151' }}>{c.phone}</span>
                </a>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={s.contactRow}>
                  <span style={s.contactIcon}></span>
                  <span style={{ fontSize: 13, color: '#374151' }}>{c.email}</span>
                </div>
                <button
                  onClick={() => setShowEmail(true)}
                  style={{ padding: '3px 10px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 5, fontSize: 11, fontWeight: 600, color: '#1D4ED8', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                >
                  Compose
                </button>
              </div>
              {c.days_in_process > 0 && (
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{c.days_in_process} days in process</div>
              )}
            </div>
          </div>

          {/* Milestones */}
          <PendingMilestonesBar
            milestones={milestones}
            maxStage={maxStage}
            onOpenFunding={() => setShowFundingModal(true)}
            onOpenAttorney={() => setShowAttorneyModal(true)}
          />

          {/* Franchise brands */}
          <div style={s.panelSection}>
            <div style={s.sectionLabel}>Franchise Progress</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
              {brands.length === 0 && (
                <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '12px 0' }}>
                  No brands — seeded from lead's franchise interests.
                </div>
              )}
              {brands.map(brand => (
                <PanelBrandCard
                  key={brand.id}
                  brand={brand}
                  onStageChange={stage => updateBrandField(brand.id, brand.brand_name, { stage })}
                  onSentimentChange={sentiment => updateBrandField(brand.id, brand.brand_name, { sentiment })}
                  onNoteChange={note => updateBrandField(brand.id, brand.brand_name, { note })}
                  onDevChange={fields => updateBrandField(brand.id, brand.brand_name, fields)}
                />
              ))}
            </div>
          </div>

          {/* Log touchpoint */}
          <div style={s.panelSection}>
            <div style={s.sectionLabel}>Log Touchpoint</div>
            {loggedMsg ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 20 }}>✓</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#15803D', marginTop: 4 }}>{loggedMsg}</div>
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['call', 'email', 'text'].map(m => (
                    <button key={m} onClick={() => setMedium(m)} style={{
                      flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 5,
                      border: `1.5px solid ${medium === m ? '#1D4ED8' : '#E5E7EB'}`,
                      background: medium === m ? '#EFF6FF' : '#F9FAFB',
                      color: medium === m ? '#1D4ED8' : '#6B7280',
                      cursor: 'pointer', textTransform: 'capitalize', fontFamily: 'inherit',
                    }}>
                      {m}
                    </button>
                  ))}
                </div>
                <textarea
                  style={{ ...s.notesArea, marginTop: 8, fontSize: 12 }}
                  rows={3}
                  placeholder={`Notes from this ${medium}…`}
                  value={tpNote}
                  onChange={e => setTpNote(e.target.value)}
                />
                <button
                  onClick={logTouchpoint}
                  disabled={!tpNote.trim() || logging}
                  style={{ ...s.primaryBtn, marginTop: 6, width: '100%', opacity: !tpNote.trim() ? 0.5 : 1, cursor: !tpNote.trim() ? 'not-allowed' : 'pointer' }}
                >
                  {logging ? 'Logging…' : `Log ${medium.charAt(0).toUpperCase() + medium.slice(1)}`}
                </button>
              </div>
            )}
          </div>

          {/* Touch history */}
          <div style={s.panelSection}>
            <div style={s.sectionLabel}>Touch History</div>
            {touchpoints.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 10, textAlign: 'center', padding: '12px 0' }}>No touchpoints yet</div>
            ) : (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 0 }}>
                {touchpoints.slice(0, 6).map((tp, i) => {
                  const isLast = i === Math.min(touchpoints.length, 6) - 1;
                  const ts     = new Date(tp.created_at);
                  const label  = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  return (
                    <div key={tp.id} style={{ display: 'flex', gap: 8 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'capitalize' }}>{tp.medium?.[0]?.toUpperCase()}</div>
                        {!isLast && <div style={{ width: 1, flex: 1, background: '#E5E7EB', margin: '2px 0' }} />}
                      </div>
                      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 12 }}>
                        <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 2 }}>
                          {label} · <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{tp.medium}</span>
                        </div>
                        {tp.note && <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{tp.note}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={s.panelSection}>
            <div style={s.sectionLabel}>Notes</div>
            <textarea
              style={{ ...s.notesArea, marginTop: 8, fontSize: 12 }}
              rows={3}
              value={clientNotes}
              placeholder="Client notes, concerns, preferences…"
              onChange={e => setClientNotes(e.target.value)}
            />
            <button
              onClick={saveNotes}
              disabled={notesSaving}
              style={{ ...s.primaryBtn, marginTop: 6, background: notesSaved ? '#15803D' : '#0057FF' }}
            >
              {notesSaving ? 'Saving…' : notesSaved ? '✓ Saved' : 'Save Notes'}
            </button>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 24 }}>
            <button onClick={closedWon} style={{ ...s.primaryBtn, background: '#15803D', flex: 1 }}>Closed Won</button>
            <button onClick={archiveClient} style={{ ...s.ghostBtn, flex: 1 }}>Archive</button>
          </div>

        </div>
      </div>

      {/* Email compose modal */}
      {showEmail && (
        <EmailModal
          to={c.email}
          name={`${c.first_name} ${c.last_name}`}
          onClose={() => setShowEmail(false)}
        />
      )}

      {/* Milestone modals */}
      {showFundingModal && (
        <FundingModal
          existing={milestones.funding}
          onSave={(data) => saveMilestone('funding', data)}
          onClose={() => setShowFundingModal(false)}
        />
      )}
      {showAttorneyModal && (
        <AttorneyModal
          existing={milestones.attorney}
          onSave={(data) => saveMilestone('attorney', data)}
          onClose={() => setShowAttorneyModal(false)}
        />
      )}
    </>
  );
}

// ─── Panel Brand Card ──────────────────────────────────────────────────────────

function PanelBrandCard({ brand, onStageChange, onSentimentChange, onNoteChange, onDevChange }) {
  const [noteVal,    setNoteVal]    = useState(brand.note || '');
  const [noteTimer,  setNoteTimer]  = useState(null);
  const [devName,    setDevName]    = useState(brand.developer_name  || '');
  const [devPhone,   setDevPhone]   = useState(brand.developer_phone || '');
  const [devEmail,   setDevEmail]   = useState(brand.developer_email || '');
  const [devTimer,   setDevTimer]   = useState(null);

  useEffect(() => {
    setNoteVal(brand.note || '');
    setDevName(brand.developer_name  || '');
    setDevPhone(brand.developer_phone || '');
    setDevEmail(brand.developer_email || '');
  }, [brand.id]);

  function handleNoteChange(v) {
    setNoteVal(v);
    if (noteTimer) clearTimeout(noteTimer);
    setNoteTimer(setTimeout(() => onNoteChange(v), 1000));
  }

  function handleDevChange(field, value) {
    if (field === 'name')  setDevName(value);
    if (field === 'phone') setDevPhone(value);
    if (field === 'email') setDevEmail(value);
    if (devTimer) clearTimeout(devTimer);
    const currentName  = field === 'name'  ? value : devName;
    const currentPhone = field === 'phone' ? value : devPhone;
    const currentEmail = field === 'email' ? value : devEmail;
    setDevTimer(setTimeout(() => onDevChange({
      developer_name:  currentName,
      developer_phone: currentPhone,
      developer_email: currentEmail,
    }), 1000));
  }

  return (
    <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 7, padding: '12px 14px' }}>
      {/* Brand name + sentiment */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{brand.brand_name}</div>
        <div style={{ display: 'flex', gap: 3 }}>
          {Object.entries(SENTIMENTS).map(([key, st]) => (
            <button
              key={key}
              onClick={() => onSentimentChange(brand.sentiment === key ? null : key)}
              title={st.label}
              style={{
                background: brand.sentiment === key ? st.bg : 'transparent',
                border: `1px solid ${brand.sentiment === key ? st.border : '#E5E7EB'}`,
                borderRadius: 4, padding: '2px 5px', cursor: 'pointer', fontSize: 12, lineHeight: 1,
              }}
            >
              {st.emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Stage stepper */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 10, flexWrap: 'wrap' }}>
        {STAGES.slice(1).map((stage, i) => {
          const n         = i + 1;
          const isCurrent = brand.stage === n;
          const isPast    = brand.stage > n;
          return (
            <button
              key={n}
              onClick={() => onStageChange(n)}
              title={stage.label}
              style={{
                padding: '3px 6px', fontSize: 9, fontWeight: 700,
                borderRadius: 4, cursor: 'pointer', border: '1.5px solid',
                borderColor: isCurrent ? stage.color : isPast ? '#D1D5DB' : '#E5E7EB',
                background:  isCurrent ? stage.bg    : isPast ? '#F3F4F6' : '#fff',
                color:       isCurrent ? stage.color : isPast ? '#9CA3AF' : '#D1D5DB',
                fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all .12s',
              }}
            >
              {n} · {stage.short}
            </button>
          );
        })}
      </div>

      {/* Brand note */}
      <textarea
        style={{ width: '100%', padding: '6px 8px', border: '1px solid #E5E7EB', borderRadius: 5, fontSize: 11, color: '#374151', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: '#fff', lineHeight: 1.5 }}
        rows={2}
        placeholder={`Notes on ${brand.brand_name}…`}
        value={noteVal}
        onChange={e => handleNoteChange(e.target.value)}
      />

      {/* Developer contact */}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F3F4F6' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 7 }}>Developer Contact</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <input
            placeholder="Developer name"
            value={devName}
            onChange={e => handleDevChange('name', e.target.value)}
            style={s.devInput}
          />
          <input
            placeholder="Developer phone"
            value={devPhone}
            onChange={e => handleDevChange('phone', e.target.value)}
            style={s.devInput}
          />
          <div style={{ display: 'flex', gap: 5 }}>
            <input
              placeholder="Developer email"
              value={devEmail}
              onChange={e => handleDevChange('email', e.target.value)}
              style={{ ...s.devInput, flex: 1 }}
            />
            {devEmail && (
              <a
                href={`mailto:${devEmail}`}
                style={{ padding: '5px 10px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 5, fontSize: 11, fontWeight: 600, color: '#1D4ED8', textDecoration: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}
              >
                Email
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Email Compose Modal ───────────────────────────────────────────────────────

function EmailModal({ to, name, onClose }) {
  const [subject, setSubject] = useState('');
  const [body,    setBody]    = useState('');
  const [sending, setSending] = useState(false);
  const [result,  setResult]  = useState(null);

  async function send() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      const res  = await fetch('/api/dashboard/send-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_email: to, subject, body }),
      });
      const data = await res.json();
      if (data.ok && !data.fallback) {
        setResult({ success: true, message: 'Email sent via GHL ✓' });
        setTimeout(onClose, 1800);
      } else if (data.mailto) {
        // Fall back to native email client
        window.location.href = data.mailto;
        onClose();
      } else {
        setResult({ success: false, message: data.error || 'Send failed' });
      }
    } catch {
      setResult({ success: false, message: 'Network error' });
    }
    setSending(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 10, width: 520, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #E8EAED' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Compose Email</div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* To */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>To</div>
            <div style={{ fontSize: 13, color: '#374151', background: '#F9FAFB', padding: '8px 10px', borderRadius: 5, border: '1px solid #E5E7EB' }}>
              {name} &lt;{to}&gt;
            </div>
          </div>

          {/* Subject */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Subject</div>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Email subject…"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 5, fontSize: 13, color: '#111827', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Body */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Message</div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your message…"
              rows={7}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 5, fontSize: 13, color: '#111827', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 }}
            />
          </div>

          {result && (
            <div style={{ padding: '8px 12px', borderRadius: 5, fontSize: 13, fontWeight: 600, background: result.success ? '#F0FDF4' : '#FEF2F2', color: result.success ? '#15803D' : '#B91C1C' }}>
              {result.message}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={s.ghostBtn}>Cancel</button>
            <button
              onClick={send}
              disabled={sending || !subject.trim() || !body.trim()}
              style={{ ...s.primaryBtn, opacity: (!subject.trim() || !body.trim()) ? 0.5 : 1 }}
            >
              {sending ? 'Sending…' : 'Send Email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SMS Compose Modal ─────────────────────────────────────────────────────────

function SmsModal({ to, name, contactId, onClose }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result,  setResult]  = useState(null);

  async function send() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res  = await fetch('/api/dashboard/send-sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: to, message: message.trim(), contactId }),
      });
      const data = await res.json();
      if (data.ok && !data.fallback) {
        setResult({ success: true, message: 'SMS sent ✓' });
        setTimeout(onClose, 1800);
      } else if (data.fallback || data.smsLink) {
        window.location.href = data.smsLink || `sms:${to}?body=${encodeURIComponent(message)}`;
        onClose();
      } else {
        setResult({ success: false, message: data.error || 'Send failed' });
      }
    } catch {
      setResult({ success: false, message: 'Network error' });
    }
    setSending(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 10, width: 480, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #E8EAED' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Send SMS</div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>To</div>
            <div style={{ fontSize: 13, color: '#374151', background: '#F9FAFB', padding: '8px 10px', borderRadius: 5, border: '1px solid #E5E7EB' }}>
              {name}{to ? ` · ${to}` : ''}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Message</div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type your message…"
              rows={5}
              autoFocus
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 5, fontSize: 13, color: '#111827', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 }}
            />
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>{message.length} chars</div>
          </div>
          {result && (
            <div style={{ padding: '8px 12px', borderRadius: 5, fontSize: 13, fontWeight: 600, background: result.success ? '#F0FDF4' : '#FEF2F2', color: result.success ? '#15803D' : '#B91C1C' }}>
              {result.message}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={s.ghostBtn}>Cancel</button>
            <button
              onClick={send}
              disabled={sending || !message.trim()}
              style={{ ...s.primaryBtn, background: '#6D28D9', opacity: !message.trim() ? 0.5 : 1 }}
            >
              {sending ? 'Sending…' : 'Send SMS'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Funding Introduction Modal ───────────────────────────────────────────────

function FundingModal({ existing, onSave, onClose }) {
  const [company, setCompany] = useState(existing?.company || '');
  const [date,    setDate]    = useState(existing?.date    || new Date().toISOString().slice(0, 10));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 10, width: 460, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #E8EAED' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Funding Introduction</div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Funding Company</div>
            <input
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="e.g. Benetrends, FranFund, Capital One…"
              autoFocus
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#111827', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Date of Introduction</div>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#111827', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={s.ghostBtn}>Cancel</button>
            <button
              onClick={() => { if (company.trim()) { onSave({ company: company.trim(), date, done: true }); onClose(); } }}
              disabled={!company.trim()}
              style={{ ...s.primaryBtn, background: '#6D28D9', opacity: !company.trim() ? 0.5 : 1 }}
            >
              Save Introduction ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Attorney Introduction Modal ──────────────────────────────────────────────

function AttorneyModal({ existing, onSave, onClose }) {
  const [attorneyName, setAttorneyName] = useState(existing?.attorney_name || '');
  const [lawFirm,      setLawFirm]      = useState(existing?.law_firm || '');
  const [date,         setDate]         = useState(existing?.date || new Date().toISOString().slice(0, 10));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 10, width: 460, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #E8EAED' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Attorney Introduction</div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Attorney Name</div>
            <input
              value={attorneyName}
              onChange={e => setAttorneyName(e.target.value)}
              placeholder="Attorney's full name"
              autoFocus
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#111827', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Law Firm</div>
            <input
              value={lawFirm}
              onChange={e => setLawFirm(e.target.value)}
              placeholder="Law firm name"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#111827', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Date of Introduction</div>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#111827', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={s.ghostBtn}>Cancel</button>
            <button
              onClick={() => { if (attorneyName.trim()) { onSave({ attorney_name: attorneyName.trim(), law_firm: lawFirm.trim(), date, done: true }); onClose(); } }}
              disabled={!attorneyName.trim()}
              style={{ ...s.primaryBtn, background: '#6D28D9', opacity: !attorneyName.trim() ? 0.5 : 1 }}
            >
              Save Introduction ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Developer Contact Modal ──────────────────────────────────────────────────

function DeveloperContactModal({ brand, onSave, onClose }) {
  const [name,  setName]  = useState(brand.developer_name  || '');
  const [phone, setPhone] = useState(brand.developer_phone || '');
  const [email, setEmail] = useState(brand.developer_email || '');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 10, width: 420, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #E8EAED' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Developer Contact — {brand.brand_name}</div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Name</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Developer's full name" autoFocus
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#111827', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Phone</div>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(800) 555-0100" type="tel"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#111827', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Email</div>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="developer@brand.com" type="email"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#111827', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={s.ghostBtn}>Cancel</button>
            <button
              onClick={() => onSave({ developer_name: name.trim(), developer_phone: phone.trim(), developer_email: email.trim() })}
              style={s.primaryBtn}
            >
              Save Contact
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pending Milestones Bar ────────────────────────────────────────────────────

function PendingMilestonesBar({ milestones = {}, maxStage, onOpenFunding, onOpenAttorney }) {
  const funding  = milestones.funding;
  const attorney = milestones.attorney;

  function fmtDate(d) {
    if (!d) return '';
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {funding?.done ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 7, padding: '8px 12px' }}>
            <span style={{ fontSize: 15 }}>✓</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#15803D' }}>Funding Intro Done</div>
              {funding.company && <div style={{ fontSize: 10, color: '#6B7280' }}>{funding.company}{funding.date ? ` · ${fmtDate(funding.date)}` : ''}</div>}
            </div>
            <button onClick={onOpenFunding} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 11, paddingLeft: 4 }}>Edit</button>
          </div>
        ) : (
          <button
            onClick={onOpenFunding}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FAF5FF', border: '2px solid #C4B5FD', borderRadius: 7, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '.04em' }}>$</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9' }}>Funding Intro Needed</div>
              <div style={{ fontSize: 10, color: '#7C3AED' }}>Click to record introduction</div>
            </div>
          </button>
      )}
      {attorney?.done ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 7, padding: '8px 12px' }}>
          <span style={{ fontSize: 15 }}>✓</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#15803D' }}>Attorney Intro Done</div>
            {attorney.attorney_name && <div style={{ fontSize: 10, color: '#6B7280' }}>{attorney.attorney_name}{attorney.law_firm ? ` · ${attorney.law_firm}` : ''}</div>}
          </div>
          <button onClick={onOpenAttorney} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 11, paddingLeft: 4 }}>Edit</button>
        </div>
      ) : (
        <button
          onClick={onOpenAttorney}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#EFF6FF', border: '2px solid #BFDBFE', borderRadius: 7, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '.04em' }}>J</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8' }}>Attorney Intro Needed</div>
            <div style={{ fontSize: 10, color: '#3B82F6' }}>Click to record introduction</div>
          </div>
        </button>
      )}
    </div>
  );
}

// ─── Queue View (Today's Queue — filtered list) ────────────────────────────────

function QueueView({ clients, isDemo, onExit, onStartWorking, selectedId, onSelect, onUpdate, onRefresh }) {
  // Show overdue + due-soon + never-contacted clients
  const dueClients = clients.filter(c =>
    c.decay === 'urgent' || c.decay === 'warning' || c.days_since_contact === null
  );

  // Sort: urgent first, then warning, then never-contacted
  const decayOrder = { urgent: 0, warning: 1 };
  const sorted = [...dueClients].sort((a, b) => (decayOrder[a.decay] ?? 2) - (decayOrder[b.decay] ?? 2));

  return (
    <div>
      {/* Queue header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={onExit} style={s.ghostBtn}>← Back to all clients</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {sorted.length > 0 && (
            <span style={{ fontSize: 13, color: '#6B7280' }}>
              {sorted.length} client{sorted.length !== 1 ? 's' : ''} need a touch today
            </span>
          )}
          {sorted.length > 0 && (
            <button
              onClick={() => onStartWorking(0)}
              style={{ ...s.primaryBtn, padding: '8px 18px', fontSize: 13 }}
            >
              ▶ Start Queue
            </button>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div style={{ ...s.card, padding: 56, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginTop: 12 }}>All caught up!</div>
          <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 6 }}>
            No clients are overdue or due for a touchpoint today.
          </div>
        </div>
      ) : (
        <div style={s.card}>
          <table style={s.table}>
            <thead>
              <tr>
                {['Client', 'Franchise(s) & Stage', 'Last Contact', 'Days In', 'Funding', ''].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => (
                <ListRow
                  key={c.id}
                  client={c}
                  striped={i % 2 === 1}
                  isSelected={selectedId === c.id}
                  isDemo={isDemo}
                  onSelect={() => onStartWorking(i)}
                  onUpdate={onUpdate}
                  onRefresh={onRefresh}
                />
              ))}
            </tbody>
          </table>
          <div style={{ padding: '10px 16px', borderTop: '1px solid #F3F4F6', fontSize: 12, color: '#9CA3AF' }}>
            Click any row to open that client, or use ▶ Start Queue to work through all of them in order.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }) {
  const ts = new Date(msg.dateAdded);
  const label = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
                ' · ' + ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  // Notes → yellow sticky-note bubble, full width
  if (msg.type === 'notes') {
    const ts = new Date(msg.dateAdded);
    const label = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
                  ' · ' + ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return (
      <div style={{
        background: '#FFFBEB',
        border: '1px solid #FDE68A',
        borderLeft: '3px solid #F59E0B',
        borderRadius: 7,
        padding: '9px 12px',
        margin: '2px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Note
          </span>
          <span style={{ fontSize: 10, color: '#C4C4C4' }}>{label}</span>
        </div>
        <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {msg.body}
        </div>
      </div>
    );
  }

  // Call logs → centered divider row
  if (msg.type === 'call') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
        <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
        <span style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
          {msg.direction === 'inbound' ? 'Incoming call' : 'Outgoing call'} · {label}
          {msg.body && <span style={{ color: '#6B7280' }}>— {msg.body}</span>}
        </span>
        <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
      </div>
    );
  }

  const isOut = msg.direction === 'outbound';
  const isSms = msg.type === 'sms';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isOut ? 'flex-end' : 'flex-start',
      marginBottom: 2,
    }}>
      {/* Type badge + timestamp */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {!isOut && (
          <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 500 }}>
            {isSms ? 'SMS' : 'Email'}
          </span>
        )}
        <span style={{ fontSize: 10, color: '#C4C4C4' }}>{label}</span>
        {isOut && (
          <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 500 }}>
            {isSms ? 'SMS' : 'Email'}
          </span>
        )}
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: '80%',
        padding: '9px 13px',
        borderRadius: isOut ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
        background: isOut ? '#1E3A5F' : '#F3F4F6',
        color: isOut ? '#FFFFFF' : '#1F2937',
        fontSize: 13,
        lineHeight: 1.55,
        wordBreak: 'break-word',
      }}>
        {msg.subject && (
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 5, opacity: 0.75 }}>
            {msg.subject}
          </div>
        )}
        {msg.body || <em style={{ opacity: 0.5 }}>(no body)</em>}
      </div>

      {/* Delivery status for outbound */}
      {isOut && msg.status && msg.status !== 'sent' && (
        <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{msg.status}</div>
      )}
    </div>
  );
}

// ─── Communications Panel ─────────────────────────────────────────────────────
// Inline chat panel: fetches real GHL conversation + shows merged timeline.
// No modals — compose lives inline at the bottom.

function CommunicationsPanel({ client, touchpoints, contactId }) {
  const feedRef = useRef(null);

  // GHL conversation state
  const [ghlMessages,  setGhlMessages]  = useState([]);
  const [convId,       setConvId]       = useState(null);
  const [loadingConv,  setLoadingConv]  = useState(false);

  // Compose state
  const [composeType,    setComposeType]    = useState('sms'); // 'sms' | 'email'
  const [composeBody,    setComposeBody]    = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [sending,        setSending]        = useState(false);
  const [sendError,      setSendError]      = useState('');

  const name = `${client.first_name} ${client.last_name}`;

  // ── Fetch GHL messages ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!contactId) return;
    setLoadingConv(true);
    fetch(`/api/dashboard/nurture-conversation?contactId=${contactId}`)
      .then(r => r.json())
      .then(data => {
        setConvId(data.conversationId || null);
        setGhlMessages(data.messages || []);
      })
      .catch(() => {})
      .finally(() => setLoadingConv(false));
  }, [contactId]);

  // ── Merge GHL messages + logged touchpoints into a single timeline ───────────
  const timeline = useMemo(() => {
    // Convert touchpoints to the same shape as GHL messages
    const tpItems = touchpoints.map(tp => ({
      id:        `tp_${tp.id}`,
      direction: 'outbound',
      type:      tp.medium === 'text' ? 'sms' : tp.medium, // 'call' | 'email' | 'sms' | 'notes'
      body:      tp.note || '',
      subject:   null,
      dateAdded: tp.created_at,
      status:    'logged',
      source:    'touchpoint',
    }));

    // Merge and sort by date oldest → newest
    return [...ghlMessages, ...tpItems].sort(
      (a, b) => new Date(a.dateAdded) - new Date(b.dateAdded)
    );
  }, [ghlMessages, touchpoints]);

  // ── Auto-scroll to bottom when timeline changes ──────────────────────────────
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [timeline]);

  // ── Send handler ─────────────────────────────────────────────────────────────
  async function send() {
    const body = composeBody.trim();
    if (!body) return;
    setSending(true);
    setSendError('');

    // Optimistic message
    const optimisticMsg = {
      id:        `opt_${Date.now()}`,
      direction: 'outbound',
      type:      composeType,
      body,
      subject:   composeSubject.trim() || null,
      dateAdded: new Date().toISOString(),
      status:    'sending',
      source:    'optimistic',
    };
    setGhlMessages(prev => [...prev, optimisticMsg]);
    setComposeBody('');
    setComposeSubject('');

    try {
      const endpoint = composeType === 'sms'
        ? '/api/dashboard/send-sms'
        : '/api/dashboard/send-email';

      const payload = composeType === 'sms'
        ? { phone: client.phone, message: body, contactId }
        : { to: client.email, name, subject: composeSubject.trim() || `Message to ${name}`, body, contactId };

      const r    = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();

      if (data.ok) {
        // Replace optimistic entry with confirmed
        setGhlMessages(prev =>
          prev.map(m => m.id === optimisticMsg.id
            ? { ...m, status: 'sent' }
            : m
          )
        );
      } else if (data.fallback && data.smsLink) {
        // SMS fallback: open native SMS app
        window.open(data.smsLink, '_blank');
        setGhlMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
        setSendError('Opened your SMS app as a fallback.');
      } else {
        throw new Error(data.error || 'Send failed');
      }
    } catch (e) {
      setSendError(e.message || 'Failed to send');
      setGhlMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
    } finally {
      setSending(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  }

  const canSms   = !!client.phone;
  const canEmail = !!client.email;

  return (
    <div style={{ ...s.card, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', height: 560 }}>

      {/* ── Header ── */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #F0F0F0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={s.cardTitle}>Communications</div>
          {loadingConv && (
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>Loading…</span>
          )}
          {!loadingConv && !contactId && (
            <span style={{ fontSize: 11, color: '#F59E0B' }}>No GHL contact linked</span>
          )}
          {!loadingConv && contactId && (
            <span style={{ fontSize: 11, color: '#10B981' }}>● Live</span>
          )}
        </div>
      </div>

      {/* ── Message feed ── */}
      <div
        ref={feedRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          minHeight: 0,
        }}
      >
        {timeline.length === 0 && !loadingConv && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#D1D5DB' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#9CA3AF' }}>No messages yet</div>
            <div style={{ fontSize: 11, marginTop: 4, color: '#C4C4C4' }}>Send an SMS or email below to start the conversation</div>
          </div>
        )}
        {loadingConv && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#D1D5DB', fontSize: 13 }}>
            Loading conversation…
          </div>
        )}
        {timeline.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
      </div>

      {/* ── Compose area ── */}
      <div style={{ borderTop: '1px solid #F0F0F0', flexShrink: 0, padding: '10px 12px 12px' }}>

        {/* Type tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {canSms && (
            <button
              onClick={() => setComposeType('sms')}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit',
                background: composeType === 'sms' ? '#6D28D9' : '#F5F3FF',
                color:      composeType === 'sms' ? '#FFFFFF'  : '#6D28D9',
                border:     composeType === 'sms' ? '1px solid #6D28D9' : '1px solid #DDD6FE',
              }}
            >
              SMS
            </button>
          )}
          {canEmail && (
            <button
              onClick={() => setComposeType('email')}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit',
                background: composeType === 'email' ? '#1D4ED8' : '#EFF6FF',
                color:      composeType === 'email' ? '#FFFFFF'  : '#1D4ED8',
                border:     composeType === 'email' ? '1px solid #1D4ED8' : '1px solid #BFDBFE',
              }}
            >
              Email
            </button>
          )}
          {!canSms && !canEmail && (
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>No phone or email on file</span>
          )}
        </div>

        {/* Email subject line */}
        {composeType === 'email' && (
          <input
            value={composeSubject}
            onChange={e => setComposeSubject(e.target.value)}
            placeholder="Subject"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '7px 10px', marginBottom: 6,
              border: '1px solid #E5E7EB', borderRadius: 6,
              fontSize: 12, fontFamily: 'inherit', color: '#1F2937',
              outline: 'none', background: '#FAFAFA',
            }}
          />
        )}

        {/* Message textarea + send button */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={composeBody}
            onChange={e => setComposeBody(e.target.value)}
            onKeyDown={handleKey}
            placeholder={composeType === 'sms' ? `Text ${client.first_name}… (⌘↵ to send)` : `Email ${client.first_name}… (⌘↵ to send)`}
            rows={2}
            style={{
              flex: 1, resize: 'none',
              padding: '8px 10px',
              border: '1px solid #E5E7EB', borderRadius: 8,
              fontSize: 13, fontFamily: 'inherit', color: '#1F2937',
              outline: 'none', background: '#FAFAFA',
              lineHeight: 1.5,
            }}
          />
          <button
            onClick={send}
            disabled={sending || !composeBody.trim()}
            style={{
              flexShrink: 0,
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13, fontWeight: 600,
              cursor: sending || !composeBody.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              background: sending || !composeBody.trim() ? '#E5E7EB' : '#1E3A5F',
              color:      sending || !composeBody.trim() ? '#9CA3AF'  : '#FFFFFF',
              border: 'none',
              transition: 'background 0.15s',
              alignSelf: 'flex-end',
            }}
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>

        {sendError && (
          <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 6 }}>{sendError}</div>
        )}
      </div>
    </div>
  );
}

// ─── Queue Card (used in Queue mode full-card layout) ─────────────────────────

// ── Next Action Engine ────────────────────────────────────────────────────────
// Given a client's current state, returns the single clearest next thing to do.
function getNextAction(client, fundingDone, maxStage) {
  const stage = maxStage || 1;
  const name  = client.first_name || 'This client';

  // Never contacted — highest priority
  if (client.days_since_contact === null) {
    return {
      icon: '📞',
      label: 'First Outreach Call',
      detail: `${name} has never been contacted. Introduce yourself, understand their goals, timeline, and liquid capital. Let them know what to expect from the process.`,
      color: '#B91C1C', bg: '#FEF2F2', border: '#FCA5A5',
    };
  }

  // Funding intro — urgent if stage 2+
  if (!fundingDone && stage >= 2) {
    return {
      icon: '💰',
      label: 'Introduce to Funding Partner',
      detail: `${name} is at Stage ${stage} and hasn't been connected to a funding source yet. Make the intro to your SBA lender or funding partner so financing doesn't become a blocker.`,
      color: '#6D28D9', bg: '#F5F3FF', border: '#C4B5FD',
    };
  }

  // Stage-based next actions
  switch (stage) {
    case 1: return {
      icon: '📞',
      label: 'Schedule Developer Intro Call',
      detail: `Set up the first call between ${name} and the franchise developer. Confirm which brand(s) they\'re most excited about and get the developer relationship started.`,
      color: '#9F1239', bg: '#FFF1F2', border: '#FECDD3',
    };
    case 2: return {
      icon: '📊',
      label: 'Unit Economics Follow-Up',
      detail: `Walk ${name} through the unit economics. Help them understand the investment return, ramp-up period, and realistic breakeven timeline for the brands they\'re considering.`,
      color: '#C2410C', bg: '#FFF7ED', border: '#FED7AA',
    };
    case 3: return {
      icon: '📄',
      label: 'FDD Review & Attorney Intro',
      detail: `Check in on ${name}\'s FDD review progress. If they haven\'t retained a franchise attorney yet, make that introduction now — it\'s a key step before Confirmation Day.`,
      color: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE',
    };
    case 4: return {
      icon: '📅',
      label: 'Invite to Confirmation Day',
      detail: `Coordinate ${name}\'s Confirmation Day visit — travel, agenda, and remaining questions. This is the final step before they commit. Make sure they feel confident.`,
      color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE',
    };
    case 5: return {
      icon: '🏁',
      label: 'Close the Deal',
      detail: `${name} is committed — confirm the signing timeline, coordinate with the franchisor on next steps, and support them through final paperwork and launch prep.`,
      color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0',
    };
    default: return {
      icon: '📞',
      label: 'Touch Base Call',
      detail: `Check in on ${name}\'s progress, answer any questions, and confirm next steps together.`,
      color: '#374151', bg: '#F9FAFB', border: '#E5E7EB',
    };
  }
}

function QueueCard({ client: c, isDemo, onNext, onUpdate, onRefresh }) {
  const [brands,            setBrands]            = useState(c.brands || []);
  const [touchpoints,       setTouchpoints]       = useState(c.touchpoints || []);
  const [milestones,        setMilestones]        = useState(c.milestones || {});
  const [medium,            setMedium]            = useState('call');
  const [note,              setNote]              = useState('');
  const [logging,           setLogging]           = useState(false);
  const [loggedMsg,         setLoggedMsg]         = useState('');
  const [notesSaving,       setNotesSaving]       = useState(false);
  const [notesSaved,        setNotesSaved]        = useState(false);
  const [clientNotes,       setClientNotes]       = useState(c.notes || '');
  const [showFundingModal,  setShowFundingModal]  = useState(false);
  const [showAttorneyModal, setShowAttorneyModal] = useState(false);
  const [ghlContact,        setGhlContact]        = useState(null);

  useEffect(() => {
    setBrands(c.brands || []);
    setTouchpoints(c.touchpoints || []);
    setMilestones(c.milestones || {});
    setClientNotes(c.notes || '');
    setNote('');
    setLoggedMsg('');
    setNotesSaved(false);
    setGhlContact(null);
    // Async fetch GHL contact for tags + prospect info
    if (c.email && !isDemo) {
      fetch(`/api/dashboard/ghl-contact-detail?email=${encodeURIComponent(c.email)}`)
        .then(r => r.json())
        .then(d => { if (d.contact) setGhlContact(d.contact); })
        .catch(() => {});
    }
  }, [c.id]);

  const decay    = DECAY[c.decay] || DECAY.good;
  const maxStage = brands.length ? Math.max(...brands.map(b => b.stage)) : 1;
  const lastTP   = touchpoints[0] || null;
  const na       = getNextAction(c, milestones.funding?.done, maxStage);

  // Relative date helper
  function relDate(iso) {
    if (!iso) return '—';
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (d === 0) return 'Today';
    if (d === 1) return 'Yesterday';
    return `${d}d ago`;
  }

  // GHL prospect data
  const liquidCap = ghlContact?.custom_fields?.['Liquid Cash'] || ghlContact?.custom_fields?.['Cash Available'] || c.investment_level || null;
  const territory = ghlContact?.custom_fields?.['Territory Interest'] || ghlContact?.custom_fields?.['Areas of Interest'] || null;
  const ghlTags   = ghlContact?.tags || [];

  async function saveMilestone(key, data) {
    const updated = { ...milestones, [key]: data };
    setMilestones(updated);
    onUpdate({ milestones: updated });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, milestones: updated }),
      }).catch(console.error);
    }
  }

  async function saveEntry() {
    if (!note.trim() || logging) return;
    setLogging(true);
    const newTP = {
      id: `tp_${Date.now()}`, nurture_client_id: c.id, medium, note: note.trim(),
      created_at: new Date().toISOString(), created_by: 'me',
    };
    setTouchpoints(prev => [newTP, ...prev]);
    setNote('');
    onUpdate({ last_contacted_at: newTP.created_at, decay: 'good', days_since_contact: 0 });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-touchpoint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nurture_client_id: c.id, medium, note: newTP.note }),
      }).catch(console.error);
    }
    setLogging(false);
    setLoggedMsg('Saved');
    setTimeout(() => setLoggedMsg(''), 2000);
  }

  async function updateBrand(brandId, brandName, fields) {
    setBrands(prev => prev.map(b => b.id === brandId ? { ...b, ...fields } : b));
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-brand', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nurture_client_id: c.id, brand_name: brandName, ...fields }),
      }).catch(console.error);
    }
  }

  async function saveNotes() {
    setNotesSaving(true);
    onUpdate({ notes: clientNotes });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, notes: clientNotes }),
      }).catch(console.error);
    }
    setNotesSaving(false);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  }

  async function logBrandNote(brand, text) {
    const stageLabel = STAGES[brand.stage]?.short || `Stage ${brand.stage}`;
    const noteBody   = `${brand.brand_name} · ${stageLabel}: ${text}`;
    const newTP = {
      id: `tp_${Date.now()}`, nurture_client_id: c.id,
      medium: 'notes', note: noteBody,
      created_at: new Date().toISOString(), created_by: 'me',
    };
    setTouchpoints(prev => [newTP, ...prev]);
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-touchpoint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nurture_client_id: c.id, medium: 'notes', note: noteBody }),
      }).catch(console.error);
    }
  }

  async function archiveClient() {
    onUpdate({ status: 'archived' });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, status: 'archived' }),
      }).catch(console.error);
    }
    onNext();
  }

  async function closedWon() {
    onUpdate({ status: 'closed' });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, status: 'closed' }),
      }).catch(console.error);
    }
    onNext();
  }

  return (
    <div>
      {/* ── Top action bar ── */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={archiveClient} style={s.ghostBtn}>Archive</button>
        <button onClick={closedWon} style={{ ...s.ghostBtn, color: '#15803D', borderColor: '#86EFAC' }}>Closed Won</button>
        <button onClick={onNext} style={{ ...s.primaryBtn, padding: '6px 18px' }}>Next →</button>
      </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 16, alignItems: 'start' }}>

      {/* ── Left column ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── 3-question header card ── */}
        <div style={s.card}>
          {/* Name + decay badge */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={s.avatar}>{c.first_name?.[0]}{c.last_name?.[0]}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{c.first_name} {c.last_name}</div>
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{c.email}</div>
                {c.phone && <div style={{ fontSize: 13, color: '#6B7280' }}>{c.phone}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>{c.days_in_process}d in process</span>
                  {liquidCap && <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{liquidCap}</span>}
                  {territory && <span style={{ fontSize: 11, color: '#374151' }}>{territory}</span>}
                </div>
              </div>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, color: decay.color, background: decay.bg, whiteSpace: 'nowrap', flexShrink: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: decay.dot }} />
              {c.days_since_contact === null ? 'Never contacted' : `${c.days_since_contact}d since last touch`}
            </span>
          </div>

          {/* GHL tags */}
          {ghlTags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
              {ghlTags.slice(0, 8).map(tag => (
                <span key={tag} style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB' }}>{tag}</span>
              ))}
            </div>
          )}

          {/* 3 questions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>

            {/* 1 · What stage? */}
            <div style={{ background: STAGES[maxStage]?.bg || '#F9FAFB', border: `1px solid ${STAGES[maxStage]?.border || '#E5E7EB'}`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>1 · What Stage?</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: STAGES[maxStage]?.color || '#374151', marginBottom: 4 }}>
                S{maxStage} · {STAGES[maxStage]?.short || '—'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {brands.map(b => (
                  <div key={b.id} style={{ fontSize: 10, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{b.brand_name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2 · What happened last? */}
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>2 · What Happened Last?</div>
              {lastTP ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'capitalize' }}>{lastTP.medium}</span>
                    <span style={{ fontSize: 10, color: '#9CA3AF' }}>· {relDate(lastTP.created_at)}</span>
                  </div>
                  {lastTP.note && (
                    <div style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      "{lastTP.note}"
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 10, color: '#9CA3AF', fontStyle: 'italic', lineHeight: 1.5 }}>No touchpoints yet — first outreach needed</div>
              )}
            </div>

            {/* 3 · What's next? */}
            <div style={{ background: na.bg, border: `1px solid ${na.border}`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>3 · What's Next?</div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: na.color, lineHeight: 1.4 }}>{na.label}</div>
              </div>
              {na.detail && <div style={{ fontSize: 10, color: '#6B7280', marginTop: 6, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{na.detail}</div>}
            </div>
          </div>

          {/* Contact buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={`tel:${c.phone}`}    style={{ ...s.contactBtn, background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>Call</a>
            <a href={`mailto:${c.email}`} style={{ ...s.contactBtn, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>Email</a>
            <a href={`sms:${c.phone}`}    style={{ ...s.contactBtn, background: '#F5F3FF', color: '#6D28D9', border: '1px solid #DDD6FE' }}>Text</a>
          </div>
        </div>

        {/* Pending milestones bar */}
        <PendingMilestonesBar
          milestones={milestones}
          maxStage={maxStage}
          onOpenFunding={() => setShowFundingModal(true)}
          onOpenAttorney={() => setShowAttorneyModal(true)}
        />

        {/* Communications feed */}
        <CommunicationsPanel
          client={c}
          touchpoints={touchpoints}
          contactId={ghlContact?.id}
        />
      </div>

      {/* ── Right column: log touchpoint + notes + franchise progress ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Log touchpoint / Notes */}
        <div style={s.card}>
          <div style={s.cardTitle}>Disposition</div>

          {/* 4-tab selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, marginTop: 12 }}>
            {[
              { key: 'call',  label: 'Call'  },
              { key: 'email', label: 'Email' },
              { key: 'text',  label: 'Text'  },
              { key: 'notes', label: 'Notes' },
            ].map(({ key, label }) => {
              const isActive = medium === key;
              const activeColor  = key === 'notes' ? '#92400E' : '#1D4ED8';
              const activeBg     = key === 'notes' ? '#FFFBEB' : '#EFF6FF';
              const activeBorder = key === 'notes' ? '#FDE68A' : '#BFDBFE';
              return (
                <button
                  key={key}
                  onClick={() => setMedium(key)}
                  style={{
                    padding: '8px 0', fontSize: 12, fontWeight: 700, borderRadius: 6,
                    border: `1.5px solid ${isActive ? activeBorder : '#E5E7EB'}`,
                    background: isActive ? activeBg : '#F9FAFB',
                    color: isActive ? activeColor : '#6B7280',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Textarea */}
          <textarea
            style={{ ...s.notesArea, marginTop: 10, fontSize: 13,
              background: medium === 'notes' ? '#FFFBEB' : undefined,
              borderColor: medium === 'notes' ? '#FDE68A' : undefined,
            }}
            rows={4}
            placeholder={
              medium === 'call'  ? 'What happened on the call?' :
              medium === 'email' ? 'What did you send or discuss?' :
              medium === 'text'  ? 'What was the message?' :
              'Add a note about this client…'
            }
            value={note}
            onChange={e => setNote(e.target.value)}
          />

          {/* Single save button */}
          <button
            onClick={saveEntry}
            disabled={!note.trim() || logging}
            style={{
              ...s.primaryBtn, marginTop: 8, width: '100%', fontSize: 14, padding: '10px',
              opacity: !note.trim() ? 0.5 : 1,
              cursor: !note.trim() ? 'not-allowed' : 'pointer',
              background: medium === 'notes' ? '#D97706' : '#1E3A5F',
            }}
          >
            {logging ? 'Saving…' : medium === 'notes' ? 'Save Note' : `Log ${medium.charAt(0).toUpperCase() + medium.slice(1)}`}
          </button>
          {loggedMsg && (
            <div style={{ fontSize: 12, color: '#15803D', textAlign: 'center', marginTop: 8, fontWeight: 600 }}>
              Saved
            </div>
          )}
        </div>

        {/* Franchise progress */}
        <div style={s.card}>
          <div style={s.cardTitle}>Franchise Progress</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 14 }}>
            {brands.length === 0 && (
              <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '16px 0' }}>
                No brands added — seeded from lead's franchise interests.
              </div>
            )}
            {brands.map(brand => (
              <BrandCard
                key={brand.id}
                brand={brand}
                onStageChange={stage => updateBrand(brand.id, brand.brand_name, { stage })}
                onSentimentChange={sentiment => updateBrand(brand.id, brand.brand_name, { sentiment })}
                onNoteChange={n => updateBrand(brand.id, brand.brand_name, { note: n })}
                onNoteSave={text => logBrandNote(brand, text)}
                onDevChange={fields => updateBrand(brand.id, brand.brand_name, fields)}
              />
            ))}
          </div>
        </div>

      </div>

      {/* Milestone modals */}
      {showFundingModal && (
        <FundingModal
          existing={milestones.funding}
          onSave={(data) => saveMilestone('funding', data)}
          onClose={() => setShowFundingModal(false)}
        />
      )}
      {showAttorneyModal && (
        <AttorneyModal
          existing={milestones.attorney}
          onSave={(data) => saveMilestone('attorney', data)}
          onClose={() => setShowAttorneyModal(false)}
        />
      )}
    </div>
    </div>
  );
}

// ─── Brand Card (Queue mode) ───────────────────────────────────────────────────

function BrandCard({ brand, onStageChange, onSentimentChange, onNoteChange, onNoteSave, onDevChange }) {
  const [noteVal,      setNoteVal]      = useState(brand.note || '');
  const [noteSaved,    setNoteSaved]    = useState(false);
  const [showDevModal, setShowDevModal] = useState(false);

  const hasDevInfo = brand.developer_name || brand.developer_phone || brand.developer_email;

  useEffect(() => {
    setNoteVal(brand.note || '');
  }, [brand.id]);

  function handleSaveNote() {
    if (!noteVal.trim()) return;
    onNoteChange(noteVal);               // persist to brand record
    onNoteSave?.(noteVal.trim());        // log to comms panel
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  }

  return (
    <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '14px 16px' }}>
      {/* Brand name + sentiment */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{brand.brand_name}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {Object.entries(SENTIMENTS).map(([key, st]) => (
            <button
              key={key}
              onClick={() => onSentimentChange(brand.sentiment === key ? null : key)}
              title={st.label}
              style={{
                background: brand.sentiment === key ? st.bg : 'transparent',
                border: `1px solid ${brand.sentiment === key ? st.border : '#E5E7EB'}`,
                borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontSize: 14, lineHeight: 1,
              }}
            >
              {st.emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Stage stepper */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {STAGES.slice(1).map((stage, i) => {
          const n         = i + 1;
          const isCurrent = brand.stage === n;
          const isPast    = brand.stage > n;
          return (
            <button
              key={n}
              onClick={() => onStageChange(n)}
              title={stage.label}
              style={{
                padding: '4px 8px', fontSize: 10, fontWeight: 700,
                borderRadius: 5, cursor: 'pointer', border: '1.5px solid',
                borderColor: isCurrent ? stage.color : isPast ? '#D1D5DB' : '#E5E7EB',
                background:  isCurrent ? stage.bg    : isPast ? '#F3F4F6' : '#fff',
                color:       isCurrent ? stage.color : isPast ? '#9CA3AF' : '#D1D5DB',
                fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all .12s',
              }}
            >
              {n} · {stage.short}
            </button>
          );
        })}
      </div>

      {/* Note */}
      <textarea
        style={{ width: '100%', padding: '7px 9px', border: '1px solid #E5E7EB', borderRadius: 5, fontSize: 12, color: '#374151', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: '#fff', lineHeight: 1.5 }}
        rows={2}
        placeholder={`Notes on ${brand.brand_name}…`}
        value={noteVal}
        onChange={e => setNoteVal(e.target.value)}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
        <button
          onClick={handleSaveNote}
          disabled={!noteVal.trim()}
          style={{
            padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 5,
            background: noteSaved ? '#15803D' : '#1E3A5F',
            color: '#fff', border: 'none', cursor: noteVal.trim() ? 'pointer' : 'not-allowed',
            opacity: noteVal.trim() ? 1 : 0.4, fontFamily: 'inherit',
          }}
        >
          {noteSaved ? 'Saved' : 'Save Note'}
        </button>
        {noteSaved && (
          <span style={{ fontSize: 11, color: '#15803D' }}>Added to communications</span>
        )}
      </div>

      {/* Developer contact — read-only */}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F3F4F6' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.05em' }}>Developer Contact</div>
          <button
            onClick={() => setShowDevModal(true)}
            style={{ fontSize: 11, fontWeight: 600, color: '#1D4ED8', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', fontFamily: 'inherit' }}
          >
            {hasDevInfo ? 'Edit' : '+ Add'}
          </button>
        </div>
        {hasDevInfo ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {brand.developer_name && (
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{brand.developer_name}</div>
            )}
            {brand.developer_phone && (
              <a href={`tel:${brand.developer_phone}`} style={{ fontSize: 12, color: '#1D4ED8', textDecoration: 'none' }}>{brand.developer_phone}</a>
            )}
            {brand.developer_email && (
              <a href={`mailto:${brand.developer_email}`} style={{ fontSize: 12, color: '#1D4ED8', textDecoration: 'none' }}>{brand.developer_email}</a>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#C0C0C0', fontStyle: 'italic' }}>No contact info yet</div>
        )}
      </div>

      {/* Edit modal */}
      {showDevModal && (
        <DeveloperContactModal
          brand={brand}
          onSave={(fields) => { onDevChange(fields); setShowDevModal(false); }}
          onClose={() => setShowDevModal(false)}
        />
      )}
    </div>
  );
}

// ─── Small components ──────────────────────────────────────────────────────────

function StatCard({ label, value, color, warn }) {
  return (
    <div style={{
      background: warn ? color + '08' : '#fff',
      border: `1px solid ${warn ? color + '40' : '#E8EAED'}`,
      borderRadius: 6, padding: '14px 18px',
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: warn ? color : '#111827', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: warn ? color : '#6B7280', marginTop: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page:        { display: 'flex', minHeight: '100vh', background: '#FAFBFD', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },

  sidebar:          { width: 210, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', zIndex: 10 },
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
  mainCol:          { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  topBar:           { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', flexShrink: 0, gap: 16 },
  topTitle:         { fontSize: 20, fontWeight: 700, color: '#0F172A' },
  topDate:          { fontSize: 13, color: '#64748B', fontWeight: 400, marginTop: 2 },
  topActions:       { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  topBtn:           { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6, border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' },
  pageBody:         { flex: 1, padding: '20px 24px', overflowY: 'auto' },

  header:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 50, background: '#151719', position: 'sticky', top: 0, zIndex: 100 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 28 },
  logo:       { fontWeight: 600, fontSize: 15, color: '#fff', flexShrink: 0 },
  nav:        { display: 'flex', gap: 2 },
  navLink:    { fontSize: 13, color: '#9FA6B2', textDecoration: 'none', padding: '7px 14px', borderRadius: 3 },
  navActive:  { color: '#fff', background: 'rgba(255,255,255,.13)' },
  headerRight:{ display: 'flex', alignItems: 'center', gap: 12 },
  headerUser: { fontSize: 13, color: '#9FA6B2' },

  body:       { maxWidth: 1320, margin: '0 auto', padding: '20px 20px 60px' },
  titleBar:   { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  pageTitle:  { fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 },
  pageSub:    { fontSize: 13, color: '#6B7280', margin: '4px 0 0' },

  statsRow:   { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 },

  demoBanner: { background: '#FFFBF0', border: '1px solid #F5A623', borderLeft: '4px solid #F5A623', borderRadius: 4, padding: '10px 14px', fontSize: 13, color: '#7D4E00', marginBottom: 18 },
  demoBadge:  { fontSize: 11, fontWeight: 600, color: '#92400E', background: '#FEF3C7', padding: '3px 9px', borderRadius: 10, border: '1px solid #FDE68A' },

  card:       { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px', boxShadow: '0 1px 3px rgba(15,23,42,.04)' },
  cardTitle:  { fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.07em' },

  table:      { width: '100%', borderCollapse: 'collapse' },
  th:         { fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.05em', padding: '8px 12px', background: '#F9FAFB', borderBottom: '1px solid #E8EAED', textAlign: 'left' },
  td:         { padding: '12px 12px', verticalAlign: 'middle', fontSize: 13 },

  avatar:     { width: 46, height: 46, borderRadius: '50%', background: '#EFF6FF', color: '#0057FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 },
  avatarSm:   { width: 36, height: 36, borderRadius: '50%', background: '#EFF6FF', color: '#0057FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },

  primaryBtn: { padding: '8px 18px', background: '#0057FF', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'background .15s' },
  ghostBtn:   { padding: '7px 14px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, color: '#475569', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  actionChip: { padding: '4px 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#15803D', cursor: 'pointer', fontFamily: 'inherit' },
  ghostChip:  { padding: '4px 10px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 20, fontSize: 11, color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' },

  contactBtn: { padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-block', cursor: 'pointer' },
  contactRow: { display: 'flex', alignItems: 'center', gap: 6 },
  contactIcon:{ fontSize: 13 },

  notesArea:  { width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#111827', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6, background: '#FFFDF0' },

  devInput:   { width: '100%', padding: '6px 8px', border: '1px solid #E5E7EB', borderRadius: 5, fontSize: 12, color: '#374151', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: '#fff' },

  loadingWrap:{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 16 },
  spinner:    { width: 28, height: 28, borderRadius: '50%', border: '2px solid #E2E8F0', borderTopColor: '#0057FF', animation: 'spin 0.8s linear infinite' },
  loadingText:{ color: '#6B7280', fontSize: 13 },

  // Side panel
  panelBackdrop: { position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,.25)' },
  panel:         { position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, zIndex: 200, background: '#FFFFFF', boxShadow: '-4px 0 24px rgba(0,0,0,.12)', display: 'flex', flexDirection: 'column', animation: 'slideIn .2s ease' },
  panelHeader:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #E2E8F0', flexShrink: 0, background: '#FFFFFF' },
  panelBody:     { flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 },
  panelSection:  { paddingBottom: 14, borderBottom: '1px solid #F1F5F9' },
  sectionLabel:  { fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.07em' },
  closeBtn:      { width: 28, height: 28, borderRadius: '50%', border: '1px solid #E5E7EB', background: '#F9FAFB', cursor: 'pointer', fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' },
};
