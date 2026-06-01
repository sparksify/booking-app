import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import Head from 'next/head';
import Link from 'next/link';
import { authOptions } from '../api/auth/[...nextauth]';

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) return { redirect: { destination: '/dashboard/login', permanent: false } };
  return { props: { session } };
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_LEADS = [
  // ── HOT ───────────────────────────────────────────────────────────────────
  {
    id: 'demo-1', first_name: 'Marcus', last_name: 'Thompson',
    email: 'marcus.thompson@gmail.com', phone: '(512) 555-0192',
    ghl_contact_id: null, created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    investment_level: '$100k–$200k', liquid_cap_raw: '$150,000',
    location: 'Dallas, TX', score: 94, bucket: 'hot',
    reasons: ['Lead submitted 1 day ago', 'Liquid capital: $150,000', 'Viewed booking page 3×', 'No advisor contact recorded'],
    recommendedAction: 'Call now — leads reached within 5 minutes are 21× more likely to book.',
    ageDays: 1, isHighDollar: false, isResurrection: false, callAttempts: 0, recentEngaged: true, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-2', first_name: 'Jennifer', last_name: 'Caldwell',
    email: 'jcaldwell@outlook.com', phone: '(623) 555-0847',
    ghl_contact_id: null, created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    investment_level: '$200k–$300k', liquid_cap_raw: '$210,000',
    location: 'Phoenix, AZ', score: 87, bucket: 'hot',
    reasons: ['Lead submitted 2 days ago', 'Liquid capital: $210,000', 'Browsed available appointment slots', 'No advisor contact recorded'],
    recommendedAction: 'Call now — leads reached within 5 minutes are 21× more likely to book.',
    ageDays: 2, isHighDollar: false, isResurrection: false, callAttempts: 0, recentEngaged: true, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-3', first_name: 'David', last_name: 'Nguyen',
    email: 'dnguyen@email.com', phone: '(281) 555-0729',
    ghl_contact_id: null, created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    investment_level: '$100k–$200k', liquid_cap_raw: '$125,000',
    location: 'Houston, TX', score: 81, bucket: 'hot',
    reasons: ['Lead submitted 3 days ago — still in hot window', 'Liquid capital: $125,000', 'Viewed booking page 2×', 'No advisor contact recorded'],
    recommendedAction: 'Call today — every day of delay drops show probability by ~8%.',
    ageDays: 3, isHighDollar: false, isResurrection: false, callAttempts: 0, recentEngaged: false, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-4', first_name: 'Angela', last_name: 'Rivera',
    email: 'angela.rivera@company.com', phone: '(305) 555-0561',
    ghl_contact_id: null, created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    investment_level: '$100k–$200k', liquid_cap_raw: '$175,000',
    location: 'Miami, FL', score: 68, bucket: 'hot',
    reasons: ['Lead submitted 6 days ago — still in hot window', 'Liquid capital: $175,000', 'Viewed booking page 2×', '1 prior contact attempt'],
    recommendedAction: 'Call today — every day of delay drops show probability by ~8%.',
    ageDays: 6, isHighDollar: false, isResurrection: false, callAttempts: 1, recentEngaged: false, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-5', first_name: 'Robert', last_name: 'Kim',
    email: 'rob.kim@gmail.com', phone: '(737) 555-0334',
    ghl_contact_id: null, created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    investment_level: '$75k–$150k', liquid_cap_raw: '$95,000',
    location: 'Austin, TX', score: 72, bucket: 'hot',
    reasons: ['Lead submitted 5 days ago — still in hot window', 'Browsed available appointment slots', 'No advisor contact recorded'],
    recommendedAction: 'Call today — every day of delay drops show probability by ~8%.',
    ageDays: 5, isHighDollar: false, isResurrection: false, callAttempts: 0, recentEngaged: false, hasBooking: false, noShowRecent: false,
  },

  // ── APPOINTMENT SAVES ─────────────────────────────────────────────────────
  {
    id: 'demo-6', first_name: 'Sarah', last_name: 'Mitchell',
    email: 'smitchell@gmail.com', phone: '(312) 555-0413',
    ghl_contact_id: null, created_at: new Date(Date.now() - 18 * 86400000).toISOString(),
    investment_level: '$150k–$250k', liquid_cap_raw: '$200,000',
    location: 'Chicago, IL', score: 78, bucket: 'saves',
    reasons: ['No-showed within the last 7 days', 'Liquid capital: $200,000', 'Previously booked but did not show', '1 prior contact attempt'],
    recommendedAction: 'Call within 24 hours — 22% of no-shows rebook when contacted immediately after.',
    ageDays: 18, isHighDollar: false, isResurrection: false, callAttempts: 1, recentEngaged: false, hasBooking: true, noShowRecent: true,
  },
  {
    id: 'demo-7', first_name: 'James', last_name: 'Patterson',
    email: 'jpatterson@email.com', phone: '(615) 555-0887',
    ghl_contact_id: null, created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
    investment_level: '$100k–$200k', liquid_cap_raw: '$150,000',
    location: 'Nashville, TN', score: 65, bucket: 'saves',
    reasons: ['No-showed within the last 7 days', 'Liquid capital: $150,000', 'Previously booked but did not show', 'No advisor contact recorded'],
    recommendedAction: 'Call within 24 hours — 22% of no-shows rebook when contacted immediately after.',
    ageDays: 25, isHighDollar: false, isResurrection: false, callAttempts: 0, recentEngaged: false, hasBooking: true, noShowRecent: true,
  },

  // ── RESURRECTIONS ─────────────────────────────────────────────────────────
  {
    id: 'demo-8', first_name: 'Linda', last_name: 'Chen',
    email: 'linda.chen@gmail.com', phone: '(619) 555-0291',
    ghl_contact_id: null, created_at: new Date(Date.now() - 145 * 86400000).toISOString(),
    investment_level: '$250k–$500k', liquid_cap_raw: '$310,000',
    location: 'San Diego, CA', score: 74, bucket: 'resurrection',
    reasons: ['Lead submitted 145 days ago', 'Liquid capital: $310,000', 'Re-engaged after going dormant 90+ days', 'Showed recent activity after going quiet'],
    recommendedAction: 'Reach out now — they re-engaged after going dark. Strike while intent is warm.',
    ageDays: 145, isHighDollar: true, isResurrection: true, callAttempts: 3, recentEngaged: true, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-9', first_name: 'Thomas', last_name: 'Baker',
    email: 'tbaker@outlook.com', phone: '(720) 555-0658',
    ghl_contact_id: null, created_at: new Date(Date.now() - 112 * 86400000).toISOString(),
    investment_level: '$75k–$150k', liquid_cap_raw: '$90,000',
    location: 'Denver, CO', score: 61, bucket: 'resurrection',
    reasons: ['Lead submitted 112 days ago', 'Re-engaged after going dormant 90+ days', 'Viewed booking page today', '2 prior contact attempts'],
    recommendedAction: 'Reach out now — they re-engaged after going dark. Strike while intent is warm.',
    ageDays: 112, isHighDollar: false, isResurrection: true, callAttempts: 2, recentEngaged: true, hasBooking: false, noShowRecent: false,
  },

  // ── HIGH DOLLAR ───────────────────────────────────────────────────────────
  {
    id: 'demo-10', first_name: 'Michael', last_name: 'Rodriguez',
    email: 'm.rodriguez@venture.com', phone: '(212) 555-0940',
    ghl_contact_id: null, created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
    investment_level: '$500k+', liquid_cap_raw: '$750,000',
    location: 'New York, NY', score: 82, bucket: 'high_dollar',
    reasons: ['Lead submitted 8 days ago', 'Liquid capital: $750,000', 'High investment level indicated', 'No advisor contact recorded'],
    recommendedAction: 'Priority outreach — high investment level means outsized commission potential.',
    ageDays: 8, isHighDollar: true, isResurrection: false, callAttempts: 0, recentEngaged: false, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-11', first_name: 'Elizabeth', last_name: 'Warren',
    email: 'ewarren@familyoffice.com', phone: '(480) 555-0374',
    ghl_contact_id: null, created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    investment_level: '$500k+', liquid_cap_raw: '$500,000',
    location: 'Scottsdale, AZ', score: 76, bucket: 'high_dollar',
    reasons: ['Lead submitted 14 days ago', 'Liquid capital: $500,000', 'High investment level indicated', '1 prior contact attempt'],
    recommendedAction: 'Priority outreach — high investment level means outsized commission potential.',
    ageDays: 14, isHighDollar: true, isResurrection: false, callAttempts: 1, recentEngaged: false, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-12', first_name: 'Christopher', last_name: 'Walsh',
    email: 'cwalsh@gmail.com', phone: '(404) 555-0812',
    ghl_contact_id: null, created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    investment_level: '$250k–$500k', liquid_cap_raw: '$280,000',
    location: 'Atlanta, GA', score: 71, bucket: 'high_dollar',
    reasons: ['Lead submitted 4 days ago — still in hot window', 'Liquid capital: $280,000', 'High investment level indicated', 'Viewed booking page 2×', 'No advisor contact recorded'],
    recommendedAction: 'Priority outreach — high investment level means outsized commission potential.',
    ageDays: 4, isHighDollar: true, isResurrection: false, callAttempts: 0, recentEngaged: false, hasBooking: false, noShowRecent: false,
  },
];

