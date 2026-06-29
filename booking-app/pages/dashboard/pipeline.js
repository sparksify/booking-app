import { useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { guardDashboardPage } from '@/lib/pageAccess';
import { visibleNav } from '@/lib/nav';
import BrandLogo from '@/components/BrandLogo';
import SidebarUser from '@/components/SidebarUser';

export async function getServerSideProps(context) {
  const gate = await guardDashboardPage(context, '/dashboard/pipeline');
  if (gate.redirect) return gate;
  return { props: { perms: gate.perms, platformLogo: gate.logo, navOrder: gate.navOrder } };
}

const INDUSTRIES = [
  'Food & Beverage','Health & Wellness','Fitness','Beauty & Personal Care',
  'Pet Services','Auto Services','Home Services','Senior Care',
  'Cleaning Services',"Children\'s Education",'Real Estate Services','Marketing & Media',
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

const SOURCE_LABELS = {
  anymail_person:  'Anymail',
  anymail_company: 'Anymail Co',
  fullenrich:      'FullEnrich',
  hunter_person:   'Hunter',
  hunter_domain:   'Hunter Domain',
  not_found:       '—',
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

function Avatar({ name, size = 38 }) {
  const initials = name ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?';
  const colors = ['#0057FF','#7C3AED','#16A34A','#EA580C','#0891B2','#DC2626'];
  const color = colors[initials.charCodeAt(0) % colors.length];
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.35, fontWeight: 700, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

function Badge({ children, color, bg, border }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '1px 7px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function ProspectCard({ biz }) {
  const [expanded, setExpanded]     = useState(false);
  const [phone, setPhone]           = useState(biz.phone || null);
  const [findingPhone, setFinding]  = useState(false);
  const [phoneError, setPhoneError] = useState(null);

  async function findMobile() {
    if (!biz.email_owner || !biz.domain) return;
    setFinding(true);
    setPhoneError(null);
    try {
      const r = await fetch('/api/pipeline/find-mobile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_name: biz.email_owner, domain: biz.domain, business_name: biz.business_name }),
      });
      const d = await r.json();
      if (d.phone) setPhone(d.phone);
      else setPhoneError('Not found');
    } catch (e) {
      setPhoneError('Error');
    }
    setFinding(false);
  }

  const statusColor = biz.outreach_status === 'loaded' ? '#16A34A'
    : biz.outreach_status === 'skipped_duplicate' ? '#F59E0B'
    : '#94A3B8';
  const statusBg = biz.outreach_status === 'loaded' ? '#DCFCE7'
    : biz.outreach_status === 'skipped_duplicate' ? '#FEF3C7'
    : '#F1F5F9';
  const statusBorder = biz.outreach_status === 'loaded' ? '#BBF7D0'
    : biz.outreach_status === 'skipped_duplicate' ? '#FDE68A'
    : '#E2E8F0';
  const statusLabel = biz.outreach_status === 'loaded' ? 'Loaded'
    : biz.outreach_status === 'skipped_duplicate' ? 'Duplicate'
    : biz.outreach_status === 'skipped_no_email' ? 'No Email'
    : biz.outreach_status || 'Pending';

  return (
    <div style={cs.card}>
      {/* Main row */}
      <div style={cs.cardMain}>
        <Avatar name={biz.email_owner || biz.business_name} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Business name */}
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 1 }}>{biz.business_name}</div>

          {/* Owner name + validated */}
          {biz.email_owner && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: '#475569' }}>{biz.email_owner}</span>
              <Badge color="#0057FF" bg="#EFF6FF" border="#BFDBFE">✓ Validated</Badge>
            </div>
          )}

          {/* Email + verified check */}
          {biz.email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 700 }}>✓</span>
              <span style={{ fontSize: 12, color: '#64748B' }}>{biz.email}</span>
              <span style={{ fontSize: 10, color: '#94A3B8' }}>· {SOURCE_LABELS[biz.email_source] || biz.email_source}</span>
            </div>
          )}

          {/* Phone row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            {phone ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, color: '#0057FF' }}>📞</span>
                <span style={{ fontSize: 12, color: '#64748B' }}>{phone}</span>
              </div>
            ) : biz.email_owner && biz.domain ? (
              <button
                onClick={findMobile}
                disabled={findingPhone}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid #E2E8F0', borderRadius: 5, padding: '2px 8px', fontSize: 11, color: findingPhone ? '#94A3B8' : '#0057FF', cursor: findingPhone ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              >
                {findingPhone ? (
                  <><span style={{ width: 9, height: 9, border: '1.5px solid #CBD5E1', borderTopColor: '#0057FF', borderRadius: '50%', display: 'inline-block', animation: 'spin .8s linear infinite' }} />Finding mobile...</>
                ) : (
                  <>📞 Find Mobile</>
                )}
              </button>
            ) : null}
            {phoneError && <span style={{ fontSize: 11, color: '#94A3B8' }}>{phoneError}</span>}
          </div>
        </div>

        {/* Right side stats */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <Badge color={statusColor} bg={statusBg} border={statusBorder}>{statusLabel}</Badge>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {biz.rating && <span style={{ fontSize: 12, color: '#F59E0B', fontWeight: 700 }}>★ {biz.rating}</span>}
            {biz.review_count && <span style={{ fontSize: 12, color: '#64748B' }}>{biz.review_count} reviews</span>}
          </div>
          {biz.sequence && (
            <button onClick={() => setExpanded(e => !e)} style={{ fontSize: 11, color: '#0057FF', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
              {expanded ? '▲ Hide emails' : '▼ View emails'}
            </button>
          )}
        </div>
      </div>

      {/* Signal */}
      {biz.signal && (
        <div style={cs.signal}>"{biz.signal}"</div>
      )}

      {/* Emails */}
      {expanded && biz.sequence && (
        <div style={cs.emails}>
          {[
            { label: 'Email 1', data: biz.sequence.email1 },
            { label: 'Email 2 — day 4', data: biz.sequence.email2 },
          ].map(({ label, data }) => (
            <div key={label} style={cs.emailBlock}>
              <div style={cs.emailLabel}>{label}</div>
              <div style={cs.emailSubject}>{data.subject}</div>
              <div style={cs.emailBody}>{data.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const cs = {
  card:        { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, marginBottom: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,.04)' },
  cardMain:    { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 18px' },
  signal:      { fontSize: 12, color: '#64748B', fontStyle: 'italic', background: '#F8FAFC', borderTop: '1px solid #F1F5F9', padding: '8px 18px' },
  emails:      { borderTop: '1px solid #F1F5F9', padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  emailBlock:  { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 14px' },
  emailLabel:  { fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 },
  emailSubject:{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginBottom: 6 },
  emailBody:   { fontSize: 12, color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap' },
};

// ── Full data table ───────────────────────────────────────────────────────────

function DataTable({ allResults, filterData }) {
  if (!allResults) return null;

  const enriched    = allResults.enrich?.results || [];
  const outreach    = allResults.outreach?.results || [];
  const franchises  = allResults.filter?.filtered_businesses || [];

  // Build enriched map for quick lookup
  const outreachMap = {};
  outreach.forEach(b => { outreachMap[b.email || b.business_name] = b; });

  // All businesses that made it to enrich
  const enrichRows = enriched.map(b => {
    const out = outreachMap[b.email || b.business_name] || {};
    return { ...b, outreach_status: out.outreach_status || (b.enriched ? 'enriched_not_loaded' : 'no_email') };
  });

  const cols = ['Business', 'Owner', 'Email', 'Phone', 'Rating', 'Reviews', 'Source', 'Status'];

  function exportCSV(rows, filename) {
    const franchiseCols = ['Business', 'City', 'Industry', 'Website', 'Phone', 'Rating', 'Reviews', 'Detected As'];
    const isFranchise = filename.includes('franchise');
    const headers = isFranchise ? franchiseCols : cols;

    const csvRows = isFranchise
      ? rows.map(b => [b.business_name, b.city, b.industry, b.website, b.phone, b.rating, b.review_count, b.franchise_check].map(v => `"${v ?? ''}"`).join(','))
      : rows.map(b => [b.business_name, b.email_owner, b.email, b.phone, b.rating, b.review_count, SOURCE_LABELS[b.email_source] || b.email_source, b.outreach_status].map(v => `"${v ?? ''}"`).join(','));

    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function TableSection({ title, rows, color, bg, exportName }) {
    if (!rows.length) return null;
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
            <span style={{ fontSize: 11, background: bg, color, borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>{rows.length}</span>
          </div>
          <button onClick={() => exportCSV(rows, exportName)} style={{ fontSize: 11, color: '#0057FF', background: 'none', border: '1px solid #BFDBFE', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            ↓ Export CSV
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={ts.table}>
            <thead>
              <tr>{cols.map(c => <th key={c} style={ts.th}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((b, i) => (
                <tr key={i} style={{ background: i % 2 ? '#fff' : '#FAFBFD' }}>
                  <td style={ts.td}><span style={{ fontWeight: 600, color: '#0F172A' }}>{b.business_name}</span></td>
                  <td style={ts.td}>{b.email_owner || b.owner_name || '—'}</td>
                  <td style={ts.td}>{b.email ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ color: '#16A34A', fontWeight: 700 }}>✓</span>{b.email}</span> : '—'}</td>
                  <td style={ts.td}>{b.phone || '—'}</td>
                  <td style={ts.td}>{b.rating ? `★ ${b.rating}` : '—'}</td>
                  <td style={ts.td}>{b.review_count || '—'}</td>
                  <td style={ts.td}>{SOURCE_LABELS[b.email_source] || b.email_source || '—'}</td>
                  <td style={ts.td}><StatusChip status={b.outreach_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function FranchiseSection({ rows }) {
    if (!rows.length) return null;
    const franchiseCols = ['Business', 'City', 'Industry', 'Website', 'Phone', 'Rating', 'Reviews', 'Detected As'];
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Franchises Detected</span>
            <span style={{ fontSize: 11, background: '#FEE2E2', color: '#DC2626', borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>{rows.length}</span>
          </div>
          <button onClick={() => exportCSV(rows, 'franchises.csv')} style={{ fontSize: 11, color: '#0057FF', background: 'none', border: '1px solid #BFDBFE', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            ↓ Export CSV
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={ts.table}>
            <thead>
              <tr>{franchiseCols.map(c => <th key={c} style={ts.th}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((b, i) => (
                <tr key={i} style={{ background: i % 2 ? '#fff' : '#FAFBFD' }}>
                  <td style={ts.td}><span style={{ fontWeight: 600, color: '#0F172A' }}>{b.business_name}</span></td>
                  <td style={ts.td}>{b.city}</td>
                  <td style={ts.td}>{b.industry}</td>
                  <td style={ts.td}>{b.website ? <a href={b.website} target="_blank" rel="noopener noreferrer" style={{ color: '#0057FF', fontSize: 12 }}>{b.domain || b.website}</a> : '—'}</td>
                  <td style={ts.td}>{b.phone || '—'}</td>
                  <td style={ts.td}>{b.rating ? `★ ${b.rating}` : '—'}</td>
                  <td style={ts.td}>{b.review_count || '—'}</td>
                  <td style={ts.td}><span style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>{b.franchise_check}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const loaded     = enrichRows.filter(b => b.outreach_status === 'loaded');
  const duplicates = enrichRows.filter(b => b.outreach_status === 'skipped_duplicate');
  const noEmail    = enrichRows.filter(b => b.outreach_status === 'no_email' || b.outreach_status === 'skipped_no_email');
  const noName     = (allResults.discover?.businesses || []).filter(b => !b.owner_name && !enriched.find(e => e.business_name === b.business_name));

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #E2E8F0' }}>
        Full Run Data
      </div>
      <TableSection title="Loaded to Smartlead"   rows={loaded}     color="#16A34A" bg="#DCFCE7" exportName="loaded.csv" />
      <TableSection title="Skipped — Duplicate"   rows={duplicates} color="#F59E0B" bg="#FEF3C7" exportName="duplicates.csv" />
      <TableSection title="Email Not Found"       rows={noEmail}    color="#94A3B8" bg="#F1F5F9" exportName="no-email.csv" />
      <FranchiseSection rows={franchises} />
    </div>
  );
}

function StatusChip({ status }) {
  const map = {
    'loaded':              { label: 'Loaded',     color: '#16A34A', bg: '#DCFCE7' },
    'skipped_duplicate':   { label: 'Duplicate',  color: '#F59E0B', bg: '#FEF3C7' },
    'skipped_no_email':    { label: 'No Email',   color: '#94A3B8', bg: '#F1F5F9' },
    'no_email':            { label: 'No Email',   color: '#94A3B8', bg: '#F1F5F9' },
    'enriched_not_loaded': { label: 'Not Loaded', color: '#64748B', bg: '#F8FAFC' },
    'failed_smartlead':    { label: 'Failed',     color: '#DC2626', bg: '#FEE2E2' },
  };
  const m = map[status] || { label: status || '—', color: '#94A3B8', bg: '#F1F5F9' };
  return <span style={{ fontSize: 11, fontWeight: 700, color: m.color, background: m.bg, borderRadius: 10, padding: '1px 7px' }}>{m.label}</span>;
}

const ts = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th:    { fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 12px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', whiteSpace: 'nowrap' },
  td:    { padding: '10px 12px', borderBottom: '1px solid #F1F5F9', color: '#475569', verticalAlign: 'middle' },
};

export default function PipelinePage({ perms = {}, platformLogo = null, navOrder = null }) {
  const [city, setCity]           = useState('');
  const [industry, setIndustry]   = useState(INDUSTRIES[0]);
  const [stage, setStage]         = useState('idle');
  const [log, setLog]             = useState([]);
  const [logOpen, setLogOpen]     = useState(false);
  const [results, setResults]     = useState(null);
  const [error, setError]         = useState(null);

  const addLog = useCallback((msg) => {
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`]);
  }, []);

  async function callStage(endpoint, body) {
    const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const err = await r.json().catch(() => ({ error: r.statusText })); throw new Error(err.error || r.statusText); }
    return r.json();
  }

  async function runPipeline() {
    if (!city.trim()) return;
    setStage('idle'); setLog([]); setLogOpen(false); setResults(null); setError(null);

    try {
      setStage('scout');
      addLog(`Scouting ${industry} businesses in ${city}...`);
      const scoutData = await callStage('/api/pipeline/scout', { city, industry });
      addLog(`Found ${scoutData.count} businesses`);
      if (!scoutData.businesses?.length) throw new Error('No businesses found.');

      setStage('filter');
      addLog(`Checking ${scoutData.businesses.length} for franchise status...`);
      const filterData = await callStage('/api/pipeline/filter', { businesses: scoutData.businesses });
      addLog(`${filterData.filtered} franchises removed — ${filterData.passed} independents remaining`);
      if (!filterData.businesses?.length) throw new Error('All businesses were franchises.');

      setStage('discover');
      addLog(`Hunting owner names for ${filterData.businesses.length} businesses...`);
      const discoverData = await callStage('/api/pipeline/discover', { businesses: filterData.businesses });
      addLog(`Owner names found: ${discoverData.owner_found} of ${discoverData.total} (${discoverData.hit_rate}%)`);

      setStage('enrich');
      addLog(`Enriching emails for ${discoverData.businesses.length} businesses...`);
      const enrichData = await callStage('/api/pipeline/enrich', { businesses: discoverData.businesses });
      addLog(`Emails found: ${enrichData.enriched_count} of ${enrichData.total} (${enrichData.hit_rate}%)`);

      const enriched = enrichData.results.filter(b => b.enriched);
      if (!enriched.length) {
        addLog('No emails found — pipeline complete');
        setStage('done');
        setResults({ scout: scoutData, filter: filterData, discover: discoverData, enrich: enrichData, outreach: null });
        return;
      }

      setStage('outreach');
      addLog(`Writing sequences and loading ${enriched.length} contacts...`);
      const outreachData = await callStage('/api/pipeline/outreach', { businesses: enriched });
      addLog(`Loaded: ${outreachData.loaded} | Skipped: ${outreachData.skipped} | Failed: ${outreachData.failed}`);

      setStage('done');
      addLog('Pipeline complete ✓');
      setResults({ scout: scoutData, filter: filterData, discover: discoverData, enrich: enrichData, outreach: outreachData });

    } catch (err) {
      setStage('error'); setError(err.message); addLog(`Error: ${err.message}`);
    }
  }

  const stageInfo  = STAGE_LABELS[stage] || STAGE_LABELS.idle;
  const isRunning  = !['idle', 'done', 'error'].includes(stage);
  const isDone     = stage === 'done';

  const statCards = results ? [
    { label: 'Scouted',      value: results.scout?.count ?? 0,            pct: null,                         color: '#0057FF' },
    { label: 'Independent',  value: results.filter?.passed ?? 0,          pct: results.filter?.passed && results.scout?.count ? Math.round((results.filter.passed / results.scout.count) * 100) : null, color: '#0891B2' },
    { label: 'Names Found',  value: results.discover?.owner_found ?? 0,   pct: results.discover?.hit_rate,   color: '#F59E0B' },
    { label: 'Emails Found', value: results.enrich?.enriched_count ?? 0,  pct: results.enrich?.hit_rate,     color: '#7C3AED' },
    { label: 'Loaded',       value: results.outreach?.loaded ?? 0,         pct: results.enrich?.enriched_count ? Math.round(((results.outreach?.loaded ?? 0) / results.enrich.enriched_count) * 100) : null, color: '#16A34A' },
  ] : [];

  const loadedProspects = results?.outreach?.results?.filter(r => r.outreach_status === 'loaded') || [];

  return (
    <>
      <Head><title>Genesis Agent — KANSO</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
      <div style={s.page}>

        <aside style={s.sidebar}>
          <div style={s.sideLogoWrap}><div style={s.sideLogoRow}><BrandLogo logo={platformLogo} /></div></div>
          <nav style={s.sideNav}>
            {visibleNav(perms, navOrder).map(({ href, label, icon }) => {
              const active = href === '/dashboard/pipeline';
              return (
                <Link key={label} href={href} style={{ ...s.sideNavItem, ...(active ? s.sideNavItemActive : {}) }}>
                  <span style={{ color: active ? '#0057FF' : '#9CA3AF', display: 'flex', alignItems: 'center' }}><SideIcon name={icon} /></span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
          <div style={s.sideBottom}><SidebarUser /></div>
        </aside>

        <div style={s.mainCol}>
          <div style={s.topBar}>
            <div>
              <div style={s.topTitle}>Genesis Agent</div>
              <div style={s.topDate}>Scout → Filter → Discover → Enrich → Outreach</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: stageInfo.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stageInfo.text}</span>
              <span style={{ fontSize: 11, background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 4, padding: '2px 8px', color: '#64748B' }}>v2.9</span>
            </div>
          </div>

          <main style={s.main}>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <input value={city} onChange={e => setCity(e.target.value)} onKeyDown={e => e.key === 'Enter' && !isRunning && city.trim() && runPipeline()} placeholder="City (e.g. Dallas, TX)" disabled={isRunning} style={s.input} />
              <select value={industry} onChange={e => setIndustry(e.target.value)} disabled={isRunning} style={s.select}>
                {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
              </select>
              <button onClick={runPipeline} disabled={isRunning || !city.trim()} style={{ ...s.btn, ...(isRunning || !city.trim() ? s.btnDisabled : {}) }}>
                {isRunning ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={s.spinner} />Running...</span> : 'Run Pipeline'}
              </button>
            </div>

            {/* Log — collapsed when done */}
            {log.length > 0 && (
              <div style={{ ...s.card, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: logOpen ? 10 : 0 }}>
                  <div style={s.cardLabel}>Pipeline Log</div>
                  <button onClick={() => setLogOpen(o => !o)} style={{ fontSize: 11, color: '#0057FF', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {logOpen ? '▲ Collapse' : `▼ ${log.length} entries`}
                  </button>
                </div>
                {(!isDone || logOpen) && log.map((line, i) => (
                  <div key={i} style={{ fontSize: 13, color: i === log.length - 1 ? '#0F172A' : '#64748B', lineHeight: 1.9, fontWeight: i === log.length - 1 ? 500 : 400 }}>{line}</div>
                ))}
                {isDone && !logOpen && (
                  <div style={{ fontSize: 13, color: '#16A34A', fontWeight: 600 }}>{log[log.length - 1]}</div>
                )}
              </div>
            )}

            {/* Error */}
            {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#DC2626', fontSize: 13, fontWeight: 500 }}>{error}</div>}

            {/* Stats */}
            {results && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 24 }}>
                {statCards.map(({ label, value, pct, color }) => (
                  <div key={label} style={s.statCard}>
                    <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                    {pct != null && <div style={{ fontSize: 11, fontWeight: 700, color, marginTop: 2 }}>{pct}%</div>}
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Prospect cards */}
            {loadedProspects.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  {loadedProspects.length} prospect{loadedProspects.length !== 1 ? 's' : ''} loaded — click to expand emails
                </div>
                {loadedProspects.map((biz, i) => <ProspectCard key={i} biz={biz} />)}
              </>
            )}

            {/* Full data table */}
            {results && <DataTable allResults={results} />}

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
  cardLabel:        { fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  statCard:         { background: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(15,23,42,.04)' },
  input:            { flex: 1, minWidth: 200, padding: '9px 14px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 7, color: '#0F172A', fontSize: 13, fontFamily: 'inherit', outline: 'none' },
  select:           { flex: 1, minWidth: 200, padding: '9px 14px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 7, color: '#0F172A', fontSize: 13, fontFamily: 'inherit', outline: 'none' },
  btn:              { padding: '9px 24px', background: '#0057FF', color: '#FFFFFF', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  btnDisabled:      { background: '#E2E8F0', color: '#94A3B8', cursor: 'not-allowed' },
  spinner:          { width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .8s linear infinite', display: 'inline-block' },
};
