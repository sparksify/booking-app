import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { guardDashboardPage } from '@/lib/pageAccess';
import { visibleNav } from '@/lib/nav';
import { getRole } from '@/lib/role';
import BrandLogo from '@/components/BrandLogo';
import SidebarUser from '@/components/SidebarUser';

// ─── Server-side auth: admin only ─────────────────────────────────────────────

export async function getServerSideProps(context) {
  const gate = await guardDashboardPage(context, '/dashboard/ad-stats');
  if (gate.redirect) return gate;
  const { session, perms } = gate;
  // Belt-and-suspenders: this page is strictly admin-only regardless of perms.
  if ((await getRole(session.user?.email)) !== 'admin') {
    return { redirect: { destination: '/dashboard/analytics', permanent: false } };
  }
  return { props: { session, perms, platformLogo: gate.logo, navOrder: gate.navOrder } };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmt$ = n => n == null ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 })}`;
const fmtN = n => n == null ? '—' : Number(n).toLocaleString();
const fmtPct = n => n == null ? '—' : `${Number(n).toFixed(2)}%`;

function delta(cur, prev) {
  if (prev == null || cur == null || !prev) return null;
  return ((cur - prev) / prev) * 100;
}

// ─── Sidebar icons ────────────────────────────────────────────────────────────

function SideIcon({ name }) {
  const p = { width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', style: { display: 'block' } };
  if (name === 'dashboard') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === 'leads')     return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  if (name === 'clients')   return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === 'meetings')  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (name === 'pipeline')  return <svg {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
  if (name === 'nurture')   return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
  if (name === 'settings')  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
  if (name === 'cq')        return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9.5 13.5a2 2 0 1 1 2.5 1.9c-.4.15-.5.4-.5.8"/><line x1="11.5" y1="18" x2="11.51" y2="18"/></svg>;
  if (name === 'ads')       return <svg {...p}><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>;
  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdsDashboard({ perms = {}, platformLogo = null, navOrder = null }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [period, setPeriod]   = useState(7);
  const [showRules, setShowRules] = useState(false);

  const load = useCallback((days) => {
    setLoading(true); setError(null);
    fetch(`/api/dashboard/fb-ads?days=${days}`)
      .then(r => r.json())
      .then(d => { d.error ? setError(d.error) : setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  useEffect(() => { load(period); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function changePeriod(days) { setPeriod(days); load(days); }

  return (
    <>
      <Head><title>Ad Stats — KANSO</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
      <div style={s.page}>
        <aside style={s.sidebar}>
          <div style={s.sideLogoWrap}><BrandLogo logo={platformLogo} /></div>
          <nav style={s.sideNav}>
            {visibleNav(perms, navOrder).map(({ href, label, icon }) => {
              const active = href === '/dashboard/ad-stats';
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
          <div style={s.sideBottom}><SidebarUser /></div>
        </aside>

        <div style={s.mainCol}>
          <div style={s.topBar}>
            <div>
              <div style={s.topTitle}>Ad Stats</div>
              <div style={s.topDate}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => setShowRules(v => !v)} style={{ ...s.pillBtn, ...(showRules ? s.pillBtnActive : {}) }}>
                Rules
              </button>
              <div style={{ display: 'flex', gap: 4 }}>
                {[{ d: 1, l: 'Today' }, { d: 7, l: '7d' }, { d: 30, l: '30d' }, { d: 90, l: '90d' }].map(({ d, l }) => (
                  <button key={d} onClick={() => changePeriod(d)} style={{ ...s.pillBtn, ...(period === d ? s.pillBtnActive : {}) }}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          <main style={s.main}>
            {loading ? (
              <div style={s.loadingWrap}><div style={s.spinner} /><div style={s.loadingText}>Pulling from Facebook…</div></div>
            ) : error ? (
              <div style={s.errorBox}>
                <strong>Couldn’t load ad data.</strong>
                <div style={{ marginTop: 6, fontSize: 13, color: '#7F1D1D' }}>{error}</div>
              </div>
            ) : data ? (
              <>
                {showRules && <RulesPanel />}
                {data.flags.length > 0 && <FlagBanner flags={data.flags} onResolve={() => load(period)} />}
                <Scorecard summary={data.summary} prev={data.prev} series={data.series} />
                <CampaignTable campaigns={data.campaigns} days={period} />
              </>
            ) : null}
          </main>
        </div>
      </div>
    </>
  );
}

// ─── Scorecard ────────────────────────────────────────────────────────────────

function Spark({ points, color = '#0057FF' }) {
  if (!points || points.length < 2) return null;
  const w = 90, h = 26;
  const max = Math.max(...points, 1);
  const step = w / (points.length - 1);
  const path = points.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(h - (v / max) * (h - 3)).toFixed(1)}`).join(' ');
  return <svg width={w} height={h} style={{ display: 'block' }}><path d={path} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" /></svg>;
}

