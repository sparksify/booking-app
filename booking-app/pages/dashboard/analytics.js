import { useState, useEffect } from 'react';
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
      <Head><title>Analytics — Booking Dashboard</title></Head>
      <div style={s.page}>
        <header style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={s.headerTitle}>Analytics</span>
            <Link href="/dashboard" style={s.navLink}>← Dashboard</Link>
            <Link href="/dashboard/leads" style={s.navLink}>Lead Pipeline</Link>
          </div>
          <span style={s.headerUser}>{session?.user?.email}</span>
        </header>

        <main style={s.main}>
          {loading ? (
            <div style={s.empty}>Loading analytics…</div>
          ) : !data ? (
            <div style={s.empty}>Could not load analytics.</div>
          ) : (
            <>
              {/* ── Booking Funnel ── */}
              <Section title="Booking Funnel">
                <div style={s.funnelRow}>
                  {funnelSteps(data.funnel).map((step, i, arr) => (
                    <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                      <div style={s.funnelBox}>
                        <div style={s.funnelNum}>{step.value.toLocaleString()}</div>
                        <div style={s.funnelLabel}>{step.label}</div>
                        {i > 0 && arr[i - 1].value > 0 && (
                          <div style={s.funnelPct}>
                            {Math.round((step.value / arr[i - 1].value) * 100)}%
                          </div>
                        )}
                      </div>
                      {i < arr.length - 1 && <div style={s.funnelArrow}>→</div>}
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── Recommendation Engine ── */}
              <Section title="Recommended Slot Performance">
                <div style={s.statGrid}>
                  <StatCard label="Times Shown"    value={data.recommendation.shown} />
                  <StatCard label="Accepted"        value={data.recommendation.accepted} color="#16A34A" />
                  <StatCard label="Rejected"        value={data.recommendation.rejected} color="#DC2626" />
                  <StatCard label="Acceptance Rate" value={`${data.recommendation.acceptance_rate}%`} color="#1D4ED8" />
                </div>
              </Section>

              {/* ── Time to Book ── */}
              <Section title="Booking Speed">
                <div style={s.statGrid}>
                  <StatCard
                    label="Avg Time to Book"
                    value={data.avgTimeToBook != null ? `${data.avgTimeToBook} min` : '—'}
                    sub="From page view to booking"
                  />
                  <StatCard label="Total Events Tracked" value={data.totalEvents.toLocaleString()} />
                </div>
              </Section>

              {/* ── Calendar Adds ── */}
              <Section title="Calendar Add Clicks">
                <div style={s.statGrid}>
                  <StatCard label="Google Calendar" value={data.calendarAdds.google} />
                  <StatCard label="Apple Calendar"  value={data.calendarAdds.apple} />
                  <StatCard label="Outlook"         value={data.calendarAdds.outlook} />
                  <StatCard label="Total"           value={data.calendarAdds.total} color="#1D4ED8" />
                </div>
              </Section>

              {/* ── Best Days ── */}
              <Section title="Best Booking Days">
                <BarChart
                  items={data.bestDays}
                  labelKey="day"
                  valueKey="bookings"
                  max={Math.max(...data.bestDays.map(d => d.bookings), 1)}
                />
              </Section>

              {/* ── Best Times ── */}
              {data.bestHours.length > 0 && (
                <Section title="Best Booking Times">
                  <BarChart
                    items={data.bestHours}
                    labelKey="label"
                    valueKey="bookings"
                    max={Math.max(...data.bestHours.map(h => h.bookings), 1)}
                    color="#7C3AED"
                  />
                </Section>
              )}

              {/* ── Rep Performance ── */}
              {data.repStats.length > 0 && (
                <Section title="Rep Performance">
                  <div style={s.tableWrap}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          {['Rep', 'Booked', 'Showed', 'Show Rate'].map(h => (
                            <th key={h} style={s.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.repStats.map(rep => (
                          <tr key={rep.email} style={s.tr}>
                            <td style={s.td}>{rep.email}</td>
                            <td style={s.td}>{rep.booked}</td>
                            <td style={s.td}>{rep.showed}</td>
                            <td style={s.td}>
                              {rep.booked > 0
                                ? `${Math.round((rep.showed / rep.booked) * 100)}%`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={s.section}>
      <h2 style={s.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={s.statCard}>
      <div style={{ ...s.statNum, color: color || '#111827' }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
      {sub && <div style={s.statSub}>{sub}</div>}
    </div>
  );
}

function BarChart({ items, labelKey, valueKey, max, color = '#1D4ED8' }) {
  return (
    <div style={s.barChart}>
      {items.map(item => (
        <div key={item[labelKey]} style={s.barRow}>
          <div style={s.barLabel}>{item[labelKey]}</div>
          <div style={s.barTrack}>
            <div
              style={{
                ...s.barFill,
                width: `${max > 0 ? Math.round((item[valueKey] / max) * 100) : 0}%`,
                background: color,
              }}
            />
          </div>
          <div style={s.barVal}>{item[valueKey]}</div>
        </div>
      ))}
    </div>
  );
}

function funnelSteps(f) {
  return [
    { label: 'Leads',      value: f.leads      || 0 },
    { label: 'Page Views', value: f.page_views  || 0 },
    { label: 'Booked',     value: f.booked      || 0 },
    { label: 'Showed',     value: f.showed      || 0 },
    { label: 'Closed',     value: f.closed      || 0 },
  ];
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page:       { minHeight: '100vh', background: '#F9FAFB', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' },
  header:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: 56, background: '#fff', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 10 },
  headerTitle:{ fontWeight: 700, fontSize: 16, color: '#111827' },
  headerUser: { fontSize: 13, color: '#6B7280' },
  navLink:    { fontSize: 13, color: '#1D4ED8', textDecoration: 'none' },
  main:       { maxWidth: 1000, margin: '0 auto', padding: '32px 24px' },
  empty:      { textAlign: 'center', padding: 64, color: '#6B7280' },
  section:    { background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 24, marginBottom: 24 },
  sectionTitle:{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 20 },

  // Funnel
  funnelRow:  { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0 },
  funnelBox:  { textAlign: 'center', padding: '16px 20px', minWidth: 110 },
  funnelNum:  { fontSize: 28, fontWeight: 800, color: '#111827' },
  funnelLabel:{ fontSize: 12, color: '#6B7280', marginTop: 2 },
  funnelPct:  { fontSize: 11, color: '#16A34A', marginTop: 4, fontWeight: 600 },
  funnelArrow:{ fontSize: 20, color: '#D1D5DB', padding: '0 4px' },

  // Stat cards
  statGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 16 },
  statCard:   { background: '#F9FAFB', borderRadius: 8, padding: '16px 20px', border: '1px solid #E5E7EB' },
  statNum:    { fontSize: 28, fontWeight: 800, color: '#111827' },
  statLabel:  { fontSize: 12, color: '#6B7280', marginTop: 2 },
  statSub:    { fontSize: 11, color: '#9CA3AF', marginTop: 4 },

  // Bar chart
  barChart:   { display: 'flex', flexDirection: 'column', gap: 10 },
  barRow:     { display: 'flex', alignItems: 'center', gap: 12 },
  barLabel:   { width: 72, fontSize: 13, color: '#374151', textAlign: 'right', flexShrink: 0 },
  barTrack:   { flex: 1, height: 20, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  barFill:    { height: '100%', borderRadius: 4, transition: 'width .4s ease' },
  barVal:     { width: 32, fontSize: 13, color: '#6B7280', textAlign: 'right', flexShrink: 0 },

  // Table
  tableWrap:  { overflowX: 'auto' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:         { textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' },
  tr:         { borderBottom: '1px solid #F3F4F6' },
  td:         { padding: '10px 12px', color: '#111827' },
};