function buildDemoData() {
  const buckets = { hot: [], saves: [], resurrection: [], high_dollar: [] };
  for (const l of DEMO_LEADS) buckets[l.bucket].push(l);
  return { leads: [...DEMO_LEADS].sort((a, b) => b.score - a.score), buckets };
}

// ─── Bucket config ────────────────────────────────────────────────────────────

const BUCKETS = {
  hot: {
    key:         'hot',
    label:       'Hot Leads',
    tagline:     'Call now',
    color:       '#D97706',
    bg:          '#FFFBEB',
    border:      '#FCD34D',
    dimColor:    '#92400E',
    recoveryRate: null,
    description: 'Fresh leads and high-scorers who haven\'t spoken to an advisor.',
  },
  saves: {
    key:         'saves',
    label:       'Appointment Saves',
    tagline:     'No-show recovery',
    color:       '#2563EB',
    bg:          '#EFF6FF',
    border:      '#93C5FD',
    dimColor:    '#1D4ED8',
    recoveryRate: '22%',
    description: 'Booked but no-showed within 7 days. High rebooking intent.',
  },
  resurrection: {
    key:         'resurrection',
    label:       'Resurrections',
    tagline:     'Re-engaged',
    color:       '#7C3AED',
    bg:          '#FAF5FF',
    border:      '#C4B5FD',
    dimColor:    '#6D28D9',
    recoveryRate: null,
    description: 'Dormant 90+ days but just showed activity. Window is short.',
  },
  high_dollar: {
    key:         'high_dollar',
    label:       'High Dollar',
    tagline:     'Premium leads',
    color:       '#15803D',
    bg:          '#F0FDF4',
    border:      '#86EFAC',
    dimColor:    '#166534',
    recoveryRate: null,
    description: '$250k+ liquid capital. Highest potential commission.',
  },
};