function Stat({ label, value, sub, d, spark, sparkColor, invert = false }) {
  const good = d != null && (invert ? d < 0 : d > 0);
  return (
    <div style={s.card}>
      <div style={s.statLabel}>{label}</div>
      <div style={s.statRow}>
        <div style={s.statValue}>{value}</div>
        {d != null && Math.abs(d) >= 0.5 && (
          <span style={{ ...s.deltaChip, color: good ? '#047857' : '#B91C1C', background: good ? '#ECFDF5' : '#FEF2F2' }}>
            {d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(0)}%
          </span>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={s.statSub}>{sub}</div>
        {spark && <Spark points={spark} color={sparkColor} />}
      </div>
    </div>
  );
}

function Scorecard({ summary, prev, series }) {
  const spendSpark = series.map(p => p.spend);
  const leadSpark  = series.map(p => p.leads);
  return (
    <>
      <div style={s.kpiGrid}>
        <Stat label="Spend" value={fmt$(summary.spend)} sub="vs previous period" d={delta(summary.spend, prev.spend)} invert spark={spendSpark} />
        <Stat label="Leads (FB)" value={fmtN(summary.leads)} sub={`${fmtN(summary.canso_leads)} landed in Canso`} d={delta(summary.leads, prev.leads)} spark={leadSpark} sparkColor="#047857" />
        <Stat label="Cost / Lead" value={fmt$(summary.cpl)} sub={`real CPL ${fmt$(summary.canso_cpl)} (Canso)`} d={delta(summary.cpl, prev.cpl)} invert />
        <Stat label="Bookings" value={fmtN(summary.canso_bookings)} sub={`cost / booking ${fmt$(summary.cost_per_booking)}`} />
      </div>
      <div style={s.kpiGrid}>
        <Stat label="Impressions" value={fmtN(summary.impressions)} sub="reach volume" d={delta(summary.impressions, prev.impressions)} />
        <Stat label="Clicks" value={fmtN(summary.clicks)} sub="link + engagement" d={delta(summary.clicks, prev.clicks)} />
        <Stat label="CTR" value={fmtPct(summary.ctr)} sub="click-through rate" d={delta(summary.ctr, prev.ctr)} />
        <Stat label="CPM" value={fmt$(summary.cpm)} sub="cost per 1k impressions" d={delta(summary.cpm, prev.cpm)} invert />
      </div>
    </>
  );
}

// ─── Flags banner ─────────────────────────────────────────────────────────────

function FlagBanner({ flags, onResolve }) {
  async function resolve(id) {
    await fetch('/api/dashboard/fb-ads-rules', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flag_id: id }),
    });
    onResolve();
  }
  return (
    <div style={s.flagWrap}>
      {flags.map(f => (
        <div key={f.id} style={{ ...s.flagRow, borderLeft: `3px solid ${f.severity === 'critical' ? '#DC2626' : '#D97706'}` }}>
          <span style={{ fontSize: 13, color: '#1E293B' }}>
            <strong>{f.severity === 'critical' ? '🚨' : '⚠️'} {f.campaign_name}</strong>
            <span style={{ color: '#64748B' }}> — {f.detail}</span>
          </span>
          <button onClick={() => resolve(f.id)} style={s.linkBtn}>dismiss</button>
        </div>
      ))}
    </div>
  );
}

