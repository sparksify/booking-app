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
      <Head><title>Analytics — Booking Dashboard</title></Head>
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
            <Link href="/dashboard" style={s.navLink}>⚙ Settings</Link>
            <span style={s.headerUser}>{session?.user?.email}</span>
            <button style={s.signOutBtn} onClick={() => signOut({ callbackUrl: '/dashboard/login' })}>
              Sign out
            </button>
          </div>
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
  page:        { minHeight: '100vh', background: '#F5F6F7', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },

  // QB dark header — precise color
  header:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 50, background: '#33485E', position: 'sticky', top: 0, zIndex: 10 },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 28 },
  logo:        { fontWeight: 600, fontSize: 15, color: '#FFFFFF', letterSpacing: '-0.2px', flexShrink: 0 },
  nav:         { display: 'flex', gap: 2 },
  navLink:     { fontSize: 13, color: '#A8BED0', textDecoration: 'none', padding: '7px 14px', borderRadius: 3, fontWeight: 400 },
  navActive:   { color: '#FFFFFF', background: 'rgba(255,255,255,.13)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  headerUser:  { fontSize: 13, color: '#A8BED0' },
  signOutBtn:  { fontSize: 12, fontWeight: 400, color: '#A8BED0', background: 'transparent', border: '1px solid rgba(255,255,255,.18)', borderRadius: 3, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },

  main:        { maxWidth: 1000, margin: '0 auto', padding: '24px 20px' },
  empty:       { textAlign: 'center', padding: 64, color: '#6B7280' },

  // Cards — QB white, thin border, no shadow
  section:     { background: '#fff', borderRadius: 4, border: '1px solid #D8DCE0', padding: '20px 22px', marginBottom: 16 },
  sectionTitle:{ fontSize: 14, fontWeight: 600, color: '#1A2B3C', marginBottom: 16 },

  // Funnel
  funnelRow:   { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0 },
  funnelBox:   { textAlign: 'center', padding: '14px 18px', minWidth: 100 },
  funnelNum:   { fontSize: 26, fontWeight: 600, color: '#1A2B3C' },
  funnelLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  funnelPct:   { fontSize: 11, color: '#2CA01C', marginTop: 4, fontWeight: 600 },
  funnelArrow: { fontSize: 18, color: '#C8CDD2', padding: '0 4px' },

  // Stat cards
  statGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 12 },
  statCard:    { background: '#F5F6F7', borderRadius: 4, padding: '14px 16px', border: '1px solid #D8DCE0' },
  statNum:     { fontSize: 26, fontWeight: 600, color: '#1A2B3C' },
  statLabel:   { fontSize: 11, color: '#6B7280', marginTop: 2 },
  statSub:     { fontSize: 11, color: '#9CA3AF', marginTop: 4 },

  // Bar chart
  barChart:    { display: 'flex', flexDirection: 'column', gap: 10 },
  barRow:      { display: 'flex', alignItems: 'center', gap: 12 },
  barLabel:    { width: 72, fontSize: 12, color: '#4A5568', textAlign: 'right', flexShrink: 0 },
  barTrack:    { flex: 1, height: 16, background: '#EAECEF', borderRadius: 2, overflow: 'hidden' },
  barFill:     { height: '100%', borderRadius: 2, transition: 'width .4s ease' },
  barVal:      { width: 32, fontSize: 12, color: '#6B7280', textAlign: 'right', flexShrink: 0 },

  // Table
  tableWrap:   { overflowX: 'auto' },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:          { textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #D8DCE0', whiteSpace: 'nowrap', fontSize: 11, letterSpacing: '.4px' },
  tr:          { borderBottom: '1px solid #EBEBEB' },
  td:          { padding: '10px 12px', color: '#1A2B3C' },
};
