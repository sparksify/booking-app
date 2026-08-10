import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { guardDashboardPage } from '@/lib/pageAccess';
import { visibleNav } from '@/lib/nav';
import BrandLogo from '@/components/BrandLogo';
import SidebarUser from '@/components/SidebarUser';
import {
  DEAL_STATUSES, OPEN_STATUSES, DEAL_OUTCOMES, SENTIMENTS, EVENT_TYPES,
  NEXT_ACTION_TYPES, WAITING_LABELS, WAITING_WINDOWS_DAYS, fmtMoney, daysBetween,
} from '@/lib/dealos';

export async function getServerSideProps(context) {
  const gate = await guardDashboardPage(context, '/dashboard/dealos');
  if (gate.redirect) return gate;
  return { props: { session: gate.session, perms: gate.perms, platformLogo: gate.logo, navOrder: gate.navOrder } };
}

// ── Small shared helpers ──────────────────────────────────────────────────────

function relDays(iso) {
  const d = daysBetween(iso);
  if (d === null) return 'Never';
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    (t.getHours() || t.getMinutes() ? ' · ' + t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');
}

function contactTone(days, threshold) {
  if (days === null) return { color: '#B91C1C', bg: '#FEE2E2' };
  if (days >= threshold) return { color: '#B91C1C', bg: '#FEE2E2' };
  if (days >= Math.ceil(threshold / 2)) return { color: '#92400E', bg: '#FEF3C7' };
  return { color: '#15803D', bg: '#DCFCE7' };
}

function StatusPill({ status, small }) {
  const info = DEAL_STATUSES[status] || DEAL_STATUSES.new;
  return (
    <span style={{
      fontSize: small ? 10 : 11, fontWeight: 700, padding: small ? '1px 7px' : '2px 9px',
      borderRadius: 10, color: info.color, background: info.bg, border: `1px solid ${info.border}`,
      whiteSpace: 'nowrap',
    }}>
      {info.short}
    </span>
  );
}

function ActionTypeIcon({ type }) {
  return <span style={{ fontSize: 14 }}>{NEXT_ACTION_TYPES[type]?.icon || '☑️'}</span>;
}

function SideIcon({ name }) {
  const p = { width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', style: { display: 'block' } };
  if (name === 'dashboard') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === 'ads')       return <svg {...p}><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>;
  if (name === 'leads')     return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  if (name === 'clients')   return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === 'meetings')  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (name === 'nurture')   return <svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>;
  if (name === 'settings')  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
  if (name === 'inbox')     return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/></svg>;
  if (name === 'pipeline')  return <svg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
  if (name === 'cq')        return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9.5 13.5a2 2 0 1 1 2.5 1.9c-.4.15-.5.4-.5.8"/><line x1="11.5" y1="18" x2="11.51" y2="18"/></svg>;
  return null;
}

// ─── Page root ────────────────────────────────────────────────────────────────

const VIEWS = [
  ['today',    'Today'],
  ['pipeline', 'Pipeline'],
  ['waiting',  'Waiting On'],
  ['closed',   'Closed'],
];

