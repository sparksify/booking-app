import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../api/auth/[...nextauth]';
import { guardDashboardPage } from '@/lib/pageAccess';
import { visibleNav } from '@/lib/nav';
import BrandLogo from '@/components/BrandLogo';
import SidebarUser from '@/components/SidebarUser';

export async function getServerSideProps(context) {
  const gate = await guardDashboardPage(context, '/dashboard/pipeline');
  if (gate.redirect) return gate;
  return {
    props: {
      perms:       gate.perms,
      platformLogo: gate.logo,
      navOrder:    gate.navOrder,
    },
  };
}

const INDUSTRIES = [
  'Food & Beverage','Health & Wellness','Fitness','Beauty & Personal Care',
  'Pet Services','Auto Services','Home Services','Senior Care',
  'Cleaning Services',"Children's Education",'Real Estate Services','Marketing & Media',
];

const STAGE_LABELS = {
  idle:     { text: 'Ready',          color: '#94A3B8' },
  scout:    { text: 'Scouting...',    color: '#F59E0B' },
  filter:   { text: 'Filtering...',   color: '#F59E0B' },
  discover: { text: 'Discovering...', color: '#F59E0B' },
  enrich:   { text: 'Enriching...',   color: '#F59E0B' },
  outreach: { text: 'Loading...',     color: '#F59E0B' },
  done:     { text: 'Complete',       color: '#16A34A' },
  error:    { text: 'Error',          color: '#DC2626' },
};

function SideIcon({ name }) {
  const p = { width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', style: { display: 'block' } };
  if (name === 'dashboard') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === 'leads')     return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  if (name === 'clients')   return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === 'meetings')  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (name === 'pipeline')  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>;
  if (name === 'nurture')   return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
  if (name === 'settings')  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
  if (name === 'cq')        return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
  return null;
}

