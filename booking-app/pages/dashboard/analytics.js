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

  return (
    <>
      <Head><title>Intelligence Dashboard</title></Head>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>
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
            <button style={s.signOutBtn} onClick={() => signOut({ callbackUrl: '/dashboard/login' })}>Sign out</button>
          </div>
        </header>

        <main style={s.main}>
          {loading ? (
            <div style={s.loadingWrap}>
              <div style={s.spinner} />
              <div style={s.loadingText}>Loading intelligence…</div>
            </div>
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

// ─── Main Dashboard ───────────────────────────────────────────────────────────

function Dashboard({ data }) {
  return (
    <>
      {/* 1 ── Executive Summary */}
      <SectionTitle>Executive Summary</SectionTitle>
      <div style={s.kpiRow}>
        <KpiCard label="Leads"        value={data.funnel.leads.toLocaleString()} sub="total in funnel"             accent="#6B7280" icon="👥" />
        <KpiCard label="Booking Rate" value={`${data.bookingRate}%`}             sub={`${data.funnel.booked} booked`} accent="#1D4ED8" icon="📅"
          warning={data.bookingRate > 0 && data.bookingRate < 20} />
        <KpiCard label="Show Rate"    value={`${data.showRate}%`}                sub={`${data.funnel.showed} of ${data.funnel.booked} showed`} accent="#16A34A" icon="✅"
          warning={data.showRate > 0 && data.showRate < 60} />
        <KpiCard label="Close Rate"   value={`${data.closeRate}%`}               sub={`${data.funnel.closed} closed`} accent="#7C3AED" icon="🤝" />
        <KpiCard label="Avg Lead Score" value={data.avgLeadScore ?? '—'}         sub="quality signal (0–100)"     accent="#F59E0B" icon="⭐" />
        <KpiCard label="Avg Time to Book" value={data.avgTimeToBook != null ? fmtMins(data.avgTimeToBook) : '—'}
          sub="lead created → booked" accent="#0EA5E9" icon="⚡" />
      </div>

      {/* 2 ── Booking Optimization */}
      <SectionTitle>Booking Optimization</SectionTitle>
      <div style={s.twoCol}>
        <RecEngineCard rec={data.recommendation} />
        <SlotLeaderboard slots={data.slotLeaderboard} />
      </div>

      {/* 3 ── Funnel Intelligence */}
      <SectionTitle>Funnel Intelligence</SectionTitle>
      <div style={s.card}>
        <FunnelViz funnel={data.funnel} />
      </div>

      {/* 4 ── Attribution */}
      <SectionTitle>Attribution</SectionTitle>
      <div style={s.twoCol}>
        <div style={s.card}>
          <CardTitle>Booking Source</CardTitle>
          <AttributionTable rows={data.attribution} />
        </div>
        <div style={s.card}>
          <CardTitle>Lead Quality Distribution</CardTitle>
          <QualityBar data={data} />
          <div style={s.bucketRow}>
            <Bucket emoji="🟢" label="High"   count={data.healthDist.green}  color="#16A34A" bg="#DCFCE7" />
            <Bucket emoji="🟡" label="Medium" count={data.healthDist.yellow} color="#B45309" bg="#FEF3C7" />
            <Bucket emoji="🔴" label="Low"    count={data.healthDist.red}    color="#DC2626" bg="#FEE2E2" />
          </div>
        </div>
      </div>

      {/* 5 ── Consultant Performance */}
      {data.repStats.length > 0 && (
        <>
          <SectionTitle>Consultant Performance</SectionTitle>
          <div style={s.card}>
            <RepTable reps={data.repStats} />
          </div>
        </>
      )}

      {/* 6 ── Analysis Row */}
      <SectionTitle>Diagnostic Analysis</SectionTitle>
      <div style={s.threeCol}>
        <div style={s.card}>
          <CardTitle>Appointment Delay vs Show Rate</CardTitle>
          <CardSub>Days between booking and call</CardSub>
          <DelayTable rows={data.delayAnalysis} />
        </div>
        <div style={s.card}>
          <CardTitle>Calendar Add vs Show Rate</CardTitle>
          <CardSub>Does adding to calendar predict attendance?</CardSub>
          <CalendarAddCard cal={data.calendarAdds} />
        </div>
        <div style={s.card}>
          <CardTitle>Booking Velocity</CardTitle>
          <CardSub>Page view → confirmed booking</CardSub>
          <VelocityCard stats={data.velocityStats} buckets={data.velocityAnalysis} />
        </div>
      </div>

      {/* 7 ── Heat maps */}
      <SectionTitle>Slot Heat Maps</SectionTitle>
      <div style={s.twoCol}>
        <div style={s.card}>
          <CardTitle>Bookings by Day</CardTitle>
          <HeatBars
            items={['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => ({
              label: day,
              value: (data.bestDays.find(d => d.day === day) || {}).bookings || 0,
            }))}
            max={Math.max(...data.bestDays.map(d => d.bookings), 1)}
            color="#1D4ED8"
          />
        </div>
        <div style={s.card}>
          <CardTitle>Bookings by Hour</CardTitle>
          {data.bestHours.length > 0 ? (
            <HeatBars
              items={data.bestHours.slice(0, 8)}
              max={Math.max(...data.bestHours.map(h => h.bookings), 1)}
              color="#7C3AED"
            />
          ) : (
            <div style={s.empty}>No hour data yet</div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

function SectionTitle({ children }) {
  return <div style={s.sectionTitle}>{children}</div>;
}

function CardTitle({ children }) {
  return <div style={s.cardTitle}>{children}</div>;
}

function CardSub({ children }) {
  return <div style={s.cardSub}>{children}</div>;
}

function KpiCard({ label, value, sub, accent, icon, warning }) {
  return (
    <div style={{ ...s.kpiCard, borderTop: `3px solid ${accent}` }}>
      <div style={s.kpiTop}>
        <span style={s.kpiIcon}>{icon}</span>
        {warning && <span style={{ fontSize: 13, color: '#F59E0B' }}>⚠</span>}
      </div>
      <div style={{ ...s.kpiValue, color: accent }}>{value}</div>
      <div style={s.kpiLabel}>{label}</div>
      <div style={s.kpiSub}>{sub}</div>
    </div>
  );
}

function RecEngineCard({ rec }) {
  return (
    <div style={s.card}>
      <CardTitle>Recommendation Engine Health</CardTitle>
      <CardSub>Is the smart slot picker working?</CardSub>
      <div style={{ marginTop: 16 }}>
        <div style={s.recRow}>
          <span style={s.recLabel}>Recommendations Shown</span>
          <span style={s.recValue}>{rec.shown.toLocaleString()}</span>
        </div>
        <div style={s.recRow}>
          <span style={s.recLabel}>Accepted</span>
          <span style={s.recValue}>{rec.accepted.toLocaleString()}</span>
        </div>
        <div style={s.recRow}>
          <span style={s.recLabel}>Rejected / Skipped</span>
          <span style={s.recValue}>{rec.rejected.toLocaleString()}</span>
        </div>
        <div style={{ ...s.recRow, borderTop: '1px solid #E0E3E7', marginTop: 8, paddingTop: 8 }}>
          <span style={s.recLabel}>Acceptance Rate</span>
          <RateBadge rate={rec.acceptance_rate} />
        </div>
      </div>
      {(rec.show_rate_accepted != null || rec.show_rate_rejected != null) && (
        <div style={s.recComparison}>
          <div style={s.recCompareItem}>
            <div style={s.recCompareVal}>{rec.show_rate_accepted != null ? `${rec.show_rate_accepted}%` : '—'}</div>
            <div style={s.recCompareLabel}>Show rate<br/>when accepted</div>
          </div>
          <div style={{ ...s.recCompareDivider }} />
          <div style={s.recCompareItem}>
            <div style={{ ...s.recCompareVal, color: '#DC2626' }}>{rec.show_rate_rejected != null ? `${rec.show_rate_rejected}%` : '—'}</div>
            <div style={s.recCompareLabel}>Show rate<br/>when rejected</div>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotLeaderboard({ slots }) {
  return (
    <div style={s.card}>
      <CardTitle>Slot Leaderboard</CardTitle>
      <CardSub>Top booking times by volume</CardSub>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Slot</th>
            <th style={{ ...s.th, textAlign: 'right' }}>Booked</th>
            <th style={{ ...s.th, textAlign: 'right' }}>Showed</th>
            <th style={{ ...s.th, textAlign: 'right' }}>Closed</th>
            <th style={{ ...s.th, textAlign: 'right' }}>Show %</th>
          </tr>
        </thead>
        <tbody>
          {slots.length === 0 ? (
            <tr><td colSpan={5} style={{ ...s.td, color: '#9CA3AF', textAlign: 'center' }}>No data yet</td></tr>
          ) : slots.map((s2, i) => (
            <tr key={s2.slot} style={{ background: i % 2 === 0 ? '#FAFAFA' : '#fff' }}>
              <td style={s.td}><span style={s.slotName}>{s2.slot}</span></td>
              <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{s2.booked}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{s2.showed}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{s2.closed}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>
                {s2.show_rate != null ? <RateBadge rate={s2.show_rate} small /> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const topVal = Math.max(...steps.map(s => s.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {steps.map((step, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const pct  = prev && prev > 0 ? Math.round((step.value / prev) * 100) : null;
        const w    = Math.max(Math.round((step.value / topVal) * 100), 3);
        return (
          <div key={step.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#4B5563' }}>{step.label}</span>
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                {pct != null ? `${pct}% of prev` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 24, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${w}%`, background: step.color, borderRadius: 4, transition: 'width .5s ease' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1A2B3C', width: 60, textAlign: 'right', flexShrink: 0 }}>
                {step.value.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AttributionTable({ rows }) {
  if (!rows || rows.length === 0) return <div style={s.empty}>No attribution data yet</div>;
  const SOURCE_ICONS = {
    direct: '🌐', facebook_lead: '📘', closebot: '🤖',
    sms: '💬', email: '📧', retargeting: '🎯',
  };
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Source</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Booked</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Showed</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Show %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.source} style={{ background: i % 2 === 0 ? '#FAFAFA' : '#fff' }}>
            <td style={s.td}>
              <span style={{ marginRight: 6 }}>{SOURCE_ICONS[row.source] || '📌'}</span>
              {row.label}
            </td>
            <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{row.booked}</td>
            <td style={{ ...s.td, textAlign: 'right' }}>{row.showed}</td>
            <td style={{ ...s.td, textAlign: 'right' }}>
              {row.show_rate != null ? <RateBadge rate={row.show_rate} small /> : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RepTable({ reps }) {
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Consultant</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Booked</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Showed</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Closed</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Show Rate</th>
          <th style={{ ...s.th, textAlign: 'right' }}>Close Rate</th>
        </tr>
      </thead>
      <tbody>
        {reps.map((rep, i) => {
          const showRate  = rep.booked  > 0 ? Math.round((rep.showed / rep.booked)  * 100) : null;
          const closeRate = rep.showed > 0 ? Math.round((rep.closed / rep.showed) * 100) : null;
          const shortName = rep.email.split('@')[0];
          return (
            <tr key={rep.email} style={{ background: i % 2 === 0 ? '#FAFAFA' : '#fff' }}>
              <td style={s.td}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={s.avatar}>{shortName[0].toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2B3C' }}>{shortName}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>{rep.email}</div>
                  </div>
                </div>
              </td>
              <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{rep.booked}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{rep.showed}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>{rep.closed}</td>
              <td style={{ ...s.td, textAlign: 'right' }}>
                {showRate  != null ? <RateBadge rate={showRate}  small /> : '—'}
              </td>
              <td style={{ ...s.td, textAlign: 'right' }}>
                {closeRate != null ? <RateBadge rate={closeRate} small thresholds={[20, 10]} /> : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DelayTable({ rows }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      {rows.map(row => (
        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 70, fontSize: 12, color: '#4B5563', flexShrink: 0 }}>{row.label}</div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 16, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
              {row.show_rate != null && (
                <div style={{
                  height: '100%',
                  width: `${row.show_rate}%`,
                  background: row.show_rate >= 80 ? '#16A34A' : row.show_rate >= 60 ? '#F59E0B' : '#DC2626',
                  borderRadius: 3,
                  transition: 'width .5s ease',
                }} />
              )}
            </div>
          </div>
          <div style={{ width: 36, fontSize: 12, fontWeight: 600, color: '#1A2B3C', textAlign: 'right', flexShrink: 0 }}>
            {row.show_rate != null ? `${row.show_rate}%` : '—'}
          </div>
          <div style={{ width: 28, fontSize: 11, color: '#9CA3AF', textAlign: 'right', flexShrink: 0 }}>
            {row.booked > 0 ? row.booked : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarAddCard({ cal }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ ...s.compareBox, borderColor: '#16A34A22', background: '#F0FDF4' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#16A34A' }}>
            {cal.show_rate_added != null ? `${cal.show_rate_added}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#16A34A', marginTop: 2 }}>Show rate</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>Added to calendar</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>({cal.added_count} bookings)</div>
        </div>
        <div style={{ ...s.compareBox, borderColor: '#DC262622', background: '#FFF5F5' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#DC2626' }}>
            {cal.show_rate_not_added != null ? `${cal.show_rate_not_added}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#DC2626', marginTop: 2 }}>Show rate</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>Didn't add</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>({cal.not_added_count} bookings)</div>
        </div>
      </div>
      <div style={s.calChipRow}>
        <CalChip icon="📅" label="Google"  value={cal.google}  />
        <CalChip icon="🍎" label="Apple"   value={cal.apple}   />
        <CalChip icon="📧" label="Outlook" value={cal.outlook} />
      </div>
    </div>
  );
}

function VelocityCard({ stats, buckets }) {
  return (
    <div style={{ marginTop: 12 }}>
      {stats ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Avg',    value: fmtMins(stats.avg)    },
            { label: 'Median', value: fmtMins(stats.median) },
            { label: 'Fastest', value: fmtMins(stats.min)   },
            { label: 'Slowest', value: fmtMins(stats.max)   },
          ].map(stat => (
            <div key={stat.label} style={s.velStat}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1A2B3C' }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: '#9CA3AF' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>Track page views to see velocity</div>
      )}
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>
        Velocity → Show Rate
      </div>
      {buckets.map(b => (
        <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 60, fontSize: 11, color: '#4B5563', flexShrink: 0 }}>{b.label}</div>
          <div style={{ flex: 1, height: 14, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
            {b.show_rate != null && (
              <div style={{
                height: '100%',
                width: `${b.show_rate}%`,
                background: b.show_rate >= 80 ? '#16A34A' : b.show_rate >= 60 ? '#F59E0B' : '#DC2626',
                borderRadius: 3,
                transition: 'width .5s ease',
              }} />
            )}
          </div>
          <div style={{ width: 32, fontSize: 11, fontWeight: 600, color: '#1A2B3C', textAlign: 'right', flexShrink: 0 }}>
            {b.show_rate != null ? `${b.show_rate}%` : '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

function QualityBar({ data }) {
  const total = (data.healthDist.green + data.healthDist.yellow + data.healthDist.red) || 1;
  const gPct  = Math.round((data.healthDist.green  / total) * 100);
  const yPct  = Math.round((data.healthDist.yellow / total) * 100);
  const rPct  = 100 - gPct - yPct;
  return (
    <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 14, background: '#EAECEF' }}>
      <div style={{ width: `${gPct}%`, background: '#16A34A' }} />
      <div style={{ width: `${yPct}%`, background: '#F59E0B' }} />
      <div style={{ width: `${rPct}%`, background: '#DC2626' }} />
    </div>
  );
}

function Bucket({ emoji, label, count, color, bg }) {
  return (
    <div style={{ flex: 1, borderRadius: 6, padding: '10px 12px', textAlign: 'center', background: bg, border: `1px solid ${color}22` }}>
      <div style={{ fontSize: 16, marginBottom: 4 }}>{emoji}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function HeatBars({ items, max, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => {
        const pct = max > 0 ? Math.round((item.value / max) * 100) : 0;
        return (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, fontSize: 12, color: '#4B5563', flexShrink: 0, textAlign: 'right' }}>{item.label}</div>
            <div style={{ flex: 1, height: 20, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.max(pct, 2)}%`,
                background: color,
                opacity: 0.12 + (pct / 100) * 0.88,
                borderRadius: 3,
                transition: 'width .5s ease',
              }} />
            </div>
            <div style={{ width: 24, fontSize: 12, color: '#6B7280', textAlign: 'right', flexShrink: 0 }}>{item.value}</div>
          </div>
        );
      })}
    </div>
  );
}

function CalChip({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#F9FAFB', borderRadius: 5, border: '1px solid #E0E3E7', marginBottom: 6 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 12, color: '#4B5563' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#1A2B3C' }}>{value}</span>
    </div>
  );
}

function RateBadge({ rate, small, thresholds = [70, 50] }) {
  const [hi, lo] = thresholds;
  const color = rate >= hi ? '#16A34A' : rate >= lo ? '#B45309' : '#DC2626';
  const bg    = rate >= hi ? '#DCFCE7'  : rate >= lo ? '#FEF3C7'  : '#FEE2E2';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMins(mins) {
  if (mins == null) return '—';
  if (mins < 60)    return `${mins}m`;
  if (mins < 1440)  return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page:         { minHeight: '100vh', background: '#F0F2F5', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 50, background: '#33485E', position: 'sticky', top: 0, zIndex: 10 },
  headerLeft:   { display: 'flex', alignItems: 'center', gap: 28 },
  logo:         { fontWeight: 600, fontSize: 15, color: '#FFFFFF', letterSpacing: '-0.2px', flexShrink: 0 },
  nav:          { display: 'flex', gap: 2 },
  navLink:      { fontSize: 13, color: '#A8BED0', textDecoration: 'none', padding: '7px 14px', borderRadius: 3, fontWeight: 400 },
  navActive:    { color: '#FFFFFF', background: 'rgba(255,255,255,.13)' },
  headerRight:  { display: 'flex', alignItems: 'center', gap: 12 },
  headerUser:   { fontSize: 13, color: '#A8BED0' },
  signOutBtn:   { fontSize: 12, color: '#A8BED0', background: 'transparent', border: '1px solid rgba(255,255,255,.18)', borderRadius: 3, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },

  main:         { maxWidth: 1200, margin: '0 auto', padding: '24px 20px 60px' },
  empty:        { textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 },
  loadingWrap:  { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 16 },
  spinner:      { width: 32, height: 32, borderRadius: '50%', border: '3px solid #D8DCE0', borderTopColor: '#1D4ED8', animation: 'spin 0.8s linear infinite' },
  loadingText:  { color: '#6B7280', fontSize: 14 },

  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 28, marginBottom: 10 },

  card:         { background: '#fff', borderRadius: 6, border: '1px solid #E0E3E7', padding: '16px 18px', marginBottom: 0 },
  cardTitle:    { fontSize: 13, fontWeight: 600, color: '#1A2B3C', marginBottom: 2 },
  cardSub:      { fontSize: 11, color: '#9CA3AF', marginBottom: 0 },

  kpiRow:       { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 0 },
  kpiCard:      { background: '#fff', borderRadius: 6, border: '1px solid #E0E3E7', padding: '14px 16px' },
  kpiTop:       { display: 'flex', justifyContent: 'space-between', marginBottom: 8 },
  kpiIcon:      { fontSize: 16 },
  kpiValue:     { fontSize: 26, fontWeight: 700, lineHeight: 1, marginBottom: 3 },
  kpiLabel:     { fontSize: 11, fontWeight: 600, color: '#4B5563', marginBottom: 2 },
  kpiSub:       { fontSize: 10, color: '#9CA3AF' },

  twoCol:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 },
  threeCol:     { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 0 },

  table:        { width: '100%', borderCollapse: 'collapse', marginTop: 12 },
  th:           { fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 8px', borderBottom: '1px solid #E0E3E7', textAlign: 'left' },
  td:           { fontSize: 12, color: '#1A2B3C', padding: '8px 8px', borderBottom: '1px solid #F3F4F6' },

  slotName:     { fontSize: 12, fontWeight: 500, color: '#1A2B3C' },

  recRow:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F3F4F6' },
  recLabel:     { fontSize: 12, color: '#4B5563' },
  recValue:     { fontSize: 13, fontWeight: 600, color: '#1A2B3C' },
  recComparison:{ display: 'flex', gap: 0, marginTop: 14, border: '1px solid #E0E3E7', borderRadius: 6, overflow: 'hidden' },
  recCompareItem:{ flex: 1, textAlign: 'center', padding: '12px 8px' },
  recCompareDivider:{ width: 1, background: '#E0E3E7' },
  recCompareVal: { fontSize: 22, fontWeight: 700, color: '#16A34A', marginBottom: 4 },
  recCompareLabel:{ fontSize: 10, color: '#6B7280', lineHeight: 1.4 },

  bucketRow:    { display: 'flex', gap: 10, marginTop: 12 },

  compareBox:   { flex: 1, borderRadius: 6, border: '1px solid', padding: '12px', textAlign: 'center' },
  calChipRow:   { marginTop: 4 },

  velStat:      { flex: 1, background: '#F9FAFB', borderRadius: 5, border: '1px solid #E0E3E7', padding: '8px 10px', textAlign: 'center', minWidth: 0 },

  avatar:       { width: 30, height: 30, borderRadius: '50%', background: '#33485E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },
};
