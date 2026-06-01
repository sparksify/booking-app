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

// ── Pipeline stage definitions ────────────────────────────────────────────────
const STAGES = [
  null,
  { label: 'Intro Call',              short: 'Intro Call',   color: '#9F1239', bg: '#FFF1F2', border: '#FECDD3' },
  { label: 'Unit Economics',          short: 'Unit Econ',    color: '#C2410C', bg: '#FFF7ED', border: '#FED7AA' },
  { label: 'FDD Review & Territory',  short: 'FDD Review',   color: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE' },
  { label: 'Confirmation Day Invite', short: 'Conf. Invite', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  { label: 'Committed',               short: 'Committed',    color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0' },
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

// ── Demo data ─────────────────────────────────────────────────────────────────
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
      { id: 'b1', nurture_client_id: 'n1', brand_name: 'Pilates Addiction', stage: 2, sentiment: 'positive', note: 'Loved unit economics call. Ready to review FDD next.' },
      { id: 'b2', nurture_client_id: 'n1', brand_name: 'Squeeze House',     stage: 1, sentiment: 'neutral',  note: 'Intro call with developer scheduled next week.' },
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
      { id: 'b3', nurture_client_id: 'n2', brand_name: 'Freecoat Nails', stage: 3, sentiment: 'positive', note: 'FDD under review with attorney. Territory mapped — loves Austin area.' },
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
      { id: 'b4', nurture_client_id: 'n3', brand_name: 'Wet Fuel',        stage: 2, sentiment: 'neutral',  note: 'Unit econ call done. Comparing to Anytime Fitness.' },
      { id: 'b5', nurture_client_id: 'n3', brand_name: 'Anytime Fitness', stage: 1, sentiment: null,       note: 'Intro call not yet scheduled with developer.' },
    ],
    touchpoints: [
      { id: 't5', medium: 'text', note: 'Quick check-in. Said he is busy but will call developer this week.', created_at: daysAgo(7), created_by: 'steve@sparksify.com' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function NurturePage() {
  const { data: session } = useSession();
  const [clients,   setClients]   = useState([]);
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [isDemo,    setIsDemo]    = useState(false);
  const [queueMode, setQueueMode] = useState(false);
  const [queueIdx,  setQueueIdx]  = useState(0);

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

  function enterQueue() { setQueueIdx(0); setQueueMode(true); }
  function exitQueue()  { setQueueMode(false); load(); }

  function updateClientLocally(id, patch) {
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  const activeClients = clients.filter(c => c.status === 'active');

  return (
    <>
      <Head><title>In-Process Nurture — FranchiseBook</title></Head>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        .nurture-row:hover { background: #F0F4FF !important; }
      `}</style>

      <div style={s.page}>
        {/* ── Header ── */}
        <header style={s.header}>
          <div style={s.headerLeft}>
            <span style={s.logo}>⬡ FranchiseBook</span>
            <nav style={s.nav}>
              <Link href="/dashboard/analytics"  style={s.navLink}>Analytics</Link>
              <Link href="/dashboard/bookings"   style={s.navLink}>Bookings</Link>
              <Link href="/dashboard/leads"      style={s.navLink}>Leads</Link>
              <Link href="/dashboard/prospects"  style={s.navLink}>Prospecting</Link>
              <Link href="/dashboard/nurture"    style={{ ...s.navLink, ...s.navActive }}>Nurture</Link>
            </nav>
          </div>
          <div style={s.headerRight}>
            <Link href="/dashboard/settings" style={s.navLink}>Settings</Link>
            <span style={s.headerUser}>{session?.user?.email}</span>
          </div>
        </header>

        <div style={s.body}>
          {/* Title bar */}
          <div style={s.titleBar}>
            <div>
              <h1 style={s.pageTitle}>In-Process Nurture</h1>
              <p style={s.pageSub}>Clients who returned a CQ — stay in front of them every week.</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {isDemo && <span style={s.demoBadge}>Preview</span>}
              <button onClick={load} style={s.ghostBtn}>↻ Refresh</button>
              {activeClients.length > 0 && (
                <button onClick={enterQueue} style={s.primaryBtn}>
                  Work Queue ({activeClients.length})
                </button>
              )}
            </div>
          </div>

          {/* Demo banner */}
          {isDemo && (
            <div style={s.demoBanner}>
              Preview mode — no nurture clients yet. Click "Mark CQ Received" on any booking to auto-add clients to this queue.
            </div>
          )}

          {/* Stats bar */}
          {stats && (
            <div style={s.statsRow}>
              <StatCard label="Active Clients"  value={stats.total}          color="#1D4ED8" />
              <StatCard label="Overdue (14d+)"  value={stats.urgent}         color="#B91C1C" warn={stats.urgent > 0} />
              <StatCard label="Due This Week"   value={stats.warning}        color="#92400E" warn={stats.warning > 0} />
              <StatCard label="Funding Needed"  value={stats.funding_needed} color="#6D28D9" warn={stats.funding_needed > 0} />
            </div>
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
              idx={queueIdx}
              setIdx={setQueueIdx}
              isDemo={isDemo}
              onExit={exitQueue}
              onUpdate={updateClientLocally}
              onRefresh={load}
            />
          ) : (
            <ListView
              clients={clients}
              isDemo={isDemo}
              onEnterQueue={enterQueue}
              onUpdate={updateClientLocally}
              onRefresh={load}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ clients, isDemo, onEnterQueue, onUpdate, onRefresh }) {
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
              {['Client', 'Franchise(s) & Stage', 'Last Contact', 'Days In', 'Funding', 'Status', ''].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.map((c, i) => (
              <ListRow key={c.id} client={c} striped={i % 2 === 1} isDemo={isDemo} onUpdate={onUpdate} onRefresh={onRefresh} />
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
                  <ListRow key={c.id} client={c} striped={i % 2 === 1} isDemo={isDemo} onUpdate={onUpdate} onRefresh={onRefresh} readOnly />
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function ListRow({ client: c, striped, isDemo, onUpdate, onRefresh, readOnly }) {
  const decay = DECAY[c.decay] || DECAY.good;
  const bg    = striped ? '#F9FAFB' : '#fff';

  async function archive() {
    onUpdate(c.id, { status: 'archived' });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, status: 'archived' }),
      }).catch(console.error);
    }
  }

  async function markClosed() {
    onUpdate(c.id, { status: 'closed' });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, status: 'closed' }),
      }).catch(console.error);
    }
  }

  return (
    <tr className="nurture-row" style={{ background: bg, borderBottom: '1px solid #F3F4F6' }}>
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
                {b.sentiment && SENTIMENTS[b.sentiment] && (
                  <span style={{ fontSize: 13 }}>{SENTIMENTS[b.sentiment].emoji}</span>
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

      {/* Actions */}
      <td style={s.td}>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 5 }}>
            <button onClick={markClosed} style={s.actionChip}>Closed Won</button>
            <button onClick={archive}   style={s.ghostChip}>Archive</button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Queue View ───────────────────────────────────────────────────────────────

function QueueView({ clients, idx, setIdx, isDemo, onExit, onUpdate, onRefresh }) {
  const client = clients[idx];

  if (!client) {
    return (
      <div style={{ textAlign: 'center', padding: 64 }}>
        <div style={{ fontSize: 40 }}>🎉</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginTop: 12 }}>Queue complete!</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 6 }}>All clients touched for today.</div>
        <button onClick={onExit} style={{ ...s.primaryBtn, marginTop: 20 }}>Back to List</button>
      </div>
    );
  }

  function next() {
    if (idx < clients.length - 1) setIdx(i => i + 1);
    else onExit();
  }
  function prev() { if (idx > 0) setIdx(i => i - 1); }

  return (
    <div>
      {/* Queue nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={onExit} style={s.ghostBtn}>← Back to list</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={prev} disabled={idx === 0} style={{ ...s.ghostBtn, opacity: idx === 0 ? 0.3 : 1 }}>← Prev</button>
          <span style={{ fontSize: 13, color: '#6B7280' }}>{idx + 1} of {clients.length}</span>
          <button onClick={next} style={s.ghostBtn}>{idx < clients.length - 1 ? 'Next →' : 'Done ✓'}</button>
        </div>
      </div>

      <QueueCard
        client={client}
        isDemo={isDemo}
        onNext={next}
        onUpdate={(patch) => onUpdate(client.id, patch)}
        onRefresh={onRefresh}
      />
    </div>
  );
}

// ─── Queue Card ───────────────────────────────────────────────────────────────

function QueueCard({ client: c, isDemo, onNext, onUpdate, onRefresh }) {
  const [brands,        setBrands]        = useState(c.brands || []);
  const [touchpoints,   setTouchpoints]   = useState(c.touchpoints || []);
  const [fundingDone,   setFundingDone]   = useState(c.funding_intro_done);
  const [medium,        setMedium]        = useState('call');
  const [note,          setNote]          = useState('');
  const [logging,       setLogging]       = useState(false);
  const [loggedMsg,     setLoggedMsg]     = useState('');
  const [notesSaving,   setNotesSaving]   = useState(false);
  const [notesSaved,    setNotesSaved]    = useState(false);
  const [clientNotes,   setClientNotes]   = useState(c.notes || '');

  // Reset when card changes
  useEffect(() => {
    setBrands(c.brands || []);
    setTouchpoints(c.touchpoints || []);
    setFundingDone(c.funding_intro_done);
    setClientNotes(c.notes || '');
    setNote('');
    setLoggedMsg('');
    setNotesSaved(false);
  }, [c.id]);

  const decay = DECAY[c.decay] || DECAY.good;
  const maxStage = brands.length ? Math.max(...brands.map(b => b.stage)) : 1;
  const showFundingPrompt = !fundingDone && maxStage >= 2;

  async function logTouchpoint() {
    if (!note.trim()) return;
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
        body: JSON.stringify({ nurture_client_id: c.id, medium, note: note.trim() }),
      }).catch(console.error);
    }
    setLogging(false);
    setLoggedMsg(`${medium.charAt(0).toUpperCase() + medium.slice(1)} logged ✓`);
    setTimeout(() => setLoggedMsg(''), 3000);
  }

  async function updateBrandStage(brandId, brandName, newStage) {
    setBrands(prev => prev.map(b => b.id === brandId ? { ...b, stage: newStage } : b));
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-brand', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nurture_client_id: c.id, brand_name: brandName, stage: newStage }),
      }).catch(console.error);
    }
  }

  async function updateBrandSentiment(brandId, brandName, sentiment) {
    setBrands(prev => prev.map(b => b.id === brandId ? { ...b, sentiment } : b));
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-brand', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nurture_client_id: c.id, brand_name: brandName, sentiment }),
      }).catch(console.error);
    }
  }

  async function updateBrandNote(brandId, brandName, note) {
    setBrands(prev => prev.map(b => b.id === brandId ? { ...b, note } : b));
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-brand', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nurture_client_id: c.id, brand_name: brandName, note }),
      }).catch(console.error);
    }
  }

  async function toggleFunding() {
    const next = !fundingDone;
    setFundingDone(next);
    onUpdate({ funding_intro_done: next });
    if (!isDemo) {
      await fetch('/api/dashboard/nurture-update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, funding_intro_done: next }),
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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>

      {/* ── Left column: client detail ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Client header */}
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={s.avatar}>{c.first_name?.[0]}{c.last_name?.[0]}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{c.first_name} {c.last_name}</div>
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{c.email}</div>
                {c.phone && <div style={{ fontSize: 13, color: '#6B7280' }}>{c.phone}</div>}
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{c.days_in_process} days in process</div>
              </div>
            </div>
            {/* Decay badge */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                color: decay.color, background: decay.bg,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: decay.dot }} />
                {c.days_since_contact === null ? 'Never contacted' : `${c.days_since_contact}d since last touch`}
              </span>
              {c.days_since_contact !== null && c.days_since_contact >= 7 && (
                <div style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'right' }}>
                  Weekly contact goal: {c.days_since_contact >= 14 ? '⚠️ 2 weeks overdue' : 'due now'}
                </div>
              )}
            </div>
          </div>

          {/* Quick contacts */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid #F3F4F6' }}>
            <a href={`tel:${c.phone}`} style={{ ...s.contactBtn, background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>📞 Call</a>
            <a href={`mailto:${c.email}`} style={{ ...s.contactBtn, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>✉️ Email</a>
            <a href={`sms:${c.phone}`} style={{ ...s.contactBtn, background: '#F5F3FF', color: '#6D28D9', border: '1px solid #DDD6FE' }}>💬 Text</a>
          </div>
        </div>

        {/* Funding prompt */}
        {showFundingPrompt && (
          <div style={{
            background: '#FAF5FF', border: '2px solid #C4B5FD', borderRadius: 8,
            padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#6D28D9' }}>💰 Funding intro needed</div>
              <div style={{ fontSize: 12, color: '#7C3AED', marginTop: 3 }}>
                {c.first_name} is at Stage 2+ — introduce them to a funding partner before Discovery Day.
              </div>
            </div>
            <button onClick={toggleFunding} style={{
              padding: '7px 16px', background: '#6D28D9', color: '#fff', border: 'none',
              borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              Mark Done ✓
            </button>
          </div>
        )}
        {fundingDone && (
          <div style={{
            background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8,
            padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#15803D' }}>Funding intro done</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                <button onClick={toggleFunding} style={{ color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11 }}>Undo</button>
              </div>
            </div>
          </div>
        )}

        {/* Franchise brand cards */}
        <div style={s.card}>
          <div style={s.cardTitle}>Franchise Progress</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 14 }}>
            {brands.length === 0 && (
              <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '16px 0' }}>
                No brands added — these are seeded from the lead's franchise interests.
              </div>
            )}
            {brands.map(brand => (
              <BrandCard
                key={brand.id}
                brand={brand}
                onStageChange={s => updateBrandStage(brand.id, brand.brand_name, s)}
                onSentimentChange={s => updateBrandSentiment(brand.id, brand.brand_name, s)}
                onNoteChange={n => updateBrandNote(brand.id, brand.brand_name, n)}
              />
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={s.card}>
          <div style={s.cardTitle}>Notes</div>
          <textarea
            style={{ ...s.notesArea, marginTop: 10 }}
            rows={4}
            value={clientNotes}
            placeholder="Notes about this client's journey, concerns, preferences…"
            onChange={e => setClientNotes(e.target.value)}
          />
          <button
            onClick={saveNotes}
            disabled={notesSaving}
            style={{ ...s.primaryBtn, marginTop: 8, background: notesSaved ? '#15803D' : '#0077C5' }}
          >
            {notesSaving ? 'Saving…' : notesSaved ? '✓ Saved' : 'Save Notes'}
          </button>
        </div>

        {/* Footer actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={closedWon} style={{ ...s.primaryBtn, background: '#15803D' }}>🎉 Mark Closed Won</button>
          <button onClick={archiveClient} style={s.ghostBtn}>Archive client</button>
          <button onClick={onNext} style={s.ghostBtn}>Skip →</button>
        </div>
      </div>

      {/* ── Right column: touchpoint logger + history ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Log touchpoint */}
        <div style={s.card}>
          <div style={s.cardTitle}>Log Touchpoint</div>
          {loggedMsg ? (
            <div style={{ marginTop: 12, textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 24 }}>✓</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#15803D', marginTop: 6 }}>{loggedMsg}</div>
            </div>
          ) : (
            <>
              {/* Medium selector */}
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                {['call', 'email', 'text'].map(m => (
                  <button key={m} onClick={() => setMedium(m)} style={{
                    flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600, borderRadius: 6,
                    border: `1.5px solid ${medium === m ? '#1D4ED8' : '#E5E7EB'}`,
                    background: medium === m ? '#EFF6FF' : '#F9FAFB',
                    color: medium === m ? '#1D4ED8' : '#6B7280',
                    cursor: 'pointer', textTransform: 'capitalize', fontFamily: 'inherit',
                  }}>
                    {m === 'call' ? '📞' : m === 'email' ? '✉️' : '💬'} {m}
                  </button>
                ))}
              </div>
              <textarea
                style={{ ...s.notesArea, marginTop: 10, fontSize: 13 }}
                rows={4}
                placeholder={`Notes from this ${medium}…\n\nWhat did you talk about? How did they feel? Next step?`}
                value={note}
                onChange={e => setNote(e.target.value)}
              />
              <button
                onClick={logTouchpoint}
                disabled={!note.trim() || logging}
                style={{
                  ...s.primaryBtn, marginTop: 8, width: '100%',
                  opacity: !note.trim() ? 0.5 : 1,
                  cursor: !note.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {logging ? 'Logging…' : `Log ${medium.charAt(0).toUpperCase() + medium.slice(1)}`}
              </button>
            </>
          )}
        </div>

        {/* Touchpoint history */}
        <div style={s.card}>
          <div style={s.cardTitle}>Touch History</div>
          {touchpoints.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 12, textAlign: 'center', padding: '16px 0' }}>
              No touchpoints logged yet
            </div>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 0 }}>
              {touchpoints.slice(0, 8).map((tp, i) => {
                const isLast = i === Math.min(touchpoints.length, 8) - 1;
                const ts = new Date(tp.created_at);
                const label = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const icon  = tp.medium === 'call' ? '📞' : tp.medium === 'email' ? '✉️' : '💬';
                return (
                  <div key={tp.id} style={{ display: 'flex', gap: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{icon}</div>
                      {!isLast && <div style={{ width: 1, flex: 1, background: '#E5E7EB', margin: '3px 0' }} />}
                    </div>
                    <div style={{ flex: 1, paddingBottom: isLast ? 0 : 14 }}>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3 }}>
                        {label} · <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{tp.medium}</span>
                      </div>
                      {tp.note && (
                        <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{tp.note}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Brand Card ───────────────────────────────────────────────────────────────

function BrandCard({ brand, onStageChange, onSentimentChange, onNoteChange }) {
  const [noteVal,    setNoteVal]    = useState(brand.note || '');
  const [noteTimer,  setNoteTimer]  = useState(null);

  function handleNoteChange(v) {
    setNoteVal(v);
    if (noteTimer) clearTimeout(noteTimer);
    setNoteTimer(setTimeout(() => onNoteChange(v), 1000));
  }

  return (
    <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '14px 16px' }}>
      {/* Brand name + sentiment */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{brand.brand_name}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {Object.entries(SENTIMENTS).map(([key, s]) => (
            <button
              key={key}
              onClick={() => onSentimentChange(brand.sentiment === key ? null : key)}
              title={s.label}
              style={{
                background: brand.sentiment === key ? s.bg : 'transparent',
                border: `1px solid ${brand.sentiment === key ? s.border : '#E5E7EB'}`,
                borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontSize: 14, lineHeight: 1,
              }}
            >
              {s.emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Stage stepper */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {STAGES.slice(1).map((stage, i) => {
          const n = i + 1;
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
                fontFamily: 'inherit', whiteSpace: 'nowrap',
                transition: 'all .12s',
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
        onChange={e => handleNoteChange(e.target.value)}
      />
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────

function StatCard({ label, value, color, warn }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${warn ? color + '40' : '#E8EAED'}`,
      borderRadius: 6, padding: '14px 18px',
      background: warn ? color + '08' : '#fff',
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: warn ? color : '#111827', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: warn ? color : '#6B7280', marginTop: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page:       { minHeight: '100vh', background: '#F0F2F5', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },
  header:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 50, background: '#151719', position: 'sticky', top: 0, zIndex: 10 },
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

  card:       { background: '#fff', border: '1px solid #E8EAED', borderRadius: 8, padding: '16px 18px' },
  cardTitle:  { fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.07em' },

  table:      { width: '100%', borderCollapse: 'collapse' },
  th:         { fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.05em', padding: '8px 12px', background: '#F9FAFB', borderBottom: '1px solid #E8EAED', textAlign: 'left' },
  td:         { padding: '12px 12px', verticalAlign: 'middle', fontSize: 13 },

  avatar:     { width: 46, height: 46, borderRadius: '50%', background: '#151719', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 },

  primaryBtn: { padding: '8px 18px', background: '#0077C5', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'background .15s' },
  ghostBtn:   { padding: '7px 14px', background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  actionChip: { padding: '4px 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#15803D', cursor: 'pointer', fontFamily: 'inherit' },
  ghostChip:  { padding: '4px 10px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 20, fontSize: 11, color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' },

  contactBtn: { padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-block', cursor: 'pointer' },

  notesArea:  { width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#111827', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 },

  loadingWrap:{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 16 },
  spinner:    { width: 28, height: 28, borderRadius: '50%', border: '2px solid #E5E7EB', borderTopColor: '#374151', animation: 'spin 0.8s linear infinite' },
  loadingText:{ color: '#6B7280', fontSize: 13 },
};