export default function PipelinePage({ perms = {}, platformLogo = null, navOrder = null }) {
  const [city, setCity]       = useState('');
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [stage, setStage]     = useState('idle');
  const [log, setLog]         = useState([]);
  const [results, setResults] = useState(null);
  const [error, setError]     = useState(null);

  function addLog(msg) {
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`]);
  }

  async function callStage(endpoint, body) {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(err.error || r.statusText);
    }
    return r.json();
  }

  async function runPipeline() {
    if (!city.trim()) return;
    setStage('idle');
    setLog([]);
    setResults(null);
    setError(null);

    try {
      setStage('scout');
      addLog(`Scouting ${industry} businesses in ${city}...`);
      const scoutData = await callStage('/api/pipeline/scout', { city, industry });
      addLog(`Found ${scoutData.count} businesses`);
      if (!scoutData.businesses?.length) throw new Error('No businesses found. Try a different city or industry.');

      setStage('filter');
      addLog(`Checking ${scoutData.businesses.length} businesses for franchise status...`);
      const filterData = await callStage('/api/pipeline/filter', { businesses: scoutData.businesses });
      addLog(`${filterData.filtered} franchises removed — ${filterData.passed} independents remaining`);
      if (!filterData.businesses?.length) throw new Error('All businesses were franchises. Try a different search.');

      setStage('discover');
      addLog(`Hunting owner names and signals for ${filterData.businesses.length} businesses...`);
      const discoverData = await callStage('/api/pipeline/discover', { businesses: filterData.businesses });
      addLog(`Owner names found: ${discoverData.owner_found} of ${discoverData.total} (${discoverData.hit_rate}%)`);

      setStage('enrich');
      addLog(`Enriching emails for ${discoverData.businesses.length} businesses...`);
      const enrichData = await callStage('/api/pipeline/enrich', { businesses: discoverData.businesses });
      addLog(`Emails found: ${enrichData.enriched_count} of ${enrichData.total} (${enrichData.hit_rate}%)`);

      const enriched = enrichData.results.filter(b => b.enriched);
      if (!enriched.length) {
        addLog('No emails found — pipeline complete with no outreach loaded');
        setStage('done');
        setResults({ scout: scoutData, filter: filterData, discover: discoverData, enrich: enrichData, outreach: null });
        return;
      }

      setStage('outreach');
      addLog(`Writing sequences and loading ${enriched.length} contacts to Smartlead...`);
      const outreachData = await callStage('/api/pipeline/outreach', { businesses: enriched });
      addLog(`Loaded: ${outreachData.loaded} | Skipped: ${outreachData.skipped} | Failed: ${outreachData.failed}`);

      setStage('done');
      addLog('Pipeline complete ✓');
      setResults({ scout: scoutData, filter: filterData, discover: discoverData, enrich: enrichData, outreach: outreachData });

    } catch (err) {
      setStage('error');
      setError(err.message);
      addLog(`Error: ${err.message}`);
    }
  }

  const stageInfo = STAGE_LABELS[stage] || STAGE_LABELS.idle;
  const isRunning = !['idle', 'done', 'error'].includes(stage);

  return (
    <>
      <Head><title>Genesis Agent — KANSO</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}*{box-sizing:border-box}`}</style>
      <div style={s.page}>

        {/* Sidebar */}
        <aside style={s.sidebar}>
          <div style={s.sideLogoWrap}>
            <div style={s.sideLogoRow}>
              <BrandLogo logo={platformLogo} />
            </div>
          </div>
          <nav style={s.sideNav}>
            {visibleNav(perms, navOrder).map(({ href, label, icon }) => {
              const active = href === '/dashboard/pipeline';
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
            <SidebarUser />
          </div>
        </aside>

        {/* Main */}
        <div style={s.mainCol}>
          <div style={s.topBar}>
            <div>
              <div style={s.topTitle}>Genesis Agent</div>
              <div style={s.topDate}>Scout → Filter → Discover → Enrich → Outreach</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: stageInfo.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {stageInfo.text}
              </span>
              <span style={{ fontSize: 11, background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 4, padding: '2px 8px', color: '#64748B' }}>v2.5</span>
            </div>
          </div>

          <main style={s.main}>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <input
                value={city}
                onChange={e => setCity(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !isRunning && city.trim() && runPipeline()}
                placeholder="City (e.g. Dallas, TX)"
                disabled={isRunning}
                style={s.input}
              />
              <select
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                disabled={isRunning}
                style={s.select}
              >
                {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
              </select>
              <button
                onClick={runPipeline}
                disabled={isRunning || !city.trim()}
                style={{ ...s.btn, ...(isRunning || !city.trim() ? s.btnDisabled : {}) }}
              >
                {isRunning ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={s.spinner} />
                    Running...
                  </span>
                ) : 'Run Pipeline'}
              </button>
            </div>

            {/* Pipeline Log */}
            {log.length > 0 && (
              <div style={{ ...s.card, marginBottom: 20 }}>
                <div style={s.cardLabel}>Pipeline Log</div>
                {log.map((line, i) => (
                  <div key={i} style={{ fontSize: 13, color: i === log.length - 1 ? '#0F172A' : '#64748B', lineHeight: 1.9, fontWeight: i === log.length - 1 ? 500 : 400 }}>
                    {line}
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#DC2626', fontSize: 13, fontWeight: 500 }}>
                {error}
              </div>
            )}

            {/* Stats row */}
            {results && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Scouted',       value: results.scout?.count ?? 0,              color: '#0057FF' },
                  { label: 'Passed Filter', value: results.filter?.passed ?? 0,            color: '#0057FF' },
                  { label: 'Names Found',   value: results.discover?.owner_found ?? 0,     color: '#F59E0B' },
                  { label: 'Emails Found',  value: results.enrich?.enriched_count ?? 0,    color: '#7C3AED' },
                  { label: 'Loaded',        value: results.outreach?.loaded ?? 0,          color: '#16A34A' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={s.statCard}>
                    <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Prospect cards */}
            {results?.outreach?.results?.filter(r => r.outreach_status === 'loaded').map((biz, i) => (
              <div key={i} style={{ ...s.card, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{biz.business_name}</div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{biz.city} · {biz.industry}</div>
                  </div>
                  <span style={{ fontSize: 11, background: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0', borderRadius: 4, padding: '2px 10px', fontWeight: 700, flexShrink: 0 }}>Loaded</span>
                </div>

                <div style={{ fontSize: 12, color: '#475569', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{biz.email_owner}</span>
                  <span style={{ color: '#CBD5E1' }}>·</span>
                  <span>{biz.email}</span>
                  <span style={{ color: '#CBD5E1' }}>·</span>
                  <span style={{ color: '#94A3B8' }}>{biz.email_source}</span>
                </div>

                {biz.signal && (
                  <div style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
                    "{biz.signal}"
                  </div>
                )}

                {biz.sequence && (
                  <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {[
                        { label: 'Email 1', data: biz.sequence.email1 },
                        { label: 'Email 2', data: biz.sequence.email2 },
                      ].map(({ label, data }) => (
                        <div key={label} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '12px 14px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginBottom: 6 }}>{data.subject}</div>
                          <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{data.body}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

          </main>
        </div>
      </div>
    </>
  );
}

const s = {
  page:             { display: 'flex', minHeight: '100vh', background: '#FAFBFD', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },
  sidebar:          { width: 210, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' },
  sideLogoWrap:     { padding: '20px 16px 16px', borderBottom: '1px solid #E2E8F0' },
  sideLogoRow:      { display: 'flex', alignItems: 'center', gap: 9 },
  sideNav:          { flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' },
  sideNavItem:      { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 7, fontSize: 13, fontWeight: 500, color: '#475569', textDecoration: 'none', transition: 'all .15s' },
  sideNavItemActive:{ background: '#EFF6FF', color: '#0057FF', fontWeight: 600 },
  sideBottom:       { borderTop: '1px solid #E2E8F0', padding: '8px 8px 16px' },
  mainCol:          { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  topBar:           { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', flexShrink: 0, gap: 16 },
  topTitle:         { fontSize: 20, fontWeight: 700, color: '#0F172A' },
  topDate:          { fontSize: 13, color: '#64748B', fontWeight: 400, marginTop: 2 },
  main:             { flex: 1, padding: '20px 24px', overflowY: 'auto' },
  card:             { background: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(15,23,42,.04)' },
  cardLabel:        { fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 },
  statCard:         { background: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(15,23,42,.04)' },
  input:            { flex: 1, minWidth: 200, padding: '9px 14px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 7, color: '#0F172A', fontSize: 13, fontFamily: 'inherit', outline: 'none' },
  select:           { flex: 1, minWidth: 200, padding: '9px 14px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 7, color: '#0F172A', fontSize: 13, fontFamily: 'inherit', outline: 'none' },
  btn:              { padding: '9px 24px', background: '#0057FF', color: '#FFFFFF', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  btnDisabled:      { background: '#E2E8F0', color: '#94A3B8', cursor: 'not-allowed' },
  spinner:          { width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .8s linear infinite', display: 'inline-block' },
};