// ─── Score color ──────────────────────────────────────────────────────────────

function scoreColor(s) {
  if (s >= 80) return { color: '#15803D', bg: '#DCFCE7' };
  if (s >= 60) return { color: '#B45309', bg: '#FEF3C7' };
  if (s >= 40) return { color: '#C2410C', bg: '#FFEDD5' };
  return           { color: '#B91C1C', bg: '#FEE2E2' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageBadge(ageDays) {
  if (ageDays < 1)  return 'Today';
  if (ageDays <= 2) return `${Math.round(ageDays * 24)}h`;
  if (ageDays <= 7) return `${ageDays}d`;
  if (ageDays <= 30) return `${ageDays}d`;
  if (ageDays <= 90) return `${ageDays}d`;
  return `${Math.round(ageDays / 30)}mo`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.round((now - d) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7)  return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function copyToClipboard(text, setCopied) {
  navigator.clipboard.writeText(text).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProspectsPage() {
  const { data: session } = useSession();
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [demoMode,     setDemoMode]     = useState(false);
  const [activeBucket, setActiveBucket] = useState('all');
  const [queueMode,    setQueueMode]    = useState(false);
  const [queueIndex,   setQueueIndex]   = useState(0);
  const [dispositioned, setDispositioned] = useState(new Set());

  const loadData = useCallback(() => {
    setLoading(true);
    fetch('/api/dashboard/prospects')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function toggleDemo(on) {
    setDemoMode(on);
    setQueueMode(false);
    setQueueIndex(0);
    setDispositioned(new Set());
    setActiveBucket('all');
    if (on) setData(buildDemoData());
    else loadData();
  }

  useEffect(() => { loadData(); }, [loadData]);

  const displayData = demoMode ? buildDemoData() : data;

  // Filtered lead list
  const visibleLeads = !displayData ? [] : (
    activeBucket === 'all'
      ? displayData.leads
      : (displayData.buckets[activeBucket] || [])
  ).filter(l => !dispositioned.has(l.id));

  const totalCount = displayData
    ? Object.values(displayData.buckets).reduce((s, b) => s + b.length, 0)
    : 0;

  function startQueue(bucket) {
    if (bucket && bucket !== 'all') setActiveBucket(bucket);
    setQueueIndex(0);
    setQueueMode(true);
  }

  function onDisposition(leadId, disp) {
    fetch('/api/dashboard/prospect-disposition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, disposition: disp }),
    });
    setDispositioned(prev => new Set([...prev, leadId]));
    // Advance queue
    setQueueIndex(i => i + 1);
  }

  function onSkip(leadId) {
    fetch('/api/dashboard/prospect-disposition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, disposition: 'skipped' }),
    });
    setQueueIndex(i => i + 1);
  }

  const queueLeads = visibleLeads;
  const currentLead = queueMode ? queueLeads[queueIndex] : null;
  const queueDone   = queueMode && queueIndex >= queueLeads.length;

  return (
    <>
      <Head><title>Prospecting — FranchiseBook</title></Head>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        * { box-sizing: border-box }
      `}</style>
      <div style={s.page}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header style={s.header}>
          <div style={s.headerLeft}>
            <span style={s.logo}>⬡ FranchiseBook</span>
            <nav style={s.nav}>
              <Link href="/dashboard/analytics"  style={s.navLink}>Analytics</Link>
              <Link href="/dashboard/bookings"   style={s.navLink}>Bookings</Link>
              <Link href="/dashboard/leads"      style={s.navLink}>Leads</Link>
              <Link href="/dashboard/prospects"  style={{ ...s.navLink, ...s.navActive }}>Prospecting</Link>
            </nav>
          </div>
          <div style={s.headerRight}>
            <Link href="/dashboard/settings" style={s.navLink}>Settings</Link>
            <span style={s.headerUser}>{session?.user?.email}</span>
            <button style={s.signOutBtn} onClick={() => signOut({ callbackUrl: '/dashboard/login' })}>Sign out</button>
          </div>
        </header>

        <main style={s.main}>

          {loading ? (
            <div style={s.loadingWrap}>
              <div style={s.spinner} />
              <div style={s.loadingText}>Scoring leads…</div>
            </div>
          ) : !data ? (
            <div style={s.empty}>Could not load prospects.</div>
          ) : (
            <>
              {/* ── Page title ─────────────────────────────────────────────── */}
              <div style={s.pageTitleRow}>
                <div>
                  <h1 style={s.pageTitle}>Revenue Opportunities</h1>
                  <p style={s.pageSubtitle}>
                    {totalCount > 0
                      ? `${totalCount} lead${totalCount !== 1 ? 's' : ''} scored and ready · ${dispositioned.size > 0 ? `${dispositioned.size} worked this session` : 'Sorted by opportunity score'}`
                      : 'No active leads to prospect at the moment'}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Demo mode toggle */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: demoMode ? '#FEF3C7' : '#F3F4F6', border: `1px solid ${demoMode ? '#FCD34D' : '#E5E7EB'}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}
                    onClick={() => toggleDemo(!demoMode)}
                  >
                    <div style={{ position: 'relative', width: 32, height: 18, borderRadius: 9, background: demoMode ? '#D97706' : '#D1D5DB', transition: 'background .2s', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: 2, left: demoMode ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)', transition: 'left .18s' }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: demoMode ? '#92400E' : '#6B7280', whiteSpace: 'nowrap' }}>
                      {demoMode ? 'Demo data ON' : 'Demo data'}
                    </span>
                  </div>
                  {!demoMode && <button style={s.refreshBtn} onClick={loadData}>↻ Refresh</button>}
                </div>
              </div>

              {/* ── 4 Bucket cards ─────────────────────────────────────────── */}
              <div style={s.bucketGrid}>
                {Object.values(BUCKETS).map(bc => {
                  const leads = data.buckets[bc.key] || [];
                  const avg   = leads.length ? Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length) : 0;
                  const top   = leads.length ? leads[0].score : 0;
                  const isActive = activeBucket === bc.key;
                  return (
                    <div
                      key={bc.key}
                      onClick={() => { setActiveBucket(bc.key); setQueueMode(false); }}
                      style={{
                        ...s.bucketCard,
                        borderLeftColor: bc.color,
                        background: isActive ? bc.bg : '#fff',
                        cursor: 'pointer',
                        outline: isActive ? `1.5px solid ${bc.border}` : 'none',
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: bc.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                        {bc.tagline}
                      </div>
                      <div style={{ fontSize: 34, fontWeight: 800, color: leads.length ? '#111827' : '#D1D5DB', lineHeight: 1, marginBottom: 4 }}>
                        {leads.length}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{bc.label}</div>
                      {leads.length > 0 ? (
                        <div style={{ fontSize: 10, color: '#6B7280' }}>
                          Avg score {avg} · Top {top}
                          {bc.recoveryRate && <span style={{ marginLeft: 6, color: bc.dimColor, fontWeight: 600 }}>{bc.recoveryRate} recovery rate</span>}
                        </div>
                      ) : (
                        <div style={{ fontSize: 10, color: '#9CA3AF' }}>None right now</div>
                      )}
                      {leads.length > 0 && (
                        <button
                          onClick={e => { e.stopPropagation(); startQueue(bc.key); }}
                          style={{ ...s.bucketStartBtn, borderColor: bc.border, color: bc.dimColor }}
                        >
                          Start Queue →
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Bucket tabs + controls ──────────────────────────────────── */}
              {!queueMode && (
                <div style={s.tabRow}>
                  <div style={s.tabs}>
                    {[['all', 'All', totalCount], ...Object.values(BUCKETS).map(b => [b.key, b.label, (data.buckets[b.key] || []).length])].map(([key, label, count]) => (
                      <button
                        key={key}
                        onClick={() => setActiveBucket(key)}
                        style={{
                          ...s.tab,
                          ...(activeBucket === key ? s.tabActive : {}),
                        }}
                      >
                        {label} <span style={{ fontSize: 11, opacity: 0.7 }}>({count})</span>
                      </button>
                    ))}
                  </div>
                  {visibleLeads.length > 0 && (
                    <button style={s.startProspectingBtn} onClick={() => startQueue(activeBucket)}>
                      ▶ Start Prospecting
                    </button>
                  )}
                </div>
              )}

              {/* ── Queue mode ──────────────────────────────────────────────── */}
              {queueMode && !queueDone && currentLead && (
                <QueueCard
                  lead={currentLead}
                  index={queueIndex}
                  total={queueLeads.length}
                  bucketConfig={BUCKETS[currentLead.bucket]}
                  onDisposition={disp => onDisposition(currentLead.id, disp)}
                  onSkip={() => onSkip(currentLead.id)}
                  onBack={() => setQueueMode(false)}
                />
              )}

              {queueMode && queueDone && (
                <div style={s.queueDoneCard}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Queue complete</div>
                  <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
                    You worked through {queueLeads.length} lead{queueLeads.length !== 1 ? 's' : ''} in this session.
                  </div>
                  <button style={s.startProspectingBtn} onClick={() => { setQueueMode(false); setQueueIndex(0); }}>
                    ← Back to list
                  </button>
                </div>
              )}

              {/* ── Lead table (list mode) ──────────────────────────────────── */}
              {!queueMode && (
                <div style={s.tableWrap}>
                  {visibleLeads.length === 0 ? (
                    <div style={s.empty}>
                      {activeBucket === 'all'
                        ? 'No active leads to show.'
                        : `No leads in the ${BUCKETS[activeBucket]?.label || activeBucket} bucket right now.`}
                    </div>
                  ) : (
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.th}>Score</th>
                          <th style={s.th}>Lead</th>
                          <th style={s.th}>Location</th>
                          <th style={s.th}>Investment</th>
                          <th style={s.th}>Age</th>
                          <th style={s.th}>Signals</th>
                          <th style={s.th}>Bucket</th>
                          <th style={{ ...s.th, textAlign: 'right' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleLeads.map((lead, i) => {
                          const sc = scoreColor(lead.score);
                          const bc = BUCKETS[lead.bucket];
                          return (
                            <tr
                              key={lead.id}
                              style={{ background: i % 2 ? '#fff' : '#F9FAFB', cursor: 'pointer' }}
                              onClick={() => { setQueueIndex(i); setQueueMode(true); }}
                            >
                              <td style={s.td}>
                                <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 20, fontSize: 12, fontWeight: 800, color: sc.color, background: sc.bg, minWidth: 36, textAlign: 'center' }}>
                                  {lead.score}
                                </span>
                              </td>
                              <td style={s.td}>
                                <div style={{ fontWeight: 600, color: '#111827', fontSize: 13 }}>{lead.first_name} {lead.last_name}</div>
                                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{lead.email}</div>
                              </td>
                              <td style={{ ...s.td, color: '#4B5563', fontSize: 12 }}>{lead.location || '—'}</td>
                              <td style={{ ...s.td, fontSize: 12, color: '#374151' }}>
                                {lead.liquid_cap_raw
                                  ? <span style={{ fontWeight: 600, color: '#15803D' }}>{lead.liquid_cap_raw}</span>
                                  : lead.investment_level || '—'}
                              </td>
                              <td style={s.td}>
                                <span style={{ fontSize: 12, color: lead.ageDays <= 2 ? '#D97706' : '#6B7280', fontWeight: lead.ageDays <= 2 ? 700 : 400 }}>
                                  {ageBadge(lead.ageDays)}
                                </span>
                              </td>
                              <td style={s.td}>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {lead.recentEngaged && <SignalPill label="Active" color="#7C3AED" />}
                                  {lead.noShowRecent  && <SignalPill label="No-show" color="#2563EB" />}
                                  {lead.isHighDollar  && <SignalPill label="High $" color="#15803D" />}
                                  {lead.callAttempts > 0 && <SignalPill label={`${lead.callAttempts} calls`} color="#6B7280" />}
                                  {lead.callAttempts === 0 && <SignalPill label="No contact" color="#DC2626" />}
                                </div>
                              </td>
                              <td style={s.td}>
                                {bc && (
                                  <span style={{ fontSize: 11, fontWeight: 600, color: bc.color, background: bc.bg, border: `1px solid ${bc.border}`, borderRadius: 4, padding: '2px 7px' }}>
                                    {bc.label}
                                  </span>
                                )}
                              </td>
                              <td style={{ ...s.td, textAlign: 'right' }}>
                                <button
                                  style={s.callBtn}
                                  onClick={e => { e.stopPropagation(); setQueueIndex(i); setQueueMode(true); }}
                                >
                                  Open →
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}

// ─── Signal pill ──────────────────────────────────────────────────────────────

function SignalPill({ label, color }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color, background: color + '18', border: `1px solid ${color}44`, borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

// ─── Queue Card ───────────────────────────────────────────────────────────────

function QueueCard({ lead, index, total, bucketConfig, onDisposition, onSkip, onBack }) {
  const [copied,       setCopied]       = useState(false);
  const [ghlSignals,   setGhlSignals]   = useState(null);
  const [ghlLoading,   setGhlLoading]   = useState(false);
  const [noteText,     setNoteText]     = useState('');
  const [showNote,     setShowNote]     = useState(false);
  const [pendingDisp,  setPendingDisp]  = useState(null);
  const loadedRef = useRef(null);

  // Fetch GHL signals lazily when this lead is shown
  useEffect(() => {
    if (loadedRef.current === lead.id) return;
    loadedRef.current = lead.id;
    setCopied(false);
    setGhlSignals(null);
    setNoteText('');
    setShowNote(false);
    setPendingDisp(null);

    if (!lead.ghl_contact_id && !lead.email) return;
    setGhlLoading(true);
    const params = lead.ghl_contact_id
      ? `contactId=${lead.ghl_contact_id}`
      : `email=${encodeURIComponent(lead.email)}`;
    fetch(`/api/dashboard/prospect-ghl?${params}`)
      .then(r => r.json())
      .then(d => { setGhlSignals(d); setGhlLoading(false); })
      .catch(() => setGhlLoading(false));
  }, [lead.id, lead.ghl_contact_id, lead.email]);

  const sc = scoreColor(lead.score);
  const bc = bucketConfig;

  function handleDisposition(disp) {
    if (disp === 'follow_up' || disp === 'not_interested') {
      setPendingDisp(disp);
      setShowNote(true);
    } else {
      onDisposition(disp);
    }
  }

  function confirmDisposition() {
    onDisposition(pendingDisp);
    setShowNote(false);
  }

  const progressPct = Math.round(((index) / total) * 100);

  return (
    <div style={{ animation: 'fadeIn .25s ease' }}>
      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button style={s.backBtn} onClick={onBack}>← Back to list</button>
        <div style={{ flex: 1, height: 4, background: '#E5E7EB', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressPct}%`, background: bc?.color || '#374151', borderRadius: 2, transition: 'width .3s ease' }} />
        </div>
        <span style={{ fontSize: 12, color: '#6B7280', flexShrink: 0 }}>
          {index + 1} / {total}
        </span>
      </div>

      <div style={s.queueCard}>
        {/* Card header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            {bc && (
              <div style={{ fontSize: 10, fontWeight: 700, color: bc.color, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>
                {bc.label}
              </div>
            )}
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#111827', margin: 0, lineHeight: 1.1 }}>
              {lead.first_name} {lead.last_name}
            </h2>
            <div style={{ fontSize: 13, color: '#6B7280', marginTop: 5, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {lead.location && <span>{lead.location}</span>}
              <span>{lead.email}</span>
              <span style={{ color: lead.ageDays <= 2 ? '#D97706' : '#9CA3AF', fontWeight: lead.ageDays <= 2 ? 700 : 400 }}>
                {ageBadge(lead.ageDays)} old
              </span>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Score</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: sc.color, lineHeight: 1 }}>{lead.score}</div>
          </div>
        </div>

        {/* Phone number — the hero element */}
        <div style={s.phoneBlock}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Phone</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', letterSpacing: '0.01em' }}>
              {lead.phone || <span style={{ color: '#D1D5DB', fontSize: 16 }}>No phone on file</span>}
            </div>
          </div>
          {lead.phone && (
            <button
              onClick={() => copyToClipboard(lead.phone, setCopied)}
              style={{ ...s.copyBtn, background: copied ? '#DCFCE7' : '#F3F4F6', color: copied ? '#15803D' : '#374151', border: `1px solid ${copied ? '#86EFAC' : '#D1D5DB'}` }}
            >
              {copied ? '✓ Copied' : 'Copy number'}
            </button>
          )}
        </div>

        {/* Investment */}
        {(lead.liquid_cap_raw || lead.investment_level) && (
          <div style={{ marginBottom: 20, padding: '10px 14px', background: '#F9FAFB', borderRadius: 5, border: '1px solid #E5E7EB' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Investment &nbsp;</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#15803D' }}>
              {lead.liquid_cap_raw || lead.investment_level}
            </span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: ghlSignals?.signals?.length ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 20 }}>
          {/* Why this lead */}
          <div>
            <div style={s.sectionLabel}>Why this lead</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {lead.reasons.map((r, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, color: '#374151', lineHeight: 1.4 }}>
                  <span style={{ color: '#D1D5DB', flexShrink: 0 }}>·</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {/* GHL signals */}
          {(ghlLoading || (ghlSignals?.signals?.length > 0)) && (
            <div>
              <div style={s.sectionLabel}>Live GHL signals</div>
              {ghlLoading ? (
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>Loading from CRM…</div>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ghlSignals.signals.map((sig, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12, color: '#374151', lineHeight: 1.4 }}>
                      <span style={{ color: '#7C3AED', flexShrink: 0 }}>·</span>
                      <span>
                        {sig.label}
                        {sig.date && <span style={{ color: '#9CA3AF', marginLeft: 6 }}>{fmtDate(sig.date)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Recommended action */}
        <div style={s.recommendBox}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
            Recommended action
          </div>
          <div style={{ fontSize: 13, color: '#111827', lineHeight: 1.5, fontStyle: 'italic' }}>
            "{lead.recommendedAction}"
          </div>
        </div>

        <div style={{ borderTop: '1px solid #F3F4F6', marginBottom: 16 }} />

        {/* Note input */}
        {showNote && (
          <div style={{ marginBottom: 14 }}>
            <div style={s.sectionLabel}>Add a note (optional)</div>
            <textarea
              style={{ width: '100%', border: '1px solid #D1D5DB', borderRadius: 4, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', minHeight: 60, outline: 'none', color: '#111827' }}
              placeholder="What happened on the call?"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={{ ...s.dispBtn, background: '#111827', color: '#fff', border: 'none' }} onClick={confirmDisposition}>
                Confirm & Next →
              </button>
              <button style={{ ...s.dispBtn, background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB' }} onClick={() => setShowNote(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Disposition buttons */}
        {!showNote && (
          <>
            <div style={s.sectionLabel}>Disposition</div>
            <div style={s.dispRow}>
              <button style={{ ...s.dispBtn, ...s.dispNeutral }} onClick={() => handleDisposition('no_answer')}>No Answer</button>
              <button style={{ ...s.dispBtn, ...s.dispNeutral }} onClick={() => handleDisposition('left_vm')}>Left Voicemail</button>
              <button style={{ ...s.dispBtn, background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', fontWeight: 700 }} onClick={() => handleDisposition('booked')}>✓ Booked!</button>
              <button style={{ ...s.dispBtn, ...s.dispNeutral }} onClick={() => handleDisposition('follow_up')}>↪ Follow Up</button>
              <button style={{ ...s.dispBtn, background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FECACA' }} onClick={() => handleDisposition('not_interested')}>Not Interested</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button style={{ ...s.dispBtn, background: 'transparent', color: '#9CA3AF', border: '1px solid #E5E7EB', fontSize: 12 }} onClick={onSkip}>
                Skip → Next lead
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page:        { minHeight: '100vh', background: '#F0F2F5', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },
  header:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 50, background: '#151719', position: 'sticky', top: 0, zIndex: 10 },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 28 },
  logo:        { fontWeight: 600, fontSize: 15, color: '#FFFFFF', flexShrink: 0 },
  nav:         { display: 'flex', gap: 2 },
  navLink:     { fontSize: 13, color: '#9FA6B2', textDecoration: 'none', padding: '7px 14px', borderRadius: 3 },
  navActive:   { color: '#FFFFFF', background: 'rgba(255,255,255,.13)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  headerUser:  { fontSize: 13, color: '#9FA6B2' },
  signOutBtn:  { fontSize: 12, color: '#9FA6B2', background: 'transparent', border: '1px solid rgba(255,255,255,.18)', borderRadius: 3, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },

  main:        { maxWidth: 1200, margin: '0 auto', padding: '20px 20px 60px' },
  loadingWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 16 },
  spinner:     { width: 28, height: 28, borderRadius: '50%', border: '2px solid #E5E7EB', borderTopColor: '#374151', animation: 'spin 0.8s linear infinite' },
  loadingText: { color: '#6B7280', fontSize: 13 },
  empty:       { textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 13 },

  pageTitleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  pageTitle:   { fontSize: 22, fontWeight: 800, color: '#111827', margin: 0, marginBottom: 3 },
  pageSubtitle:{ fontSize: 13, color: '#6B7280', margin: 0 },
  refreshBtn:  { fontSize: 12, color: '#6B7280', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' },

  bucketGrid:  { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 },
  bucketCard:  { background: '#fff', border: '1px solid #E8EAED', borderLeft: '4px solid #E8EAED', borderRadius: 6, padding: '16px 16px 12px', transition: 'box-shadow .15s' },
  bucketStartBtn: { marginTop: 12, width: '100%', padding: '6px 0', background: 'transparent', border: '1px solid', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.03em' },

  tabRow:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 },
  tabs:        { display: 'flex', gap: 2, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 5, padding: 3, flexWrap: 'wrap' },
  tab:         { padding: '5px 12px', fontSize: 12, fontWeight: 500, color: '#6B7280', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .1s' },
  tabActive:   { background: '#111827', color: '#fff', fontWeight: 700 },
  startProspectingBtn: { padding: '9px 20px', background: '#111827', color: '#fff', border: 'none', borderRadius: 5, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },

  tableWrap:   { background: '#fff', border: '1px solid #E8EAED', borderRadius: 6, overflow: 'hidden' },
  table:       { width: '100%', borderCollapse: 'collapse' },
  th:          { fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 12px', background: '#F9FAFB', borderBottom: '1px solid #E8EAED', textAlign: 'left' },
  td:          { fontSize: 13, color: '#111827', padding: '10px 12px', borderBottom: '1px solid #F3F4F6', verticalAlign: 'middle' },
  callBtn:     { padding: '5px 12px', background: 'transparent', border: '1px solid #E5E7EB', borderRadius: 4, fontSize: 12, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 },

  // Queue
  backBtn:     { padding: '5px 12px', background: 'transparent', border: '1px solid #E5E7EB', borderRadius: 4, fontSize: 12, color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
  queueCard:   { background: '#fff', border: '1px solid #E8EAED', borderRadius: 8, padding: '28px 30px', boxShadow: '0 1px 4px rgba(0,0,0,.06)' },
  queueDoneCard: { background: '#fff', border: '1px solid #E8EAED', borderRadius: 8, padding: 48, textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.06)' },

  phoneBlock:  { display: 'flex', alignItems: 'center', gap: 16, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, padding: '14px 18px', marginBottom: 16 },
  copyBtn:     { padding: '8px 16px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', flexShrink: 0 },

  sectionLabel: { fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 },
  recommendBox: { background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 5, padding: '12px 16px', marginBottom: 20 },

  dispRow:     { display: 'flex', gap: 8, flexWrap: 'wrap' },
  dispBtn:     { padding: '8px 16px', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', transition: 'opacity .1s' },
  dispNeutral: { background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB' },
};
