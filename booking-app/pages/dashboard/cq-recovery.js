import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Head from 'next/head';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../api/auth/[...nextauth]';
import { CRMPanel } from '@/components/CrmPanel';
import { guardDashboardPage } from '@/lib/pageAccess';
import { visibleNav } from '@/lib/nav';
import BrandLogo from '@/components/BrandLogo';
import SidebarUser from '@/components/SidebarUser';

export async function getServerSideProps(ctx) {
  const gate = await guardDashboardPage(ctx, '/dashboard/cq-recovery');
  if (gate.redirect) return gate;
  return { props: { perms: gate.perms, platformLogo: gate.logo, navOrder: gate.navOrder } };
}

const DEAL_VALUE = 30000; // estimated revenue per recovered lead
const money = n => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);

// ─── Icons ────────────────────────────────────────────────────────────────────
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

function Ic({ name, size = 20 }) {
  const p = { width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', style: { display: 'block' } };
  switch (name) {
    case 'doc':    return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
    case 'flame':  return <svg {...p}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>;
    case 'fish':   return <svg {...p}><path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6z"/><path d="M2 12c1.5-2 3-3 3-3M2 12c1.5 2 3 3 3 3"/><circle cx="15" cy="11" r="1"/></svg>;
    case 'people': return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>;
    case 'clock':  return <svg {...p}><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>;
    case 'snow':   return <svg {...p}><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>;
    case 'dollar': return <svg {...p}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
    case 'bolt':   return <svg {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case 'mail':   return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>;
    case 'eye':    return <svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'phone':  return <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
    case 'chat':   return <svg {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>;
    case 'star':   return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case 'send':   return <svg {...p}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
    case 'check':  return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>;
    default: return null;
  }
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

function scoreTier(score) {
  if (score >= 70) return { label: 'High', color: '#15803D', bg: '#DCFCE7', border: '#BBF7D0' };
  if (score >= 50) return { label: 'High', color: '#C2410C', bg: '#FFF7ED', border: '#FED7AA' };
  if (score >= 30) return { label: 'Med',  color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' };
  return { label: 'Low', color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0' };
}

const hasReason   = (l, re) => (l.reasons || []).some(r => re.test(r));
const openedCQ    = l => l.email_opened || hasReason(l, /opened the cq/i);
const viewedBook  = l => hasReason(l, /booking page/i);
const recentlyAct = l => l.last_activity && l.last_activity.days_ago <= 7;
const needsTouch  = l => !l.last_activity || l.last_activity.days_ago >= 3;
const goingCold   = l => l.bucket === 'cold' || l.days_waiting >= 14;

function nextBestAction(l) {
  const today = l.last_activity && l.last_activity.days_ago === 0;
  if (l.score >= 60 || (today && l.score >= 45)) return { label: 'Call now',      sub: 'High intent detected',  icon: 'phone', color: '#15803D', bg: '#DCFCE7' };
  if (l.bucket === 'big_fish' || hasReason(l, /high liquid/i)) return { label: 'Escalate', sub: 'High-value opportunity', icon: 'star', color: '#B45309', bg: '#FEF3C7' };
  if (openedCQ(l) && !viewedBook(l)) return { label: 'Resend CQ', sub: 'Nudge to re-engage', icon: 'mail', color: '#2563EB', bg: '#EFF6FF' };
  if (viewedBook(l))                 return { label: 'Text follow-up', sub: 'Quick check-in',  icon: 'chat', color: '#2563EB', bg: '#EFF6FF' };
  if (goingCold(l))                  return { label: 'Re-engage', sub: 'Going cold',           icon: 'clock', color: '#DC2626', bg: '#FEE2E2' };
  return { label: 'Follow up', sub: 'Keep it warm', icon: 'chat', color: '#64748B', bg: '#F1F5F9' };
}

function timelineOf(l) {
  const items = [];
  const when = a => (a == null ? '' : a === 0 ? 'Today' : a === 1 ? 'Yesterday' : `${a} days ago`);
  if (openedCQ(l))     items.push({ icon: 'mail',   text: 'Opened the CQ email', sub: when(l.last_activity?.days_ago) });
  if (l.last_activity) items.push({ icon: 'people', text: 'Active in system',    sub: when(l.last_activity.days_ago) });
  const vb = (l.reasons || []).find(r => /booking page/i.test(r));
  if (vb)              items.push({ icon: 'eye',    text: vb, sub: '' });
  if (l.cq_sent_at)    items.push({ icon: 'send',   text: 'CQ sent', sub: new Date(l.cq_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
  return items;
}

export default function CQRecovery({ perms = {}, platformLogo = null, navOrder = null }) {
  const { data: session } = useSession();
  const [leads,      setLeads]      = useState([]);
  const [metrics,    setMetrics]    = useState({});
  const [loading,    setLoading]    = useState(true);
  const [busy,       setBusy]       = useState({});
  const [composer,   setComposer]   = useState(null);
  const [snoozeFor,  setSnoozeFor]  = useState(null);
  const [activeTab,  setActiveTab]  = useState('all');
  const [selected,   setSelected]   = useState(null);

  // Slide-out CRM panel (shared with the Meetings page)
  const [panelOpen,    setPanelOpen]    = useState(false);
  const [panelBooking, setPanelBooking] = useState(null);
  const [panelLead,    setPanelLead]    = useState(null);
  const [panelNotes,   setPanelNotes]   = useState('');
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelConf,    setPanelConf]    = useState(null);

  const keyOf = l => `${l.email}|${l.slot_start}`;
  const setRowBusy = (l, v) => setBusy(b => ({ ...b, [keyOf(l)]: v }));
  function removeLead(l) {
    setLeads(ls => ls.filter(x => keyOf(x) !== keyOf(l)));
    setSelected(s => (s && keyOf(s) === keyOf(l) ? null : s));
  }

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/dashboard/cq-recovery')
      .then(r => r.json())
      .then(d => { setLeads(d.leads || []); setMetrics(d.metrics || {}); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!selected && leads.length) setSelected(leads[0]); }, [leads, selected]);

  async function markReceived(l) {
    setRowBusy(l, true);
    await fetch('/api/dashboard/mark-cq-received', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: l.booking_id || undefined, email: l.email, slot_start: l.slot_start }) }).catch(() => {});
    removeLead(l);
  }
  async function resendCQ(l) {
    setRowBusy(l, true);
    await fetch('/api/dashboard/send-cq', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: l.booking_id || undefined, email: l.email, slot_start: l.slot_start }) }).catch(() => {});
    setRowBusy(l, false);
    setLeads(ls => ls.map(x => keyOf(x) === keyOf(l) ? { ...x, _resent: true } : x));
  }
  async function snooze(l, days) {
    setSnoozeFor(null); setRowBusy(l, true);
    await fetch('/api/dashboard/cq-snooze', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: l.email, slot_start: l.slot_start, days }) }).catch(() => {});
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
    if (channel === 'email')    { url = '/api/dashboard/send-email';    payload = { to_email: lead.email, subject, body }; }
    else if (channel === 'sms') { url = '/api/dashboard/send-sms';      payload = { phone: lead.phone, message: body, contactId: lead.ghl_contact_id || undefined }; }
    else                        { url = '/api/dashboard/send-imessage'; payload = { address: lead.phone, message: body }; }
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
    setComposer(c => ({ ...c, sending: false, sent: true }));
    setTimeout(() => setComposer(null), 1200);
  }

  function openPanel(l) {
    const booking = {
      id: l.booking_id || `cqr_${l.email}_${l.slot_start}`,
      first_name: l.first_name, last_name: l.last_name, email: l.email, phone: l.phone,
      slot_start: l.slot_start, status: 'showed', investment_level: l.liquid_capital,
      ghl_contact_id: l.ghl_contact_id, assigned_to_email: l.assigned_rep,
      cq_sent_at: l.cq_sent_at, cq_received_at: null, _source_display: 'GoHighLevel', event_name: null,
    };
    setPanelBooking(booking);
    setPanelConf(l.confirmation ? { status: l.confirmation } : null);
    setPanelLead(null); setPanelNotes(''); setPanelOpen(true); setPanelLoading(true);
    fetch(`/api/dashboard/lead-detail?email=${encodeURIComponent(l.email)}`)
      .then(r => r.json())
      .then(d => { setPanelLead(d.lead); setPanelNotes(d.notes ?? d.lead?.notes ?? ''); setPanelLoading(false); })
      .catch(() => setPanelLoading(false));
  }
  function closePanel() {
    setPanelOpen(false);
    setTimeout(() => { setPanelBooking(null); setPanelLead(null); setPanelNotes(''); setPanelConf(null); }, 260);
    load();
  }
  async function panelStatusChange(status) {
    if (!panelBooking) return;
    await fetch('/api/dashboard/update-booking-status', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: panelBooking.id, email: panelBooking.email, status, slot_start: panelBooking.slot_start }) }).catch(() => {});
    setPanelBooking(b => b ? { ...b, status } : b);
  }

  // ── derived ──
  const TABS = [
    { key: 'all',      label: 'All',            test: () => true },
    { key: 'engaged',  label: 'Engaged',        test: l => l.bucket === 'engaged' },
    { key: 'hot',      label: 'Hot',            test: l => l.bucket === 'hot' },
    { key: 'big_fish', label: 'Big Fish',       test: l => l.bucket === 'big_fish' },
    { key: 'cold',     label: 'Going Cold',     test: goingCold },
    { key: 'opened',   label: 'Opened CQ',      test: openedCQ },
    { key: 'viewed',   label: 'Viewed Booking', test: viewedBook },
    { key: 'needs',    label: 'Needs Follow-up', test: needsTouch },
    { key: 'ready',    label: 'Ready',          test: recentlyAct, hidden: true },
  ];
  const activeTest = (TABS.find(t => t.key === activeTab) || TABS[0]).test;
  const filtered = leads.filter(activeTest);

  const segReady  = leads.filter(recentlyAct).length;
  const segOpened = leads.filter(openedCQ).length;
  const segViewed = leads.filter(viewedBook).length;
  const segNeeds  = leads.filter(needsTouch).length;

  const stats = [
    { label: 'Outstanding', sub: 'Leads', value: metrics.total ?? 0,   icon: 'doc',    color: '#2563EB', bg: '#DBEAFE' },
    { label: 'Hot',         sub: 'Leads', value: metrics.hot ?? 0,      icon: 'flame',  color: '#DC2626', bg: '#FEE2E2' },
    { label: 'Big Fish',    sub: 'Leads', value: metrics.bigFish ?? 0,  icon: 'fish',   color: '#9333EA', bg: '#F3E8FF' },
    { label: 'Engaged',     sub: 'Leads', value: metrics.engaged ?? 0,  icon: 'people', color: '#EA580C', bg: '#FFEDD5' },
    { label: 'Avg Days',    sub: 'to Act', value: metrics.avgDays ?? 0, icon: 'clock',  color: '#2563EB', bg: '#DBEAFE' },
    { label: 'Going Cold',  sub: 'Leads', value: metrics.goingCold ?? 0, icon: 'snow',  color: '#0D9488', bg: '#CCFBF1' },
  ];
  const actionCards = [
    { key: 'ready',  title: 'Ready to Recover',   count: segReady,  desc: 'High-intent leads showing recent engagement.', icon: 'bolt', color: '#16A34A', bg: '#DCFCE7' },
    { key: 'opened', title: 'Opened but No Submit', count: segOpened, desc: 'Opened your CQ email but haven’t submitted.',  icon: 'mail', color: '#EA580C', bg: '#FFEDD5' },
    { key: 'viewed', title: 'Viewed Booking Page', count: segViewed, desc: 'Viewed your booking page multiple times.',      icon: 'eye',  color: '#9333EA', bg: '#F3E8FF' },
    { key: 'needs',  title: 'Needs Touch Today',   count: segNeeds,  desc: 'No engagement in 3+ days. Re-engage now.',      icon: 'clock', color: '#2563EB', bg: '#DBEAFE' },
  ];
  const pipeline = (metrics.total ?? 0) * DEAL_VALUE;

  const weekLabel = (() => {
    const now = new Date(); const end = new Date(now); const start = new Date(now); start.setDate(now.getDate() - 6);
    const f = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${f(start)} – ${f(end)}, ${end.getFullYear()}`;
  })();

  return (
    <>
      <Head><title>CQ Recovery — KANSO</title></Head>
      <div style={s.page}>
        {/* Sidebar */}
        <aside style={s.sidebar}>
          <div style={s.sideLogoWrap}><BrandLogo logo={platformLogo} /></div>
          <nav style={s.sideNav}>
            {visibleNav(perms, navOrder).map(({ href, label, icon }) => {
              const active = href === '/dashboard/cq-recovery';
              return (
                <Link key={label} href={href} style={{ ...s.sideNavItem, ...(active ? s.sideNavItemActive : {}) }}>
                  <span style={{ color: active ? '#0057FF' : '#9CA3AF', display: 'flex', alignItems: 'center' }}><SideIcon name={icon} /></span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
          <div style={s.sideBottom}><div style={s.sideHelpRow}><span style={{ color: '#9CA3AF', display: 'flex' }}><SideIcon name="help" /></span><span style={{ fontSize: 13, color: '#6B7280' }}>Help</span></div><SidebarUser /></div>
        </aside>

        {/* Main */}
        <main style={s.main}>
          <div style={s.topbar}>
            <div>
              <div style={s.topTitle}>CQ Recovery</div>
              <div style={s.topSub}>High-value follow-up opportunities ranked by recovery potential.</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={s.toolBtn} onClick={load} disabled={loading}>↻ {loading ? 'Loading…' : 'Refresh'}</button>
              <button style={s.toolBtn}>≡ Filters</button>
              <button style={s.toolBtn}>📅 {weekLabel}</button>
            </div>
          </div>

          <div style={s.scrollArea}>
            {/* Stat tiles */}
            <div style={s.statRow}>
              {stats.map(st => (
                <div key={st.label} style={s.statTile}>
                  <div style={{ ...s.iconCircle, background: st.bg, color: st.color }}><Ic name={st.icon} /></div>
                  <div>
                    <div style={s.statNum}>{st.value}</div>
                    <div style={s.statLabel}>{st.label} <span style={{ color: '#94A3B8' }}>{st.sub}</span></div>
                  </div>
                </div>
              ))}
              <div style={{ ...s.statTile, ...s.pipelineTile }}>
                <div style={{ ...s.iconCircle, background: '#DCFCE7', color: '#16A34A' }}><Ic name="dollar" /></div>
                <div style={{ textAlign: 'right', flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#15803D', fontWeight: 600 }}>Estimated Pipeline Value</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#15803D', lineHeight: 1.1 }}>{money(pipeline)}</div>
                  <div style={{ fontSize: 11, color: '#16A34A' }}>From outstanding leads</div>
                </div>
              </div>
            </div>

            {/* Action cards */}
            <div style={s.actionRow}>
              {actionCards.map(c => (
                <div key={c.key} style={s.actionCard}>
                  <div style={{ ...s.iconCircleLg, background: c.bg, color: c.color }}><Ic name={c.icon} size={22} /></div>
                  <div style={s.actionTitle}>{c.title}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>{c.count}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{money(c.count * DEAL_VALUE)}</span>
                  </div>
                  <div style={s.actionDesc}>{c.desc}</div>
                  <button style={{ ...s.startBtn, color: c.color }} onClick={() => setActiveTab(c.key)}>Start Recovery →</button>
                </div>
              ))}
            </div>

            {/* Priority board */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 12px' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Priority Recovery Board</span>
              <span style={{ fontSize: 12, color: '#94A3B8' }}>{leads.length} leads</span>
            </div>
            <div style={s.tabs}>
              {TABS.filter(t => !t.hidden).map(t => {
                const n = leads.filter(t.test).length;
                const on = activeTab === t.key;
                return <button key={t.key} onClick={() => setActiveTab(t.key)} style={{ ...s.tab, ...(on ? s.tabActive : {}) }}>{t.label} ({n})</button>;
              })}
            </div>

            <div style={s.tableCard}>
              <div style={s.tHead}>
                <div style={{ width: 70 }}>SCORE</div>
                <div style={{ flex: 1.4 }}>LEAD</div>
                <div style={{ flex: 1.6 }}>RECENT SIGNALS</div>
                <div style={{ width: 110 }}>EST. DEAL VALUE</div>
                <div style={{ width: 150 }}>NEXT BEST ACTION</div>
                <div style={{ width: 280, textAlign: 'right' }}>ACTIONS</div>
              </div>
              {loading ? (
                <div style={s.empty}>Scoring your queue…</div>
              ) : filtered.length === 0 ? (
                <div style={s.empty}>No leads in this segment.</div>
              ) : filtered.map(l => {
                const t = scoreTier(l.score); const nba = nextBestAction(l); const rb = busy[keyOf(l)];
                const sel = selected && keyOf(selected) === keyOf(l);
                return (
                  <div key={keyOf(l)} style={{ ...s.tRow, ...(sel ? s.tRowSel : {}) }} onClick={() => setSelected(l)}>
                    <div style={{ width: 70 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: t.color, lineHeight: 1 }}>{l.score}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: t.color }}>{t.label}</div>
                    </div>
                    <div style={{ flex: 1.4, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{`${l.first_name || ''} ${l.last_name || ''}`.trim() || l.email}</div>
                      {l.phone && <div style={{ fontSize: 11, color: '#94A3B8' }}>{l.phone}</div>}
                      <div style={{ fontSize: 11, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.email}</div>
                      {l.assigned_rep && <span style={s.repTag}>{l.assigned_rep}</span>}
                    </div>
                    <div style={{ flex: 1.6, display: 'flex', flexWrap: 'wrap', gap: 4, alignContent: 'flex-start' }}>
                      {(l.reasons || []).slice(0, 4).map((r, i) => <span key={i} style={s.signal}>{r}</span>)}
                    </div>
                    <div style={{ width: 110 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#15803D' }}>{money(DEAL_VALUE)}</div>
                      <div style={{ fontSize: 10, color: '#94A3B8' }}>Potential</div>
                    </div>
                    <div style={{ width: 150, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{nba.label}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>{nba.sub}</div>
                      </div>
                      <span style={{ ...s.nbaIcon, background: nba.bg, color: nba.color }}><Ic name={nba.icon} size={15} /></span>
                    </div>
                    <div style={{ width: 280 }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button style={s.miniGreen} onClick={() => openComposer(l, 'imessage')} disabled={!l.phone}>iMessage</button>
                        <button style={s.miniBlue}  onClick={() => openComposer(l, 'sms')} disabled={!l.phone}>SMS</button>
                        <button style={s.mini}      onClick={() => openComposer(l, 'email')}>Email</button>
                        <button style={s.miniGreenSolid} onClick={() => markReceived(l)} disabled={rb}>✓ Received</button>
                      </div>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', marginTop: 5, alignItems: 'center' }}>
                        <button style={s.mini} onClick={() => resendCQ(l)} disabled={rb}>{l._resent ? 'Resent ✓' : 'Resend CQ'}</button>
                        <div style={{ position: 'relative' }}>
                          <button style={s.mini} onClick={() => setSnoozeFor(snoozeFor === keyOf(l) ? null : keyOf(l))} disabled={rb}>Snooze ▾</button>
                          {snoozeFor === keyOf(l) && (
                            <div style={s.snoozeMenu}>{[1, 3, 7].map(d => <button key={d} style={s.snoozeItem} onClick={() => snooze(l, d)}>{d === 1 ? '1 day' : d === 7 ? '1 week' : `${d} days`}</button>)}</div>
                          )}
                        </div>
                        <button style={s.miniGhost} onClick={() => openPanel(l)}>Open card →</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        {/* Selected Lead docked panel */}
        {selected && (
          <aside style={s.rightPanel}>
            {(() => {
              const l = selected; const t = scoreTier(l.score); const nba = nextBestAction(l);
              return (
                <>
                  <div style={s.rpHdr}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Selected Lead</span>
                    <button style={s.rpClose} onClick={() => setSelected(null)}>✕</button>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: t.color, lineHeight: 1 }}>{l.score}</div>
                      <span style={{ ...s.tierPill, color: t.color, background: t.bg, border: `1px solid ${t.border}` }}>{t.label}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 800, color: '#0F172A' }}>{`${l.first_name || ''} ${l.last_name || ''}`.trim() || l.email}</span>
                        {l.assigned_rep && <span style={s.repTag}>{l.assigned_rep}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#C2410C', fontWeight: 600, marginTop: 2 }}>● {l.bucket === 'engaged' ? 'Engaged — No Submit' : (l.bucket || '').replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>{l.phone || '—'}</div>
                      <div style={{ fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.email}</div>
                    </div>
                  </div>

                  <div style={s.rpBox}>
                    <Ic name="dollar" size={16} />
                    <div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>Estimated Deal Value</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>${DEAL_VALUE.toLocaleString()}</div>
                    </div>
                  </div>

                  <div style={s.rpSectionTitle}>Recent Activity</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
                    {timelineOf(l).length === 0 ? <div style={{ fontSize: 12, color: '#94A3B8' }}>No activity logged yet.</div> :
                      timelineOf(l).map((it, i) => (
                        <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                          <span style={{ color: '#94A3B8', marginTop: 1 }}><Ic name={it.icon} size={15} /></span>
                          <div><div style={{ fontSize: 12.5, color: '#334155', fontWeight: 600 }}>{it.text}</div>{it.sub && <div style={{ fontSize: 11, color: '#94A3B8' }}>{it.sub}</div>}</div>
                        </div>
                      ))}
                  </div>

                  <div style={s.rpSectionTitle}>Recommended Next Step</div>
                  <div style={{ ...s.rpNextStep, background: nba.bg }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: nba.color }}>{nba.label}</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>{nba.sub}</div>
                    </div>
                    <span style={{ color: nba.color }}><Ic name={nba.icon} size={18} /></span>
                  </div>

                  <div style={s.rpSectionTitle}>Quick Actions</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button style={s.qa} onClick={() => openComposer(l, 'imessage')} disabled={!l.phone}><Ic name="chat" size={16} /> iMessage</button>
                    <button style={s.qa} onClick={() => openComposer(l, 'sms')} disabled={!l.phone}><Ic name="chat" size={16} /> SMS</button>
                    <button style={s.qa} onClick={() => openComposer(l, 'email')}><Ic name="mail" size={16} /> Email</button>
                    <button style={s.qa} onClick={() => resendCQ(l)}><Ic name="send" size={16} /> Resend CQ</button>
                    <button style={s.qa} onClick={() => setSnoozeFor(snoozeFor === 'rp' ? null : 'rp')}>Snooze ▾</button>
                    <button style={{ ...s.qa, color: '#0057FF', borderColor: '#BFD3FF' }} onClick={() => openPanel(l)}>Open card →</button>
                  </div>
                  {snoozeFor === 'rp' && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>{[1, 3, 7].map(d => <button key={d} style={s.mini} onClick={() => snooze(l, d)}>{d === 1 ? '1 day' : d === 7 ? '1 week' : `${d} days`}</button>)}</div>
                  )}
                </>
              );
            })()}
          </aside>
        )}
      </div>

      {/* Full slide-out CRM panel */}
      {panelBooking && (
        <CRMPanel booking={panelBooking} lead={panelLead} loading={panelLoading} open={panelOpen} isDemo={false}
          brandPitches={{}} confirmation={panelConf} initialNotes={panelNotes}
          onClose={closePanel} onStatusChange={panelStatusChange}
          onCQSent={ts => setPanelBooking(b => b ? { ...b, cq_sent_at: ts } : b)} />
      )}

      {/* Composer modal */}
      {composer && (
        <div style={s.modalOverlay} onClick={() => !composer.sending && setComposer(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHdr}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>{composer.channel === 'email' ? 'Email' : composer.channel === 'sms' ? 'SMS' : 'iMessage'} — {composer.lead.first_name || composer.lead.email}</div>
              <button style={s.modalClose} onClick={() => !composer.sending && setComposer(null)}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>To: {composer.channel === 'email' ? composer.lead.email : (composer.lead.phone || '— no phone —')}</div>
              {composer.channel === 'email' && <input style={s.input} value={composer.subject} onChange={e => setComposer(c => ({ ...c, subject: e.target.value }))} placeholder="Subject" />}
              <textarea style={{ ...s.input, minHeight: 130, resize: 'vertical', marginTop: composer.channel === 'email' ? 8 : 0 }} value={composer.body} onChange={e => setComposer(c => ({ ...c, body: e.target.value }))} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button style={s.cancelBtn} onClick={() => setComposer(null)} disabled={composer.sending}>Cancel</button>
                <button style={s.sendBtn} onClick={sendMessage} disabled={composer.sending || composer.sent || (composer.channel !== 'email' && !composer.lead.phone)}>{composer.sent ? 'Sent ✓' : composer.sending ? 'Sending…' : 'Send'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const s = {
  page: { display: 'flex', height: '100vh', overflow: 'hidden', background: '#F4F5F7', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },
  sidebar:          { width: 210, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column' },
  sideLogoWrap:     { padding: '20px 16px 16px', borderBottom: '1px solid #E2E8F0' },
  sideLogoRow:      { display: 'flex', alignItems: 'center', gap: 9 },
  sideLogoIcon:     { width: 30, height: 30, borderRadius: 8, background: '#0057FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 },
  sideLogoText:     { fontWeight: 700, fontSize: 14, color: '#0F172A' },
  sideNav:          { flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' },
  sideNavItem:      { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 7, fontSize: 13, fontWeight: 500, color: '#475569', textDecoration: 'none' },
  sideNavItemActive:{ background: '#EFF6FF', color: '#0057FF', fontWeight: 600 },
  sideBottom:       { borderTop: '1px solid #E2E8F0', padding: '8px 8px 16px' },
  sideHelpRow:      { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, cursor: 'pointer' },

  main:   { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  topbar: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', background: '#fff', borderBottom: '1px solid #E2E8F0' },
  topTitle: { fontSize: 22, fontWeight: 800, color: '#0F172A' },
  topSub:   { fontSize: 13, color: '#64748B', marginTop: 2 },
  toolBtn:  { padding: '8px 14px', background: '#fff', color: '#334155', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  scrollArea: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 24px 32px' },

  statRow:  { display: 'flex', gap: 12, marginBottom: 16 },
  statTile: { flex: 1, minWidth: 0, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 },
  pipelineTile: { flex: 1.8, background: '#F0FDF4', border: '1px solid #BBF7D0' },
  iconCircle:   { width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconCircleLg: { width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 10 },
  statNum:   { fontSize: 24, fontWeight: 800, color: '#0F172A', lineHeight: 1 },
  statLabel: { fontSize: 12, color: '#334155', fontWeight: 600, marginTop: 2 },

  actionRow:  { display: 'flex', gap: 12, marginBottom: 22 },
  actionCard: { flex: 1, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column' },
  actionTitle:{ fontSize: 14, fontWeight: 700, color: '#0F172A' },
  actionDesc: { fontSize: 12, color: '#64748B', marginTop: 6, marginBottom: 12, lineHeight: 1.45, flex: 1 },
  startBtn:   { alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },

  tabs:     { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  tab:      { padding: '6px 12px', background: '#fff', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  tabActive:{ background: '#0057FF', color: '#fff', border: '1px solid #0057FF' },

  tableCard: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' },
  tHead: { display: 'flex', gap: 12, alignItems: 'center', padding: '10px 18px', borderBottom: '1px solid #EEF2F6', fontSize: 10.5, fontWeight: 700, color: '#94A3B8', letterSpacing: '.04em' },
  tRow:  { display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 18px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' },
  tRowSel: { background: '#F8FAFF', boxShadow: 'inset 3px 0 0 #2563EB' },
  repTag:  { display: 'inline-block', marginTop: 4, padding: '1px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, color: '#6D28D9', background: '#F5F3FF', border: '1px solid #DDD6FE' },
  signal:  { fontSize: 10.5, fontWeight: 600, color: '#334155', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 6, padding: '2px 7px' },
  nbaIcon: { width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  empty:   { padding: '40px 20px', textAlign: 'center', color: '#94A3B8', fontSize: 14 },

  mini:        { padding: '5px 9px', background: '#fff', color: '#374151', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  miniGreen:   { padding: '5px 9px', background: '#ECFDF5', color: '#15803D', border: '1px solid #A7F3D0', borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  miniBlue:    { padding: '5px 9px', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  miniGreenSolid: { padding: '5px 9px', background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  miniGhost:   { padding: '5px 9px', background: 'transparent', color: '#0057FF', border: '1px solid transparent', borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  snoozeMenu:  { position: 'absolute', top: '110%', right: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.12)', zIndex: 30, display: 'flex', flexDirection: 'column', minWidth: 92 },
  snoozeItem:  { padding: '8px 12px', background: 'none', border: 'none', textAlign: 'left', fontSize: 12.5, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' },

  rightPanel: { width: 330, flexShrink: 0, background: '#fff', borderLeft: '1px solid #E2E8F0', padding: '18px 18px 24px', overflowY: 'auto' },
  rpHdr:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  rpClose:    { background: 'none', border: 'none', fontSize: 15, color: '#94A3B8', cursor: 'pointer' },
  tierPill:   { display: 'inline-block', marginTop: 4, padding: '1px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700 },
  rpBox:      { display: 'flex', alignItems: 'center', gap: 10, color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 12px', margin: '16px 0 18px' },
  rpSectionTitle: { fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 },
  rpNextStep: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, padding: '12px 14px', marginBottom: 18 },
  qa:         { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 10px', background: '#fff', color: '#334155', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },

  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal:    { width: 480, maxWidth: '92vw', background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.25)', overflow: 'hidden' },
  modalHdr: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #EEF2F6' },
  modalClose: { background: 'none', border: 'none', fontSize: 16, color: '#94A3B8', cursor: 'pointer' },
  input:    { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, color: '#0F172A', fontFamily: 'inherit', outline: 'none' },
  cancelBtn:{ padding: '8px 14px', background: '#fff', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  sendBtn:  { padding: '8px 18px', background: '#0057FF', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
};
