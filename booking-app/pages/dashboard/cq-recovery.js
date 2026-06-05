import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../api/auth/[...nextauth]';

export async function getServerSideProps(ctx) {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session) return { redirect: { destination: '/dashboard/login', permanent: false } };
  return { props: {} };
}

// ─── Sidebar icon ─────────────────────────────────────────────────────────────
function SideIcon({ name }) {
  const p = { width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', style: { display: 'block' } };
  if (name === 'dashboard') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === 'leads')     return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  if (name === 'clients')   return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === 'meetings')  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (name === 'cq')        return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9.5 13.5a2 2 0 1 1 2.5 1.9c-.4.15-.5.4-.5.8"/><line x1="11.5" y1="18" x2="11.51" y2="18"/></svg>;
  if (name === 'nurture')   return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
  if (name === 'settings')  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
  return null;
}

const NAV = [
  { href: '/dashboard/analytics',   label: 'Dashboard',   icon: 'dashboard' },
  { href: '/dashboard/leads',       label: 'Leads',       icon: 'leads' },
  { href: '/dashboard/prospects',   label: 'Prospecting', icon: 'clients' },
  { href: '/dashboard/bookings',    label: 'Meetings',    icon: 'meetings' },
  { href: '/dashboard/cq-recovery', label: 'CQ Recovery', icon: 'cq', active: true },
  { href: '/dashboard/nurture',     label: 'Nurture',     icon: 'nurture' },
  { href: '/dashboard/settings',    label: 'Settings',    icon: 'settings' },
];

