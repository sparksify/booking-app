import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import Head from 'next/head';
import Link from 'next/link';
import { authOptions } from '../api/auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

// ─── Server-side auth + settings ─────────────────────────────────────────────

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) return { redirect: { destination: '/dashboard/login', permanent: false } };

  const supabase = getSupabaseAdmin();
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('show_revenue, show_franchise_metrics')
    .eq('id', 1)
    .single();

  return {
    props: {
      session,
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsDashboard({ showRevenueProp, showFranchiseProp }) {
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
      <Head><title>Analytics — FranchiseBook</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
      <div style={s.page}>

        <header style={s.header}>
          <div style={s.headerLeft}>
            <span style={s.logo}>⬡ FranchiseBook</span>
            <nav style={s.nav}>
              <Link href="/dashboard/analytics"  style={{ ...s.navLink, ...s.navActive }}>Analytics</Link>
              <Link href="/dashboard/bookings"   style={s.navLink}>Bookings</Link>
              <Link href="/dashboard/leads"      style={s.navLink}>Leads</Link>
              <Link href="/dashboard/prospects"  style={s.navLink}>Prospecting</Link>
              <Link href="/dashboard/nurture"    style={s.navLink}>Nurture</Link>
            </nav>
          </div>
          <div style={s.headerRight}>
            <Link href="/dashboard/settings" style={s.navLink}>Settings</Link>
            <span style={s.headerUser}>{session?.user?.email}</span>
            <button style={s.signOutBtn} onClick={() => signOut({ callbackUrl: '/dashboard/login' })}>Sign out</button>
          </div>
        </header>

        <main style={s.main}>
          {/* Period selector */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Analytics</div>
            <div style={{ display: 'flex', gap: 2, background: '#F3F4F6', borderRadius: 6, padding: 3 }}>
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => changePeriod(d)} style={{
                  padding: '4px 13px', fontSize: 12,
                  fontWeight: period === d ? 700 : 500,
                  color: period === d ? '#111827' : '#6B7280',
                  background: period === d ? '#fff' : 'transparent',
                  border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: period === d ? '0 1px 2px rgba(0,0,0,.07)' : 'none',
                }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>

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
    </>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ data, showRevenue, showFranchise }) {
  return (
    <>
      {/* §1 Executive Summary */}
      <SecTitle>Executive Summary</SecTitle>
      <div style={s.kpi4}>
        <KpiCard label="Total Leads"  value={data.funnel.leads.toLocaleString()} sub="in funnel" />
        <KpiCard label="Booking Rate" value={`${data.bookingRate}%`}  sub={`${data.funnel.booked} booked`}  warn={data.bookingRate > 0 && data.bookingRate < 20} />
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
          <SecTitle>Franchise &amp; CQ Metrics</SecTitle>
          <div style={s.kpi4}>
            <KpiCard label="CQ Sent"       value={data.cqMetrics.cq_sent.toLocaleString()}      sub={`of ${data.funnel.showed} showed`} />
            <KpiCard label="CQ Rate"        value={`${data.cqMetrics.cq_rate}%`}                 sub="% of shows → CQ sent" />
            <KpiCard label="CQ Received"    value={data.cqMetrics.cq_received.toLocaleString()}  sub={`of ${data.cqMetrics.cq_sent} sent`} warn={data.cqMetrics.cq_sent > 0 && data.cqMetrics.cq_return_rate < 50} />
            <KpiCard label="Return Rate"    value={`${data.cqMetrics.cq_return_rate}%`}          sub="CQ sent → CQ returned" />
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

          {(data.cqPipeline.sent_not_received > 0 || data.cqPipeline.received_not_closed > 0) && (
            <div style={s.twoCol}>
              <div style={s.card}>
                <CTitle>CQ Sent — Awaiting Response</CTitle>
                <CSub>{data.cqPipeline.sent_not_received} questionnaires out, not yet returned</CSub>
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#111827' }}>{fmtCurrency(data.cqPipeline.pipeline_sent)}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>projected at current close rate</div>
                </div>
              </div>
              <div style={s.card}>
                <CTitle>CQ Received — Not Yet Closed</CTitle>
                <CSub>{data.cqPipeline.received_not_closed} questionnaires back, deals in progress</CSub>
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#111827' }}>{fmtCurrency(data.cqPipeline.pipeline_received)}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>projected at current close rate</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* §3 Booking Engine + Slot Leaderboard */}
      <SecTitle>Booking Engine &amp; Slot Leaderboard</SecTitle>
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
      <SecTitle>Conversion Funnel</SecTitle>
      <div style={s.card}>
        <FunnelViz funnel={data.funnel} />
      </div>

      {/* §5 Attribution */}
      <SecTitle>Attribution</SecTitle>
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
      <SecTitle>Consultant Performance</SecTitle>
      <div style={s.card}>
        <RepTable reps={data.repStats} hasRevenue={showRevenue} />
      </div>

      {/* §7 Velocity | §8 Appointment Window | §9 Calendar Add */}
      <SecTitle>Booking Velocity &nbsp;·&nbsp; Appointment Window &nbsp;·&nbsp; Calendar Add</SecTitle>
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
          <SecTitle>Revenue Intelligence</SecTitle>
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
      <SecTitle>Lead Quality &nbsp;·&nbsp; Opportunity Loss</SecTitle>
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

function SecTitle({ children }) {
  return <div style={s.secTitle}>{children}</div>;
}
function CTitle({ children }) {
  return <div style={s.cardTitle}>{children}</div>;
}
function CSub({ children }) {
  return <div style={s.cardSub}>{children}</div>;
}

// ─── KPI Card — clean, no colored accent bar ──────────────────────────────────

function KpiCard({ label, value, sub, warn }) {
  return (
    <div style={s.kpiCard}>
      <div style={s.kpiLabel}>{label}</div>
      <div style={s.kpiValue}>{value}</div>
      {sub  && <div style={s.kpiSub}>{sub}</div>}
      {warn && <div style={{ marginTop: 5, fontSize: 11, color: '#D97706', fontWeight: 500 }}>Below target</div>}
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

// ─── CQ Tables ────────────────────────────────────────────────────────────────

function CQSlotTable({ slots }) {
  if (!slots || slots.length === 0) {
    return <div style={s.empty}>No CQ data yet — click Send CQ on a booking to start tracking</div>;
  }
  return (
    <table style={s.table}>
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
          <tr key={sl.slot} style={{ background: i === 0 ? '#FAF5FF' : 'transparent' }}>
            <td style={{ ...s.td, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? '#7C3AED' : '#111827' }}>
              {i === 0 && <span style={{ marginRight: 5 }}>★</span>}{sl.slot}
            </td>
            <td style={{ ...s.td, textAlign: 'right' }}>{sl.showed}</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{sl.cq_sent}</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{sl.cq_rate != null ? <RateBadge rate={sl.cq_rate} small thresholds={[70, 50]} /> : '—'}</td>
            <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: '#15803D' }}>{sl.cq_received}</td>
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
    <table style={s.table}>
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
            <tr key={r.email} style={{ background: i === 0 && r.cq_received > 0 ? '#F0FDF4' : 'transparent' }}>
              <td style={{ ...s.td, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ ...s.avatar, width: 24, height: 24, fontSize: 10 }}>{initials}</div>
                <span style={{ fontSize: 12, color: '#111827' }}>{r.email.split('@')[0]}</span>
              </td>
              <td style={{ ...s.td, textAlign: 'right' }}>{r.showed}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{r.cq_sent}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{r.cq_rate != null ? <RateBadge rate={r.cq_rate} small thresholds={[70, 50]} /> : '—'}</td>
              <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: '#15803D' }}>{r.cq_received}</td>
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

  main:        { maxWidth: 1280, margin: '0 auto', padding: '20px 20px 60px' },
  empty:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center', padding: 24, color: '#9CA3AF', fontSize: 12 },
  loadingWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 16 },
  spinner:     { width: 28, height: 28, borderRadius: '50%', border: '2px solid #E5E7EB', borderTopColor: '#374151', animation: 'spin 0.8s linear infinite' },
  loadingText: { color: '#6B7280', fontSize: 13 },

  secTitle:    { fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 28, marginBottom: 10 },
  card:        { background: '#fff', borderRadius: 6, border: '1px solid #E8EAED', padding: '16px 18px' },
  cardTitle:   { fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 2 },
  cardSub:     { fontSize: 11, color: '#9CA3AF' },

  kpi4:        { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 },
  kpiCard:     { background: '#fff', borderRadius: 6, border: '1px solid #E8EAED', padding: '16px 18px' },
  kpiLabel:    { fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
  kpiValue:    { fontSize: 28, fontWeight: 700, color: '#111827', lineHeight: 1, marginBottom: 4 },
  kpiSub:      { fontSize: 11, color: '#9CA3AF', lineHeight: 1.4 },

  twoCol:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 },
  threeCol:    { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },

  table:       { width: '100%', borderCollapse: 'collapse', marginTop: 12 },
  th:          { fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 8px', background: '#F9FAFB', borderBottom: '1px solid #E8EAED', textAlign: 'left' },
  td:          { fontSize: 12, color: '#111827', padding: '7px 8px', borderBottom: '1px solid #F3F4F6' },

  metaRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #F3F4F6' },
  metaLabel:   { fontSize: 12, color: '#4B5563' },
  metaValue:   { fontSize: 13, fontWeight: 600, color: '#111827' },
  compareBox:  { display: 'flex', marginTop: 14, border: '1px solid #E8EAED', borderRadius: 5, overflow: 'hidden' },

  velBox:      { background: '#F9FAFB', border: '1px solid #E8EAED', borderRadius: 4, padding: '8px 10px', textAlign: 'center' },
  calBox:      { flex: 1, borderRadius: 5, border: '1px solid', padding: '10px', textAlign: 'center' },

  lossRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #F3F4F6' },

  avatar:      { width: 28, height: 28, borderRadius: '50%', background: '#151719', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 },
};
