import { useState, useEffect } from 'react';
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

export default function AnalyticsDashboard() {
  const { data: session } = useSession();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const showRate  = data && data.funnel.booked > 0
    ? Math.round((data.funnel.showed / data.funnel.booked) * 100)
    : 0;
  const closeRate = data && data.funnel.showed > 0
    ? Math.round((data.funnel.closed / data.funnel.showed) * 100)
    : 0;

  return (
    <>
      <Head><title>Intelligence Dashboard — FranchiseBook</title></Head>
      <div style={s.page}>

        {/* ── Header ── */}
        <header style={s.header}>
          <div style={s.headerLeft}>
            <span style={s.logo}>⬡ FranchiseBook</span>
            <nav style={s.nav}>
              <Link href="/dashboard/bookings"  style={s.navLink}>Bookings</Link>
              <Link href="/dashboard/leads"     style={s.navLink}>Leads</Link>
              <Link href="/dashboard/analytics" style={{ ...s.navLink, ...s.navActive }}>Analytics</Link>
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

        <main style={s.main}>
          {loading ? (
            <div style={s.loading}>
              <div style={s.loadingSpinner} />
              <div style={s.loadingText}>Loading intelligence…</div>
            </div>
          ) : !data ? (
            <div style={s.empty}>Could not load analytics.</div>
          ) : (
            <>
              {/* ── Hero KPI Row ── */}
              <div style={s.kpiRow}>
                <KpiCard
                  label="Total Booked"
                  value={data.funnel.booked}
                  sub={`${data.funnel.leads} leads in funnel`}
                  accent="#1D4ED8"
                  icon="📅"
                />
                <KpiCard
                  label="Show Rate"
                  value={`${showRate}%`}
                  sub={`${data.funnel.showed} of ${data.funnel.booked} showed`}
                  accent="#16A34A"
                  icon="✅"
                  warning={showRate > 0 && showRate < 50}
                />
                <KpiCard
                  label="Close Rate"
                  value={`${closeRate}%`}
                  sub={`${data.funnel.closed} contracts out`}
                  accent="#7C3AED"
                  icon="🤝"
                />
                <KpiCard
                  label="Avg Lead Score"
                  value={data.avgLeadScore != null ? data.avgLeadScore : '—'}
                  sub="Quality signal (0–100)"
                  accent="#F59E0B"
                  icon="⭐"
                />
              </div>

              {/* ── Lead Quality ── */}
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <span style={s.cardTitle}>Lead Quality Distribution</span>
                  <span style={s.cardSub}>Based on investment level, urgency &amp; contact completeness</span>
                </div>
                <QualityBar data={data} />
                <div style={s.bucketRow}>
                  <Bucket emoji="🟢" label="High Quality" count={data.healthDist.green}  color="#16A34A" bg="#DCFCE7" />
                  <Bucket emoji="🟡" label="Medium"       count={data.healthDist.yellow} color="#B45309" bg="#FEF3C7" />
                  <Bucket emoji="🔴" label="Low Quality"  count={data.healthDist.red}    color="#DC2626" bg="#FEE2E2" />
                </div>
              </div>

              {/* ── Pipeline Funnel ── */}
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <span style={s.cardTitle}>Pipeline Funnel</span>
                </div>
                <FunnelViz funnel={data.funnel} />
              </div>

              {/* ── Two-column row: Best Days + Best Times ── */}
              <div style={s.twoCol}>
                <div style={{ ...s.card, marginBottom: 0 }}>
                  <div style={s.cardHeader}>
                    <span style={s.cardTitle}>Bookings by Day</span>
                  </div>
                  <HeatBars
                    items={['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => ({
                      label: day,
                      value: (data.bestDays.find(d => d.day === day) || {}).bookings || 0,
                    }))}
                    max={Math.max(...data.bestDays.map(d => d.bookings), 1)}
                    color="#1D4ED8"
                  />
                </div>
                <div style={{ ...s.card, marginBottom: 0 }}>
                  <div style={s.cardHeader}>
                    <span style={s.cardTitle}>Bookings by Hour</span>
                  </div>
                  {data.bestHours.length > 0 ? (
                    <HeatBars
                      items={data.bestHours.slice(0, 7)}
                      max={Math.max(...data.bestHours.map(h => h.bookings), 1)}
                      color="#7C3AED"
                      labelKey="label"
                    />
                  ) : (
                    <div style={s.empty}>No hour data yet</div>
                  )}
                </div>
              </div>

              {/* ── Rep Performance ── */}
              {data.repStats.length > 0 && (
                <div style={s.card}>
                  <div style={s.cardHeader}>
                    <span style={s.cardTitle}>Rep Performance</span>
                  </div>
                  <div style={s.repGrid}>
                    {data.repStats.map(rep => {
                      const rate = rep.booked > 0 ? Math.round((rep.showed / rep.booked) * 100) : 0;
                      return (
                        <RepStat key={rep.email} rep={rep} rate={rate} />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Bottom row: Booking Speed + Recommendation + Calendar ── */}
              <div style={s.threeCol}>
                <div style={{ ...s.card, marginBottom: 0 }}>
                  <div style={s.cardHeader}>
                    <span style={s.cardTitle}>Booking Speed</span>
                  </div>
                  <div style={s.bigStat}>
                    {data.avgTimeToBook != null ? data.avgTimeToBook : '—'}
                    {data.avgTimeToBook != null && <span style={s.bigStatUnit}>min</span>}
                  </div>
                  <div style={s.bigStatSub}>avg time from page view to booking</div>
                  <div style={s.dimStat}>{data.totalEvents.toLocaleString()} events tracked</div>
                </div>

                <div style={{ ...s.card, marginBottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ ...s.cardHeader, alignSelf: 'stretch' }}>
                    <span style={s.cardTitle}>Rec. Acceptance</span>
                  </div>
                  <RecRing rate={data.recommendation.acceptance_rate} />
                  <div style={s.ringStats}>
                    <span style={s.ringStatItem}><b>{data.recommendation.accepted}</b> accepted</span>
                    <span style={s.ringStatItem}><b>{data.recommendation.rejected}</b> skipped</span>
                  </div>
                </div>

                <div style={{ ...s.card, marginBottom: 0 }}>
                  <div style={s.cardHeader}>
                    <span style={s.cardTitle}>Calendar Adds</span>
                  </div>
                  <div style={s.calRow}>
                    <CalChip icon="📅" label="Google" value={data.calendarAdds.google} />
                    <CalChip icon="🍎" label="Apple"  value={data.calendarAdds.apple} />
                    <CalChip icon="📧" label="Outlook" value={data.calendarAdds.outlook} />
                  </div>
                  <div style={s.calTotal}>
                    <span style={s.calTotalNum}>{data.calendarAdds.total}</span>
                    <span style={s.calTotalLabel}> total add-to-calendar clicks</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent, icon, warning }) {
  return (
    <div style={{ ...s.kpiCard, borderLeft: `4px solid ${accent}` }}>
      <div style={s.kpiTop}>
        <span style={s.kpiIcon}>{icon}</span>
        {warning && <span style={s.kpiWarning}>⚠</span>}
      </div>
      <div style={{ ...s.kpiValue, color: accent }}>{value}</div>
      <div style={s.kpiLabel}>{label}</div>
      <div style={s.kpiSub}>{sub}</div>
    </div>
  );
}

function QualityBar({ data }) {
  const total = (data.healthDist.green + data.healthDist.yellow + data.healthDist.red) || 1;
  const gPct  = Math.round((data.healthDist.green  / total) * 100);
  const yPct  = Math.round((data.healthDist.yellow / total) * 100);
  const rPct  = 100 - gPct - yPct;
  return (
    <div style={s.qualityBar}>
      <div style={{ ...s.qualitySegment, width: `${gPct}%`,  background: '#16A34A' }} title={`High: ${gPct}%`} />
      <div style={{ ...s.qualitySegment, width: `${yPct}%`,  background: '#F59E0B' }} title={`Medium: ${yPct}%`} />
      <div style={{ ...s.qualitySegment, width: `${rPct}%`,  background: '#DC2626' }} title={`Low: ${rPct}%`} />
    </div>
  );
}

function Bucket({ emoji, label, count, color, bg }) {
  return (
    <div style={{ ...s.bucket, background: bg, border: `1px solid ${color}22` }}>
      <div style={s.bucketEmoji}>{emoji}</div>
      <div style={{ ...s.bucketCount, color }}>{count}</div>
      <div style={s.bucketLabel}>{label}</div>
    </div>
  );
}

function FunnelViz({ funnel }) {
  const steps = [
    { label: 'Leads',      value: funnel.leads,      color: '#6B7280' },
    { label: 'Page Views', value: funnel.page_views, color: '#3B82F6' },
    { label: 'Booked',     value: funnel.booked,     color: '#1D4ED8' },
    { label: 'Showed',     value: funnel.showed,     color: '#16A34A' },
    { label: 'Closed',     value: funnel.closed,     color: '#7C3AED' },
  ];
  const topVal = Math.max(...steps.map(s => s.value), 1);
  return (
    <div style={s.funnel}>
      {steps.map((step, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const pct  = prev && prev > 0 ? Math.round((step.value / prev) * 100) : null;
        const w    = Math.max(Math.round((step.value / topVal) * 100), 4);
        return (
          <div key={step.label} style={s.funnelStep}>
            <div style={s.funnelMeta}>
              <span style={s.funnelLabel}>{step.label}</span>
              {pct != null && <span style={s.funnelConv}>{pct}% conv.</span>}
            </div>
            <div style={s.funnelTrack}>
              <div style={{ ...s.funnelBar, width: `${w}%`, background: step.color }} />
              <span style={s.funnelNum}>{step.value.toLocaleString()}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HeatBars({ items, max, color, labelKey = 'label' }) {
  return (
    <div style={s.heatBars}>
      {items.map(item => {
        const pct = max > 0 ? Math.round((item.value / max) * 100) : 0;
        const opacity = 0.12 + (pct / 100) * 0.88;
        return (
          <div key={item[labelKey] || item.label} style={s.heatRow}>
            <div style={s.heatLabel}>{item[labelKey] || item.label}</div>
            <div style={s.heatTrack}>
              <div style={{
                ...s.heatFill,
                width: `${Math.max(pct, 2)}%`,
                background: color,
                opacity,
              }} />
            </div>
            <div style={s.heatVal}>{item.value}</div>
          </div>
        );
      })}
    </div>
  );
}

function RepStat({ rep, rate }) {
  const rateColor = rate >= 70 ? '#16A34A' : rate >= 50 ? '#B45309' : '#DC2626';
  const rateBg    = rate >= 70 ? '#DCFCE7' : rate >= 50 ? '#FEF3C7' : '#FEE2E2';
  const shortName = rep.email.split('@')[0];
  return (
    <div style={s.repCard}>
      <div style={s.repAvatar}>{shortName[0].toUpperCase()}</div>
      <div style={s.repInfo}>
        <div style={s.repName}>{shortName}</div>
        <div style={s.repEmail}>{rep.email}</div>
      </div>
      <div style={s.repStats}>
        <span style={s.repStat}>{rep.booked} booked</span>
        <span style={s.repStat}>{rep.showed} showed</span>
        <span style={{ ...s.repRate, color: rateColor, background: rateBg }}>
          {rep.booked > 0 ? `${rate}%` : '—'}
        </span>
      </div>
    </div>
  );
}

function RecRing({ rate }) {
  const r  = 42;
  const cx = 56;
  const cy = 56;
  const circ = 2 * Math.PI * r;
  const dash = (rate / 100) * circ;
  return (
    <svg width={112} height={112} style={{ margin: '8px 0 4px' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EAECEF" strokeWidth={10} />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={rate >= 60 ? '#16A34A' : rate >= 35 ? '#F59E0B' : '#DC2626'}
        strokeWidth={10}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="#1A2B3C">{rate}%</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill="#6B7280">accepted</text>
    </svg>
  );
}

function CalChip({ icon, label, value }) {
  return (
    <div style={s.calChip}>
      <span style={s.calChipIcon}>{icon}</span>
      <span style={s.calChipLabel}>{label}</span>
      <span style={s.calChipVal}>{value}</span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page:      { minHeight: '100vh', background: '#F0F2F5', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },

  // Header
  header:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 50, background: '#33485E', position: 'sticky', top: 0, zIndex: 10 },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 28 },
  logo:        { fontWeight: 600, fontSize: 15, color: '#FFFFFF', letterSpacing: '-0.2px', flexShrink: 0 },
  nav:         { display: 'flex', gap: 2 },
  navLink:     { fontSize: 13, color: '#A8BED0', textDecoration: 'none', padding: '7px 14px', borderRadius: 3, fontWeight: 400 },
  navActive:   { color: '#FFFFFF', background: 'rgba(255,255,255,.13)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  headerUser:  { fontSize: 13, color: '#A8BED0' },
  signOutBtn:  { fontSize: 12, fontWeight: 400, color: '#A8BED0', background: 'transparent', border: '1px solid rgba(255,255,255,.18)', borderRadius: 3, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },

  main:      { maxWidth: 1100, margin: '0 auto', padding: '24px 20px 40px' },
  empty:     { textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 13 },

  // Loading
  loading:        { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 16 },
  loadingSpinner: { width: 32, height: 32, borderRadius: '50%', border: '3px solid #D8DCE0', borderTopColor: '#1D4ED8', animation: 'spin 0.8s linear infinite' },
  loadingText:    { color: '#6B7280', fontSize: 14 },

  // Cards
  card:      { background: '#fff', borderRadius: 6, border: '1px solid #E0E3E7', padding: '18px 20px', marginBottom: 14 },
  cardHeader:{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 },
  cardTitle: { fontSize: 13, fontWeight: 600, color: '#1A2B3C', letterSpacing: '-.1px' },
  cardSub:   { fontSize: 12, color: '#9CA3AF' },

  // KPI row
  kpiRow:      { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 },
  kpiCard:     { background: '#fff', borderRadius: 6, border: '1px solid #E0E3E7', padding: '16px 18px', position: 'relative' },
  kpiTop:      { display: 'flex', justifyContent: 'space-between', marginBottom: 8 },
  kpiIcon:     { fontSize: 18 },
  kpiWarning:  { fontSize: 14, color: '#F59E0B' },
  kpiValue:    { fontSize: 30, fontWeight: 700, lineHeight: 1, marginBottom: 4 },
  kpiLabel:    { fontSize: 12, fontWeight: 600, color: '#4B5563', marginBottom: 2 },
  kpiSub:      { fontSize: 11, color: '#9CA3AF' },

  // Quality bar
  qualityBar:     { display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 14, background: '#EAECEF' },
  qualitySegment: { height: '100%', transition: 'width .5s ease' },
  bucketRow:      { display: 'flex', gap: 12 },
  bucket:         { flex: 1, borderRadius: 6, padding: '12px 14px', textAlign: 'center' },
  bucketEmoji:    { fontSize: 18, marginBottom: 4 },
  bucketCount:    { fontSize: 22, fontWeight: 700, lineHeight: 1 },
  bucketLabel:    { fontSize: 11, color: '#6B7280', marginTop: 2 },

  // Funnel
  funnel:       { display: 'flex', flexDirection: 'column', gap: 10 },
  funnelStep:   { display: 'flex', flexDirection: 'column', gap: 4 },
  funnelMeta:   { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  funnelLabel:  { fontSize: 12, fontWeight: 500, color: '#4B5563' },
  funnelConv:   { fontSize: 11, color: '#9CA3AF' },
  funnelTrack:  { display: 'flex', alignItems: 'center', gap: 10 },
  funnelBar:    { height: 22, borderRadius: 3, transition: 'width .5s ease', minWidth: 4 },
  funnelNum:    { fontSize: 13, fontWeight: 600, color: '#1A2B3C', flexShrink: 0 },

  // Two-column grid
  twoCol:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 },

  // Heat bars
  heatBars:  { display: 'flex', flexDirection: 'column', gap: 8 },
  heatRow:   { display: 'flex', alignItems: 'center', gap: 10 },
  heatLabel: { width: 36, fontSize: 12, color: '#4B5563', flexShrink: 0, textAlign: 'right' },
  heatTrack: { flex: 1, height: 20, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  heatFill:  { height: '100%', borderRadius: 3, transition: 'width .5s ease' },
  heatVal:   { width: 24, fontSize: 12, color: '#6B7280', textAlign: 'right', flexShrink: 0 },

  // Rep grid
  repGrid:  { display: 'flex', flexDirection: 'column', gap: 10 },
  repCard:  { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#F9FAFB', borderRadius: 6, border: '1px solid #E0E3E7' },
  repAvatar:{ width: 34, height: 34, borderRadius: '50%', background: '#33485E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 },
  repInfo:  { flex: 1, minWidth: 0 },
  repName:  { fontSize: 13, fontWeight: 600, color: '#1A2B3C' },
  repEmail: { fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  repStats: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  repStat:  { fontSize: 12, color: '#6B7280' },
  repRate:  { fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 12 },

  // Three-column bottom row
  threeCol:  { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 },

  // Booking speed
  bigStat:     { fontSize: 42, fontWeight: 700, color: '#1A2B3C', lineHeight: 1, marginBottom: 4 },
  bigStatUnit: { fontSize: 20, fontWeight: 400, color: '#6B7280', marginLeft: 4 },
  bigStatSub:  { fontSize: 12, color: '#9CA3AF' },
  dimStat:     { fontSize: 11, color: '#C4C9CF', marginTop: 10 },

  // Ring
  ringStats:    { display: 'flex', gap: 16, justifyContent: 'center' },
  ringStatItem: { fontSize: 12, color: '#6B7280' },

  // Calendar chips
  calRow:       { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 },
  calChip:      { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#F9FAFB', borderRadius: 5, border: '1px solid #E0E3E7' },
  calChipIcon:  { fontSize: 16 },
  calChipLabel: { flex: 1, fontSize: 13, color: '#4B5563' },
  calChipVal:   { fontSize: 15, fontWeight: 600, color: '#1A2B3C' },
  calTotal:     { fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
  calTotalNum:  { fontWeight: 700, color: '#1A2B3C', fontSize: 15 },
  calTotalLabel:{ fontSize: 12, color: '#9CA3AF' },
};
