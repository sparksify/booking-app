import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import Head from 'next/head';
import Link from 'next/link';
import { authOptions } from '../api/auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';
import { guardDashboardPage } from '@/lib/pageAccess';
import { visibleNav } from '@/lib/nav';

// ─── Server-side auth + settings ─────────────────────────────────────────────

export async function getServerSideProps(context) {
  const gate = await guardDashboardPage(context, '/dashboard/analytics');
  if (gate.redirect) return gate;
  const { session, perms } = gate;

  const supabase = getSupabaseAdmin();
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('show_revenue, show_franchise_metrics')
    .eq('id', 1)
    .single();

  return {
    props: {
      session,
      perms,
      showRevenueProp:   settingsRow?.show_revenue           ?? false,
      showFranchiseProp: settingsRow?.show_franchise_metrics ?? false,
    },
  };
}

// ─── Currency / time helpers ──────────────────────────────────────────────────

function fmtCurrency(n) {
  if (!n) return '$0';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `$${(n / 1000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}
function fmtMins(m) {
  if (m == null) return '—';
  if (m < 60)    return `${m}m`;
  if (m < 1440)  return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

// ─── Sidebar icon set ─────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsDashboard({ showRevenueProp, showFranchiseProp, perms = {} }) {
  const { data: session } = useSession();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [period,  setPeriod]  = useState(30);

  function loadData(days) {
    setLoading(true);
    setData(null);
    fetch(`/api/analytics?days=${days}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  function changePeriod(days) {
    setPeriod(days);
    loadData(days);
  }

  useEffect(() => { loadData(30); }, []);

  return (
    <>
      <Head><title>Analytics — KANSO</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
      <div style={s.page}>

        <aside style={s.sidebar}>
          <div style={s.sideLogoWrap}>
            <div style={s.sideLogoRow}>
              <div style={s.sideLogoIcon}>K</div>
              <span style={s.sideLogoText}>KANSO</span>
            </div>
          </div>
          <nav style={s.sideNav}>
            {visibleNav(perms).map(({ href, label, icon }) => {
              const active = href === '/dashboard/analytics';
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

        <div style={s.mainCol}>
          <div style={s.topBar}>
            <div>
              <div style={s.topTitle}>Analytics</div>
              <div style={s.topDate}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            </div>
            <div style={s.topActions}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[7, 30, 90].map(d => (
                  <button key={d} onClick={() => changePeriod(d)} style={{
                    padding: '6px 16px', fontSize: 13, fontWeight: 600,
                    color: period === d ? '#fff' : '#475569',
                    background: period === d ? '#0057FF' : 'transparent',
                    border: `1px solid ${period === d ? '#0057FF' : '#E2E8F0'}`,
                    borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          <main style={s.main}>
            {loading ? (
              <div style={s.loadingWrap}>
                <div style={s.spinner} />
                <div style={s.loadingText}>Loading analytics…</div>
              </div>
            ) : !data ? (
              <div style={s.empty}>Could not load analytics.</div>
            ) : (
              <Dashboard
                data={data}
                showRevenue={showRevenueProp && data.revenue.per_close > 0}
                showFranchise={showFranchiseProp}
              />
            )}
          </main>
        </div>
      </div>
    </>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ data, showRevenue, showFranchise }) {
  return (
    <>
      {/* §1 Executive Summary */}
      <SecTitle icon="chart" color="#0057FF" bg="#EFF6FF">Executive Summary</SecTitle>
      <div style={s.kpi4}>
        <KpiCard label="Total Leads"  value={data.funnel.leads.toLocaleString()} sub="in funnel" />
        <KpiCard label="Booking Rate" value={`${data.bookingRate}%`}  sub={`${data.funnel.booked} booked`}  warn={data.bookingRate > 0 && data.bookingRate < 20} trend={data.bookingRate >= 20 ? 'up' : undefined} />
        <KpiCard label="Show Rate"    value={`${data.showRate}%`}     sub={`${data.funnel.showed} of ${data.funnel.booked} booked`} warn={data.showRate > 0 && data.showRate < 60} />
        <KpiCard label="Close Rate"   value={`${data.closeRate}%`}    sub={`${data.funnel.closed} closed`} />
      </div>
      {showRevenue && (
        <div style={s.kpi4}>
          <KpiCard label="Revenue Generated" value={fmtCurrency(data.revenue.generated)} sub={`${data.funnel.closed} closes × ${fmtCurrency(data.revenue.per_close)}`} />
          <KpiCard label="Revenue / Appt"    value={fmtCurrency(data.revenue.per_appt)}  sub="revenue ÷ bookings" />
          <KpiCard label="Revenue / Lead"    value={fmtCurrency(data.revenue.per_lead)}  sub="revenue ÷ total leads" />
          <KpiCard label="Est. Revenue Lost" value={fmtCurrency(data.revenue.lost)}      sub={`${data.funnel.leads - data.funnel.booked} lost leads × rev/lead`} warn />
        </div>
      )}

      {/* §2 Franchise & CQ Metrics — immediately after exec summary */}
      {showFranchise && (
        <>
          <SecTitle icon="bar" color="#D97706" bg="#FFF7ED">Franchise &amp; CQ Metrics</SecTitle>
          <div style={s.kpi4}>
            <KpiCard label="CQ Sent"     value={data.cqMetrics.cq_sent.toLocaleString()}      sub={`of ${data.funnel.showed} showed`} />
            <KpiCard label="CQ Rate"     value={`${data.cqMetrics.cq_rate}%`}                 sub="% of shows → CQ sent" />
            <KpiCard label="CQ Received" value={data.cqMetrics.cq_received.toLocaleString()}  sub={`of ${data.cqMetrics.cq_sent} sent`} warn={data.cqMetrics.cq_sent > 0 && data.cqMetrics.cq_return_rate < 50} />
            <KpiCard label="Return Rate" value={`${data.cqMetrics.cq_return_rate}%`}          sub="CQ sent → CQ returned" />
          </div>

          <div style={s.twoCol}>
            <div style={s.card}>
              <CTitle>Best Slots for CQ Returns</CTitle>
              <CSub>Optimize booking times to maximize questionnaire completions</CSub>
              <CQSlotTable slots={data.cqSlotLeaderboard} />
            </div>
            <div style={s.card}>
              <CTitle>CQ by Consultant</CTitle>
              <CSub>Who's driving the most questionnaire returns?</CSub>
              <CQRepTable reps={data.cqByRep} />
            </div>
          </div>

          {/* CQ Pipeline — always show when franchise mode on */}
          <div style={s.twoCol}>
            <CQPipelineCard
              icon="send"
              iconBg="#EFF6FF"
              iconColor="#0057FF"
              title="CQ Sent — Awaiting Response"
              sub={`${data.cqPipeline.sent_not_received} questionnaires out, not yet returned`}
              amount={fmtCurrency(data.cqPipeline.pipeline_sent)}
              amountColor="#0057FF"
              decorIcon="clock"
            />
            <CQPipelineCard
              icon="download"
              iconBg="#FFF7ED"
              iconColor="#EA580C"
              title="CQ Received — Not Yet Closed"
              sub={`${data.cqPipeline.received_not_closed} questionnaires back, deals in progress`}
              amount={fmtCurrency(data.cqPipeline.pipeline_received)}
              amountColor="#EA580C"
              decorIcon="hourglass"
            />
          </div>
        </>
      )}

      {/* §3 Booking Engine + Slot Leaderboard */}
      <SecTitle icon="target" color="#16A34A" bg="#F0FDF4">Booking Engine &amp; Slot Leaderboard</SecTitle>
      <div style={s.twoCol}>
        <div style={s.card}>
          <CTitle>Recommendation Engine Performance</CTitle>
          <CSub>Does the smart slot picker improve outcomes?</CSub>
          <RecTable rec={data.recommendation} />
        </div>
        <div style={s.card}>
          <CTitle>Slot Leaderboard</CTitle>
          <CSub>Top booking times by volume — the engine's training data</CSub>
          <SlotTable slots={data.slotLeaderboard} hasRevenue={showRevenue} />
        </div>
      </div>

      {/* §4 Conversion Funnel */}
      <SecTitle icon="funnel" color="#7C3AED" bg="#F5F3FF">Conversion Funnel</SecTitle>
      <div style={s.card}>
        <FunnelViz funnel={data.funnel} />
      </div>

      {/* §5 Attribution */}
      <SecTitle icon="link" color="#0057FF" bg="#EFF6FF">Attribution</SecTitle>
      <div style={s.twoCol}>
        <div style={s.card}>
          <CTitle>Booking Source</CTitle>
          <CSub>What's actually driving appointments?</CSub>
          <AttrTable rows={data.attribution} />
        </div>
        <div style={s.card}>
          <CTitle>Lead Source</CTitle>
          <CSub>Where are the leads coming from?</CSub>
          <LeadSourceTable rows={data.leadSource} />
        </div>
      </div>

      {/* §6 Consultant Performance */}
      <SecTitle icon="users" color="#0057FF" bg="#EFF6FF">Consultant Performance</SecTitle>
      <div style={s.card}>
        <RepTable reps={data.repStats} hasRevenue={showRevenue} />
      </div>

      {/* §7 Velocity | §8 Appointment Window | §9 Calendar Add */}
      <SecTitle icon="chart" color="#0057FF" bg="#EFF6FF">Booking Velocity &nbsp;·&nbsp; Appointment Window &nbsp;·&nbsp; Calendar Add</SecTitle>
      <div style={s.threeCol}>
        <div style={s.card}>
          <CTitle>Booking Velocity</CTitle>
          <CSub>Page view → confirmed booking</CSub>
          <VelocityCard stats={data.velocityStats} buckets={data.velocityAnalysis} avgTimeToBook={data.avgTimeToBook} />
        </div>
        <div style={s.card}>
          <CTitle>Appointment Window</CTitle>
          <CSub>Days between booking and call — show rate impact</CSub>
          <DelayBars rows={data.delayAnalysis} />
        </div>
        <div style={s.card}>
          <CTitle>Calendar Add Analysis</CTitle>
          <CSub>Adding to calendar predicts attendance</CSub>
          <CalendarCard cal={data.calendarAdds} />
        </div>
      </div>

      {/* §10 Revenue Intelligence */}
      {showRevenue && (
        <>
          <SecTitle icon="bar" color="#16A34A" bg="#F0FDF4">Revenue Intelligence</SecTitle>
          <div style={s.twoCol}>
            <div style={s.card}>
              <CTitle>Revenue by Day</CTitle>
              <CSub>Which days generate the most revenue?</CSub>
              <RevBars items={data.revenueByDay} labelKey="day" />
            </div>
            <div style={s.card}>
              <CTitle>Revenue by Time</CTitle>
              <CSub>Which time slots generate the most revenue?</CSub>
              <RevBars items={data.revenueByHour} labelKey="label" />
            </div>
          </div>
        </>
      )}

      {/* §11 Lead Quality | §12 Opportunity Loss */}
      <SecTitle icon="star" color="#D97706" bg="#FFF7ED">Lead Quality &nbsp;·&nbsp; Opportunity Loss</SecTitle>
      <div style={s.twoCol}>
        <div style={s.card}>
          <CTitle>Lead Quality Distribution</CTitle>
          <CSub>Scored on investment level, urgency &amp; completeness</CSub>
          <QualitySection data={data} />
        </div>
        <div style={s.card}>
          <CTitle>Opportunity Loss</CTitle>
          <CSub>Revenue left on the table from unconverted leads</CSub>
          <OpportunityLoss funnel={data.funnel} revenue={data.revenue} hasRevenue={showRevenue} />
        </div>
      </div>
    </>
  );
}

// ─── Section chrome ───────────────────────────────────────────────────────────

// Section icon definitions
const SEC_ICONS = {
  chart:   (c) => <svg width="16" height="16" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  bar:     (c) => <svg width="16" height="16" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  target:  (c) => <svg width="16" height="16" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  funnel:  (c) => <svg width="16" height="16" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  link:    (c) => <svg width="16" height="16" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  users:   (c) => <svg width="16" height="16" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  star:    (c) => <svg width="16" height="16" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  loss:    (c) => <svg width="16" height="16" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
};

function SecTitle({ children, icon = 'chart', color = '#0057FF', bg = '#EFF6FF' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 28, marginBottom: 14 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {(SEC_ICONS[icon] || SEC_ICONS.chart)(color)}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{children}</div>
    </div>
  );
}
function CTitle({ children }) {
  return <div style={s.cardTitle}>{children}</div>;
}
function CSub({ children }) {
  return <div style={s.cardSub}>{children}</div>;
}

// ─── KPI icons ─────────────────────────────────────────────────────────────────

const KPI_META = {
  'Total Leads':       { bg: '#EFF6FF', color: '#0057FF',
    icon: (c,s) => <svg width={s} height={s} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  'Booking Rate':      { bg: '#F0FDF4', color: '#16A34A',
    icon: (c,s) => <svg width={s} height={s} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  'Show Rate':         { bg: '#F5F3FF', color: '#7C3AED',
    icon: (c,s) => <svg width={s} height={s} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  'Close Rate':        { bg: '#FFF7ED', color: '#EA580C',
    icon: (c,s) => <svg width={s} height={s} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> },
  'Revenue Generated': { bg: '#F0FDF4', color: '#16A34A',
    icon: (c,s) => <svg width={s} height={s} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
  'Revenue / Appt':    { bg: '#EFF6FF', color: '#0057FF',
    icon: (c,s) => <svg width={s} height={s} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
  'Revenue / Lead':    { bg: '#EFF6FF', color: '#0057FF',
    icon: (c,s) => <svg width={s} height={s} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
  'Est. Revenue Lost': { bg: '#FEF2F2', color: '#DC2626',
    icon: (c,s) => <svg width={s} height={s} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
  'CQ Sent':           { bg: '#EFF6FF', color: '#0057FF',
    icon: (c,s) => <svg width={s} height={s} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> },
  'CQ Rate':           { bg: '#FFF7ED', color: '#D97706',
    icon: (c,s) => <svg width={s} height={s} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
  'CQ Received':       { bg: '#FFF7ED', color: '#EA580C',
    icon: (c,s) => <svg width={s} height={s} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> },
  'Return Rate':       { bg: '#F0FDF4', color: '#16A34A',
    icon: (c,s) => <svg width={s} height={s} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> },
};
const KPI_DEFAULT = { bg: '#F1F5F9', color: '#64748B', icon: (c,s) => <svg width={s} height={s} fill="none" stroke={c} strokeWidth="1.8" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> };

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, warn, trend }) {
  const meta = KPI_META[label] || KPI_DEFAULT;
  const iconSize = 28;
  return (
    <div style={s.kpiCard}>
      {/* Colored circle icon */}
      <div style={{ width: 58, height: 58, borderRadius: '50%', background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {meta.icon(meta.color, iconSize)}
      </div>
      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={s.kpiLabel}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={s.kpiValue}>{value}</div>
          {trend === 'up' && (
            <svg width="16" height="16" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
            </svg>
          )}
          {trend === 'down' && (
            <svg width="16" height="16" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <line x1="7" y1="7" x2="17" y2="17"/><polyline points="17 7 17 17 7 17"/>
            </svg>
          )}
        </div>
        {sub  && <div style={s.kpiSub}>{sub}</div>}
        {warn && <div style={{ marginTop: 4, fontSize: 11, color: '#D97706', fontWeight: 600 }}>Below target</div>}
      </div>
    </div>
  );
}

// ─── Recommendation engine table ──────────────────────────────────────────────

function RecTable({ rec }) {
  const rows = [
    { label: 'Recommendations Shown', value: rec.shown.toLocaleString() },
    { label: 'Accepted',              value: rec.accepted.toLocaleString() },
    { label: 'Rejected / Skipped',    value: rec.rejected.toLocaleString() },
    { label: 'Acceptance Rate',       value: <RateBadge rate={rec.acceptance_rate} /> },
  ];
  return (
    <div style={{ marginTop: 14 }}>
      {rows.map(r => (
        <div key={r.label} style={s.metaRow}>
          <span style={s.metaLabel}>{r.label}</span>
          <span style={s.metaValue}>{r.value}</span>
        </div>
      ))}
      {(rec.show_rate_accepted != null || rec.show_rate_rejected != null) && (
        <div style={s.compareBox}>
          <CompareItem label="Show rate (accepted)" value={rec.show_rate_accepted} color="#16A34A" />
          <div style={{ width: 1, background: '#E5E7EB' }} />
          <CompareItem label="Show rate (rejected)" value={rec.show_rate_rejected} color="#DC2626" />
        </div>
      )}
    </div>
  );
}

function CompareItem({ label, value, color }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '12px 8px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 4 }}>
        {value != null ? `${value}%` : '—'}
      </div>
      <div style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.4 }}>{label}</div>
    </div>
  );
}

// ─── Slot Leaderboard ─────────────────────────────────────────────────────────

function SlotTable({ slots, hasRevenue }) {
  if (!slots || slots.length === 0) return <div style={s.empty}>No data yet</div>;
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Slot</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Booked</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Showed</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Closed</th>
          {hasRevenue && <th style={{ ...s.th, textAlign: 'right' }}>Revenue</th>}
          <th style={{ ...s.th, textAlign: 'right' }}>Show %</th>
        </tr>
      </thead>
      <tbody>
        {slots.map((sl, i) => (
          <tr key={sl.slot} style={{ background: i % 2 ? '#fff' : '#F9FAFB' }}>
            <td style={s.td}><strong>{sl.slot}</strong></td>
            <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{sl.booked}</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{sl.showed}</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{sl.closed}</td>
            {hasRevenue && <td style={{ ...s.td, textAlign: 'right', color: '#16A34A', fontWeight: 600 }}>{sl.revenue > 0 ? fmtCurrency(sl.revenue) : '—'}</td>}
            <td style={{ ...s.td, textAlign: 'right' }}>{sl.show_rate != null ? <RateBadge rate={sl.show_rate} small /> : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Funnel ───────────────────────────────────────────────────────────────────

function FunnelViz({ funnel }) {
  const steps = [
    { label: 'Leads',       value: funnel.leads,       color: '#6B7280' },
    { label: 'Page Viewed', value: funnel.page_viewed, color: '#0EA5E9' },
    { label: 'Booked',      value: funnel.booked,      color: '#1D4ED8' },
    { label: 'Showed',      value: funnel.showed,      color: '#16A34A' },
    { label: 'Closed',      value: funnel.closed,      color: '#7C3AED' },
  ];
  const top = Math.max(...steps.map(s => s.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {steps.map((step, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const pct  = prev && prev > 0 ? Math.round((step.value / prev) * 100) : null;
        const w    = Math.max(Math.round((step.value / top) * 100), 3);
        return (
          <div key={step.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{step.label}</span>
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                {pct != null ? `${pct}% of previous step` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 24, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${w}%`, background: step.color, borderRadius: 3, transition: 'width .6s ease' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', width: 56, textAlign: 'right', flexShrink: 0 }}>
                {step.value.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Attribution ──────────────────────────────────────────────────────────────

function AttrTable({ rows }) {
  if (!rows || rows.length === 0) return <div style={s.empty}>No data yet</div>;
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Source</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Booked</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Showed</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Closed</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Show %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.source} style={{ background: i % 2 ? '#fff' : '#F9FAFB' }}>
            <td style={s.td}>{r.label}</td>
            <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{r.booked}</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{r.showed}</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{r.closed}</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{r.show_rate != null ? <RateBadge rate={r.show_rate} small /> : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LeadSourceTable({ rows }) {
  if (!rows || rows.length === 0) return <div style={s.empty}>No data yet</div>;
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Source</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Leads</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Booked</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Showed</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Book %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const bookPct = r.leads > 0 ? Math.round((r.booked / r.leads) * 100) : null;
          return (
            <tr key={r.source} style={{ background: i % 2 ? '#fff' : '#F9FAFB' }}>
              <td style={s.td}>{r.label}</td>
              <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{r.leads.toLocaleString()}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{r.booked}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{r.showed}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{bookPct != null ? <RateBadge rate={bookPct} small /> : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Consultant Performance ───────────────────────────────────────────────────

function RepTable({ reps, hasRevenue }) {
  if (!reps || reps.length === 0) return <div style={s.empty}>No rep data yet</div>;
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Consultant</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Booked</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Showed</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Closed</th>
          {hasRevenue && <th style={{ ...s.th, textAlign: 'right' }}>Revenue</th>}
          <th style={{ ...s.th, textAlign: 'right' }}>Show %</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Close %</th>
        </tr>
      </thead>
      <tbody>
        {reps.map((rep, i) => {
          const showRate  = rep.booked  > 0 ? Math.round((rep.showed / rep.booked)  * 100) : null;
          const closeRate = rep.showed  > 0 ? Math.round((rep.closed / rep.showed)  * 100) : null;
          const shortName = rep.email.split('@')[0];
          return (
            <tr key={rep.email} style={{ background: i % 2 ? '#fff' : '#F9FAFB' }}>
              <td style={s.td}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={s.avatar}>{shortName[0].toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                      {shortName}{rep.top_performer && ' ★'}
                    </div>
                    <div style={{ fontSize: 10, color: '#9CA3AF' }}>{rep.email}</div>
                  </div>
                </div>
              </td>
              <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{rep.booked}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{rep.showed}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{rep.closed}</td>
              {hasRevenue && <td style={{ ...s.td, textAlign: 'right', color: '#16A34A', fontWeight: 600 }}>{rep.revenue > 0 ? fmtCurrency(rep.revenue) : '—'}</td>}
              <td style={{ ...s.td, textAlign: 'right' }}>{showRate  != null ? <RateBadge rate={showRate}  small /> : '—'}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{closeRate != null ? <RateBadge rate={closeRate} small thresholds={[20, 10]} /> : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Velocity / Delay / Calendar ──────────────────────────────────────────────

function VelocityCard({ stats, buckets, avgTimeToBook }) {
  return (
    <div style={{ marginTop: 12 }}>
      {stats ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[['Average', fmtMins(stats.avg)], ['Median', fmtMins(stats.median)], ['Fastest', fmtMins(stats.min)], ['Slowest', fmtMins(stats.max)]].map(([label, value]) => (
            <div key={label} style={s.velBox}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{value}</div>
              <div style={{ fontSize: 10, color: '#9CA3AF' }}>{label}</div>
            </div>
          ))}
        </div>
      ) : avgTimeToBook != null ? (
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#111827' }}>{fmtMins(avgTimeToBook)}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>avg time lead → booking</div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>Track page views to see velocity data</div>
      )}
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>Velocity → Show Rate</div>
      {buckets.map(b => <ShowRateBar key={b.label} label={b.label} showRate={b.show_rate} count={b.booked} />)}
    </div>
  );
}

function DelayBars({ rows }) {
  return (
    <div style={{ marginTop: 12 }}>
      {rows.map(r => <ShowRateBar key={r.label} label={r.label} showRate={r.show_rate} count={r.booked} />)}
    </div>
  );
}

function ShowRateBar({ label, showRate, count }) {
  const color = showRate == null ? '#D1D5DB' : showRate >= 80 ? '#16A34A' : showRate >= 60 ? '#F59E0B' : '#DC2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{ width: 64, fontSize: 11, color: '#4B5563', flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 13, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
        {showRate != null && <div style={{ height: '100%', width: `${showRate}%`, background: color, borderRadius: 3, transition: 'width .5s ease' }} />}
      </div>
      <div style={{ width: 34, fontSize: 11, fontWeight: 700, color: '#111827', textAlign: 'right', flexShrink: 0 }}>
        {showRate != null ? `${showRate}%` : '—'}
      </div>
      {count > 0 && <div style={{ width: 24, fontSize: 10, color: '#9CA3AF', textAlign: 'right', flexShrink: 0 }}>{count}</div>}
    </div>
  );
}

function CalendarCard({ cal }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ ...s.calBox, borderColor: '#BBF7D0', background: '#F0FDF4' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#16A34A' }}>{cal.show_rate_added != null ? `${cal.show_rate_added}%` : '—'}</div>
          <div style={{ fontSize: 10, color: '#16A34A', marginTop: 2 }}>Added calendar</div>
          <div style={{ fontSize: 10, color: '#9CA3AF' }}>({cal.added_count} bookings)</div>
        </div>
        <div style={{ ...s.calBox, borderColor: '#FECACA', background: '#FFF5F5' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#DC2626' }}>{cal.show_rate_not_added != null ? `${cal.show_rate_not_added}%` : '—'}</div>
          <div style={{ fontSize: 10, color: '#DC2626', marginTop: 2 }}>Didn't add</div>
          <div style={{ fontSize: 10, color: '#9CA3AF' }}>({cal.not_added_count} bookings)</div>
        </div>
      </div>
      {[['Google', cal.google], ['Apple', cal.apple], ['Outlook', cal.outlook]].map(([label, val]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F3F4F6', fontSize: 12, color: '#4B5563' }}>
          <span>{label}</span>
          <span style={{ fontWeight: 600, color: '#111827' }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Revenue bars ─────────────────────────────────────────────────────────────

function RevBars({ items, labelKey }) {
  if (!items || items.length === 0) return (
    <div style={s.empty}>
      No revenue data yet
      <span style={{ fontSize: 11 }}>Set Revenue per Close in Settings</span>
    </div>
  );
  const max = Math.max(...items.map(i => i.revenue), 1);
  return (
    <div style={{ marginTop: 12 }}>
      {items.slice(0, 7).map(item => {
        const pct = Math.round((item.revenue / max) * 100);
        return (
          <div key={item[labelKey]} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 50, fontSize: 11, color: '#4B5563', flexShrink: 0, textAlign: 'right' }}>{item[labelKey]}</div>
            <div style={{ flex: 1, height: 18, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(pct, 2)}%`, background: '#16A34A', borderRadius: 3, opacity: 0.2 + (pct / 100) * 0.8, transition: 'width .5s ease' }} />
            </div>
            <div style={{ width: 52, fontSize: 11, fontWeight: 700, color: '#16A34A', textAlign: 'right', flexShrink: 0 }}>{fmtCurrency(item.revenue)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Lead Quality ─────────────────────────────────────────────────────────────

function QualitySection({ data }) {
  const total = (data.healthDist.green + data.healthDist.yellow + data.healthDist.red) || 1;
  const gPct  = Math.round((data.healthDist.green  / total) * 100);
  const yPct  = Math.round((data.healthDist.yellow / total) * 100);
  const rPct  = 100 - gPct - yPct;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 14, background: '#E5E7EB' }}>
        <div style={{ width: `${gPct}%`, background: '#16A34A' }} />
        <div style={{ width: `${yPct}%`, background: '#F59E0B' }} />
        <div style={{ width: `${rPct}%`, background: '#DC2626' }} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {[['High',   data.healthDist.green,  '#16A34A', '#DCFCE7', '#BBF7D0'],
          ['Medium', data.healthDist.yellow, '#B45309', '#FEF3C7', '#FDE68A'],
          ['Low',    data.healthDist.red,    '#DC2626', '#FEE2E2', '#FECACA'],
        ].map(([label, count, color, bg, border]) => (
          <div key={label} style={{ flex: 1, borderRadius: 5, padding: '10px 12px', textAlign: 'center', background: bg, border: `1px solid ${border}` }}>
            <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{count}</div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>
      {data.avgLeadScore != null && (
        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: '#6B7280' }}>
          Avg lead score: <strong style={{ color: '#111827' }}>{data.avgLeadScore}</strong> / 100
        </div>
      )}
    </div>
  );
}

// ─── Opportunity Loss ─────────────────────────────────────────────────────────

function OpportunityLoss({ funnel, revenue, hasRevenue }) {
  const lostLeads  = funnel.leads  - funnel.booked;
  const lostShowed = funnel.booked - funnel.showed;
  const lostClosed = funnel.showed - funnel.closed;
  const pctLost    = funnel.leads > 0 ? Math.round((lostLeads / funnel.leads) * 100) : 0;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={s.lossRow}>
        <span style={{ fontSize: 13, color: '#4B5563' }}>Total Leads</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{funnel.leads.toLocaleString()}</span>
      </div>
      <div style={s.lossRow}>
        <span style={{ fontSize: 13, color: '#4B5563' }}>→ Booked</span>
        <span style={{ fontSize: 13, color: '#16A34A', fontWeight: 600 }}>{funnel.booked.toLocaleString()}</span>
      </div>
      <div style={{ ...s.lossRow, borderBottom: '2px solid #FECACA' }}>
        <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 600 }}>Never Booked ({pctLost}%)</span>
        <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 700 }}>{lostLeads.toLocaleString()}</span>
      </div>
      <div style={s.lossRow}>
        <span style={{ fontSize: 13, color: '#4B5563' }}>No-shows</span>
        <span style={{ fontSize: 13, color: '#B45309', fontWeight: 600 }}>{lostShowed.toLocaleString()}</span>
      </div>
      <div style={s.lossRow}>
        <span style={{ fontSize: 13, color: '#4B5563' }}>Showed but didn't close</span>
        <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>{lostClosed.toLocaleString()}</span>
      </div>
      {hasRevenue && revenue.lost > 0 && (
        <div style={{ marginTop: 16, padding: 14, background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: 5, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#DC2626', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Estimated Revenue Lost
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#DC2626' }}>{fmtCurrency(revenue.lost)}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
            {lostLeads.toLocaleString()} lost leads × {fmtCurrency(revenue.per_lead)}/lead
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CQ Pipeline Card ─────────────────────────────────────────────────────────

function CQPipelineCard({ icon, iconBg, iconColor, title, sub, amount, amountColor, decorIcon }) {
  const p = { width: 28, height: 28, fill: 'none', stroke: iconColor, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24' };
  const icons = {
    send:     <svg {...p}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    download: <svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  };
  const decorIcons = {
    clock:    <svg width="52" height="52" fill="none" stroke="#E2E8F0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    hourglass:<svg width="52" height="52" fill="none" stroke="#E2E8F0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>,
  };
  return (
    <div style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 16, position: 'relative', overflow: 'hidden', minHeight: 90 }}>
      <div style={{ width: 58, height: 58, borderRadius: '50%', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icons[icon]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>{sub}</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: amountColor, lineHeight: 1 }}>{amount}</div>
      </div>
      <div style={{ position: 'absolute', right: 16, bottom: 8, opacity: 0.5 }}>
        {decorIcons[decorIcon]}
      </div>
    </div>
  );
}

// ─── CQ Tables ────────────────────────────────────────────────────────────────

function CQSlotTable({ slots }) {
  if (!slots || slots.length === 0) {
    return <div style={s.empty}>No CQ data yet — click Send CQ on a booking to start tracking</div>;
  }
  return (
    <table style={{ ...s.table, marginTop: 14 }}>
      <thead>
        <tr>
          <th style={s.th}>Slot</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Showed</th>
          <th style={{ ...s.th, textAlign: 'right' }}>CQ Sent</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Rate</th>
          <th style={{ ...s.th, textAlign: 'right' }}>CQ Recv</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Return %</th>
        </tr>
      </thead>
      <tbody>
        {slots.map((sl, i) => (
          <tr key={sl.slot} style={{ background: i === 0 ? '#F0F7FF' : i % 2 ? '#FFFFFF' : '#FAFBFD' }}>
            <td style={{ ...s.td, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? '#0057FF' : '#0F172A' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {i === 0 && (
                  <svg width="13" height="13" fill="#0057FF" stroke="#0057FF" strokeWidth="1" viewBox="0 0 24 24">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                )}
                {sl.slot}
              </div>
            </td>
            <td style={{ ...s.td, textAlign: 'right' }}>{sl.showed}</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{sl.cq_sent}</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{sl.cq_rate != null ? <RateBadge rate={sl.cq_rate} small thresholds={[70, 50]} /> : '—'}</td>
            <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>{sl.cq_received}</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{sl.cq_return_rate != null ? <RateBadge rate={sl.cq_return_rate} small thresholds={[70, 50]} /> : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CQRepTable({ reps }) {
  if (!reps || reps.length === 0) return <div style={s.empty}>No data yet</div>;
  return (
    <table style={{ ...s.table, marginTop: 14 }}>
      <thead>
        <tr>
          <th style={s.th}>Consultant</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Showed</th>
          <th style={{ ...s.th, textAlign: 'right' }}>CQ Sent</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Rate</th>
          <th style={{ ...s.th, textAlign: 'right' }}>CQ Recv</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Return %</th>
        </tr>
      </thead>
      <tbody>
        {reps.map((r, i) => {
          const initials = r.email.split('@')[0].slice(0, 2).toUpperCase();
          return (
            <tr key={r.email} style={{ background: i % 2 ? '#FFFFFF' : '#FAFBFD' }}>
              <td style={{ ...s.td, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#0057FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#0F172A' }}>{r.email.split('@')[0]}</span>
              </td>
              <td style={{ ...s.td, textAlign: 'right' }}>{r.showed}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{r.cq_sent}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{r.cq_rate != null ? <RateBadge rate={r.cq_rate} small thresholds={[70, 50]} /> : '—'}</td>
              <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>{r.cq_received}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{r.cq_return_rate != null ? <RateBadge rate={r.cq_return_rate} small thresholds={[70, 50]} /> : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Rate Badge ───────────────────────────────────────────────────────────────

function RateBadge({ rate, small, thresholds = [70, 50] }) {
  const [hi, lo] = thresholds;
  const color = rate >= hi ? '#16A34A' : rate >= lo ? '#B45309' : '#DC2626';
  const bg    = rate >= hi ? '#DCFCE7'  : rate >= lo ? '#FEF3C7' : '#FEE2E2';
  return (
    <span style={{
      display: 'inline-block',
      padding: small ? '2px 7px' : '3px 10px',
      borderRadius: 10,
      fontSize: small ? 11 : 13,
      fontWeight: 700,
      color,
      background: bg,
    }}>
      {rate}%
    </span>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page:        { display: 'flex', minHeight: '100vh', background: '#FAFBFD', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },

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

  mainCol:   { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  topBar:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', flexShrink: 0, gap: 16 },
  topTitle:  { fontSize: 20, fontWeight: 700, color: '#0F172A' },
  topDate:   { fontSize: 13, color: '#64748B', fontWeight: 400, marginTop: 2 },
  topActions:{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  topBtn:    { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6, border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' },

  main:        { flex: 1, padding: '20px 24px', overflowY: 'auto' },
  empty:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center', padding: 24, color: '#9CA3AF', fontSize: 12 },
  loadingWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 16 },
  spinner:     { width: 28, height: 28, borderRadius: '50%', border: '2px solid #E2E8F0', borderTopColor: '#0057FF', animation: 'spin 0.8s linear infinite' },
  loadingText: { color: '#6B7280', fontSize: 13 },

  secTitle:    { fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 28, marginBottom: 10 },
  card:        { background: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(15,23,42,.04)' },
  cardTitle:   { fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 2 },
  cardSub:     { fontSize: 12, color: '#64748B', lineHeight: 1.5 },

  kpi4:        { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 },
  kpiCard:     { background: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 3px rgba(15,23,42,.04)' },
  kpiLabel:    { fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 },
  kpiValue:    { fontSize: 26, fontWeight: 800, color: '#0F172A', lineHeight: 1.1, marginBottom: 3 },
  kpiSub:      { fontSize: 11, color: '#94A3B8', lineHeight: 1.4 },

  twoCol:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  threeCol:    { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 },

  table:       { width: '100%', borderCollapse: 'collapse', marginTop: 12 },
  th:          { fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 10px', background: '#FAFBFD', borderBottom: '1px solid #E2E8F0', textAlign: 'left', whiteSpace: 'nowrap' },
  td:          { fontSize: 13, color: '#0F172A', padding: '10px 10px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' },

  metaRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #F3F4F6' },
  metaLabel:   { fontSize: 12, color: '#4B5563' },
  metaValue:   { fontSize: 13, fontWeight: 600, color: '#111827' },
  compareBox:  { display: 'flex', marginTop: 14, border: '1px solid #E2E8F0', borderRadius: 5, overflow: 'hidden' },

  velBox:      { background: '#F9FAFB', border: '1px solid #E2E8F0', borderRadius: 4, padding: '8px 10px', textAlign: 'center' },
  calBox:      { flex: 1, borderRadius: 5, border: '1px solid', padding: '10px', textAlign: 'center' },

  lossRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #F3F4F6' },

  avatar:      { width: 30, height: 30, borderRadius: '50%', background: '#0057FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flexShrink: 0 },
};
