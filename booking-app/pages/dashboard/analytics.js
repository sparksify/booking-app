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

// ─── Currency helpers ─────────────────────────────────────────────────────────
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

export default function AnalyticsDashboard() {
  const { data: session } = useSession();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <>
      <Head><title>Intelligence Dashboard</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
      <div style={s.page}>
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
            <button style={s.signOutBtn} onClick={() => signOut({ callbackUrl: '/dashboard/login' })}>Sign out</button>
          </div>
        </header>

        <main style={s.main}>
          {loading ? (
            <div style={s.loadingWrap}><div style={s.spinner}/><div style={s.loadingText}>Loading intelligence…</div></div>
          ) : !data ? (
            <div style={s.empty}>Could not load analytics.</div>
          ) : (
            <Dashboard data={data} />
          )}
        </main>
      </div>
    </>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ data }) {
  const hasRevenue   = data.revenue.per_close > 0;
  const [showRevenue, setShowRevenue] = useState(false);
  const showRev = showRevenue && hasRevenue;

  return (
    <>
      {/* Revenue toggle bar */}
      <div style={s.toggleBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#4B5563' }}>Revenue Metrics</span>
          {!hasRevenue && (
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>— set Revenue per Close in Settings to enable</span>
          )}
        </div>
        <button
          onClick={() => hasRevenue && setShowRevenue(p => !p)}
          disabled={!hasRevenue}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
            borderRadius: 20, border: 'none', cursor: hasRevenue ? 'pointer' : 'not-allowed',
            background: showRev ? '#16A34A' : '#D1D5DB',
            color: showRev ? '#fff' : '#6B7280',
            fontSize: 12, fontWeight: 600, transition: 'background .2s', fontFamily: 'inherit',
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: showRev ? '#fff' : '#9CA3AF', display: 'inline-block' }} />
          {showRev ? 'Revenue ON' : 'Revenue OFF'}
        </button>
      </div>

      {/* §1 Executive Summary */}
      <SecTitle>§1 — Executive Summary</SecTitle>
      <div style={s.kpi4}>
        <KpiCard label="Leads"        value={data.funnel.leads.toLocaleString()} sub="total in funnel"          accent="#6B7280" icon="👥" />
        <KpiCard label="Booking Rate" value={`${data.bookingRate}%`}             sub={`${data.funnel.booked} booked`} accent="#1D4ED8" icon="📅" warn={data.bookingRate > 0 && data.bookingRate < 20} />
        <KpiCard label="Show Rate"    value={`${data.showRate}%`}                sub={`${data.funnel.showed} of ${data.funnel.booked}`} accent="#16A34A" icon="✅" warn={data.showRate > 0 && data.showRate < 60} />
        <KpiCard label="Close Rate"   value={`${data.closeRate}%`}               sub={`${data.funnel.closed} closed`} accent="#7C3AED" icon="🤝" />
      </div>
      {showRev && (
        <div style={s.kpi4}>
          <KpiCard label="Revenue Generated" value={fmtCurrency(data.revenue.generated)}  sub={`${data.funnel.closed} closes × ${fmtCurrency(data.revenue.per_close)}`} accent="#16A34A" icon="💰" />
          <KpiCard label="Revenue Per Appt"  value={fmtCurrency(data.revenue.per_appt)}   sub="revenue ÷ bookings"    accent="#0EA5E9" icon="📈" />
          <KpiCard label="Revenue Per Lead"  value={fmtCurrency(data.revenue.per_lead)}   sub="revenue ÷ total leads" accent="#F59E0B" icon="🎯" />
          <KpiCard label="Est. Revenue Lost" value={fmtCurrency(data.revenue.lost)}       sub={`${data.funnel.leads - data.funnel.booked} lost leads × rev/lead`} accent="#DC2626" icon="⚠️" />
        </div>
      )}

      {/* §2 + §3 Booking Engine + Slot Leaderboard */}
      <SecTitle>§2 — Booking Engine Health &nbsp;&nbsp; | &nbsp;&nbsp; §3 — Slot Leaderboard</SecTitle>
      <div style={s.twoCol}>
        <div style={s.card}>
          <CTitle>Recommendation Engine Performance</CTitle>
          <CSub>Does the smart slot picker improve outcomes?</CSub>
          <RecTable rec={data.recommendation} />
        </div>
        <div style={s.card}>
          <CTitle>Slot Leaderboard</CTitle>
          <CSub>Top booking times by volume — the engine's training data</CSub>
          <SlotTable slots={data.slotLeaderboard} hasRevenue={showRev} />
        </div>
      </div>

      {/* §4 Conversion Funnel */}
      <SecTitle>§4 — Conversion Funnel</SecTitle>
      <div style={s.card}>
        <FunnelViz funnel={data.funnel} />
      </div>

      {/* §5 Attribution */}
      <SecTitle>§5 — Attribution</SecTitle>
      <div style={s.twoCol}>
        <div style={s.card}>
          <CTitle>Booking Source</CTitle>
          <CSub>What's actually driving appointments?</CSub>
          <AttrTable rows={data.attribution} cols={['Booked','Showed','Closed','Show %']} getRow={r => [r.booked, r.showed, r.closed, r.show_rate]} />
        </div>
        <div style={s.card}>
          <CTitle>Lead Source</CTitle>
          <CSub>Where are the leads coming from?</CSub>
          <LeadSourceTable rows={data.leadSource} />
        </div>
      </div>

      {/* §6 Consultant Performance */}
      <SecTitle>§6 — Consultant Performance</SecTitle>
      <div style={s.card}>
        <RepTable reps={data.repStats} hasRevenue={showRev} />
      </div>

      {/* §7 Velocity | §8 Delay | §9 Calendar */}
      <SecTitle>§7 — Booking Velocity &nbsp;&nbsp;|&nbsp;&nbsp; §8 — Appointment Window &nbsp;&nbsp;|&nbsp;&nbsp; §9 — Calendar Add</SecTitle>
      <div style={s.threeCol}>
        <div style={s.card}>
          <CTitle>Booking Velocity</CTitle>
          <CSub>Page view → confirmed booking</CSub>
          <VelocityCard stats={data.velocityStats} buckets={data.velocityAnalysis} avgTimeToBook={data.avgTimeToBook} />
        </div>
        <div style={s.card}>
          <CTitle>Appointment Window Performance</CTitle>
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
      {showRev && (
        <>
          <SecTitle>§10 — Revenue Intelligence</SecTitle>
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
      <SecTitle>§11 — Lead Quality &nbsp;&nbsp;|&nbsp;&nbsp; §12 — Opportunity Loss</SecTitle>
      <div style={s.twoCol}>
        <div style={s.card}>
          <CTitle>Lead Quality Distribution</CTitle>
          <CSub>Scored on investment level, urgency & completeness</CSub>
          <QualitySection data={data} />
        </div>
        <div style={s.card}>
          <CTitle>Opportunity Loss</CTitle>
          <CSub>Revenue left on the table from unconverted leads</CSub>
          <OpportunityLoss funnel={data.funnel} revenue={data.revenue} hasRevenue={showRev} />
        </div>
      </div>
    </>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

function SecTitle({ children }) {
  return <div style={s.secTitle}>{children}</div>;
}
function CTitle({ children }) {
  return <div style={s.cardTitle}>{children}</div>;
}
function CSub({ children }) {
  return <div style={s.cardSub}>{children}</div>;
}

function KpiCard({ label, value, sub, accent, icon, warn }) {
  return (
    <div style={{ ...s.kpiCard, borderTop: `3px solid ${accent}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        {warn && <span style={{ fontSize: 12, color: '#F59E0B' }}>⚠</span>}
      </div>
      <div style={{ ...s.kpiValue, color: accent }}>{value}</div>
      <div style={s.kpiLabel}>{label}</div>
      <div style={s.kpiSub}>{sub}</div>
    </div>
  );
}

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
          <div style={{ width: 1, background: '#E0E3E7' }} />
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
          <tr key={sl.slot} style={{ background: i % 2 ? '#fff' : '#FAFAFA' }}>
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
              <span style={{ fontSize: 12, fontWeight: 600, color: '#4B5563' }}>{step.label}</span>
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                {pct != null ? `${pct}% of previous step` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 26, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${w}%`, background: step.color, borderRadius: 4, transition: 'width .6s ease' }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1A2B3C', width: 64, textAlign: 'right', flexShrink: 0 }}>
                {step.value.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AttrTable({ rows }) {
  if (!rows || rows.length === 0) return <div style={s.empty}>No data yet</div>;
  const SOURCE_ICONS = { direct: '🌐', facebook_lead: '📘', closebot: '🤖', sms: '💬', email: '📧', retargeting: '🎯' };
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
          <tr key={r.source} style={{ background: i % 2 ? '#fff' : '#FAFAFA' }}>
            <td style={s.td}>{SOURCE_ICONS[r.source] || '📌'} {r.label}</td>
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
  const ICONS = { facebook: '📘', direct: '🌐', google: '🔍', referral: '🤝' };
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
            <tr key={r.source} style={{ background: i % 2 ? '#fff' : '#FAFAFA' }}>
              <td style={s.td}>{ICONS[r.source] || '📌'} {r.label}</td>
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
          const closeRate = rep.showed > 0 ? Math.round((rep.closed / rep.showed) * 100) : null;
          const shortName = rep.email.split('@')[0];
          return (
            <tr key={rep.email} style={{ background: i % 2 ? '#fff' : '#FAFAFA' }}>
              <td style={s.td}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={s.avatar}>{shortName[0].toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2B3C' }}>
                      {shortName}{rep.top_performer && ' 🏆'}
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

function VelocityCard({ stats, buckets, avgTimeToBook }) {
  return (
    <div style={{ marginTop: 12 }}>
      {stats ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[['Average', fmtMins(stats.avg)], ['Median', fmtMins(stats.median)], ['Fastest', fmtMins(stats.min)], ['Slowest', fmtMins(stats.max)]].map(([label, value]) => (
            <div key={label} style={s.velBox}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1A2B3C' }}>{value}</div>
              <div style={{ fontSize: 10, color: '#9CA3AF' }}>{label}</div>
            </div>
          ))}
        </div>
      ) : avgTimeToBook != null ? (
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#1A2B3C' }}>{fmtMins(avgTimeToBook)}</div>
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
      <div style={{ width: 68, fontSize: 11, color: '#4B5563', flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 14, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
        {showRate != null && <div style={{ height: '100%', width: `${showRate}%`, background: color, borderRadius: 3, transition: 'width .5s ease' }} />}
      </div>
      <div style={{ width: 34, fontSize: 11, fontWeight: 700, color: '#1A2B3C', textAlign: 'right', flexShrink: 0 }}>
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
        <div style={{ ...s.calBox, borderColor: '#16A34A33', background: '#F0FDF4' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#16A34A' }}>{cal.show_rate_added != null ? `${cal.show_rate_added}%` : '—'}</div>
          <div style={{ fontSize: 10, color: '#16A34A' }}>Added calendar</div>
          <div style={{ fontSize: 10, color: '#9CA3AF' }}>({cal.added_count} bookings)</div>
        </div>
        <div style={{ ...s.calBox, borderColor: '#DC262633', background: '#FFF5F5' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#DC2626' }}>{cal.show_rate_not_added != null ? `${cal.show_rate_not_added}%` : '—'}</div>
          <div style={{ fontSize: 10, color: '#DC2626' }}>Didn't add</div>
          <div style={{ fontSize: 10, color: '#9CA3AF' }}>({cal.not_added_count} bookings)</div>
        </div>
      </div>
      {[['📅 Google', cal.google], ['🍎 Apple', cal.apple], ['📧 Outlook', cal.outlook]].map(([label, val]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F3F4F6', fontSize: 12, color: '#4B5563' }}>
          <span>{label}</span><span style={{ fontWeight: 600, color: '#1A2B3C' }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

function RevBars({ items, labelKey }) {
  if (!items || items.length === 0) return <div style={s.empty}>No revenue data yet<br/><span style={{ fontSize: 11 }}>Set Revenue per Close in Settings</span></div>;
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

function QualitySection({ data }) {
  const total = (data.healthDist.green + data.healthDist.yellow + data.healthDist.red) || 1;
  const gPct  = Math.round((data.healthDist.green  / total) * 100);
  const yPct  = Math.round((data.healthDist.yellow / total) * 100);
  const rPct  = 100 - gPct - yPct;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 14, background: '#EAECEF' }}>
        <div style={{ width: `${gPct}%`, background: '#16A34A' }} />
        <div style={{ width: `${yPct}%`, background: '#F59E0B' }} />
        <div style={{ width: `${rPct}%`, background: '#DC2626' }} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {[['🟢', 'High',   data.healthDist.green,  '#16A34A', '#DCFCE7'],
          ['🟡', 'Medium', data.healthDist.yellow, '#B45309', '#FEF3C7'],
          ['🔴', 'Low',    data.healthDist.red,    '#DC2626', '#FEE2E2'],
        ].map(([emoji, label, count, color, bg]) => (
          <div key={label} style={{ flex: 1, borderRadius: 6, padding: '10px 12px', textAlign: 'center', background: bg, border: `1px solid ${color}22` }}>
            <div style={{ fontSize: 16, marginBottom: 4 }}>{emoji}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{count}</div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
      {data.avgLeadScore != null && (
        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: '#6B7280' }}>
          Avg lead score: <strong style={{ color: '#1A2B3C' }}>{data.avgLeadScore}</strong> / 100
        </div>
      )}
    </div>
  );
}

function OpportunityLoss({ funnel, revenue, hasRevenue }) {
  const lostLeads   = funnel.leads - funnel.booked;
  const lostShowed  = funnel.booked - funnel.showed;
  const lostClosed  = funnel.showed - funnel.closed;
  const pctLost     = funnel.leads > 0 ? Math.round((lostLeads / funnel.leads) * 100) : 0;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={s.lossRow}>
        <span style={{ fontSize: 13, color: '#4B5563' }}>Total Leads</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1A2B3C' }}>{funnel.leads.toLocaleString()}</span>
      </div>
      <div style={s.lossRow}>
        <span style={{ fontSize: 13, color: '#4B5563' }}>↳ Booked</span>
        <span style={{ fontSize: 13, color: '#16A34A', fontWeight: 600 }}>{funnel.booked.toLocaleString()}</span>
      </div>
      <div style={{ ...s.lossRow, borderBottom: '2px solid #FEE2E2' }}>
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
        <div style={{ marginTop: 16, padding: 14, background: '#FFF5F5', border: '1px solid #FCA5A5', borderRadius: 6, textAlign: 'center' }}>
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

function RateBadge({ rate, small, thresholds = [70, 50] }) {
  const [hi, lo] = thresholds;
  const color = rate >= hi ? '#16A34A' : rate >= lo ? '#B45309' : '#DC2626';
  const bg    = rate >= hi ? '#DCFCE7'  : rate >= lo ? '#FEF3C7'  : '#FEE2E2';
  return (
    <span style={{ display: 'inline-block', padding: small ? '2px 7px' : '3px 10px', borderRadius: 10, fontSize: small ? 11 : 13, fontWeight: 700, color, background: bg }}>
      {rate}%
    </span>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page:         { minHeight: '100vh', background: '#F0F2F5', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 50, background: '#33485E', position: 'sticky', top: 0, zIndex: 10 },
  headerLeft:   { display: 'flex', alignItems: 'center', gap: 28 },
  logo:         { fontWeight: 600, fontSize: 15, color: '#FFFFFF', flexShrink: 0 },
  nav:          { display: 'flex', gap: 2 },
  navLink:      { fontSize: 13, color: '#A8BED0', textDecoration: 'none', padding: '7px 14px', borderRadius: 3 },
  navActive:    { color: '#FFFFFF', background: 'rgba(255,255,255,.13)' },
  headerRight:  { display: 'flex', alignItems: 'center', gap: 12 },
  headerUser:   { fontSize: 13, color: '#A8BED0' },
  signOutBtn:   { fontSize: 12, color: '#A8BED0', background: 'transparent', border: '1px solid rgba(255,255,255,.18)', borderRadius: 3, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },

  main:         { maxWidth: 1280, margin: '0 auto', padding: '20px 20px 60px' },
  empty:        { textAlign: 'center', padding: 24, color: '#9CA3AF', fontSize: 12 },
  loadingWrap:  { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 16 },
  spinner:      { width: 32, height: 32, borderRadius: '50%', border: '3px solid #D8DCE0', borderTopColor: '#1D4ED8', animation: 'spin 0.8s linear infinite' },
  loadingText:  { color: '#6B7280', fontSize: 14 },

  toggleBar:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #E0E3E7', borderRadius: 6, padding: '10px 16px', marginBottom: 16 },
  secTitle:     { fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 24, marginBottom: 10 },
  card:         { background: '#fff', borderRadius: 6, border: '1px solid #E0E3E7', padding: '16px 18px' },
  cardTitle:    { fontSize: 13, fontWeight: 600, color: '#1A2B3C', marginBottom: 2 },
  cardSub:      { fontSize: 11, color: '#9CA3AF' },

  kpi4:         { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 },
  kpiCard:      { background: '#fff', borderRadius: 6, border: '1px solid #E0E3E7', padding: '14px 16px' },
  kpiValue:     { fontSize: 26, fontWeight: 700, lineHeight: 1, marginBottom: 3 },
  kpiLabel:     { fontSize: 11, fontWeight: 600, color: '#4B5563', marginBottom: 2 },
  kpiSub:       { fontSize: 10, color: '#9CA3AF', lineHeight: 1.4 },

  twoCol:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 },
  threeCol:     { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },

  table:        { width: '100%', borderCollapse: 'collapse', marginTop: 12 },
  th:           { fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '5px 8px', borderBottom: '1px solid #E0E3E7', textAlign: 'left' },
  td:           { fontSize: 12, color: '#1A2B3C', padding: '7px 8px', borderBottom: '1px solid #F3F4F6' },

  metaRow:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #F3F4F6' },
  metaLabel:    { fontSize: 12, color: '#4B5563' },
  metaValue:    { fontSize: 13, fontWeight: 600, color: '#1A2B3C' },
  compareBox:   { display: 'flex', marginTop: 14, border: '1px solid #E0E3E7', borderRadius: 6, overflow: 'hidden' },

  velBox:       { background: '#F9FAFB', border: '1px solid #E0E3E7', borderRadius: 5, padding: '8px 10px', textAlign: 'center' },

  calBox:       { flex: 1, borderRadius: 6, border: '1px solid', padding: '10px', textAlign: 'center' },

  lossRow:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #F3F4F6' },

  avatar:       { width: 28, height: 28, borderRadius: '50%', background: '#33485E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 },
};