// ─── Campaign table ───────────────────────────────────────────────────────────

const COLS = [
  { key: 'name',          label: 'Campaign',   align: 'left'  },
  { key: 'daily_budget',  label: 'Budget/day', fmt: fmt$ },
  { key: 'spend',         label: 'Spend',      fmt: fmt$ },
  { key: 'fb_leads',      label: 'Leads (FB)', fmt: fmtN },
  { key: 'canso_leads',   label: 'Canso',      fmt: fmtN },
  { key: 'canso_bookings',label: 'Booked',     fmt: fmtN },
  { key: 'fb_cpl',        label: 'CPL',        fmt: fmt$ },
  { key: 'canso_cpl',     label: 'Real CPL',   fmt: fmt$ },
  { key: 'ctr',           label: 'CTR',        fmt: fmtPct },
  { key: 'frequency',     label: 'Freq',       fmt: n => n ? Number(n).toFixed(1) : '—' },
];

function StatusDot({ status }) {
  const color = status === 'ACTIVE' ? '#10B981' : status === 'PAUSED' || status === 'CAMPAIGN_PAUSED' ? '#94A3B8' : '#F59E0B';
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: color, marginRight: 8, flexShrink: 0 }} title={status} />;
}

function CampaignTable({ campaigns, days }) {
  const [sort, setSort]         = useState({ key: 'spend', dir: -1 });
  const [showPaused, setShowPaused] = useState(false);
  const [open, setOpen]         = useState({});   // campaign_id → children rows | 'loading'

  const rows = campaigns
    .filter(c => showPaused || c.effective_status === 'ACTIVE')
    .sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      if (va == null) return 1; if (vb == null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });

  async function toggle(id) {
    if (open[id]) { setOpen(o => ({ ...o, [id]: null })); return; }
    setOpen(o => ({ ...o, [id]: 'loading' }));
    const r = await fetch(`/api/dashboard/fb-ads?days=${days}&campaign_id=${id}&drill=ads`);
    const d = await r.json();
    setOpen(o => ({ ...o, [id]: d.children || [] }));
  }

  return (
    <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
      <div style={s.tableHead}>
        <div>
          <div style={s.cardTitle}>Campaigns</div>
          <div style={s.cardSub}>{rows.length} shown · sorted by {COLS.find(c => c.key === sort.key)?.label?.toLowerCase()}</div>
        </div>
        <label style={{ fontSize: 13, color: '#64748B', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={showPaused} onChange={e => setShowPaused(e.target.checked)} />
          show paused
        </label>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={s.table}>
          <thead>
            <tr>
              {COLS.map(c => (
                <th key={c.key}
                    onClick={() => setSort(prev => ({ key: c.key, dir: prev.key === c.key ? -prev.dir : -1 }))}
                    style={{ ...s.th, textAlign: c.align || 'right', cursor: 'pointer' }}>
                  {c.label}{sort.key === c.key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={COLS.length} style={{ ...s.td, textAlign: 'center', color: '#94A3B8', padding: 32 }}>No active campaigns in this period.</td></tr>
            )}
            {rows.map(c => (
              <CampaignRow key={c.id} c={c} open={open[c.id]} onToggle={() => toggle(c.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignRow({ c, open, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer', background: open ? '#F8FAFC' : undefined }}>
        {COLS.map(col => (
          <td key={col.key} style={{ ...s.td, textAlign: col.align || 'right' }}>
            {col.key === 'name' ? (
              <span style={{ display: 'flex', alignItems: 'center', fontWeight: 600, color: '#0F172A' }}>
                <StatusDot status={c.effective_status} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{c.name}</span>
                <span style={{ marginLeft: 8, color: '#94A3B8', fontSize: 11 }}>{open ? '▾' : '▸'}</span>
              </span>
            ) : col.fmt(c[col.key])}
          </td>
        ))}
      </tr>
      {open === 'loading' && (
        <tr><td colSpan={COLS.length} style={{ ...s.td, color: '#94A3B8', fontSize: 12 }}>Loading ads…</td></tr>
      )}
      {Array.isArray(open) && open.map(ad => (
        <tr key={ad.id} style={{ background: '#FBFCFE' }}>
          <td style={{ ...s.td, paddingLeft: 40 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#475569' }}>
              {ad.thumbnail && <img src={ad.thumbnail} alt="" width={26} height={26} style={{ borderRadius: 4, objectFit: 'cover' }} />}
              <StatusDot status={ad.effective_status} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280, fontSize: 13 }}>{ad.name}</span>
            </span>
          </td>
          <td style={s.td} />
          <td style={{ ...s.td, textAlign: 'right' }}>{fmt$(ad.spend)}</td>
          <td style={{ ...s.td, textAlign: 'right' }}>{fmtN(ad.fb_leads)}</td>
          <td style={s.td} /><td style={s.td} />
          <td style={{ ...s.td, textAlign: 'right' }}>{fmt$(ad.fb_cpl)}</td>
          <td style={s.td} />
          <td style={{ ...s.td, textAlign: 'right' }}>{fmtPct(ad.ctr)}</td>
          <td style={{ ...s.td, textAlign: 'right' }}>{ad.frequency ? Number(ad.frequency).toFixed(1) : '—'}</td>
        </tr>
      ))}
    </>
  );
}

// ─── Rules panel ──────────────────────────────────────────────────────────────

const METRIC_LABELS = {
  cpl: 'Cost per lead ($)',
  spend_no_leads: 'Spend with 0 leads ($)',
  ctr: 'CTR (%)',
  frequency: 'Frequency',
  spend: 'Spend ($)',
};

function RulesPanel() {
  const [rules, setRules] = useState(null);
  const [draft, setDraft] = useState({ name: '', metric: 'cpl', operator: 'gt', threshold: '', window_days: 3, severity: 'warn' });

  const loadRules = () => fetch('/api/dashboard/fb-ads-rules').then(r => r.json()).then(d => setRules(d.rules || []));
  useEffect(() => { loadRules(); }, []);

  async function save() {
    if (!draft.name || !draft.threshold) return;
    await fetch('/api/dashboard/fb-ads-rules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
    });
    setDraft(d => ({ ...d, name: '', threshold: '' }));
    loadRules();
  }
  async function toggleRule(r) {
    await fetch('/api/dashboard/fb-ads-rules', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, enabled: !r.enabled }),
    });
    loadRules();
  }
  async function remove(id) {
    await fetch('/api/dashboard/fb-ads-rules', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    });
    loadRules();
  }

  return (
    <div style={{ ...s.card, marginBottom: 20 }}>
      <div style={s.cardTitle}>Watchdog Rules</div>
      <div style={s.cardSub}>Evaluated every 2 hours against active campaigns. Breaches show as flags above the scorecard.</div>

      {rules === null ? <div style={{ fontSize: 13, color: '#94A3B8', padding: '12px 0' }}>Loading…</div> : (
        <div style={{ margin: '14px 0' }}>
          {rules.map(r => (
            <div key={r.id} style={s.ruleRow}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
                <input type="checkbox" checked={r.enabled} onChange={() => toggleRule(r)} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: r.enabled ? '#0F172A' : '#94A3B8' }}>{r.name}</span>
                <span style={{ fontSize: 12.5, color: '#64748B' }}>
                  {METRIC_LABELS[r.metric] || r.metric} {r.operator === 'lt' ? '<' : '>'} {r.threshold} over {r.window_days}d
                  {r.severity === 'critical' ? ' · critical' : ''}
                </span>
              </label>
              <button onClick={() => remove(r.id)} style={s.linkBtn}>delete</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid #F1F5F9', paddingTop: 14 }}>
        <input placeholder="Rule name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} style={{ ...s.input, width: 180 }} />
        <select value={draft.metric} onChange={e => setDraft({ ...draft, metric: e.target.value })} style={s.input}>
          {Object.entries(METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={draft.operator} onChange={e => setDraft({ ...draft, operator: e.target.value })} style={s.input}>
          <option value="gt">above</option><option value="lt">below</option>
        </select>
        <input placeholder="Threshold" type="number" value={draft.threshold} onChange={e => setDraft({ ...draft, threshold: e.target.value })} style={{ ...s.input, width: 100 }} />
        <select value={draft.window_days} onChange={e => setDraft({ ...draft, window_days: Number(e.target.value) })} style={s.input}>
          {[1, 3, 7, 14, 30].map(d => <option key={d} value={d}>last {d}d</option>)}
        </select>
        <select value={draft.severity} onChange={e => setDraft({ ...draft, severity: e.target.value })} style={s.input}>
          <option value="warn">warn</option><option value="critical">critical</option>
        </select>
        <button onClick={save} style={{ ...s.pillBtn, ...s.pillBtnActive }}>Add rule</button>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page:       { display: 'flex', minHeight: '100vh', background: '#F8FAFC', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: '#0F172A' },
  sidebar:    { width: 220, background: '#fff', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', flexShrink: 0 },
  sideLogoWrap: { padding: '20px 18px 12px' },
  sideNav:    { padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },
  sideNavItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, fontSize: 13.5, fontWeight: 500, color: '#475569', textDecoration: 'none' },
  sideNavItemActive: { background: '#EFF6FF', color: '#0057FF', fontWeight: 600 },
  sideBottom: { padding: 12, borderTop: '1px solid #F1F5F9' },
  mainCol:    { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  topBar:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 28px', background: '#fff', borderBottom: '1px solid #E2E8F0' },
  topTitle:   { fontSize: 18, fontWeight: 700 },
  topDate:    { fontSize: 12.5, color: '#94A3B8', marginTop: 2 },
  main:       { padding: 28, maxWidth: 1280, width: '100%' },
  pillBtn:    { padding: '6px 16px', fontSize: 13, fontWeight: 600, color: '#475569', background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' },
  pillBtnActive: { color: '#fff', background: '#0057FF', border: '1px solid #0057FF' },
  loadingWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 14 },
  spinner:    { width: 28, height: 28, border: '3px solid #E2E8F0', borderTopColor: '#0057FF', borderRadius: '50%', animation: 'spin .8s linear infinite' },
  loadingText: { fontSize: 13.5, color: '#64748B' },
  errorBox:   { background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 10, padding: 18, fontSize: 14 },
  kpiGrid:    { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 },
  card:       { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18 },
  cardTitle:  { fontSize: 15, fontWeight: 700 },
  cardSub:    { fontSize: 12.5, color: '#94A3B8', marginTop: 2 },
  statLabel:  { fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.04em' },
  statRow:    { display: 'flex', alignItems: 'baseline', gap: 8, margin: '6px 0 2px' },
  statValue:  { fontSize: 24, fontWeight: 700 },
  statSub:    { fontSize: 12, color: '#94A3B8' },
  deltaChip:  { fontSize: 11.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999 },
  flagWrap:   { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 },
  flagRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 14px' },
  linkBtn:    { fontSize: 12.5, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', flexShrink: 0 },
  tableHead:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 18px 12px' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th:         { padding: '10px 14px', fontSize: 11.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap', userSelect: 'none' },
  td:         { padding: '11px 14px', borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap' },
  ruleRow:    { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' },
  input:      { padding: '7px 10px', fontSize: 13, border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: 'inherit', background: '#fff', color: '#0F172A' },
};
