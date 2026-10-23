import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import BrandLogo from '@/components/BrandLogo';
import SidebarUser from '@/components/SidebarUser';
import { visibleNav } from '@/lib/nav';
import { guardDashboardPage } from '@/lib/pageAccess';

const colors = { navy: '#0D1B2E', blue: '#0057FF', teal: '#00A88F', green: '#16A34A', red: '#DC2626', amber: '#D97706', ink: '#0F172A', muted: '#64748B', line: '#E2E8F0', bg: '#F8FAFC' };
const statusColor = status => ({ Enriched: colors.green, 'Accepted Freemail': colors.teal, 'Accepted Catch-all': colors.teal, 'Needs Founder': colors.amber, 'No Match': colors.red, Error: colors.red, Enriching: colors.blue, Pending: colors.muted }[status] || colors.muted);

function Metric({ label, value, hint }) {
  return <div className="metric"><strong>{value ?? 0}</strong><span>{label}</span>{hint ? <em>{hint}</em> : null}</div>;
}

export default function GenesisPipelinePage({ perms, platformLogo, navOrder }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [city, setCity] = useState('Austin');
  const [industry, setIndustry] = useState('Food & Beverage');
  const [dryRun, setDryRun] = useState(true);
  const [businessesJson, setBusinessesJson] = useState('');
  const [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('leads');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard/genesis-pipeline');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load leads');
      setData(payload);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  async function runPipeline(event) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    setError('');
    try {
      let body = { city, industry, dry_run: dryRun };
      if (businessesJson.trim()) {
        const businesses = JSON.parse(businessesJson);
        if (!Array.isArray(businesses)) throw new Error('Businesses JSON must be an array');
        body = { businesses, dry_run: dryRun };
      }
      const response = await fetch('/api/pipeline/genesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Run failed');
      const summary = payload.summary || {};
      setNotice(`${dryRun ? 'Dry run' : 'Run'} finished. Verified business emails: ${summary.founder_verified ?? 0}. Accepted freemail: ${summary.accepted_freemail ?? 0}. Accepted catch-all: ${summary.accepted_catch_all ?? 0}. Needs Founder: ${summary.needs_founder ?? 0}. Nothing was sent.`);
      if (!dryRun) await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const stats = data?.stats || {};
  const funnel = stats.funnel || {};
  const leads = data?.leads || [];
  const finders = stats.finders || [];

  return <>
    <Head><title>Genesis Pipeline — KANSO</title></Head>
    <div className="shell">
      <aside>
        <div className="logo"><BrandLogo logo={platformLogo} /></div>
        <div className="section">AI Workflows</div>
        <nav>{visibleNav(perms, navOrder).map(item => <Link key={item.href} href={item.href} className={item.href === '/dashboard/genesis-pipeline' ? 'active' : ''}><span className="navDot">{item.href === '/dashboard/genesis-pipeline' ? '◎' : '○'}</span>{item.label}</Link>)}</nav>
        <div className="user"><SidebarUser /></div>
      </aside>
      <main>
        <header>
          <div>
            <h1>Genesis Pipeline</h1>
            <p>Owner name first. Business-domain emails first. Drafts stay unsent.</p>
          </div>
          <a className="csv" href={tab === 'franchises' ? '/api/dashboard/genesis-pipeline?format=franchises' : '/api/dashboard/genesis-pipeline?format=csv'}>{tab === 'franchises' ? 'Export franchises' : 'Export CSV'}</a>
        </header>
        <div className="content">
          {error && <div className="error">{error}</div>}
          {notice && <div className="notice">{notice}</div>}
          <section className="hero">
            <div>
              <div className="eyebrow">VERIFIED BUSINESS EMAILS</div>
              <h2>{stats.founder_verified ?? 0} of {stats.total ?? 0} leads</h2>
              <p>This rate counts only a verified business-domain founder email. Accepted freemail and accepted catch-all are usable contacts and stay out of this rate. Role inboxes are rejected.</p>
            </div>
            <div className="rate">{stats.personal_hit_rate ?? 0}<span>%</span></div>
          </section>
          <section className="metrics">
            <Metric label="Leads" value={funnel.leads} />
            <Metric label="Franchises held" value={funnel.filtered_out} />
            <Metric label="Names stored" value={funnel.owners_found} />
            <Metric label="Needs Founder" value={funnel.needs_founder} hint="No finder credits" />
            <Metric label="Personal emails" value={funnel.founder_emails} hint="Verified business" />
            <Metric label="Accepted freemail" value={funnel.accepted_freemail} hint="Usable, not verified business" />
            <Metric label="Accepted catch-all" value={funnel.accepted_catch_all} hint="Usable, not verified business" />
            <Metric label="Role / freemail" value={funnel.role_inboxes} hint="Rejected" />
            <Metric label="Catch-all rejected" value={funnel.catch_all} hint="Not stored" />
            <Metric label="Domain mismatch" value={funnel.domain_mismatch} hint="Flagged, still Enriched" />
            <Metric label="No Match" value={funnel.no_match} />
            <Metric label="Drafts" value={funnel.drafts} hint="Never sent" />
            <Metric label="Name credits" value={stats.name_credits} hint="Estimated" />
            <Metric label="Finder credits" value={stats.finder_credits} hint="Estimated" />
            <Metric label="Errors" value={funnel.errors} />
          </section>
          <form className="card run" onSubmit={runPipeline}>
            <div className="cardHead"><div><h3>Run</h3><p>The franchise check runs first. A confirmed franchise is saved and spends nothing further. Finder credits start only after two name sources agree.</p></div></div>
            <div className="fields">
              <label>City<input value={city} onChange={event => setCity(event.target.value)} /></label>
              <label>Industry<input value={industry} onChange={event => setIndustry(event.target.value)} /></label>
              <label className="check"><input type="checkbox" checked={dryRun} onChange={event => setDryRun(event.target.checked)} /> Dry run</label>
              <button disabled={busy} type="submit">{busy ? 'Running…' : dryRun ? 'Dry run' : 'Run live'}</button>
            </div>
            <label className="json">Businesses JSON, optional. Leave empty to search Maps for the city and industry.
              <textarea value={businessesJson} onChange={event => setBusinessesJson(event.target.value)} placeholder='[{"record_id":"FM-000015","business_name":"Eggroll Company","website":"https://example.com","city":"Austin","franchise_override":"Scout found no franchise offering"}]' />
            </label>
          </form>
          <div className="tabs">
            <button type="button" className={tab === 'leads' ? 'on' : ''} onClick={() => setTab('leads')}>Leads</button>
            <button type="button" className={tab === 'franchises' ? 'on' : ''} onClick={() => setTab('franchises')}>Known franchises</button>
          </div>
          {tab === 'franchises' ? <section className="card">
            <div className="cardHead"><div><h3>Known franchises</h3><p>Saved for a possible later franchise outreach list. Overrides stay on the row.</p></div><span>{(data?.franchises || []).length} brands</span></div>
            <div className="tableWrap">
              <table className="leads">
                <thead><tr><th>Brand</th><th>Domain</th><th>City</th><th>Evidence</th><th>Confidence</th><th>Found</th><th>Record</th><th>Override</th></tr></thead>
                <tbody>
                  {(data?.franchises || []).map(brand => <tr key={brand.id}>
                    <td><strong>{brand.brand}</strong></td>
                    <td>{brand.domain || '—'}</td>
                    <td>{brand.city || '—'}</td>
                    <td>{brand.evidence_kind || '—'}<div className="sub">{brand.evidence_detail || brand.evidence_url || ''}</div></td>
                    <td>{brand.confidence || '—'}</td>
                    <td>{brand.found_at ? new Date(brand.found_at).toLocaleDateString() : '—'}</td>
                    <td>{brand.external_id || brand.source || '—'}</td>
                    <td>{brand.override_reason || '—'}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            {data?.franchises_error && <div className="empty">{data.franchises_error}</div>}
            {!data?.franchises?.length && !data?.franchises_error && <div className="empty">No franchise brands saved yet.</div>}
          </section> : null}
          {tab === 'leads' && <>
          <section className="card">
            <div className="cardHead"><div><h3>Finder hit rates</h3><p>A hit is a verified business-domain founder email. Accepted freemail and catch-all contacts are not hits.</p></div></div>
            <table>
              <thead><tr><th>Finder</th><th>Calls</th><th>Personal hits</th><th>Hit rate</th><th>Est. credits</th></tr></thead>
              <tbody>
                {finders.map(finder => <tr key={finder.finder}><td>{finder.label}</td><td>{finder.calls}</td><td>{finder.hits}</td><td>{finder.hit_rate == null ? '—' : `${finder.hit_rate}%`}</td><td>{finder.credits}</td></tr>)}
              </tbody>
            </table>
            {!finders.length && <div className="empty">No calls recorded yet.</div>}
          </section>
          <section className="card">
            <div className="cardHead"><div><h3>Recent leads</h3><p>Draft copy is stored on the lead and is never sent from this pipeline.</p></div><span>{leads.length} shown</span></div>
            <div className="tableWrap">
              <table className="leads">
                <thead><tr><th>Business</th><th>Owner</th><th>Confidence</th><th>Phone</th><th>Email</th><th>Status</th><th>Flagged</th></tr></thead>
                <tbody>
                  {leads.map(lead => <tr key={lead.id} onClick={() => setOpenId(openId === lead.id ? null : lead.id)} className={openId === lead.id ? 'open' : ''}>
                    <td><strong>{lead.business_name}</strong><div className="sub">{[lead.city, lead.domain].filter(Boolean).join(' · ')}</div></td>
                    <td>{[lead.owner_first, lead.owner_last].filter(Boolean).join(' ') || '—'}<div className="sub">{lead.owner_role || ''}</div></td>
                    <td>{lead.owner_confidence || '—'}</td>
                    <td>{lead.owner_phone || '—'}<div className="sub">{lead.owner_phone_source || ''}</div></td>
                    <td>{lead.email || '—'}<div className="sub">{lead.email ? [lead.inbox_type, lead.email_source].filter(Boolean).join(' · ') : ''}</div></td>
                    <td><span className="pill" style={{ color: statusColor(lead.status), background: `${statusColor(lead.status)}12`, borderColor: `${statusColor(lead.status)}35` }}>{lead.status}</span></td>
                    <td>{(lead.flagged_emails || []).map(item => `${item.email} (${item.reason})`).join(', ') || '—'}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            {openId && (() => {
              const lead = leads.find(item => item.id === openId);
              if (!lead?.icebreaker?.email1) return <div className="draft empty">No icebreaker draft on this lead.</div>;
              return <div className="draft">
                <h4>Draft, not sent</h4>
                <p><strong>{lead.icebreaker.email1.subject}</strong></p>
                <pre>{lead.icebreaker.email1.body}</pre>
                {lead.icebreaker.email2 && <><p><strong>{lead.icebreaker.email2.subject}</strong></p><pre>{lead.icebreaker.email2.body}</pre></>}
              </div>;
            })()}
            {!leads.length && <div className="empty">No persisted leads yet. A dry run does not write to this table.</div>}
          </section>
          </>}
        </div>
      </main>
    </div>
    <style jsx>{`
      *{box-sizing:border-box}.shell{min-height:100vh;background:${colors.bg};color:${colors.ink};font-family:Inter,ui-sans-serif,system-ui;display:flex}
      aside{width:220px;background:white;border-right:1px solid ${colors.line};display:flex;flex-direction:column;position:fixed;inset:0 auto 0 0}
      .logo{height:72px;padding:20px;border-bottom:1px solid ${colors.line}}.section{margin:20px 16px 7px;font-size:10px;font-weight:800;color:#94A3B8;letter-spacing:.12em;text-transform:uppercase}
      nav{padding:0 10px;display:flex;flex-direction:column;gap:3px}nav :global(a){padding:10px 12px;border-radius:8px;color:${colors.muted};font-size:13px;text-decoration:none;display:flex;gap:10px;align-items:center;font-weight:600}nav :global(a.active){background:#EEF4FF;color:${colors.blue}}
      .navDot{font-size:17px}.user{margin-top:auto;border-top:1px solid ${colors.line};padding:12px}
      main{margin-left:220px;min-width:0;flex:1}header{height:72px;background:white;border-bottom:1px solid ${colors.line};padding:0 28px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:5}
      h1{font-size:19px;margin:0}header p{font-size:12px;color:${colors.muted};margin:3px 0 0}.csv{background:${colors.navy};color:white;text-decoration:none;border-radius:8px;padding:10px 14px;font-size:12px;font-weight:800}
      .content{padding:24px;max-width:1500px;margin:auto}.error{background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;padding:12px;border-radius:9px;margin-bottom:16px}.notice{background:#ECFDF5;border:1px solid #A7F3D0;color:#065F46;padding:12px;border-radius:9px;margin-bottom:16px}
      .hero{border-radius:18px;background:linear-gradient(125deg,#0D1B2E,#102B55);padding:28px 34px;color:white;display:flex;align-items:center;justify-content:space-between}.eyebrow{font-size:10px;color:#64D9C7;font-weight:800;letter-spacing:.17em}.hero h2{font-size:28px;margin:10px 0}.hero p{max-width:640px;color:#B8C6D9;font-size:14px;line-height:1.6;margin:0}.rate{font-size:64px;font-weight:800}.rate span{font-size:24px}
      .metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:16px 0}.metric{background:white;border:1px solid ${colors.line};border-radius:11px;padding:14px}.metric strong{display:block;font-size:22px}.metric span{display:block;color:${colors.muted};font-size:9px;text-transform:uppercase;letter-spacing:.06em;margin-top:4px}.metric em{display:block;font-style:normal;color:#94A3B8;font-size:10px;margin-top:4px}
      .card{background:white;border:1px solid ${colors.line};border-radius:14px;overflow:hidden;margin-bottom:16px}.cardHead{padding:17px 20px;border-bottom:1px solid ${colors.line};display:flex;justify-content:space-between}.cardHead h3{font-size:14px;margin:0}.cardHead p,.cardHead span{font-size:11px;color:${colors.muted};margin:4px 0 0}
      .tabs{display:flex;gap:8px;margin:0 0 16px}.tabs button{background:white;color:${colors.ink};border:1px solid ${colors.line}}.tabs button.on{background:${colors.navy};color:white}
      .fields{display:flex;gap:12px;align-items:end;padding:16px 20px;flex-wrap:wrap}.fields label,.json{display:flex;flex-direction:column;gap:6px;font-size:11px;color:${colors.muted};font-weight:700}input,textarea{border:1px solid ${colors.line};border-radius:8px;padding:9px 10px;font:inherit;color:${colors.ink}}textarea{min-height:72px;width:100%}.json{padding:0 20px 16px}.check{flex-direction:row;align-items:center;padding-bottom:10px}button{border:0;border-radius:8px;padding:10px 16px;font-weight:800;background:${colors.blue};color:white;cursor:pointer}button:disabled{opacity:.5}
      table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:right;padding:12px;border-bottom:1px solid #F1F5F9;vertical-align:top}th:first-child,td:first-child{text-align:left}th{color:${colors.muted};font-size:9px;text-transform:uppercase}.leads td:first-child,.leads th:nth-child(2),.leads td:nth-child(2),.leads th:nth-child(4),.leads td:nth-child(4),.leads th:nth-child(5),.leads td:nth-child(5),.leads th:last-child,.leads td:last-child{text-align:left}.leads tr{cursor:pointer}.sub{color:${colors.muted};font-size:10px;margin-top:3px}.pill{border:1px solid;border-radius:20px;padding:3px 8px;font-size:9px;font-weight:800}.tableWrap{overflow:auto}.draft{padding:16px 20px;background:#F8FAFC}.draft pre{white-space:pre-wrap;font-family:inherit;font-size:13px}.empty{padding:24px;text-align:center;color:#94A3B8;font-size:12px}
      @media(max-width:1100px){.metrics{grid-template-columns:repeat(3,1fr)}}@media(max-width:720px){aside{display:none}main{margin-left:0}.content{padding:12px}.hero{padding:20px}.rate{font-size:42px}.metrics{grid-template-columns:repeat(2,1fr)}}
    `}</style>
  </>;
}

export async function getServerSideProps(context) {
  const gate = await guardDashboardPage(context, '/dashboard/genesis-pipeline');
  if (gate.redirect) return gate;
  return { props: { perms: gate.perms, platformLogo: gate.logo, navOrder: gate.navOrder } };
}