const URGENCY = {
  frozen: { label: 'Frozen', color: '#B91C1C', bg: '#FEE2E2', border: '#FECACA' },
  cold:   { label: 'Cold',   color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' },
  warm:   { label: 'Warm',   color: '#15803D', bg: '#DCFCE7', border: '#BBF7D0' },
  fresh:  { label: 'Fresh',  color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
};

function fmtActivity(a) {
  if (!a) return 'No activity logged';
  const label = (a.type || '').replace(/_/g, ' ');
  const when  = a.days_ago === 0 ? 'today' : a.days_ago === 1 ? '1 day ago' : `${a.days_ago} days ago`;
  return `${label} · ${when}`;
}

export default function CQRecovery() {
  const { data: session } = useSession();
  const router = useRouter();
  const [leads,    setLeads]    = useState([]);
  const [metrics,  setMetrics]  = useState({ total: 0, avgDays: 0, oldest: 0, goingCold: 0, recentlyActive: 0 });
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState({});       // { [email]: true }
  const [composer, setComposer] = useState(null);     // { lead, channel, subject, body, sending, sent }
  const [snoozeFor, setSnoozeFor] = useState(null);   // email with open snooze menu

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/dashboard/cq-recovery')
      .then(r => r.json())
      .then(d => { setLeads(d.leads || []); setMetrics(d.metrics || {}); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const keyOf = l => `${l.email}|${l.slot_start}`;
  function removeLead(l) {
    setLeads(ls => ls.filter(x => keyOf(x) !== keyOf(l)));
    setMetrics(m => ({ ...m, total: Math.max(0, (m.total || 1) - 1) }));
  }
  function setRowBusy(l, v) { setBusy(b => ({ ...b, [keyOf(l)]: v })); }

  async function markReceived(l) {
    setRowBusy(l, true);
    await fetch('/api/dashboard/mark-cq-received', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: l.booking_id || undefined, email: l.email, slot_start: l.slot_start }),
    }).catch(() => {});
    removeLead(l);
  }

  async function resendCQ(l) {
    setRowBusy(l, true);
    await fetch('/api/dashboard/send-cq', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: l.booking_id || undefined, email: l.email, slot_start: l.slot_start }),
    }).catch(() => {});
    setRowBusy(l, false);
    setLeads(ls => ls.map(x => keyOf(x) === keyOf(l) ? { ...x, _resent: true } : x));
  }

  async function snooze(l, days) {
    setSnoozeFor(null);
    setRowBusy(l, true);
    await fetch('/api/dashboard/cq-snooze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: l.email, slot_start: l.slot_start, days }),
    }).catch(() => {});
    removeLead(l);
  }

  function openComposer(l, channel) {
    const first = l.first_name || 'there';
    const body = `Hi ${first}, just following up on the questionnaire we sent over. Whenever you have a few minutes to complete it, we can line up your franchise matches. Anything I can help with in the meantime?`;
    setComposer({ lead: l, channel, subject: 'Following up on your questionnaire', body, sending: false, sent: false });
  }

  async function sendMessage() {
    if (!composer) return;
    const { lead, channel, subject, body } = composer;
    setComposer(c => ({ ...c, sending: true }));
    let url, payload;
    if (channel === 'email') {
      url = '/api/dashboard/send-email';
      payload = { to_email: lead.email, subject, body };
    } else if (channel === 'sms') {
      url = '/api/dashboard/send-sms';
      payload = { phone: lead.phone, message: body, contactId: lead.ghl_contact_id || undefined };
    } else {
      url = '/api/dashboard/send-imessage';
      payload = { address: lead.phone, message: body };
    }
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
    setComposer(c => ({ ...c, sending: false, sent: true }));
    setTimeout(() => setComposer(null), 1200);
  }

  const metricCards = [
    { label: 'Outstanding',     value: metrics.total ?? 0,           color: '#0F172A' },
    { label: 'Avg Days Waiting', value: metrics.avgDays ?? 0,         color: '#0F172A' },
    { label: 'Oldest (days)',   value: metrics.oldest ?? 0,          color: '#B91C1C' },
    { label: 'Going Cold',      value: metrics.goingCold ?? 0,       color: '#B45309' },
    { label: 'Recently Active', value: metrics.recentlyActive ?? 0,  color: '#15803D' },
  ];

  return (
    <>
      <Head><title>CQ Recovery — KANSO</title></Head>
      <div style={s.page}>
        {/* Sidebar */}
        <aside style={s.sidebar}>
          <div style={s.sideLogoWrap}>
            <div style={s.sideLogoRow}>
              <div style={s.sideLogoIcon}>K</div>
              <span style={s.sideLogoText}>KANSO</span>
            </div>
          </div>
          <nav style={s.sideNav}>
            {NAV.map(({ href, label, icon, active }) => (
              <Link key={label} href={href} style={{ ...s.sideNavItem, ...(active ? s.sideNavItemActive : {}) }}>
                <span style={{ color: active ? '#0057FF' : '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                  <SideIcon name={icon} />
                </span>
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <div style={s.sideBottom}>
            <div style={s.sideHelpRow}>
              <span style={{ color: '#9CA3AF', display: 'flex' }}><SideIcon name="help" /></span>
              <span style={{ fontSize: 13, color: '#6B7280' }}>Help</span>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={s.main}>
          <div style={s.topbar}>
            <div>
              <div style={s.topTitle}>CQ Recovery</div>
              <div style={s.topSub}>Questionnaires sent but not yet returned</div>
            </div>
            <button style={s.refreshBtn} onClick={load} disabled={loading}>{loading ? 'Loading…' : '↻ Refresh'}</button>
          </div>

          <div style={s.content}>
            {/* Metrics */}
            <div style={s.metricsRow}>
              {metricCards.map((m, i) => (
                <div key={m.label} style={{ ...s.metricCell, ...(i < metricCards.length - 1 ? { borderRight: '1px solid #E5E7EB' } : {}) }}>
                  <div style={{ ...s.metricNum, color: m.color }}>{m.value}</div>
                  <div style={s.metricLabel}>{m.label}</div>
                </div>
              ))}
            </div>

            {/* List */}
            {loading ? (
              <div style={s.empty}>Loading queue…</div>
            ) : leads.length === 0 ? (
              <div style={s.empty}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>No outstanding questionnaires 🎉</div>
                <div>Every CQ you’ve sent has been returned, snoozed, or marked received.</div>
              </div>
            ) : (
              <div style={s.list}>
                {leads.map(l => {
                  const u = URGENCY[l.urgency] || URGENCY.fresh;
                  const rb = busy[keyOf(l)];
                  return (
                    <div key={keyOf(l)} style={s.card}>
                      {/* Days + urgency */}
                      <div style={s.daysCol}>
                        <div style={{ ...s.daysNum, color: u.color }}>{l.days_waiting}</div>
                        <div style={s.daysUnit}>days</div>
                        <span style={{ ...s.urgencyBadge, color: u.color, background: u.bg, border: `1px solid ${u.border}` }}>{u.label}</span>
                      </div>

                      {/* Identity */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.name}>{(l.first_name || l.last_name) ? `${l.first_name} ${l.last_name}`.trim() : l.email}</div>
                        <div style={s.metaRow}>
                          {l.phone && <span>{l.phone}</span>}
                          <span style={{ color: '#CBD5E1' }}>·</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.email}</span>
                        </div>
                        <div style={s.metaRow}>
                          {l.liquid_capital && <span style={s.tag}>{l.liquid_capital}</span>}
                          {l.assigned_rep && <span style={s.repTag}>{l.assigned_rep}</span>}
                          <span style={s.activity}>{fmtActivity(l.last_activity)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={s.actions}>
                        <button style={s.actBtn}   onClick={() => openComposer(l, 'imessage')} disabled={!l.phone} title={l.phone ? '' : 'No phone on file'}>iMessage</button>
                        <button style={s.actBtn}   onClick={() => openComposer(l, 'sms')}      disabled={!l.phone} title={l.phone ? '' : 'No phone on file'}>SMS</button>
                        <button style={s.actBtn}   onClick={() => openComposer(l, 'email')}>Email</button>
                        <button style={s.actBtnGreen} onClick={() => markReceived(l)} disabled={rb}>✓ Received</button>
                        <button style={s.actBtn}   onClick={() => resendCQ(l)} disabled={rb}>{l._resent ? 'Resent ✓' : 'Resend CQ'}</button>
                        <div style={{ position: 'relative' }}>
                          <button style={s.actBtn} onClick={() => setSnoozeFor(snoozeFor === keyOf(l) ? null : keyOf(l))} disabled={rb}>Snooze ▾</button>
                          {snoozeFor === keyOf(l) && (
                            <div style={s.snoozeMenu}>
                              {[1, 3, 7].map(d => (
                                <button key={d} style={s.snoozeItem} onClick={() => snooze(l, d)}>{d === 1 ? '1 day' : d === 7 ? '1 week' : `${d} days`}</button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button style={s.actBtnGhost} onClick={() => router.push(`/dashboard/bookings?focus=${encodeURIComponent(l.email)}`)}>Open card →</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Composer modal */}
      {composer && (
        <div style={s.modalOverlay} onClick={() => !composer.sending && setComposer(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHdr}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>
                {composer.channel === 'email' ? 'Email' : composer.channel === 'sms' ? 'SMS' : 'iMessage'} — {composer.lead.first_name || composer.lead.email}
              </div>
              <button style={s.modalClose} onClick={() => !composer.sending && setComposer(null)}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>
                To: {composer.channel === 'email' ? composer.lead.email : (composer.lead.phone || '— no phone —')}
              </div>
              {composer.channel === 'email' && (
                <input style={s.input} value={composer.subject} onChange={e => setComposer(c => ({ ...c, subject: e.target.value }))} placeholder="Subject" />
              )}
              <textarea style={{ ...s.input, minHeight: 130, resize: 'vertical', marginTop: composer.channel === 'email' ? 8 : 0 }}
                value={composer.body} onChange={e => setComposer(c => ({ ...c, body: e.target.value }))} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button style={s.cancelBtn} onClick={() => setComposer(null)} disabled={composer.sending}>Cancel</button>
                <button style={s.sendBtn} onClick={sendMessage} disabled={composer.sending || composer.sent || (composer.channel !== 'email' && !composer.lead.phone)}>
                  {composer.sent ? 'Sent ✓' : composer.sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const s = {
  page: { display: 'flex', minHeight: '100vh', background: '#F4F5F7', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },
  sidebar:          { width: 210, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' },
  sideLogoWrap:     { padding: '20px 16px 16px', borderBottom: '1px solid #E2E8F0' },
  sideLogoRow:      { display: 'flex', alignItems: 'center', gap: 9 },
  sideLogoIcon:     { width: 30, height: 30, borderRadius: 8, background: '#0057FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 },
  sideLogoText:     { fontWeight: 700, fontSize: 14, color: '#0F172A', letterSpacing: '-0.2px' },
  sideNav:          { flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' },
  sideNavItem:      { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 7, fontSize: 13, fontWeight: 500, color: '#475569', textDecoration: 'none', transition: 'all .15s' },
  sideNavItemActive:{ background: '#EFF6FF', color: '#0057FF', fontWeight: 600 },
  sideBottom:       { borderTop: '1px solid #E2E8F0', padding: '8px 8px 16px' },
  sideHelpRow:      { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, cursor: 'pointer' },

  main:    { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  topbar:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 28px', background: '#fff', borderBottom: '1px solid #E2E8F0' },
  topTitle:{ fontSize: 19, fontWeight: 700, color: '#0F172A' },
  topSub:  { fontSize: 13, color: '#64748B', marginTop: 2 },
  refreshBtn: { padding: '7px 14px', background: '#fff', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  content: { padding: 28, overflowY: 'auto' },

  metricsRow: { display: 'flex', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, marginBottom: 22, overflow: 'hidden' },
  metricCell: { flex: 1, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4 },
  metricNum:  { fontSize: 26, fontWeight: 700, lineHeight: 1 },
  metricLabel:{ fontSize: 12, color: '#64748B', fontWeight: 500 },

  empty: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: '#64748B', fontSize: 14 },

  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { display: 'flex', alignItems: 'center', gap: 18, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 18px' },

  daysCol:  { width: 74, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 },
  daysNum:  { fontSize: 30, fontWeight: 800, lineHeight: 1 },
  daysUnit: { fontSize: 11, color: '#94A3B8', marginTop: -1 },
  urgencyBadge: { marginTop: 3, padding: '1px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700 },

  name:    { fontSize: 15, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  metaRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#64748B', marginTop: 3, flexWrap: 'wrap' },
  tag:     { padding: '1px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#1D4ED8', background: '#EFF6FF', border: '1px solid #BFDBFE' },
  repTag:  { padding: '1px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#6D28D9', background: '#F5F3FF', border: '1px solid #DDD6FE' },
  activity:{ color: '#94A3B8', fontSize: 12 },

  actions:  { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 380 },
  actBtn:      { padding: '6px 10px', background: '#fff', color: '#374151', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  actBtnGreen: { padding: '6px 10px', background: '#ECFDF5', color: '#15803D', border: '1px solid #A7F3D0', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  actBtnGhost: { padding: '6px 10px', background: 'transparent', color: '#0057FF', border: '1px solid transparent', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  snoozeMenu: { position: 'absolute', top: '110%', right: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.12)', zIndex: 20, display: 'flex', flexDirection: 'column', minWidth: 92 },
  snoozeItem: { padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: 12.5, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' },

  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal:    { width: 480, maxWidth: '92vw', background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.25)', overflow: 'hidden' },
  modalHdr: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #EEF2F6' },
  modalClose: { background: 'none', border: 'none', fontSize: 16, color: '#94A3B8', cursor: 'pointer' },
  input:    { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, color: '#0F172A', fontFamily: 'inherit', outline: 'none' },
  cancelBtn:{ padding: '8px 14px', background: '#fff', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  sendBtn:  { padding: '8px 18px', background: '#0057FF', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
};