export default function DealOSPage({ perms = {}, platformLogo = null, navOrder = null }) {
  const [data,      setData]      = useState({ clients: [], queue: [], summary: null });
  const [loading,   setLoading]   = useState(true);
  const [view,      setView]      = useState('today'); // Today is the default screen
  const [workspace, setWorkspace] = useState(null);    // { clientId, dealId }

  const load = useCallback(() => {
    fetch('/api/dashboard/dealos-deals')
      .then(r => r.json())
      .then(d => { if (d.clients) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const clientById = useMemo(() => {
    const m = {};
    for (const c of data.clients) m[c.id] = c;
    return m;
  }, [data.clients]);

  const wsClient = workspace ? clientById[workspace.clientId] : null;
  const wsDeal = wsClient?.deals?.find(d => d.id === workspace.dealId) || wsClient?.deals?.[0] || null;

  function openDeal(clientId, dealId) { setWorkspace({ clientId, dealId }); }

  return (
    <>
      <Head><title>DealOS — KANSO</title></Head>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        .dealos-row:hover { background: #F0F4FF !important; cursor: pointer; }
        .dealos-card:hover { border-color: #BFDBFE !important; box-shadow: 0 2px 8px rgba(15,23,42,.08) !important; }
      `}</style>

      {workspace && wsClient && wsDeal && (
        <DealWorkspace
          client={wsClient}
          deal={wsDeal}
          onClose={() => { setWorkspace(null); load(); }}
          onSwitchDeal={dealId => setWorkspace({ clientId: wsClient.id, dealId })}
          onRefresh={load}
        />
      )}

      <div style={s.page}>
        <aside style={s.sidebar}>
          <div style={s.sideLogoWrap}>
            <div style={s.sideLogoRow}>
              <BrandLogo logo={platformLogo} />
            </div>
          </div>
          <nav style={s.sideNav}>
            {visibleNav(perms, navOrder).map(({ href, label, icon }) => {
              const active = href === '/dashboard/dealos' || href === '/dashboard/nurture';
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

        <div style={s.mainCol}>
          <div style={s.topBar}>
            <div>
              <div style={s.topTitle}>DealOS</div>
              <div style={s.topDate}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            </div>
            <div style={s.topActions}>
              <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 6, padding: 2 }}>
                {VIEWS.map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setView(key)}
                    style={{
                      padding: '5px 13px', fontSize: 12, fontWeight: 600, borderRadius: 4,
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      background: view === key ? '#fff' : 'transparent',
                      color: view === key ? '#111827' : '#6B7280',
                      boxShadow: view === key ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                      transition: 'all .15s',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={load} style={s.ghostBtn}>↻ Refresh</button>
            </div>
          </div>

          <div style={s.pageBody}>
            {loading ? (
              <div style={s.loadingWrap}>
                <div style={s.spinner} />
                <div style={s.loadingText}>Loading DealOS…</div>
              </div>
            ) : view === 'today' ? (
              <TodayView data={data} clientById={clientById} onOpenDeal={openDeal} />
            ) : view === 'pipeline' ? (
              <PipelineView clients={data.clients} onOpenDeal={openDeal} />
            ) : view === 'waiting' ? (
              <WaitingView clients={data.clients} onOpenDeal={openDeal} />
            ) : (
              <ClosedView clients={data.clients} onOpenDeal={openDeal} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Today view: executive summary + prioritized action queue ─────────────────

function TodayView({ data, clientById, onOpenDeal }) {
  const { queue, summary } = data;

  return (
    <div>
      {/* Executive summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        <SummaryTile label="Active Deals" value={summary?.active_deals ?? 0} color="#0057FF" />
        <SummaryTile label="Est. Pipeline Commission" value={fmtMoney(summary?.pipeline_commission) || '$0'} color="#15803D" />
        <SummaryTile label="Actions Due Today" value={summary?.actions_due_today ?? 0} color="#C2410C" />
        <SummaryTile label="Commission at Risk" value={fmtMoney(summary?.commission_at_risk) || '$0'} color="#B91C1C" warn={(summary?.commission_at_risk || 0) > 0} />
      </div>

      {/* Prioritized action queue */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
          Action Queue
          <span style={{ fontWeight: 500, color: '#9CA3AF', marginLeft: 8 }}>
            {queue.length} action{queue.length !== 1 ? 's' : ''} · most urgent first
          </span>
        </div>
      </div>

      {queue.length === 0 ? (
        <div style={{ ...s.card, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>Nothing needs your attention</div>
          <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 6 }}>
            New deals appear here when a CQ is received, an event completes, or a rule fires.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {queue.map(item => (
            <ActionQueueCard
              key={item.deal_id}
              item={item}
              client={clientById[item.client_id]}
              onOpenDeal={() => onOpenDeal(item.client_id, item.deal_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, color, warn }) {
  return (
    <div style={{ ...s.card, padding: '14px 18px', borderLeft: `4px solid ${warn ? '#EF4444' : color}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, marginTop: 4, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

function ActionQueueCard({ item, client, onOpenDeal }) {
  const deal = client?.deals?.find(d => d.id === item.deal_id);
  const candDays = deal?.days_since_candidate_contact ?? null;
  const devDays = deal?.days_since_developer_contact ?? null;
  const phone = client?.phone;
  const email = client?.email;

  return (
    <div className="dealos-card" style={{ ...s.card, padding: 0, overflow: 'hidden', transition: 'all .15s' }}>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {/* Priority rail */}
        <div style={{ width: 4, flexShrink: 0, background: item.jeopardy ? '#EF4444' : '#F59E0B' }} />

        <div style={{ flex: 1, padding: '14px 18px', minWidth: 0 }}>
          {/* Row 1: who / which deal / money / status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{item.candidate}</span>
            <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>· {item.brand}</span>
            <StatusPill status={item.deal_status} small />
            {item.estimated_commission != null && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>{fmtMoney(item.estimated_commission)}</span>
            )}
            {item.jeopardy && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C', background: '#FEE2E2', padding: '1px 7px', borderRadius: 10 }}>At risk</span>
            )}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexShrink: 0 }}>
              {phone && <a href={`tel:${phone}`} onClick={e => e.stopPropagation()} style={s.miniAction}>📞 Call</a>}
              {phone && <a href={`sms:${phone}`} onClick={e => e.stopPropagation()} style={s.miniAction}>💬 Text</a>}
              {email && <a href={`mailto:${email}`} onClick={e => e.stopPropagation()} style={s.miniAction}>✉️ Email</a>}
              <button onClick={onOpenDeal} style={{ ...s.miniAction, background: '#0057FF', color: '#fff', border: '1px solid #0057FF' }}>Open Deal →</button>
            </span>
          </div>

          {/* Row 2: ACTION / REASON / OBJECTIVE */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1fr', gap: 14, marginTop: 12 }}>
            <div>
              <div style={s.aroLabel}>Action</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <ActionTypeIcon type={item.action?.type} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>{item.action?.label}</span>
              </div>
            </div>
            <div>
              <div style={s.aroLabel}>Why</div>
              <div style={{ fontSize: 12, color: '#374151', marginTop: 3, lineHeight: 1.45 }}>{item.reason}</div>
            </div>
            <div>
              <div style={s.aroLabel}>Accomplish</div>
              <div style={{ fontSize: 12, color: '#374151', marginTop: 3, lineHeight: 1.45 }}>{item.objective}</div>
            </div>
          </div>

          {/* Row 3: context — contacts + next event */}
          <div style={{ display: 'flex', gap: 14, marginTop: 11, paddingTop: 9, borderTop: '1px solid #F3F4F6', flexWrap: 'wrap' }}>
            <ContextChip label="Candidate contact" value={relDays(deal?.last_candidate_contact_at)} tone={contactTone(candDays, 7)} />
            <ContextChip label="Developer contact" value={relDays(deal?.last_developer_contact_at)} tone={contactTone(devDays, 10)} />
            {deal?.next_event_at && (
              <ContextChip
                label="Next event"
                value={`${EVENT_TYPES[deal.next_event_type]?.label || 'Event'} · ${fmtDateTime(deal.next_event_at)}`}
                tone={{ color: '#1D4ED8', bg: '#EFF6FF' }}
              />
            )}
            {deal?.waiting_on && (
              <ContextChip label="Waiting on" value={WAITING_LABELS[deal.waiting_on] || deal.waiting_on} tone={{ color: '#92400E', bg: '#FEF3C7' }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContextChip({ label, value, tone }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: tone.color, background: tone.bg, padding: '1px 8px', borderRadius: 10 }}>{value}</span>
    </div>
  );
}

// ─── Pipeline view (Kanban by universal deal status) ──────────────────────────

function PipelineView({ clients, onOpenDeal }) {
  const openDeals = [];
  for (const c of clients) {
    for (const d of c.deals || []) {
      if (d.is_open) openDeals.push({ client: c, deal: d });
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, paddingBottom: 24, alignItems: 'flex-start', overflowX: 'auto' }}>
        {OPEN_STATUSES.map(status => {
          const info = DEAL_STATUSES[status];
          const colDeals = openDeals.filter(x => x.deal.deal_status === status);
          return (
            <div key={status} style={{ flex: '1 1 0', minWidth: 150, display: 'flex', flexDirection: 'column' }}>
              <div style={{
                background: '#fff', border: `1px solid ${info.border}`, borderTop: `3px solid ${info.color}`,
                borderRadius: '8px 8px 0 0', padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: info.color }}>{info.label}</div>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: colDeals.length > 0 ? info.bg : '#F3F4F6',
                    border: `1.5px solid ${colDeals.length > 0 ? info.border : '#E5E7EB'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: colDeals.length > 0 ? info.color : '#C0C0C0', flexShrink: 0,
                  }}>
                    {colDeals.length}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
                  {fmtMoney(colDeals.reduce((sum, x) => sum + (Number(x.deal.estimated_commission) || 0), 0)) || '$0'}
                </div>
              </div>
              <div style={{
                flex: 1, background: colDeals.length > 0 ? '#F7F8FA' : '#FAFAFA',
                border: `1px solid ${info.border}`, borderTop: 'none', borderRadius: '0 0 8px 8px',
                padding: 8, display: 'flex', flexDirection: 'column', gap: 7, minHeight: 120,
              }}>
                {colDeals.length === 0 ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: '#D1D5DB' }}>No deals</div>
                ) : colDeals.map(({ client, deal }) => (
                  <DealKanbanCard key={deal.id} client={client} deal={deal} onOpen={() => onOpenDeal(client.id, deal.id)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DealKanbanCard({ client, deal, onOpen }) {
  const top = deal.top_attention;
  return (
    <div
      className="dealos-card"
      onClick={onOpen}
      style={{
        background: '#fff', border: '1px solid #E5E7EB', borderRadius: 7,
        padding: '10px 11px', cursor: 'pointer', transition: 'all .15s',
        boxShadow: '0 1px 3px rgba(0,0,0,.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>
          {client.first_name} {client.last_name}
        </div>
        {top && (
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 3,
            background: deal.attention.some(a => a.jeopardy) ? '#EF4444' : '#F59E0B',
          }} />
        )}
      </div>
      <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, marginTop: 2 }}>{deal.brand_name}</div>
      {deal.estimated_commission != null && (
        <div style={{ fontSize: 11, fontWeight: 700, color: '#15803D', marginTop: 4 }}>{fmtMoney(deal.estimated_commission)}</div>
      )}
      {top && (
        <div style={{ fontSize: 10, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 5, padding: '4px 7px', marginTop: 7, lineHeight: 1.35 }}>
          {top.action.label}
        </div>
      )}
      {deal.next_event_at && (
        <div style={{ fontSize: 10, color: '#1D4ED8', marginTop: 5 }}>
          {EVENT_TYPES[deal.next_event_type]?.label || 'Event'} · {fmtDateTime(deal.next_event_at)}
        </div>
      )}
    </div>
  );
}

// ─── Waiting On view ──────────────────────────────────────────────────────────

function WaitingView({ clients, onOpenDeal }) {
  const rows = [];
  for (const c of clients) {
    for (const d of c.deals || []) {
      if (d.is_open && d.waiting_on) rows.push({ client: c, deal: d });
    }
  }
  rows.sort((a, b) => new Date(a.deal.waiting_since || 0) - new Date(b.deal.waiting_since || 0));

  if (rows.length === 0) {
    return (
      <div style={{ ...s.card, padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>Not waiting on anything</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 6 }}>
          Mark a deal as "waiting on" from the deal workspace to track it here.
        </div>
      </div>
    );
  }

  return (
    <div style={s.card}>
      <table style={s.table}>
        <thead>
          <tr>{['Candidate', 'Deal', 'Waiting On', 'What For', 'Since', 'Window', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(({ client, deal }) => {
            const days = daysBetween(deal.waiting_since);
            const windowDays = WAITING_WINDOWS_DAYS[deal.waiting_on] ?? 5;
            const over = days !== null && days > windowDays;
            return (
              <tr key={deal.id} className="dealos-row" style={{ borderBottom: '1px solid #F3F4F6' }} onClick={() => onOpenDeal(client.id, deal.id)}>
                <td style={s.td}>
                  <div style={{ fontWeight: 600, color: '#111827' }}>{client.first_name} {client.last_name}</div>
                </td>
                <td style={s.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{deal.brand_name}</span>
                    <StatusPill status={deal.deal_status} small />
                  </div>
                </td>
                <td style={s.td}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '2px 9px', borderRadius: 10 }}>
                    {WAITING_LABELS[deal.waiting_on] || deal.waiting_on}
                  </span>
                </td>
                <td style={{ ...s.td, maxWidth: 260 }}>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>{deal.waiting_note || '—'}</span>
                </td>
                <td style={s.td}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: over ? '#B91C1C' : '#374151' }}>
                    {days === null ? '—' : `${days}d`}
                  </span>
                </td>
                <td style={s.td}>
                  {over ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#B91C1C', background: '#FEE2E2', padding: '2px 8px', borderRadius: 10 }}>
                      {days - windowDays}d over
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: '#15803D' }}>within {windowDays}d</span>
                  )}
                </td>
                <td style={s.td}>
                  <span style={{ fontSize: 12, color: '#0057FF', fontWeight: 600 }}>Open →</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Closed view ──────────────────────────────────────────────────────────────

function ClosedView({ clients, onOpenDeal }) {
  const rows = [];
  for (const c of clients) {
    for (const d of c.deals || []) {
      const closed = d.outcome || ['paid', 'closed'].includes(d.deal_status) || c.status !== 'active';
      if (closed) rows.push({ client: c, deal: d });
    }
  }
  rows.sort((a, b) => new Date(b.deal.closed_at || b.deal.updated_at || 0) - new Date(a.deal.closed_at || a.deal.updated_at || 0));

  if (rows.length === 0) {
    return (
      <div style={{ ...s.card, padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🏁</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>No closed deals yet</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 6 }}>Deals appear here once an outcome is set.</div>
      </div>
    );
  }

  const won = rows.filter(r => r.deal.outcome === 'won' || r.deal.deal_status === 'paid');
  const wonCommission = won.reduce((sum, r) => sum + (Number(r.deal.estimated_commission) || 0), 0);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        <SummaryTile label="Closed Deals" value={rows.length} color="#6B7280" />
        <SummaryTile label="Won" value={won.length} color="#15803D" />
        <SummaryTile label="Won Commission" value={fmtMoney(wonCommission) || '$0'} color="#15803D" />
      </div>
      <div style={s.card}>
        <table style={s.table}>
          <thead>
            <tr>{['Candidate', 'Deal', 'Outcome', 'Commission', 'Closed', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(({ client, deal }) => {
              const outcome = deal.outcome ? DEAL_OUTCOMES[deal.outcome]
                : deal.deal_status === 'paid' ? DEAL_OUTCOMES.won : null;
              return (
                <tr key={deal.id} className="dealos-row" style={{ borderBottom: '1px solid #F3F4F6' }} onClick={() => onOpenDeal(client.id, deal.id)}>
                  <td style={s.td}><div style={{ fontWeight: 600, color: '#111827' }}>{client.first_name} {client.last_name}</div></td>
                  <td style={s.td}><span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{deal.brand_name}</span></td>
                  <td style={s.td}>
                    {outcome ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: outcome.color, background: outcome.bg, padding: '2px 9px', borderRadius: 10 }}>{outcome.label}</span>
                    ) : <StatusPill status={deal.deal_status} small />}
                  </td>
                  <td style={s.td}><span style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>{fmtMoney(deal.estimated_commission) || '—'}</span></td>
                  <td style={s.td}><span style={{ fontSize: 12, color: '#6B7280' }}>{deal.closed_at ? fmtDateTime(deal.closed_at) : '—'}</span></td>
                  <td style={s.td}><span style={{ fontSize: 12, color: '#0057FF', fontWeight: 600 }}>Open →</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Deal Workspace (full-page) ───────────────────────────────────────────────
// Visual priority: NEXT ACTION first, context second, progress/milestones/notes
// third, GHL communication history last (context, not the operating interface).

function DealWorkspace({ client: c, deal, onClose, onSwitchDeal, onRefresh }) {
  const [ghlContact, setGhlContact] = useState(null);
  const [touchpoints, setTouchpoints] = useState(c.touchpoints || []);
  const [milestones, setMilestones] = useState(c.milestones || {});
  const [clientNotes, setClientNotes] = useState(c.notes || '');
  const [notesSaved, setNotesSaved] = useState(false);
  const [showFundingModal, setShowFundingModal] = useState(false);
  const [showAttorneyModal, setShowAttorneyModal] = useState(false);
  const [showDevModal, setShowDevModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);

  // Touchpoint logger
  const [tpMedium, setTpMedium] = useState('call');
  const [tpParty, setTpParty] = useState('candidate');
  const [tpNote, setTpNote] = useState('');
  const [tpSavedMsg, setTpSavedMsg] = useState('');

  useEffect(() => {
    setTouchpoints(c.touchpoints || []);
    setMilestones(c.milestones || {});
    setClientNotes(c.notes || '');
  }, [c.id]);

  useEffect(() => {
    if (!c.email) return;
    fetch(`/api/dashboard/ghl-contact-detail?email=${encodeURIComponent(c.email)}`)
      .then(r => r.json())
      .then(d => setGhlContact(d.contact || null))
      .catch(() => {});
  }, [c.email]);

  const top = deal.top_attention;
  const na = top || (deal.next_action_type ? {
    action: { type: deal.next_action_type, label: `${NEXT_ACTION_TYPES[deal.next_action_type]?.label || 'Do'} — ${c.first_name}` },
    reason: deal.next_action_due_at ? `Planned next action, due ${fmtDateTime(deal.next_action_due_at)}.` : 'Planned next action.',
    objective: deal.next_action_note || 'Complete the planned next step and set the following one.',
  } : null);

  async function patchDeal(fields) {
    await fetch('/api/dashboard/dealos-deal-update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deal.id, ...fields }),
    }).catch(console.error);
    onRefresh();
  }

  async function saveMilestone(key, mData) {
    const updated = { ...milestones, [key]: mData };
    setMilestones(updated);
    await fetch('/api/dashboard/nurture-update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, milestones: updated }),
    }).catch(console.error);
    onRefresh();
  }

  async function saveNotes() {
    await fetch('/api/dashboard/nurture-update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, notes: clientNotes }),
    }).catch(console.error);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  }

  async function logTouchpoint() {
    if (!tpNote.trim()) return;
    const newTP = {
      id: `tp_${Date.now()}`, medium: tpMedium, party: tpParty, note: tpNote.trim(),
      created_at: new Date().toISOString(), created_by: 'me',
    };
    setTouchpoints(prev => [newTP, ...prev]);
    setTpNote('');
    await fetch('/api/dashboard/nurture-touchpoint', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nurture_client_id: c.id, medium: tpMedium, note: newTP.note,
        deal_id: deal.id, party: tpParty,
      }),
    }).catch(console.error);
    setTpSavedMsg(`${tpParty === 'developer' ? 'Developer' : 'Candidate'} ${tpMedium} logged ✓`);
    setTimeout(() => setTpSavedMsg(''), 2500);
    onRefresh();
  }

  async function saveEvent(body) {
    await fetch('/api/dashboard/dealos-event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(console.error);
    onRefresh();
  }

  const lastEvent = deal.last_completed_event;
  const candTone = contactTone(deal.days_since_candidate_contact, 7);
  const devTone = contactTone(deal.days_since_developer_contact, 10);
  const openDeals = (c.deals || []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#F3F4F6', overflow: 'auto' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '20px 20px 60px' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <button onClick={onClose} style={s.ghostBtn}>← Back to DealOS</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {openDeals.length > 1 && openDeals.map(d => (
              <button
                key={d.id}
                onClick={() => onSwitchDeal(d.id)}
                style={{
                  ...s.ghostBtn, padding: '5px 12px', fontSize: 12,
                  ...(d.id === deal.id ? { background: '#EFF6FF', borderColor: '#93C5FD', color: '#1D4ED8', fontWeight: 700 } : {}),
                }}
              >
                {d.brand_name}
              </button>
            ))}
            <button onClick={onClose} style={{ ...s.ghostBtn, color: '#9CA3AF' }}>✕ Close</button>
          </div>
        </div>

        {/* Header: candidate + deal identity + status control */}
        <div style={{ ...s.card, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={s.avatar}>{c.first_name?.[0]}{c.last_name?.[0]}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#111827' }}>
              {c.first_name} {c.last_name}
              <span style={{ fontWeight: 600, color: '#6B7280', fontSize: 14 }}> · {deal.brand_name}</span>
            </div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
              {c.email}{c.phone ? ` · ${c.phone}` : ''} · {c.days_in_process}d in process
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={deal.deal_status}
              onChange={e => patchDeal({ deal_status: e.target.value })}
              style={{ padding: '7px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', color: '#111827', background: '#fff', cursor: 'pointer' }}
            >
              {Object.entries(DEAL_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {!deal.outcome ? (
              <>
                <button onClick={() => patchDeal({ outcome: 'won', deal_status: 'paid' })} style={{ ...s.miniAction, background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D' }}>✓ Won</button>
                <button onClick={() => patchDeal({ outcome: 'lost', deal_status: 'closed' })} style={{ ...s.miniAction, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }}>Lost</button>
                <button onClick={() => patchDeal({ outcome: 'withdrawn', deal_status: 'closed' })} style={{ ...s.miniAction }}>Withdrawn</button>
              </>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 700, color: DEAL_OUTCOMES[deal.outcome]?.color, background: DEAL_OUTCOMES[deal.outcome]?.bg, padding: '4px 12px', borderRadius: 10 }}>
                {DEAL_OUTCOMES[deal.outcome]?.label}
              </span>
            )}
          </div>
        </div>

        {/* ── NEXT ACTION — the highest-priority element ── */}
        <div style={{
          background: '#fff', borderRadius: 10, marginBottom: 12, overflow: 'hidden',
          border: `2px solid ${na ? (top?.jeopardy ? '#FCA5A5' : '#FCD34D') : '#E2E8F0'}`,
          boxShadow: '0 2px 12px rgba(15,23,42,.06)',
        }}>
          <div style={{ padding: '18px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: top?.jeopardy ? '#B91C1C' : '#92400E', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                Next Action
              </div>
              <button onClick={() => setShowActionModal(true)} style={{ ...s.ghostBtn, padding: '4px 10px', fontSize: 11 }}>
                {deal.next_action_type ? 'Edit planned action' : '+ Plan an action'}
              </button>
            </div>
            {na ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 26, lineHeight: 1 }}>{NEXT_ACTION_TYPES[na.action?.type]?.icon || '☑️'}</span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: '#111827', lineHeight: 1.2 }}>{na.action?.label}</span>
                  <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                    {c.phone && <a href={`tel:${c.phone}`} style={{ ...s.miniAction, fontSize: 13, padding: '8px 16px' }}>📞 Call</a>}
                    {c.phone && <a href={`sms:${c.phone}`} style={{ ...s.miniAction, fontSize: 13, padding: '8px 16px' }}>💬 Text</a>}
                    {c.email && <a href={`mailto:${c.email}`} style={{ ...s.miniAction, fontSize: 13, padding: '8px 16px' }}>✉️ Email</a>}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ ...s.aroLabel, color: '#92400E' }}>Why this is surfaced</div>
                    <div style={{ fontSize: 13, color: '#78350F', marginTop: 4, lineHeight: 1.5 }}>{na.reason}</div>
                  </div>
                  <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ ...s.aroLabel, color: '#1D4ED8' }}>What to accomplish</div>
                    <div style={{ fontSize: 13, color: '#1E3A5F', marginTop: 4, lineHeight: 1.5 }}>{na.objective}</div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: '#9CA3AF', marginTop: 8 }}>
                Nothing urgent on this deal. Plan the next action so it never goes quiet.
              </div>
            )}
          </div>
        </div>

        {/* ── Context strip: events, contacts, sentiment, commission ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 12 }}>
          <ContextCard label="Last Meaningful Event">
            {lastEvent ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{lastEvent.title || EVENT_TYPES[lastEvent.event_type]?.label}</div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{fmtDateTime(lastEvent.completed_at)}</div>
                {!lastEvent.debrief_done && (
                  <button
                    onClick={() => saveEvent({ id: lastEvent.id, debrief_done: true })}
                    style={{ ...s.miniAction, marginTop: 6, fontSize: 10 }}
                  >
                    Mark debrief done
                  </button>
                )}
              </>
            ) : <Empty>No completed events yet</Empty>}
          </ContextCard>
          <ContextCard label="Contacts">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#6B7280' }}>Candidate</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: candTone.color, background: candTone.bg, padding: '1px 8px', borderRadius: 10 }}>
                  {relDays(deal.last_candidate_contact_at)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#6B7280' }}>Developer</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: devTone.color, background: devTone.bg, padding: '1px 8px', borderRadius: 10 }}>
                  {relDays(deal.last_developer_contact_at)}
                </span>
              </div>
            </div>
          </ContextCard>
          <ContextCard label="Next Event">
            {deal.next_event_at ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8' }}>{EVENT_TYPES[deal.next_event_type]?.label || 'Event'}</div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{fmtDateTime(deal.next_event_at)}</div>
              </>
            ) : <Empty>None scheduled</Empty>}
            <button onClick={() => setShowEventModal(true)} style={{ ...s.miniAction, marginTop: 6, fontSize: 10 }}>+ Add event</button>
          </ContextCard>
          <ContextCard label="Potential Commission">
            <CommissionEditor value={deal.estimated_commission} onSave={v => patchDeal({ estimated_commission: v })} />
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <SentimentDots label="Candidate" value={deal.sentiment} onChange={v => patchDeal({ sentiment: v })} />
              <SentimentDots label="Developer" value={deal.developer_sentiment} onChange={v => patchDeal({ developer_sentiment: v })} />
            </div>
          </ContextCard>
        </div>

        {/* ── Waiting-on + milestones row ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <WaitingEditor deal={deal} onSave={patchDeal} />
          <PendingMilestonesBar
            milestones={milestones}
            onOpenFunding={() => setShowFundingModal(true)}
            onOpenAttorney={() => setShowAttorneyModal(true)}
          />
        </div>

        {/* ── Middle grid: deal detail + logger ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 12, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Deal events / process */}
            <div style={s.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={s.cardTitle}>Deal Events & Milestones</div>
                <button onClick={() => setShowEventModal(true)} style={{ ...s.miniAction, fontSize: 11 }}>+ Add</button>
              </div>
              {(deal.events || []).length === 0 ? (
                <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '18px 0' }}>
                  No events yet — track franchisor process steps here (validation, Discovery Day, award…).
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  {[...deal.events].sort((a, b) =>
                    new Date(a.scheduled_at || a.completed_at || a.created_at) - new Date(b.scheduled_at || b.completed_at || b.created_at)
                  ).map(ev => (
                    <EventRow key={ev.id} ev={ev} onSave={saveEvent} />
                  ))}
                </div>
              )}
            </div>

            {/* Developer contact */}
            <div style={s.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={s.cardTitle}>Developer Contact — {deal.brand_name}</div>
                <button onClick={() => setShowDevModal(true)} style={{ ...s.miniAction, fontSize: 11 }}>
                  {deal.developer_name || deal.developer_phone || deal.developer_email ? 'Edit' : '+ Add'}
                </button>
              </div>
              {deal.developer_name || deal.developer_phone || deal.developer_email ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{deal.developer_name || 'Developer'}</span>
                  {deal.developer_phone && <a href={`tel:${deal.developer_phone}`} style={{ fontSize: 12, color: '#0057FF', textDecoration: 'none' }}>📞 {deal.developer_phone}</a>}
                  {deal.developer_email && <a href={`mailto:${deal.developer_email}`} style={{ fontSize: 12, color: '#0057FF', textDecoration: 'none' }}>✉️ {deal.developer_email}</a>}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 10 }}>No developer contact on file.</div>
              )}
            </div>

            {/* Candidate notes */}
            <div style={s.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={s.cardTitle}>Candidate Notes</div>
                {notesSaved && <span style={{ fontSize: 11, color: '#15803D', fontWeight: 600 }}>Saved ✓</span>}
              </div>
              <textarea
                style={{ ...s.notesArea, marginTop: 10 }}
                rows={4}
                value={clientNotes}
                onChange={e => setClientNotes(e.target.value)}
                placeholder="Liquidity, motivations, spouse, timeline…"
              />
              <button onClick={saveNotes} style={{ ...s.ghostBtn, marginTop: 6, fontSize: 12 }}>Save Notes</button>
            </div>
          </div>

          {/* Right rail: log a touchpoint */}
          <div style={s.card}>
            <div style={s.cardTitle}>Log Contact</div>
            {tpSavedMsg ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 20 }}>✓</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#15803D', marginTop: 4 }}>{tpSavedMsg}</div>
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {[['candidate', `👤 ${c.first_name || 'Candidate'}`], ['developer', `🏢 ${deal.developer_name || 'Developer'}`]].map(([party, label]) => (
                    <button key={party} onClick={() => setTpParty(party)} style={{
                      flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700, borderRadius: 5,
                      border: `1.5px solid ${tpParty === party ? '#1D4ED8' : '#E5E7EB'}`,
                      background: tpParty === party ? '#EFF6FF' : '#F9FAFB',
                      color: tpParty === party ? '#1D4ED8' : '#6B7280',
                      cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['call', 'email', 'text', 'meeting', 'note'].map(m => (
                    <button key={m} onClick={() => setTpMedium(m)} style={{
                      flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 600, borderRadius: 5,
                      border: `1.5px solid ${tpMedium === m ? (m === 'note' ? '#D97706' : '#1D4ED8') : '#E5E7EB'}`,
                      background: tpMedium === m ? (m === 'note' ? '#FFFBEB' : '#EFF6FF') : '#F9FAFB',
                      color: tpMedium === m ? (m === 'note' ? '#D97706' : '#1D4ED8') : '#6B7280',
                      cursor: 'pointer', textTransform: 'capitalize', fontFamily: 'inherit',
                    }}>
                      {m}
                    </button>
                  ))}
                </div>
                <textarea
                  style={{ ...s.notesArea, marginTop: 8, fontSize: 12 }}
                  rows={3}
                  placeholder={tpMedium === 'note' ? 'Add a note…' : `Notes from this ${tpMedium} with the ${tpParty}…`}
                  value={tpNote}
                  onChange={e => setTpNote(e.target.value)}
                />
                <button
                  onClick={logTouchpoint}
                  disabled={!tpNote.trim()}
                  style={{
                    ...s.primaryBtn, marginTop: 6, width: '100%',
                    background: tpMedium === 'note' ? '#D97706' : '#0057FF',
                    opacity: !tpNote.trim() ? 0.5 : 1, cursor: !tpNote.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {tpMedium === 'note' ? 'Save Note' : `Log ${tpMedium.charAt(0).toUpperCase() + tpMedium.slice(1)}`}
                </button>
                <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 6, lineHeight: 1.4 }}>
                  Contacts update the {tpParty === 'developer' ? 'Last Developer Contact' : 'Last Candidate Contact'} clock. Notes don't reset clocks.
                </div>
              </div>
            )}

            {/* GHL enrichment chips */}
            {ghlContact?.custom_fields && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
                <div style={s.cardTitle}>Candidate Intel</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  {(ghlContact.custom_fields['Liquid Cash'] || ghlContact.custom_fields['Cash Available']) && (
                    <div style={{ fontSize: 12, color: '#374151' }}>💰 {ghlContact.custom_fields['Liquid Cash'] || ghlContact.custom_fields['Cash Available']}</div>
                  )}
                  {(ghlContact.custom_fields['Territory Interest'] || ghlContact.custom_fields['Areas of Interest']) && (
                    <div style={{ fontSize: 12, color: '#374151' }}>📍 {ghlContact.custom_fields['Territory Interest'] || ghlContact.custom_fields['Areas of Interest']}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── GHL communication history — preserved, but demoted to the bottom ── */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
            Communication History <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>— context, not the to-do list</span>
          </div>
          <CommunicationsPanel client={c} touchpoints={touchpoints} contactId={ghlContact?.id} />
        </div>
      </div>

      {/* Modals */}
      {showFundingModal && (
        <FundingModal existing={milestones.funding} onSave={d => saveMilestone('funding', d)} onClose={() => setShowFundingModal(false)} />
      )}
      {showAttorneyModal && (
        <AttorneyModal existing={milestones.attorney} onSave={d => saveMilestone('attorney', d)} onClose={() => setShowAttorneyModal(false)} />
      )}
      {showDevModal && (
        <DeveloperContactModal brand={deal} onSave={f => { patchDeal(f); setShowDevModal(false); }} onClose={() => setShowDevModal(false)} />
      )}
      {showEventModal && (
        <EventModal dealId={deal.id} onSave={b => { saveEvent(b); setShowEventModal(false); }} onClose={() => setShowEventModal(false)} />
      )}
      {showActionModal && (
        <PlanActionModal deal={deal} onSave={f => { patchDeal(f); setShowActionModal(false); }} onClose={() => setShowActionModal(false)} />
      )}
    </div>
  );
}

function ContextCard({ label, children }) {
  return (
    <div style={{ ...s.card, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ fontSize: 12, color: '#C4C4C4' }}>{children}</div>;
}

function CommissionEditor({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? '');

  if (!editing) {
    return (
      <button onClick={() => { setVal(value ?? ''); setEditing(true); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: value != null ? '#15803D' : '#C4C4C4' }}>
          {fmtMoney(value) || 'Set $'}
        </span>
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      <input
        type="number" value={val} autoFocus
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onSave(val === '' ? null : Number(val)); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
        placeholder="15000"
        style={{ width: 100, padding: '5px 8px', border: '1px solid #E5E7EB', borderRadius: 5, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
      />
      <button onClick={() => { onSave(val === '' ? null : Number(val)); setEditing(false); }} style={{ ...s.miniAction, fontSize: 11 }}>Save</button>
    </div>
  );
}

function SentimentDots({ label, value, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', gap: 3 }}>
        {Object.entries(SENTIMENTS).map(([k, v]) => (
          <button
            key={k}
            title={v.label}
            onClick={() => onChange(value === k ? null : k)}
            style={{
              width: 22, height: 22, borderRadius: 5, fontSize: 11, padding: 0,
              border: `1.5px solid ${value === k ? v.border : '#F0F0F0'}`,
              background: value === k ? v.bg : '#FAFAFA',
              cursor: 'pointer', opacity: value && value !== k ? 0.45 : 1,
            }}
          >
            {v.emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

function WaitingEditor({ deal, onSave }) {
  const days = daysBetween(deal.waiting_since);
  const windowDays = deal.waiting_on ? (WAITING_WINDOWS_DAYS[deal.waiting_on] ?? 5) : null;
  const over = days !== null && windowDays !== null && days > windowDays;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: deal.waiting_on ? (over ? '#FEF2F2' : '#FFFBEB') : '#fff', border: `1px solid ${deal.waiting_on ? (over ? '#FECACA' : '#FDE68A') : '#E2E8F0'}`, borderRadius: 7, padding: '8px 12px' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.04em' }}>⏳ Waiting on</span>
      <select
        value={deal.waiting_on || ''}
        onChange={e => onSave({ waiting_on: e.target.value || null })}
        style={{ padding: '4px 8px', border: '1px solid #E5E7EB', borderRadius: 5, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}
      >
        <option value="">Nothing</option>
        {Object.entries(WAITING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {deal.waiting_on && (
        <>
          <input
            defaultValue={deal.waiting_note || ''}
            placeholder="what for?"
            onBlur={e => { if (e.target.value !== (deal.waiting_note || '')) onSave({ waiting_on: deal.waiting_on, waiting_since: deal.waiting_since, waiting_note: e.target.value }); }}
            style={{ padding: '4px 8px', border: '1px solid #E5E7EB', borderRadius: 5, fontSize: 12, fontFamily: 'inherit', width: 160, outline: 'none' }}
          />
          <span style={{ fontSize: 11, fontWeight: 700, color: over ? '#B91C1C' : '#92400E' }}>
            {days === null ? '' : `${days}d`}{over ? ` (${days - windowDays}d over window)` : ''}
          </span>
        </>
      )}
    </div>
  );
}

function EventRow({ ev, onSave }) {
  const info = EVENT_TYPES[ev.event_type] || EVENT_TYPES.other;
  const done = !!ev.completed_at;
  const upcoming = !done && ev.scheduled_at && new Date(ev.scheduled_at) > new Date();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
      background: done ? '#F9FAFB' : upcoming ? '#EFF6FF' : '#FFFBEB',
      border: `1px solid ${done ? '#E5E7EB' : upcoming ? '#BFDBFE' : '#FDE68A'}`,
      borderRadius: 7,
    }}>
      <span style={{ fontSize: 13 }}>{done ? '✅' : upcoming ? '📅' : '🕒'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{ev.title || info.label}</div>
        <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>
          {done ? `Completed ${fmtDateTime(ev.completed_at)}` : ev.scheduled_at ? `Scheduled ${fmtDateTime(ev.scheduled_at)}` : 'Unscheduled'}
          {done && !ev.debrief_done && <span style={{ color: '#B91C1C', fontWeight: 700 }}> · debrief pending</span>}
          {done && ev.debrief_done && <span style={{ color: '#15803D' }}> · debriefed ✓</span>}
        </div>
      </div>
      {!done && (
        <button onClick={() => onSave({ id: ev.id, completed_at: new Date().toISOString() })} style={{ ...s.miniAction, fontSize: 10 }}>
          Mark completed
        </button>
      )}
      {done && !ev.debrief_done && (
        <button onClick={() => onSave({ id: ev.id, debrief_done: true })} style={{ ...s.miniAction, fontSize: 10 }}>
          Debrief done
        </button>
      )}
    </div>
  );
}

function EventModal({ dealId, onSave, onClose }) {
  const [eventType, setEventType] = useState('validation');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [completed, setCompleted] = useState(false);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 10, width: 460, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #E8EAED' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Add Deal Event</div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={s.modalLabel}>Event Type</div>
            <select value={eventType} onChange={e => setEventType(e.target.value)} style={s.modalInput}>
              {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <div style={s.modalLabel}>Title (optional)</div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Validation call with existing franchisees" style={s.modalInput} />
          </div>
          <div>
            <div style={s.modalLabel}>{completed ? 'Date Completed' : 'Scheduled Date'}</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={s.modalInput} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
            <input type="checkbox" checked={completed} onChange={e => setCompleted(e.target.checked)} />
            Already happened
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={s.ghostBtn}>Cancel</button>
            <button
              onClick={() => onSave({
                deal_id: dealId,
                event_type: eventType,
                title: title.trim() || null,
                scheduled_at: completed ? null : `${date}T12:00:00Z`,
                completed_at: completed ? `${date}T12:00:00Z` : null,
              })}
              style={s.primaryBtn}
            >
              Save Event
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanActionModal({ deal, onSave, onClose }) {
  const [type, setType] = useState(deal.next_action_type || 'call');
  const [note, setNote] = useState(deal.next_action_note || '');
  const [due, setDue] = useState(deal.next_action_due_at ? deal.next_action_due_at.slice(0, 10) : new Date().toISOString().slice(0, 10));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 10, width: 460, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #E8EAED' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Plan Next Action</div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={s.modalLabel}>Action Type</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.entries(NEXT_ACTION_TYPES).map(([k, v]) => (
                <button key={k} onClick={() => setType(k)} style={{
                  flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 5,
                  border: `1.5px solid ${type === k ? '#1D4ED8' : '#E5E7EB'}`,
                  background: type === k ? '#EFF6FF' : '#F9FAFB',
                  color: type === k ? '#1D4ED8' : '#6B7280',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={s.modalLabel}>What should this accomplish?</div>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="e.g. Confirm conviction after validation and lock the Discovery Day date"
              style={{ ...s.modalInput, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          <div>
            <div style={s.modalLabel}>Due Date</div>
            <input type="date" value={due} onChange={e => setDue(e.target.value)} style={s.modalInput} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 4 }}>
            {deal.next_action_type ? (
              <button
                onClick={() => onSave({ next_action_type: null, next_action_note: null, next_action_due_at: null })}
                style={{ ...s.ghostBtn, color: '#B91C1C' }}
              >
                Clear action
              </button>
            ) : <span />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={s.ghostBtn}>Cancel</button>
              <button
                onClick={() => onSave({ next_action_type: type, next_action_note: note.trim() || null, next_action_due_at: `${due}T17:00:00Z` })}
                style={s.primaryBtn}
              >
                Save Action
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Funding / Attorney / Developer modals (preserved from Nurture) ───────────

function FundingModal({ existing, onSave, onClose }) {
  const [company, setCompany] = useState(existing?.company || '');
  const [date, setDate] = useState(existing?.date || new Date().toISOString().slice(0, 10));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 10, width: 460, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #E8EAED' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Funding Introduction</div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={s.modalLabel}>Funding Company</div>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Benetrends, FranFund, Capital One…" autoFocus style={s.modalInput} />
          </div>
          <div>
            <div style={s.modalLabel}>Date of Introduction</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={s.modalInput} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={s.ghostBtn}>Cancel</button>
            <button
              onClick={() => { if (company.trim()) { onSave({ company: company.trim(), date, done: true }); onClose(); } }}
              disabled={!company.trim()}
              style={{ ...s.primaryBtn, background: '#6D28D9', opacity: !company.trim() ? 0.5 : 1 }}
            >
              Save Introduction ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttorneyModal({ existing, onSave, onClose }) {
  const [attorneyName, setAttorneyName] = useState(existing?.attorney_name || '');
  const [lawFirm, setLawFirm] = useState(existing?.law_firm || '');
  const [date, setDate] = useState(existing?.date || new Date().toISOString().slice(0, 10));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 10, width: 460, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #E8EAED' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Attorney Introduction</div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={s.modalLabel}>Attorney Name</div>
            <input value={attorneyName} onChange={e => setAttorneyName(e.target.value)} placeholder="Attorney's full name" autoFocus style={s.modalInput} />
          </div>
          <div>
            <div style={s.modalLabel}>Law Firm</div>
            <input value={lawFirm} onChange={e => setLawFirm(e.target.value)} placeholder="Law firm name" style={s.modalInput} />
          </div>
          <div>
            <div style={s.modalLabel}>Date of Introduction</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={s.modalInput} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={s.ghostBtn}>Cancel</button>
            <button
              onClick={() => { if (attorneyName.trim()) { onSave({ attorney_name: attorneyName.trim(), law_firm: lawFirm.trim(), date, done: true }); onClose(); } }}
              disabled={!attorneyName.trim()}
              style={{ ...s.primaryBtn, background: '#6D28D9', opacity: !attorneyName.trim() ? 0.5 : 1 }}
            >
              Save Introduction ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeveloperContactModal({ brand, onSave, onClose }) {
  const [name, setName] = useState(brand.developer_name || '');
  const [phone, setPhone] = useState(brand.developer_phone || '');
  const [email, setEmail] = useState(brand.developer_email || '');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 10, width: 420, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #E8EAED' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Developer Contact — {brand.brand_name}</div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={s.modalLabel}>Name</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Developer's full name" autoFocus style={s.modalInput} />
          </div>
          <div>
            <div style={s.modalLabel}>Phone</div>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(800) 555-0100" type="tel" style={s.modalInput} />
          </div>
          <div>
            <div style={s.modalLabel}>Email</div>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="developer@brand.com" type="email" style={s.modalInput} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={s.ghostBtn}>Cancel</button>
            <button onClick={() => onSave({ developer_name: name.trim(), developer_phone: phone.trim(), developer_email: email.trim() })} style={s.primaryBtn}>
              Save Contact
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pending Milestones Bar (funding / attorney checkpoints) ──────────────────

function PendingMilestonesBar({ milestones = {}, onOpenFunding, onOpenAttorney }) {
  const funding = milestones.funding;
  const attorney = milestones.attorney;

  function fmtDate(d) {
    if (!d) return '';
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {funding?.done ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 7, padding: '8px 12px' }}>
          <span style={{ fontSize: 15 }}>✓</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#15803D' }}>Funding Intro Done</div>
            {funding.company && <div style={{ fontSize: 10, color: '#6B7280' }}>{funding.company}{funding.date ? ` · ${fmtDate(funding.date)}` : ''}</div>}
          </div>
          <button onClick={onOpenFunding} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 11, paddingLeft: 4 }}>Edit</button>
        </div>
      ) : (
        <button
          onClick={onOpenFunding}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FAF5FF', border: '2px solid #C4B5FD', borderRadius: 7, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '.04em' }}>$</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9' }}>Funding Intro Needed</div>
            <div style={{ fontSize: 10, color: '#7C3AED' }}>Click to record introduction</div>
          </div>
        </button>
      )}
      {attorney?.done ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 7, padding: '8px 12px' }}>
          <span style={{ fontSize: 15 }}>✓</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#15803D' }}>Attorney Intro Done</div>
            {attorney.attorney_name && <div style={{ fontSize: 10, color: '#6B7280' }}>{attorney.attorney_name}{attorney.law_firm ? ` · ${attorney.law_firm}` : ''}</div>}
          </div>
          <button onClick={onOpenAttorney} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 11, paddingLeft: 4 }}>Edit</button>
        </div>
      ) : (
        <button
          onClick={onOpenAttorney}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#EFF6FF', border: '2px solid #BFDBFE', borderRadius: 7, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '.04em' }}>J</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8' }}>Attorney Intro Needed</div>
            <div style={{ fontSize: 10, color: '#3B82F6' }}>Click to record introduction</div>
          </div>
        </button>
      )}
    </div>
  );
}

// ─── Message bubble + Communications panel (preserved GHL integration) ────────

function MessageBubble({ msg }) {
  const ts = new Date(msg.dateAdded);
  const label = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (msg.type === 'note' || msg.type === 'notes') {
    return (
      <div style={{
        background: '#FFFBEB', border: '1px solid #FDE68A', borderLeft: '3px solid #F59E0B',
        borderRadius: 7, padding: '9px 12px', margin: '2px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '.05em' }}>Note</span>
          <span style={{ fontSize: 10, color: '#C4C4C4' }}>{label}</span>
        </div>
        <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{msg.body}</div>
      </div>
    );
  }

  if (msg.type === 'call' || msg.type === 'meeting') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
        <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
        <span style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
          {msg.type === 'meeting' ? 'Meeting' : msg.direction === 'inbound' ? 'Incoming call' : 'Outgoing call'} · {label}
          {msg.body && <span style={{ color: '#6B7280' }}>— {msg.body}</span>}
        </span>
        <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
      </div>
    );
  }

  const isOut = msg.direction === 'outbound';
  const isSms = msg.type === 'sms';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isOut ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {!isOut && <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 500 }}>{isSms ? 'SMS' : 'Email'}</span>}
        <span style={{ fontSize: 10, color: '#C4C4C4' }}>{label}</span>
        {isOut && <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 500 }}>{isSms ? 'SMS' : 'Email'}</span>}
      </div>
      <div style={{
        maxWidth: '80%', padding: '9px 13px',
        borderRadius: isOut ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
        background: isOut ? '#1E3A5F' : '#F3F4F6',
        color: isOut ? '#FFFFFF' : '#1F2937',
        fontSize: 13, lineHeight: 1.55, wordBreak: 'break-word',
      }}>
        {msg.subject && <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 5, opacity: 0.75 }}>{msg.subject}</div>}
        {msg.body || <em style={{ opacity: 0.5 }}>(no body)</em>}
      </div>
      {isOut && msg.status && msg.status !== 'sent' && (
        <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{msg.status}</div>
      )}
    </div>
  );
}

function CommunicationsPanel({ client, touchpoints, contactId }) {
  const feedRef = useRef(null);

  const [ghlMessages, setGhlMessages] = useState([]);
  const [loadingConv, setLoadingConv] = useState(false);

  const [composeType, setComposeType] = useState('sms');
  const [composeBody, setComposeBody] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const name = `${client.first_name} ${client.last_name}`;

  useEffect(() => {
    if (!contactId) return;
    setLoadingConv(true);
    fetch(`/api/dashboard/nurture-conversation?contactId=${contactId}`)
      .then(r => r.json())
      .then(data => setGhlMessages(data.messages || []))
      .catch(() => {})
      .finally(() => setLoadingConv(false));
  }, [contactId]);

  const timeline = useMemo(() => {
    const tpItems = (touchpoints || []).map(tp => ({
      id: `tp_${tp.id}`,
      direction: 'outbound',
      type: tp.medium === 'text' ? 'sms' : tp.medium,
      body: tp.note || '',
      subject: null,
      dateAdded: tp.created_at,
      status: 'logged',
      source: 'touchpoint',
    }));
    return [...ghlMessages, ...tpItems].sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded));
  }, [ghlMessages, touchpoints]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [timeline]);

  async function send() {
    const body = composeBody.trim();
    if (!body) return;
    setSending(true);
    setSendError('');

    const optimisticMsg = {
      id: `opt_${Date.now()}`, direction: 'outbound', type: composeType, body,
      subject: composeSubject.trim() || null, dateAdded: new Date().toISOString(),
      status: 'sending', source: 'optimistic',
    };
    setGhlMessages(prev => [...prev, optimisticMsg]);
    setComposeBody('');
    setComposeSubject('');

    try {
      const endpoint = composeType === 'sms' ? '/api/dashboard/send-sms' : '/api/dashboard/send-email';
      const payload = composeType === 'sms'
        ? { phone: client.phone, message: body, contactId }
        : { to_email: client.email, subject: composeSubject.trim() || `Message to ${name}`, body };

      const r = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();

      if (data.ok && !data.fallback) {
        setGhlMessages(prev => prev.map(m => m.id === optimisticMsg.id ? { ...m, status: 'sent' } : m));
      } else if (data.fallback && (data.smsLink || data.mailto)) {
        window.open(data.smsLink || data.mailto, '_blank');
        setGhlMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
        setSendError(`Opened your ${composeType === 'sms' ? 'SMS' : 'email'} app as a fallback.`);
      } else {
        throw new Error(data.error || 'Send failed');
      }
    } catch (e) {
      setSendError(e.message || 'Failed to send');
      setGhlMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
    } finally {
      setSending(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  }

  const canSms = !!client.phone;
  const canEmail = !!client.email;

  return (
    <div style={{ ...s.card, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', height: 440 }}>
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #F0F0F0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={s.cardTitle}>Communications</div>
          {loadingConv && <span style={{ fontSize: 11, color: '#9CA3AF' }}>Loading…</span>}
          {!loadingConv && !contactId && <span style={{ fontSize: 11, color: '#F59E0B' }}>No GHL contact linked</span>}
          {!loadingConv && contactId && <span style={{ fontSize: 11, color: '#10B981' }}>● Live</span>}
        </div>
      </div>

      <div ref={feedRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
        {timeline.length === 0 && !loadingConv && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#D1D5DB' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#9CA3AF' }}>No messages yet</div>
            <div style={{ fontSize: 11, marginTop: 4, color: '#C4C4C4' }}>Send an SMS or email below to start the conversation</div>
          </div>
        )}
        {loadingConv && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#D1D5DB', fontSize: 13 }}>Loading conversation…</div>
        )}
        {timeline.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
      </div>

      <div style={{ borderTop: '1px solid #F0F0F0', flexShrink: 0, padding: '10px 12px 12px' }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {canSms && (
            <button
              onClick={() => setComposeType('sms')}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                background: composeType === 'sms' ? '#6D28D9' : '#F5F3FF',
                color: composeType === 'sms' ? '#FFFFFF' : '#6D28D9',
                border: composeType === 'sms' ? '1px solid #6D28D9' : '1px solid #DDD6FE',
              }}
            >
              SMS
            </button>
          )}
          {canEmail && (
            <button
              onClick={() => setComposeType('email')}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                background: composeType === 'email' ? '#1D4ED8' : '#EFF6FF',
                color: composeType === 'email' ? '#FFFFFF' : '#1D4ED8',
                border: composeType === 'email' ? '1px solid #1D4ED8' : '1px solid #BFDBFE',
              }}
            >
              Email
            </button>
          )}
          {!canSms && !canEmail && <span style={{ fontSize: 11, color: '#9CA3AF' }}>No phone or email on file</span>}
        </div>

        {composeType === 'email' && (
          <input
            value={composeSubject}
            onChange={e => setComposeSubject(e.target.value)}
            placeholder="Subject"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '7px 10px', marginBottom: 6,
              border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 12, fontFamily: 'inherit',
              color: '#1F2937', outline: 'none', background: '#FAFAFA',
            }}
          />
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={composeBody}
            onChange={e => setComposeBody(e.target.value)}
            onKeyDown={handleKey}
            placeholder={composeType === 'sms' ? `Text ${client.first_name}… (⌘↵ to send)` : `Email ${client.first_name}… (⌘↵ to send)`}
            rows={2}
            style={{
              flex: 1, resize: 'none', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 8,
              fontSize: 13, fontFamily: 'inherit', color: '#1F2937', outline: 'none', background: '#FAFAFA', lineHeight: 1.5,
            }}
          />
          <button
            onClick={send}
            disabled={sending || !composeBody.trim()}
            style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: sending || !composeBody.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              background: sending || !composeBody.trim() ? '#E5E7EB' : '#1E3A5F',
              color: sending || !composeBody.trim() ? '#9CA3AF' : '#FFFFFF',
              border: 'none', transition: 'background 0.15s', alignSelf: 'flex-end',
            }}
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>

        {sendError && <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 6 }}>{sendError}</div>}
      </div>
    </div>
  );
}

// ─── Styles (shared shell language with the rest of the dashboard) ────────────

const s = {
  page:        { display: 'flex', minHeight: '100vh', background: '#FAFBFD', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },

  sidebar:          { width: 210, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', zIndex: 10 },
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
  topActions:       { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  pageBody:         { flex: 1, padding: '20px 24px', overflowY: 'auto' },

  card:       { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px', boxShadow: '0 1px 3px rgba(15,23,42,.04)' },
  cardTitle:  { fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.07em' },

  table:      { width: '100%', borderCollapse: 'collapse' },
  th:         { fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.05em', padding: '8px 12px', background: '#F9FAFB', borderBottom: '1px solid #E8EAED', textAlign: 'left' },
  td:         { padding: '12px 12px', verticalAlign: 'middle', fontSize: 13 },

  avatar:     { width: 46, height: 46, borderRadius: '50%', background: '#EFF6FF', color: '#0057FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 },

  primaryBtn: { padding: '8px 18px', background: '#0057FF', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'background .15s' },
  ghostBtn:   { padding: '7px 14px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, color: '#475569', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  miniAction: { padding: '5px 11px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' },

  aroLabel:   { fontSize: 9, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.07em' },

  notesArea:  { width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#111827', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6, background: '#FFFDF0' },

  modalLabel: { fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 },
  modalInput: { width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, color: '#111827', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: '#fff' },

  loadingWrap:{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 16 },
  spinner:    { width: 28, height: 28, borderRadius: '50%', border: '2px solid #E2E8F0', borderTopColor: '#0057FF', animation: 'spin 0.8s linear infinite' },
  loadingText:{ color: '#6B7280', fontSize: 13 },

  closeBtn:   { width: 28, height: 28, borderRadius: '50%', border: '1px solid #E5E7EB', background: '#F9FAFB', cursor: 'pointer', fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' },
};
