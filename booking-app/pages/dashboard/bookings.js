import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { getServerSession } from 'next-auth/next';
import Head from 'next/head';
import Link from 'next/link';
import { authOptions } from '../api/auth/[...nextauth]';
import { visibleNav } from '@/lib/nav';
import BrandLogo from '@/components/BrandLogo';
import SidebarUser from '@/components/SidebarUser';

export async function getServerSideProps(context) {
  const { guardDashboardPage } = await import('@/lib/pageAccess');
  const gate = await guardDashboardPage(context, '/dashboard/bookings');
  if (gate.redirect) return gate;
  const { getSupabaseAdmin } = await import('@/lib/supabase');
  const supabase = getSupabaseAdmin();
  const { data: settingsRow } = await supabase
    .from('settings').select('brand_pitches').eq('id', 1).single();
  return { props: { session: gate.session, perms: gate.perms, platformLogo: gate.logo, navOrder: gate.navOrder, brandPitches: settingsRow?.brand_pitches || {} } };
}

const FILTERS = [
  { key: 'today',    label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week',     label: 'Next 2 Weeks' },
  { key: 'all',      label: 'All' },
];

const STATUS_META = {
  scheduled:        { label: 'Scheduled',      color: '#2563EB', bg: '#EFF6FF', dot: '#2563EB' },
  showed:           { label: 'Showed',         color: '#059669', bg: '#D1FAE5', dot: '#059669' },
  'no-show':        { label: 'No Show',        color: '#DC2626', bg: '#FEE2E2', dot: '#DC2626' },
  closed:           { label: 'Closed Won',     color: '#7C3AED', bg: '#EDE9FE', dot: '#7C3AED' },
  'not-interested': { label: 'Not Interested', color: '#64748B', bg: '#F1F5F9', dot: '#94A3B8' },
  'not-a-fit':      { label: 'Not a Good Fit', color: '#9A3412', bg: '#FFF7ED', dot: '#C2410C' },
};

// ─── Lead score (commitment stack) ────────────────────────────────────────────
function computeLeadScore({ liquidRaw, confStatus, status, cqSent, cqReceived, emailOpened }) {
  let score = 10;
  const reasons = [];
  const num = parseFloat(String(liquidRaw || '').replace(/[^0-9.]/g, '')) || 0;
  const liquidHigh = num >= 500000 || /\$?\b(500|750)\s?k|million|\$?1\s?m|1,000,000/i.test(String(liquidRaw || ''));

  if (liquidHigh)        { score += 30; reasons.push({ t: `Liquid capital ${liquidRaw || '$500k+'}`, good: true }); }
  else if (num >= 250000){ score += 22; reasons.push({ t: `Liquid capital ${liquidRaw}`, good: true }); }
  else if (num >= 100000){ score += 14; reasons.push({ t: `Liquid capital ${liquidRaw}`, good: true }); }
  else if (liquidRaw)    { score += 6;  reasons.push({ t: `Liquid capital ${liquidRaw}`, good: true }); }

  if (confStatus === 'confirmed')      { score += 20; reasons.push({ t: 'Confirmed appointment by text', good: true }); }
  else if (confStatus === 'uncertain') { score += 6;  reasons.push({ t: 'Tentative reply on confirmation', good: true }); }
  else if (confStatus === 'declined')  { score -= 15; reasons.push({ t: 'Declined / cancelled by text', good: false }); }

  if (status === 'showed')        { score += 20; reasons.push({ t: 'Showed for the meeting', good: true }); }
  else if (status === 'no-show')  { score -= 20; reasons.push({ t: 'No-showed the appointment', good: false }); }

  if (cqReceived)   { score += 15; reasons.push({ t: 'Returned the CQ', good: true }); }
  else if (cqSent)  { score += 8;  reasons.push({ t: 'CQ sent', good: true }); }

  if (emailOpened)  { score += 6;  reasons.push({ t: 'Opened the CQ email', good: true }); }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

function scoreTier(score) {
  if (score >= 70) return { label: 'Hot',  color: '#15803D', bg: '#DCFCE7', border: '#BBF7D0' };
  if (score >= 45) return { label: 'Warm', color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' };
  return { label: 'Cool', color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0' };
}

const DEMO = [
  { id: 'd1', first_name: 'Marcus',   last_name: 'Thompson', email: 'marcus.t@email.com',     phone: '(512) 555-0192', slot_start: (() => { const d = new Date(); d.setHours(9,  0); return d.toISOString(); })(), status: 'scheduled', investment_level: '$100k–$200k', assigned_to_email: 'steve@sparksify.com', meet_link: 'https://meet.google.com/abc-defg-hij', _source_display: 'Calendly',      event_name: 'Franchise Intro Call' },
  { id: 'd2', first_name: 'Jennifer', last_name: 'Caldwell',  email: 'jcaldwell@gmail.com',    phone: '(214) 555-0847', slot_start: (() => { const d = new Date(); d.setHours(10,30); return d.toISOString(); })(), status: 'showed',    investment_level: '$50k–$100k',  assigned_to_email: 'steve@sparksify.com', meet_link: null,                                                 _source_display: 'Calendly',      event_name: 'Franchise Intro Call' },
  { id: 'd3', first_name: 'Robert',   last_name: 'Kim',       email: 'rob.kim@outlook.com',    phone: '(713) 555-0334', slot_start: (() => { const d = new Date(); d.setHours(11,45); return d.toISOString(); })(), status: 'no-show',  investment_level: '$200k+',      assigned_to_email: 'steve@sparksify.com', meet_link: null,                                                 _source_display: 'GoHighLevel',   event_name: 'Franchise Intro Call' },
  { id: 'd4', first_name: 'Angela',   last_name: 'Rivera',    email: 'angela.r@company.com',   phone: '(469) 555-0561', slot_start: (() => { const d = new Date(); d.setHours(13, 0); return d.toISOString(); })(), status: 'closed',   investment_level: '$100k–$200k', assigned_to_email: 'steve@sparksify.com', meet_link: 'https://meet.google.com/xyz-uvwx-rst', _source_display: 'KANSO', event_name: 'Franchise Discovery Call' },
  { id: 'd5', first_name: 'David',    last_name: 'Nguyen',    email: 'dnguyen@email.com',      phone: '(281) 555-0729', slot_start: (() => { const d = new Date(); d.setHours(14,30); return d.toISOString(); })(), status: 'scheduled', investment_level: '$50k–$100k',  assigned_to_email: 'steve@sparksify.com', meet_link: 'https://meet.google.com/lmn-opqr-stu', _source_display: 'GoHighLevel',   event_name: 'Franchise Intro Call' },
];

function makeDemoLead(booking) {
  return {
    id: booking.id, first_name: booking.first_name, last_name: booking.last_name,
    email: booking.email, phone: booking.phone, investment_level: booking.investment_level,
    status: booking.status,
    franchise_interests: [
      { id: 'fi1', brand: 'Wet Fuel', developer_name: 'Janet Okafor', developer_phone: '(972) 555-0182', developer_email: 'janet.okafor@wetfuel.com' },
      { id: 'fi2', brand: 'Squeeze House', developer_name: 'Marcus Webb', developer_phone: '(214) 555-0299', developer_email: 'mwebb@squeezehouse.com' },
    ],
    notes: 'Very motivated buyer. Has previous business ownership experience. Interested in multi-unit.',
    raw_fields: { liquid_capital_to_get_started: '$100,000 – $250,000', have_you_ever_owned_or_managed_a_business_before: 'Yes' },
    bookings: [booking], created_at: new Date().toISOString(),
  };
}

function getField(raw, ...keys) {
  if (!raw) return null;
  for (const key of keys) {
    const slug = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = Object.entries(raw).find(([k]) => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(slug));
    if (found) return found[1];
  }
  return null;
}

// ─── Sidebar line icons ───────────────────────────────────────────────────────
function SideIcon({ name }) {
  const p = { width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', style: { display: 'block' } };
  if (name === 'dashboard') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === 'leads')     return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  if (name === 'clients')   return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === 'meetings')  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (name === 'nurture')   return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
  if (name === 'settings')  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
  if (name === 'help')      return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
  if (name === 'cq')        return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9.5 13.5a2 2 0 1 1 2.5 1.9c-.4.15-.5.4-.5.8"/><line x1="11.5" y1="18" x2="11.51" y2="18"/></svg>;
  return null;
}

// ─── Rep avatar (photo or initials fallback) ──────────────────────────────────
function RepAvatar({ emailOrName, repAvatars, size = 26 }) {
  const raw     = emailOrName || '';
  const initial = raw[0]?.toUpperCase() || '?';
  const url     = repAvatars?.[raw];
  const fontSize = Math.floor(size * 0.42);
  if (url) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#8B5CF6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize, fontWeight: 700, flexShrink: 0 }}>
      {initial}
    </div>
  );
}

// ─── Stat icons ───────────────────────────────────────────────────────────────
function StatIcon({ name, color }) {
  const p = { width: 18, height: 18, fill: 'none', stroke: color, strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', style: { display: 'block' } };
  if (name === 'calendar') return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (name === 'check')    return <svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
  if (name === 'x-circle') return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
  if (name === 'award')    return <svg {...p}><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>;
  if (name === 'trending') return <svg {...p}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>;
  if (name === 'mail')     return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>;
  return null;
}

// ─── Source badge ─────────────────────────────────────────────────────────────
function SourceBadge({ source }) {
  const styles = {
    Calendly:      { color: '#6D28D9', background: '#F5F3FF', border: '1px solid #DDD6FE' },
    GoHighLevel:   { color: '#047857', background: '#ECFDF5', border: '1px solid #A7F3D0' },
    KANSO: { color: '#1D4ED8', background: '#DBEAFE', border: '1px solid #BFDBFE' },
  };
  const src = source || 'KANSO';
  const st = styles[src] || { color: '#374151', background: '#F3F4F6', border: '1px solid #E5E7EB' };
  return (
    <span style={{ ...st, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {src}
    </span>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function BookingsDashboard({ brandPitches = {}, perms = {}, platformLogo = null, navOrder = null }) {
  const { data: session } = useSession();
  const router = useRouter();
  const focusedRef = useRef(false);
  const canPersistRef = useRef(false);
  const [filter,       setFilter]       = useState('today');
  const [bookings,     setBookings]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [updating,     setUpdating]     = useState({});
  const [isDemo,       setIsDemo]       = useState(false);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [repFilter,    setRepFilter]    = useState(['Steve Sparks']);
  const [panelBooking, setPanelBooking] = useState(null);
  const [lead,         setLead]         = useState(null);
  const [panelNotes,   setPanelNotes]   = useState('');
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelOpen,    setPanelOpen]    = useState(false);
  const [repAvatars,   setRepAvatars]   = useState({});
  const [transferOpen, setTransferOpen] = useState(false);
  const [isAdmin,      setIsAdmin]      = useState(true);   // "can view all reps"
  const [canTransfer,  setCanTransfer]  = useState(true);
  // smsConfirmations: { [bookingId]: { status, note, loading } }
  const [smsConfirmations, setSmsConfirmations] = useState({});
  const nowLineRef    = useRef(null);
  const scrollBodyRef = useRef(null);

  // Scroll so past meetings sit above the fold and the current/next one is near
  // the top. The "Now" line only exists when there's an upcoming meeting; if the
  // whole day is in the past we jump to the bottom (the latest meeting).
  useEffect(() => {
    if (loading) return;
    const sc = scrollBodyRef.current;
    if (!sc) return;
    let cancelled = false;
    const scrollToNow = () => {
      if (cancelled) return;
      const el = nowLineRef.current;
      if (el) {
        const r  = el.getBoundingClientRect();
        const sr = sc.getBoundingClientRect();
        sc.scrollTop += (r.top - sr.top) - 8;
      } else {
        sc.scrollTop = sc.scrollHeight;
      }
    };
    // Run a few times so the position survives the SMS-confirmation re-renders,
    // but stop if the user starts scrolling on their own.
    const ts = [150, 500, 1000].map(d => setTimeout(scrollToNow, d));
    const stop = () => { cancelled = true; };
    sc.addEventListener('wheel', stop, { passive: true });
    sc.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('keydown', stop);
    return () => {
      ts.forEach(clearTimeout);
      sc.removeEventListener('wheel', stop);
      sc.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
  }, [loading, bookings.length, filter, repFilter, statusFilter, sourceFilter]);

  // Remember the last-used filters (default: Today + Steve Sparks).
  useEffect(() => {
    if (!router.isReady || canPersistRef.current) return;
    if (!router.query.focus) {
      try {
        const f   = localStorage.getItem('mtg_filter');
        const r   = localStorage.getItem('mtg_repFilter');
        const sf  = localStorage.getItem('mtg_statusFilter');
        const src = localStorage.getItem('mtg_sourceFilter');
        if (f)             setFilter(f);
        if (r)             setRepFilter(JSON.parse(r));
        if (sf  !== null)  setStatusFilter(sf  || '');
        if (src !== null)  setSourceFilter(src || '');
      } catch {}
    }
    canPersistRef.current = true;
  }, [router.isReady, router.query.focus]);

  useEffect(() => { if (canPersistRef.current) { try { localStorage.setItem('mtg_filter', filter); } catch {} } }, [filter]);
  useEffect(() => { if (canPersistRef.current) { try { localStorage.setItem('mtg_repFilter', JSON.stringify(repFilter)); } catch {} } }, [repFilter]);
  useEffect(() => { if (canPersistRef.current) { try { localStorage.setItem('mtg_statusFilter', statusFilter); } catch {} } }, [statusFilter]);
  useEffect(() => { if (canPersistRef.current) { try { localStorage.setItem('mtg_sourceFilter', sourceFilter); } catch {} } }, [sourceFilter]);

  // After bookings load, auto-check SMS confirmation for bookings that have a GHL contact.
  // Batched in groups of 5 to stay within GHL rate limits.
  useEffect(() => {
    if (loading || isDemo || !bookings.length) return;
    // Check every booking that has a GHL contact — including GHL-sourced rows
    // (id like `ghl_…`), which are the real meetings with SMS conversations.
    const toCheck = bookings.filter(b => b.ghl_contact_id);
    if (!toCheck.length) return;

    // Mark all as loading
    setSmsConfirmations(prev => {
      const next = { ...prev };
      toCheck.forEach(b => { if (!next[b.id]) next[b.id] = { loading: true }; });
      return next;
    });

    // Fetch in batches of 5
    async function checkBatch(batch) {
      await Promise.allSettled(batch.map(async b => {
        try {
          const r = await fetch('/api/dashboard/check-confirmation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookingId:          b.id,
              ghl_contact_id:     b.ghl_contact_id,
              booking_created_at: b.created_at,
            }),
          });
          const d = await r.json();
          setSmsConfirmations(prev => ({ ...prev, [b.id]: { status: d.status, note: d.note, loading: false } }));
        } catch {
          setSmsConfirmations(prev => ({ ...prev, [b.id]: { status: 'no_response', loading: false } }));
        }
      }));
    }

    (async () => {
      for (let i = 0; i < toCheck.length; i += 5) {
        await checkBatch(toCheck.slice(i, i + 5));
        if (i + 5 < toCheck.length) await new Promise(r => setTimeout(r, 300));
      }
    })();
  }, [loading, isDemo]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/dashboard/bookings?filter=${filter}`)
      .then(r => r.json())
      .then(d => {
        const real = d.bookings || [];
        const viewAll = !!d.viewAll;
        setIsAdmin(viewAll);
        setCanTransfer(d.canTransfer !== false);
        if (!viewAll) setRepFilter([]);   // members are already scoped server-side
        if (real.length === 0) { setBookings(DEMO); setIsDemo(true); }
        else                   { setBookings(real); setIsDemo(false); }
        if (d.rep_avatars) setRepAvatars(d.rep_avatars);
        setLoading(false);
      })
      .catch(() => { setBookings(DEMO); setIsDemo(true); setLoading(false); });
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') closePanel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  function openPanel(booking) {
    setPanelBooking(booking); setLead(null); setPanelNotes(''); setPanelOpen(true);
    if (isDemo) { const dl = makeDemoLead(booking); setLead(dl); setPanelNotes(dl?.notes || ''); return; }
    setPanelLoading(true);
    fetch(`/api/dashboard/lead-detail?email=${encodeURIComponent(booking.email)}`)
      .then(r => r.json())
      .then(d => { setLead(d.lead); setPanelNotes(d.notes ?? d.lead?.notes ?? ''); setPanelLoading(false); })
      .catch(() => setPanelLoading(false));
  }

  function closePanel() {
    setPanelOpen(false);
    setTimeout(() => { setPanelBooking(null); setLead(null); setPanelNotes(''); }, 260);
  }

  // Deep-link from CQ Recovery: /dashboard/bookings?focus=<email> opens that card.
  useEffect(() => {
    if (router.query.focus && !focusedRef.current) setFilter('all');
  }, [router.query.focus]);

  useEffect(() => {
    const focusEmail = router.query.focus;
    if (!focusEmail || focusedRef.current || loading || !bookings.length) return;
    const match = bookings.find(b => (b.email || '').toLowerCase() === String(focusEmail).toLowerCase());
    if (match) { focusedRef.current = true; openPanel(match); }
  }, [bookings, loading, router.query.focus]);

  async function updateStatus(booking, status) {
    if (isDemo) {
      setBookings(bs => bs.map(b => b.id === booking.id ? { ...b, status } : b));
      if (panelBooking?.id === booking.id) setPanelBooking(b => ({ ...b, status }));
      return;
    }
    setUpdating(u => ({ ...u, [booking.id]: true }));
    await fetch('/api/dashboard/update-booking-status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: booking.id, email: booking.email, status, assigned_user_id: booking.assigned_user_id || null, slot_start: booking.slot_start }),
    }).catch(console.error);
    setBookings(bs => bs.map(b => b.id === booking.id ? { ...b, status } : b));
    if (panelBooking?.id === booking.id) setPanelBooking(b => ({ ...b, status }));
    setUpdating(u => ({ ...u, [booking.id]: false }));
  }

  function downloadCSV() {
    const headers = ['Time', 'Date', 'Name', 'Email', 'Phone', 'Liquid Capital', 'Consultant', 'Status'];
    const rows = filteredBookings.map(b => {
      const slot = b.slot_start ? new Date(b.slot_start) : null;
      return [
        slot ? slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
        slot ? slot.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
        `${b.first_name} ${b.last_name}`, b.email, b.phone || '',
        b.investment_level || '', b.assigned_to_email || '', b.status,
      ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',');
    });
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `meetings-${filter}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const allReps = [...new Set(bookings.map(b => b.assigned_to_email).filter(Boolean))];

  const filteredBookings = bookings
    .filter(b => !isAdmin || repFilter.length === 0 || repFilter.includes(b.assigned_to_email))
    .filter(b => !sourceFilter || (b._source_display || 'KANSO') === sourceFilter)
    .filter(b => !statusFilter || b.status === statusFilter);

  const displayBookings = filteredBookings.filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${b.first_name} ${b.last_name}`.toLowerCase().includes(q) || (b.email || '').toLowerCase().includes(q);
  });

  const counts = filteredBookings.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});
  const cqSentCount = filteredBookings.filter(b => b.cq_sent_at).length;
  const showRateDenom = (counts.showed || 0) + (counts['no-show'] || 0);
  const showRate = showRateDenom > 0 ? Math.round((counts.showed || 0) / showRateDenom * 100) + '%' : '0%';

  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  const userName = session?.user?.name || session?.user?.email?.split('@')[0] || 'User';
  const sessionInitial = (session?.user?.email?.[0] || 'U').toUpperCase();

  // Next up: first future scheduled meeting
  const now = new Date();
  const nextUp = displayBookings.find(b => b.status === 'scheduled' && b.slot_start && new Date(b.slot_start) > now);
  let nextUpTimeNum = '', nextUpAMPM = '', nextUpInLabel = '';
  if (nextUp) {
    const slot = new Date(nextUp.slot_start);
    const full = slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const parts = full.split(' ');
    nextUpTimeNum = parts[0];
    nextUpAMPM = parts[1] || '';
    const mins = Math.round((slot - now) / 60000);
    nextUpInLabel = mins < 60 ? `in ${mins} min` : `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  return (
    <>
      <Head><title>Meetings — KANSO</title></Head>
      <div style={s.page}>

        {/* ── White Sidebar ── */}
        <aside style={s.sidebar}>
          {/* Logo */}
          <div style={s.sideLogoWrap}>
            <div style={s.sideLogoRow}>
              <BrandLogo logo={platformLogo} />
            </div>
          </div>

          {/* Nav */}
          <nav style={s.sideNav}>
            {visibleNav(perms, navOrder).map(({ href, label, icon }) => {
              const active = href === '/dashboard/bookings';
              return (
                <Link key={label} href={href}
                  style={{ ...s.sideNavItem, ...(active ? s.sideNavItemActive : {}) }}>
                  <span style={{ color: active ? '#0057FF' : '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                    <SideIcon name={icon} />
                  </span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Bottom */}
          <div style={s.sideBottom}>
            <div style={s.sideHelpRow}>
              <span style={{ color: '#9CA3AF', display: 'flex' }}><SideIcon name="help" /></span>
              <span style={{ fontSize: 13, color: '#6B7280' }}>Help</span>
            </div>
            <SidebarUser avatarUrl={repAvatars?.[session?.user?.email] || null} />
          </div>
        </aside>

        {/* ── Main ── */}
        <div style={s.main}>

          {/* Top Bar */}
          <div style={s.topBar}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={s.topTitle}>Today's Meetings</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={s.topDate}>{todayLabel} ▾</span>
                <button style={s.topNavArrow}>‹</button>
                <button style={s.topNavArrow}>›</button>
              </div>
            </div>
            <div style={s.topActions}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none', display: 'flex' }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </span>
                <input
                  style={s.searchInput}
                  placeholder="Search meetings, clients, email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <button style={s.topBtn}>≡ Filters</button>
              {canTransfer && <button onClick={() => setTransferOpen(true)} style={s.topBtn}>⇄ Transfer</button>}
              <button onClick={load} style={s.topBtn}>↻ Refresh</button>
              <button onClick={downloadCSV} style={s.topBtnPrimary}>+ Export ▾</button>
            </div>
          </div>

          {/* Body */}
          <div style={s.headerArea}>

            {/* Demo banner */}
            {isDemo && (
              <div style={s.demoBanner}>
                Preview mode — no real bookings found. Showing sample data.
              </div>
            )}

            {/* Stats row — connected */}
            <div style={s.statsCard}>
              {[
                { label: 'Booked', num: filteredBookings.length, iconBg: '#DBEAFE', iconColor: '#2563EB', icon: 'calendar' },
                { label: 'Showed',    num: counts.showed      || 0, iconBg: '#D1FAE5', iconColor: '#059669', icon: 'check'    },
                { label: 'No-Shows',  num: counts['no-show']  || 0, iconBg: '#FEE2E2', iconColor: '#DC2626', icon: 'x-circle' },
                { label: 'Show Rate', num: showRate,               iconBg: '#DBEAFE', iconColor: '#2563EB', icon: 'trending' },
                { label: 'CQ Sent',   num: cqSentCount,            iconBg: '#EDE9FE', iconColor: '#7C3AED', icon: 'mail'     },
              ].map((st, i) => (
                <div key={st.label} style={{ ...s.statCell, ...(i < 4 ? { borderRight: '1px solid #E5E7EB' } : {}) }}>
                  <div style={{ ...s.statIconCircle, background: st.iconBg }}>
                    <StatIcon name={st.icon} color={st.iconColor} />
                  </div>
                  <div>
                    <div style={s.statNum}>{st.num}</div>
                    <div style={s.statLabel}>{st.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Next Up */}
            {nextUp && (() => {
              const initials = `${nextUp.first_name?.[0] || ''}${nextUp.last_name?.[0] || ''}`.toUpperCase();
              const { score: nextScore } = computeLeadScore({ liquidRaw: nextUp.investment_level, confStatus: smsConfirmations[nextUp.id]?.status, status: nextUp.status, cqSent: !!nextUp.cq_sent_at, cqReceived: !!nextUp.cq_received_at, emailOpened: false });
              const nextTier = scoreTier(nextScore);
              const nextConf = smsConfirmations[nextUp.id];
              return (
                <div style={s.nextUp}>
                  {/* Time */}
                  <div style={s.nextUpTimeCol}>
                    <div style={s.nextUpLabel}>NEXT UP</div>
                    <div style={s.nextUpTime}>
                      {nextUpTimeNum}
                      <span style={s.nextUpAMPM}> {nextUpAMPM}</span>
                    </div>
                    <div style={s.nextUpIn}>{nextUpInLabel}</div>
                  </div>

                  <div style={s.nextUpDivider} />

                  {/* Avatar + Info */}
                  <div style={s.nextUpAvatar}>{initials}</div>
                  <div style={s.nextUpInfo}>
                    <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <SourceBadge source={nextUp._source_display || 'KANSO'} />
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: nextTier.color, background: nextTier.bg, border: `1px solid ${nextTier.border}` }}>Score {nextScore}</span>
                      {nextConf && !nextConf.loading && (() => {
                        const CONF = { confirmed: { l: '✓ Confirmed', c: '#15803D', b: '#DCFCE7', br: '#BBF7D0' }, declined: { l: '✗ Declined', c: '#DC2626', b: '#FEE2E2', br: '#FECACA' }, uncertain: { l: '? Maybe', c: '#B45309', b: '#FEF3C7', br: '#FDE68A' } };
                        const cc = CONF[nextConf.status];
                        return cc ? <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: cc.c, background: cc.b, border: `1px solid ${cc.br}` }}>{cc.l}</span> : null;
                      })()}
                    </div>
                    <div style={s.nextUpName}>{nextUp.first_name} {nextUp.last_name}</div>
                    {nextUp.event_name && <div style={s.nextUpSub}>{nextUp.event_name}</div>}
                    {nextUp.assigned_to_email && (
                      <div style={s.nextUpRep}>
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ marginRight: 4, flexShrink: 0 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        {nextUp.assigned_to_email.split('@')[0]}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={s.nextUpActions}>
                    <button onClick={() => openPanel(nextUp)} style={s.nextUpBtnOutline}>
                      Open Details
                    </button>
                    <button
                      onClick={() => updateStatus(nextUp, 'showed')}
                      disabled={!!updating[nextUp.id]}
                      style={{ ...s.nextUpBtnFill, opacity: updating[nextUp.id] ? 0.7 : 1 }}
                    >
                      ✓ Mark Showed
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Filter bar */}
            <div style={s.filterBar}>
              {/* Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {/* All Meetings */}
                <button
                  onClick={() => setFilter('all')}
                  style={filter === 'all' ? s.filterPillActive : s.filterPillOutline}
                >
                  All Meetings
                  {filter === 'all' && (
                    <span style={s.filterPillBadge}>{displayBookings.length}</span>
                  )}
                </button>

                {/* Date filters */}
                {[
                  { key: 'today',    label: 'Today' },
                  { key: 'tomorrow', label: 'Tomorrow' },
                  { key: 'week',     label: 'Next 2 Weeks' },
                ].map(f => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    style={filter === f.key ? s.filterPillActive : s.filterPillOutline}>
                    {f.label}
                  </button>
                ))}

                {/* Source dropdown */}
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <select
                    value={sourceFilter}
                    onChange={e => setSourceFilter(e.target.value)}
                    style={s.filterSelect}
                  >
                    <option value="">All Sources</option>
                    <option value="Calendly">Calendly</option>
                    <option value="GoHighLevel">GoHighLevel</option>
                    <option value="KANSO">KANSO</option>
                  </select>
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6B7280', fontSize: 10 }}>▼</span>
                </div>

                {/* Status dropdown */}
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    style={s.filterSelect}
                  >
                    <option value="">All Statuses</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="showed">Showed</option>
                    <option value="no-show">No Show</option>
                    <option value="closed">Closed Won</option>
                    <option value="not-interested">Not Interested</option>
                    <option value="not-a-fit">Not a Good Fit</option>
                  </select>
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6B7280', fontSize: 10 }}>▼</span>
                </div>

                <button style={s.filterMoreBtn}>≡ More Filters</button>
              </div>

              {/* Rep chips (right side) — admin only */}
              {isAdmin && allReps.length > 1 && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>Rep:</span>
                  {allReps.map(email => {
                    const name = email.split('@')[0];
                    const active = repFilter.includes(email);
                    return (
                      <button key={email}
                        onClick={() => setRepFilter(prev => prev.includes(email) ? prev.filter(r => r !== email) : [...prev, email])}
                        style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1.5px solid ${active ? '#2563EB' : '#E5E7EB'}`, background: active ? '#EFF6FF' : '#fff', color: active ? '#2563EB' : '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {name}
                      </button>
                    );
                  })}
                  {repFilter.length > 0 && (
                    <button onClick={() => setRepFilter([])} style={{ fontSize: 11, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Table — scrolls independently; lands on the current time */}
          <div style={s.tableScroll} ref={scrollBodyRef}>
            {/* Table */}
            <div style={s.tableCard}>
              {loading ? (
                <div style={s.tableEmpty}>Loading…</div>
              ) : displayBookings.length === 0 ? (
                <div style={s.tableEmpty}>No meetings for this period.</div>
              ) : (
                <table style={s.table}>
                  <thead>
                    <tr>
                      {['Time', 'Client', 'Score', 'Source / Type', 'Rep', 'Liquid Capital', 'Confirmed', 'CQ Sent', 'Status', 'Actions'].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const nowMs = Date.now();
                      const inProgressId = (() => {
                        const cands = displayBookings.filter(b => {
                          const ms = b.slot_start ? new Date(b.slot_start).getTime() : 0;
                          return ms > 0 && ms <= nowMs && nowMs <= ms + 90 * 60_000;
                        });
                        if (!cands.length) return null;
                        return cands.reduce((a, b) => new Date(b.slot_start) > new Date(a.slot_start) ? b : a).id;
                      })();
                      let nowInserted = false;
                      return displayBookings.flatMap((b, i) => {
                        const slotMs = b.slot_start ? new Date(b.slot_start).getTime() : 0;
                        const rows = [];
                        if (!nowInserted && slotMs > nowMs) {
                          nowInserted = true;
                          rows.push(
                            <tr key="now-divider" ref={nowLineRef} style={{ pointerEvents: 'none' }}>
                              <td colSpan={10} style={{ padding: '2px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ flex: 1, height: 1, background: '#EF4444', opacity: 0.4 }} />
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#EF4444', letterSpacing: '.05em', textTransform: 'uppercase', flexShrink: 0 }}>Now</span>
                                  <div style={{ flex: 1, height: 1, background: '#EF4444', opacity: 0.4 }} />
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        rows.push(
                          <BookingRow
                            key={b.id}
                            booking={b}
                            striped={i % 2 === 1}
                            busy={!!updating[b.id]}
                            selected={panelBooking?.id === b.id}
                            onRowClick={() => openPanel(b)}
                            onStatus={status => updateStatus(b, status)}
                            inProgress={b.id === inProgressId}
                            repAvatars={repAvatars}
                            confirmation={smsConfirmations[b.id]}
                          />
                        );
                        return rows;
                      });
                    })()}
                  </tbody>
                </table>
              )}
            </div>
            {/* Spacer so the current/next meeting can scroll to the top even when
                it's the last row of the day. */}
            <div style={{ height: '75vh' }} aria-hidden="true" />
          </div>
        </div>

        {/* ── CRM Panel ── */}
        {panelBooking && (
          <CRMPanel
            booking={panelBooking}
            lead={lead}
            loading={panelLoading}
            open={panelOpen}
            isDemo={isDemo}
            brandPitches={brandPitches}
            confirmation={smsConfirmations[panelBooking.id]}
            initialNotes={panelNotes}
            onClose={closePanel}
            onStatusChange={status => updateStatus(panelBooking, status)}
            onCQSent={ts => {
              setBookings(bs => bs.map(b => b.id === panelBooking.id ? { ...b, cq_sent_at: ts } : b));
              setPanelBooking(b => b ? { ...b, cq_sent_at: ts } : b);
            }}
          />
        )}

        {transferOpen && <TransferModal onClose={() => setTransferOpen(false)} onDone={load} />}
      </div>
    </>
  );
}

// ─── Transfer Appointments Modal ────────────────────────────────────────────────
function TransferModal({ onClose, onDone }) {
  const [reps,       setReps]       = useState([]);
  const [target,     setTarget]     = useState('');
  const [appts,      setAppts]      = useState([]);
  const [selected,   setSelected]   = useState({});   // { [id]: true }
  const [loadingReps, setLoadingReps] = useState(true);
  const [checking,   setChecking]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result,     setResult]     = useState(null);

  // Load reps once
  useEffect(() => {
    fetch('/api/dashboard/team-members')
      .then(r => r.json())
      .then(d => {
        const me = (d.me || '').toLowerCase();
        setReps((d.reps || []).filter(r => r.email.toLowerCase() !== me));
      })
      .catch(() => setReps([]))
      .finally(() => setLoadingReps(false));
  }, []);

  // When target changes, fetch my appts + conflict flags
  useEffect(() => {
    if (!target) { setAppts([]); setSelected({}); return; }
    setChecking(true); setResult(null);
    fetch(`/api/dashboard/transfer-check?target=${encodeURIComponent(target)}`)
      .then(r => r.json())
      .then(d => {
        const list = d.appointments || [];
        setAppts(list);
        // Pre-select all conflict-free appointments
        const pre = {};
        list.forEach(a => { if (!a.conflict) pre[a.id] = true; });
        setSelected(pre);
      })
      .catch(() => setAppts([]))
      .finally(() => setChecking(false));
  }, [target]);

  const targetRep   = reps.find(r => r.email === target);
  const selectedIds = appts.filter(a => selected[a.id] && !a.conflict).map(a => a.id);
  const freeCount   = appts.filter(a => !a.conflict).length;

  function toggle(a) {
    if (a.conflict) return;
    setSelected(s => ({ ...s, [a.id]: !s[a.id] }));
  }

  async function submit() {
    if (!selectedIds.length) return;
    setSubmitting(true); setResult(null);
    try {
      const res = await fetch('/api/dashboard/transfer-bookings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ targetEmail: target, bookingIds: selectedIds }),
      });
      const d = await res.json();
      if (!res.ok) { setResult({ error: d.error || 'Transfer failed' }); }
      else {
        setResult({ transferred: d.transferred, total: d.total });
        onDone && onDone();
      }
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={t.overlay} onClick={onClose}>
      <div style={t.modal} onClick={e => e.stopPropagation()}>
        <div style={t.header}>
          <div>
            <div style={t.title}>Transfer Appointments</div>
            <div style={t.sub}>Hand off your upcoming meetings to another rep — only conflict-free times can be selected.</div>
          </div>
          <button onClick={onClose} style={t.close}>✕</button>
        </div>

        <div style={t.body}>
          <label style={t.label}>Transfer to</label>
          <select value={target} onChange={e => setTarget(e.target.value)} style={t.select} disabled={loadingReps}>
            <option value="">{loadingReps ? 'Loading reps…' : 'Select a rep…'}</option>
            {reps.map(r => (
              <option key={r.email} value={r.email} disabled={!r.has_calendar}>
                {r.name}{!r.has_calendar ? ' (no calendar connected)' : ''}
              </option>
            ))}
          </select>

          {target && (
            <div style={{ marginTop: 18 }}>
              <div style={t.listHead}>
                <span>Your upcoming appointments</span>
                {!checking && appts.length > 0 && (
                  <span style={{ color: '#64748B', fontWeight: 500 }}>{freeCount} of {appts.length} available for {targetRep?.name?.split(' ')[0] || 'them'}</span>
                )}
              </div>

              {checking ? (
                <div style={t.empty}>Checking {targetRep?.name?.split(' ')[0] || 'their'}’s calendar…</div>
              ) : appts.length === 0 ? (
                <div style={t.empty}>You have no upcoming scheduled appointments to transfer.</div>
              ) : (
                <div style={t.list}>
                  {appts.map(a => (
                    <label key={a.id} style={{ ...t.row, ...(a.conflict ? t.rowDisabled : {}) }}>
                      <input
                        type="checkbox"
                        checked={!!selected[a.id] && !a.conflict}
                        disabled={a.conflict}
                        onChange={() => toggle(a)}
                        style={{ width: 16, height: 16, flexShrink: 0, accentColor: '#2563EB' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                        <div style={{ fontSize: 12, color: '#64748B' }}>{a.date_label} · {a.time_label}</div>
                      </div>
                      {a.conflict
                        ? <span style={t.conflictTag}>Conflict</span>
                        : <span style={t.freeTag}>Available</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {result && (
            result.error
              ? <div style={{ ...t.note, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA' }}>{result.error}</div>
              : <div style={{ ...t.note, color: '#15803D', background: '#DCFCE7', border: '1px solid #BBF7D0' }}>✓ Transferred {result.transferred} of {result.total} appointment{result.total === 1 ? '' : 's'} to {targetRep?.name || target}.</div>
          )}
        </div>

        <div style={t.footer}>
          <button onClick={onClose} style={t.btnGhost}>Close</button>
          <button onClick={submit} disabled={!selectedIds.length || submitting} style={{ ...t.btnPrimary, opacity: (!selectedIds.length || submitting) ? 0.5 : 1, cursor: (!selectedIds.length || submitting) ? 'default' : 'pointer' }}>
            {submitting ? 'Transferring…' : `Transfer ${selectedIds.length || ''} ${selectedIds.length === 1 ? 'appointment' : 'appointments'}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}

const t = {
  overlay:   { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal:     { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.25)', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif", overflow: 'hidden' },
  header:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 22px 16px', borderBottom: '1px solid #EEF0F3' },
  title:     { fontSize: 18, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.2px' },
  sub:       { fontSize: 12.5, color: '#64748B', marginTop: 4, lineHeight: 1.5, maxWidth: 420 },
  close:     { background: 'none', border: 'none', fontSize: 18, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0 },
  body:      { padding: '18px 22px', overflowY: 'auto' },
  label:     { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 7 },
  select:    { width: '100%', padding: '11px 12px', fontSize: 14, color: '#0F172A', border: '1px solid #D7DCE3', borderRadius: 10, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' },
  listHead:  { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 },
  list:      { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' },
  row:       { display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', border: '1px solid #E5E8EC', borderRadius: 10, cursor: 'pointer' },
  rowDisabled: { background: '#FAFAFB', cursor: 'not-allowed', opacity: 0.7 },
  freeTag:     { fontSize: 11, fontWeight: 700, color: '#15803D', background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' },
  conflictTag: { fontSize: 11, fontWeight: 700, color: '#B45309', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' },
  empty:     { fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '24px 0' },
  note:      { marginTop: 16, padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600 },
  footer:    { display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid #EEF0F3' },
  btnGhost:  { padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #D7DCE3', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' },
  btnPrimary:{ padding: '10px 18px', fontSize: 13, fontWeight: 700, color: '#fff', background: '#2563EB', border: 'none', borderRadius: 10, fontFamily: 'inherit' },
};

// ─── Table Row ────────────────────────────────────────────────────────────────
function BookingRow({ booking: b, striped, busy, selected, onRowClick, onStatus, inProgress, repAvatars, confirmation }) {
  const slot      = b.slot_start ? new Date(b.slot_start) : null;
  const timeLabel = slot ? slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';
  const dateLabel = slot ? slot.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const meta      = STATUS_META[b.status] || STATUS_META.scheduled;
  const initials  = `${b.first_name?.[0] || ''}${b.last_name?.[0] || ''}`.toUpperCase();

  const rowBg = selected ? '#EFF6FF' : inProgress ? '#F0FDF4' : striped ? '#FAFAFA' : '#fff';
  const firstTdBorder = selected ? { borderLeft: '3px solid #2563EB' } : { borderLeft: '3px solid transparent' };

  const { score: leadScore } = computeLeadScore({ liquidRaw: b.investment_level, confStatus: confirmation?.status, status: b.status, cqSent: !!b.cq_sent_at, cqReceived: !!b.cq_received_at, emailOpened: false });
  const sTier = scoreTier(leadScore);

  return (
    <tr style={{ ...s.tr, background: rowBg, cursor: 'pointer' }} onClick={onRowClick}>

      {/* Time */}
      <td style={{ ...s.td, ...firstTdBorder }}>
        <div style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>{timeLabel}</div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{dateLabel}</div>
        {inProgress && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: '#15803D', background: '#DCFCE7', border: '1px solid #BBF7D0' }}>
            ● Live
          </span>
        )}
      </td>

      {/* Client */}
      <td style={s.td}>
        <div style={{ fontWeight: 600, color: '#2563EB', fontSize: 13 }}>{b.first_name} {b.last_name}</div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{b.email}</div>
      </td>

      {/* Score */}
      <td style={s.td}>
        <span title={`Lead score (${sTier.label})`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 34, padding: '4px 9px', borderRadius: 8, fontSize: 14, fontWeight: 800, color: sTier.color, background: sTier.bg, border: `1px solid ${sTier.border}` }}>
          {leadScore}
        </span>
      </td>

      {/* Source / Type */}
      <td style={s.td}>
        <SourceBadge source={b._source_display || 'KANSO'} />
        {b.event_name && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{b.event_name}</div>}
      </td>

      {/* Rep */}
      <td style={s.td}>
        {b.assigned_to_email ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <RepAvatar emailOrName={b.assigned_to_email} repAvatars={repAvatars} size={26} />
            <span style={{ fontSize: 13, color: '#374151' }}>
              {b.assigned_to_email.includes('@') ? b.assigned_to_email.split('@')[0] : b.assigned_to_email}
            </span>
          </div>
        ) : <span style={{ color: '#D1D5DB' }}>—</span>}
      </td>

      {/* Liquid Capital */}
      <td style={s.td}>
        {b.investment_level
          ? <span style={{ fontSize: 12, color: '#374151' }}>{b.investment_level}</span>
          : <span style={{ color: '#D1D5DB' }}>—</span>}
      </td>

      {/* Confirmation */}
      <td style={s.td}>
        {!confirmation || confirmation.loading ? (
          b.ghl_contact_id
            ? <span style={{ fontSize: 11, color: '#CBD5E1' }}>checking…</span>
            : <span style={{ color: '#E2E8F0' }}>—</span>
        ) : (() => {
          const STATUS = {
            confirmed:   { label: 'Confirmed',   color: '#15803D', bg: '#DCFCE7', border: '#BBF7D0' },
            declined:    { label: 'Declined',     color: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
            uncertain:   { label: 'Maybe',        color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' },
            no_response: { label: 'No Response',  color: '#94A3B8', bg: '#F1F5F9', border: '#E2E8F0' },
          };
          const st = STATUS[confirmation.status] || STATUS.no_response;
          return (
            <span
              title={confirmation.note || ''}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, border: `1px solid ${st.border}`, cursor: confirmation.note ? 'help' : 'default' }}
            >
              {confirmation.status === 'confirmed'   && '✓ '}
              {confirmation.status === 'declined'    && '✗ '}
              {confirmation.status === 'uncertain'   && '? '}
              {st.label}
            </span>
          );
        })()}
      </td>

      {/* CQ Sent — bubble + timestamp (mirrors the Source/Type column) */}
      <td style={s.td}>
        {b.cq_sent_at ? (
          <div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#6D28D9', background: '#F5F3FF', border: '1px solid #DDD6FE', whiteSpace: 'nowrap' }}>
              ✓ CQ Sent
            </span>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4, whiteSpace: 'nowrap' }}>
              {new Date(b.cq_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' · '}
              {new Date(b.cq_sent_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </div>
            {b.cq_received_at && (
              <div style={{ fontSize: 10, color: '#15803D', fontWeight: 700, marginTop: 2 }}>✓ Returned</div>
            )}
          </div>
        ) : (
          <span style={{ color: '#E2E8F0' }}>—</span>
        )}
      </td>

      {/* Status */}
      <td style={s.td}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: meta.color, background: meta.bg, border: `1px solid ${meta.dot}33` }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot, display: 'inline-block', flexShrink: 0 }} />
          {meta.label}
        </span>
      </td>

      {/* Actions — icon buttons */}
      <td style={s.td} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* Eye — open panel */}
          <button
            onClick={onRowClick}
            title="View details"
            style={s.iconBtn}
          >
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>

          {/* Calendar — join call */}
          <a
            href={b.meet_link || '#'}
            target={b.meet_link ? '_blank' : undefined}
            rel="noreferrer"
            onClick={e => { if (!b.meet_link) e.preventDefault(); }}
            title={b.meet_link ? 'Join call' : 'No link'}
            style={{ ...s.iconBtn, opacity: b.meet_link ? 1 : 0.35, textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </a>

          {/* Ellipsis */}
          <button title="More" style={s.iconBtn}>
            <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Panel icons ──────────────────────────────────────────────────────────────
function PIc({ name, size = 16 }) {
  const a = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', style: { display: 'block' } };
  switch (name) {
    case 'mail':      return <svg {...a}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>;
    case 'phone':     return <svg {...a}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
    case 'chat':      return <svg {...a}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>;
    case 'external':  return <svg {...a}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>;
    case 'calendar':  return <svg {...a}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case 'user':      return <svg {...a}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case 'dollar':    return <svg {...a}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
    case 'briefcase': return <svg {...a}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
    case 'pin':       return <svg {...a}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
    case 'send':      return <svg {...a}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
    case 'check':     return <svg {...a}><polyline points="20 6 9 17 4 12"/></svg>;
    case 'ban':       return <svg {...a}><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>;
    case 'userx':     return <svg {...a}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>;
    default: return null;
  }
}

const GHL_LOCATION = 'tsIW5P8nYSjx55tuMI43';

// ─── CRM Side Panel ───────────────────────────────────────────────────────────
function CRMPanel({ booking, lead, loading, open, isDemo, brandPitches = {}, confirmation, initialNotes = '', onClose, onStatusChange, onCQSent }) {
  const [notes,         setNotes]         = useState('');
  const [interests,     setInterests]     = useState([]);
  const [selectedIdx,   setSelectedIdx]   = useState(null);
  const [brandEditMode, setBrandEditMode] = useState(false);
  const [brandSaving,   setBrandSaving]   = useState(false);
  const [brandSaved,    setBrandSaved]    = useState(false);
  const [notesSaving,   setNotesSaving]   = useState(false);
  const [notesSaved,    setNotesSaved]    = useState(false);
  const [showEmail,     setShowEmail]     = useState(false);
  const [email,         setEmail]         = useState({ to: '', subject: '', body: '' });
  const [emailSent,     setEmailSent]     = useState(false);
  const [cqSent,        setCqSent]        = useState(!!booking?.cq_sent_at);
  const [cqSentAt,      setCqSentAt]      = useState(booking?.cq_sent_at || null);
  const [cqReceived,    setCqReceived]    = useState(!!booking?.cq_received_at);
  const [cqReceivedAt,  setCqReceivedAt]  = useState(booking?.cq_received_at || null);
  const [cqRecvSaving,  setCqRecvSaving]  = useState(false);
  const [pitchOpen,     setPitchOpen]     = useState(false);
  const [pitchBrandIdx, setPitchBrandIdx] = useState(0);
  const [panelTab,      setPanelTab]      = useState('info');
  const [timeline,      setTimeline]      = useState([]);
  const [tlLoading,     setTlLoading]     = useState(false);
  const [imMessages,    setImMessages]    = useState([]);
  const [imLoading,     setImLoading]     = useState(false);
  const [imText,        setImText]        = useState('');
  const [imSending,     setImSending]     = useState(false);
  const imBottomRef = useRef(null);
  const [ghlContact,        setGhlContact]        = useState(null);
  const [ghlContactLoading, setGhlContactLoading] = useState(false);
  const [ghlTags,        setGhlTags]        = useState([]);
  const [ghlTagsLoading, setGhlTagsLoading] = useState(false);
  const [newTagInput,    setNewTagInput]    = useState('');
  const [showTagInput,   setShowTagInput]   = useState(false);
  const [tagSaving,      setTagSaving]      = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [fuDate,       setFuDate]       = useState('');
  const [fuNote,       setFuNote]       = useState('');
  const [fuTemp,       setFuTemp]       = useState(3);
  const [fuSaving,     setFuSaving]     = useState(false);
  const [fuSaved,      setFuSaved]      = useState(false);
  const panelRef = useRef(null);
  const notesRef = useRef(null);
  function focusNotes() {
    setPanelTab('info');
    setTimeout(() => {
      notesRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      notesRef.current?.focus();
    }, 80);
  }

  useEffect(() => {
    if (lead) {
      const fi = lead.franchise_interests || [];
      setInterests(fi);
      setSelectedIdx(fi.length > 0 ? 0 : null);
    }
  }, [lead]);

  // Notes are keyed by contact email (not the lead row), so load them from the
  // value resolved server-side rather than from lead.notes.
  useEffect(() => { setNotes(initialNotes || ''); }, [initialNotes, booking?.id]);

  useEffect(() => {
    setCqSent(!!booking?.cq_sent_at);
    setCqSentAt(booking?.cq_sent_at || null);
    setCqReceived(!!booking?.cq_received_at);
    setCqReceivedAt(booking?.cq_received_at || null);
    setGhlTags([]); setNewTagInput(''); setShowTagInput(false); setTagSaving(false);
    setShowFollowUp(false); setFuDate(''); setFuNote(''); setFuTemp(3); setFuSaved(false);
    if (!booking?.email || isDemo) {
      if (isDemo) setGhlTags(['hot-lead', 'franchise-ready']);
      setGhlContact(null); return;
    }
    const ghlId = booking?.ghl_contact_id;
    const source = booking?._source_display;
    function applyContact(c) {
      setGhlContact(c); setGhlContactLoading(false);
      if (c?.tags?.length > 0) setGhlTags(c.tags);
      else {
        setGhlTagsLoading(true);
        fetch(`/api/dashboard/contact-tags?email=${encodeURIComponent(booking.email)}`)
          .then(r => r.json()).then(d => { setGhlTags(d.tags || []); setGhlTagsLoading(false); })
          .catch(() => setGhlTagsLoading(false));
      }
    }
    if (ghlId) {
      setGhlContactLoading(true);
      fetch(`/api/dashboard/ghl-contact-detail?contactId=${ghlId}`)
        .then(r => r.json()).then(d => applyContact(d.contact || null))
        .catch(() => { setGhlContact(null); setGhlContactLoading(false); });
    } else if (source === 'Calendly' && booking.email) {
      setGhlContactLoading(true);
      fetch(`/api/dashboard/ghl-contact-detail?email=${encodeURIComponent(booking.email)}`)
        .then(r => r.json()).then(d => applyContact(d.contact || null))
        .catch(() => { setGhlContact(null); setGhlContactLoading(false); });
    } else {
      setGhlContact(null); setGhlTagsLoading(true);
      fetch(`/api/dashboard/contact-tags?email=${encodeURIComponent(booking.email)}`)
        .then(r => r.json()).then(d => { setGhlTags(d.tags || []); setGhlTagsLoading(false); })
        .catch(() => setGhlTagsLoading(false));
    }
  }, [booking?.id]);

  useEffect(() => {
    if (!open) {
      setShowEmail(false); setEmailSent(false); setPitchOpen(false); setBrandEditMode(false);
      setPanelTab('info'); setTimeline([]); setShowFollowUp(false); setFuSaved(false);
      setNewTagInput(''); setShowTagInput(false); setGhlContact(null); setGhlContactLoading(false);
      setImMessages([]); setImText(''); setImSending(false);
    }
  }, [open]);

  function openImessage() {
    setPanelTab('imessage');
    if (imMessages.length > 0 || imLoading) return;
    const phone = booking?.phone || lead?.phone || ghlContact?.phone || '';
    if (!phone) return;
    setImLoading(true);
    fetch(`/api/dashboard/imessage-history?address=${encodeURIComponent(phone)}`)
      .then(r => r.json())
      .then(d => { setImMessages(d.messages || []); setImLoading(false); setTimeout(() => imBottomRef.current?.scrollIntoView(), 50); })
      .catch(() => setImLoading(false));
  }

  async function sendImessage() {
    const phone = booking?.phone || lead?.phone || ghlContact?.phone || '';
    if (!phone || !imText.trim() || imSending) return;
    setImSending(true);
    const text = imText.trim();
    setImText('');
    // Optimistic add
    setImMessages(prev => [...prev, { guid: `tmp_${Date.now()}`, text, isFromMe: true, dateCreated: Date.now() }]);
    setTimeout(() => imBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
    await fetch('/api/dashboard/send-imessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: phone, message: text, booking_id: booking?.id }),
    }).catch(console.error);
    setImSending(false);
  }

  function openTimeline() {
    setPanelTab('timeline');
    if (timeline.length > 0 || tlLoading) return;
    setTlLoading(true);
    fetch(`/api/lead-events?email=${encodeURIComponent(booking.email)}`)
      .then(r => r.json()).then(d => { setTimeline(d.events || []); setTlLoading(false); })
      .catch(() => setTlLoading(false));
  }

  const selectedFI = selectedIdx !== null ? interests[selectedIdx] : null;
  function updateInterest(idx, field, value) {
    setInterests(prev => prev.map((fi, i) => i === idx ? { ...fi, [field]: value } : fi));
    if (field === 'developer_email' && idx === selectedIdx) setEmail(em => ({ ...em, to: value }));
  }
  function addBrand() {
    const newFI = { id: `fi_${Date.now()}`, brand: '', developer_name: '', developer_phone: '', developer_email: '' };
    setInterests(prev => [...prev, newFI]); setSelectedIdx(interests.length);
  }
  function removeBrand(idx) {
    const updated = interests.filter((_, i) => i !== idx);
    setInterests(updated);
    setSelectedIdx(updated.length === 0 ? null : Math.min(idx, updated.length - 1));
    saveInterestsToAPI(updated);
  }
  async function saveInterestsToAPI(data) {
    if (!lead || isDemo) return;
    await fetch('/api/dashboard/update-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lead.id, franchise_interests: data }) }).catch(console.error);
  }
  async function saveBrand() {
    setBrandSaving(true); await saveInterestsToAPI(interests); setBrandSaving(false);
    setBrandSaved(true); setTimeout(() => setBrandSaved(false), 2000);
  }
  async function saveNotes() {
    if (isDemo) { setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000); return; }
    if (!booking?.email) return;
    setNotesSaving(true);
    // Keyed by email so notes persist even when there's no lead row.
    await fetch('/api/dashboard/save-note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: booking.email, notes }) }).catch(console.error);
    setNotesSaving(false); setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000);
  }
  function sendEmail() { setEmailSent(true); setTimeout(() => { setEmailSent(false); setShowEmail(false); }, 2500); }
  async function sendCQ() {
    const now = new Date().toISOString();
    if (isDemo) { setCqSent(true); setCqSentAt(now); onCQSent?.(now); return; }
    setCqSent(true);
    setCqSentAt(now);
    onCQSent?.(now); // bubble up so the meetings list + CQ Sent KPI update immediately
    await fetch('/api/dashboard/send-cq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: booking.id, email: booking.email, assigned_user_id: booking.assigned_user_id || null, slot_start: booking.slot_start }) }).catch(console.error);
  }
  async function markCQReceived() {
    const now = new Date().toISOString();
    if (isDemo) { setCqReceived(true); setCqReceivedAt(now); return; }
    setCqRecvSaving(true);
    const res = await fetch('/api/dashboard/mark-cq-received', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: booking.id, email: booking.email, slot_start: booking.slot_start }) }).catch(console.error);
    const data = res ? await res.json().catch(() => ({})) : {};
    setCqReceived(true);
    setCqReceivedAt(data.cq_received_at || now);
    setCqRecvSaving(false);
  }
  async function addTag(tag) {
    const clean = tag.trim(); if (!clean || ghlTags.includes(clean)) return;
    setTagSaving(true); setGhlTags(prev => [...prev, clean]); setNewTagInput('');
    if (!isDemo) await fetch('/api/dashboard/contact-tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: booking.email, tags: [clean] }) }).catch(console.error);
    setTagSaving(false);
  }
  async function removeTag(tag) {
    setGhlTags(prev => prev.filter(t => t !== tag));
    if (!isDemo) await fetch('/api/dashboard/contact-tags', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: booking.email, tags: [tag] }) }).catch(console.error);
  }
  async function saveFollowUp() {
    setFuSaving(true);
    if (!isDemo) await fetch('/api/dashboard/schedule-followup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: booking.id, email: booking.email, follow_up_date: fuDate, note: fuNote || null, temperature: fuTemp }) }).catch(console.error);
    setFuSaving(false); setFuSaved(true); setTimeout(() => { setFuSaved(false); setShowFollowUp(false); }, 2200);
  }

  const raw = lead?.raw_fields ? (typeof lead.raw_fields === 'string' ? JSON.parse(lead.raw_fields) : lead.raw_fields) : {};
  const cf = ghlContact?.custom_fields || {};
  const liquidCapital = getField(raw, 'liquid_capital', 'liquid capital') || cf['Liquid Cash'] || cf['Cash Available'] || null;
  const ownedBusiness = getField(raw, 'owned_business', 'owned or managed', 'managed a business', 'business before') || cf['Owned Business'] || null;
  const territory = (() => {
    const city = lead?.location_city || ghlContact?.city;
    const state = lead?.location_state || ghlContact?.state;
    const zip = lead?.location_zip || ghlContact?.zip;
    const areaCode = lead?.location_area_code || ghlContact?.area_code;
    const locRaw = lead?.location_raw;
    const fbRaw = getField(raw, 'territory', 'area_of_interest', 'interested_area') || cf['Areas of Interest'] || cf['Territory Interest'];
    if (city || state) { const primary = [city, state].filter(Boolean).join(', '); const sub = zip || (areaCode ? `Area code ${areaCode}` : null); return { primary, sub }; }
    const fallback = locRaw || fbRaw; return fallback ? { primary: fallback, sub: null } : null;
  })();

  const meta = STATUS_META[booking.status] || STATUS_META.scheduled;
  const initials = `${booking.first_name?.[0] || ''}${booking.last_name?.[0] || ''}`.toUpperCase();
  const slot = booking.slot_start ? new Date(booking.slot_start) : null;
  const slotLabel = slot ? slot.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';
  const pitchBrands = interests.filter(fi => fi.brand && brandPitches[fi.brand]);
  const pitchFI = pitchBrands[pitchBrandIdx] || pitchBrands[0];
  const pitchText = pitchFI ? brandPitches[pitchFI.brand] : null;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.2)', zIndex: 100, opacity: open ? 1 : 0, transition: 'opacity .25s', pointerEvents: open ? 'auto' : 'none' }} />
      <div ref={panelRef} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,.10)', zIndex: 101, display: 'flex', flexDirection: 'column', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .25s cubic-bezier(.4,0,.2,1)', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" }}>
        <style>{`.crmRow:last-child{border-bottom:none !important;margin-bottom:0 !important;padding-bottom:0 !important}`}</style>

        {/* Header */}
        {(() => {
          const hdrPhone = booking.phone || lead?.phone || ghlContact?.phone || '';
          const hdrCid = booking.ghl_contact_id || ghlContact?.id || '';
          return (
        <div style={p.panelHdr}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ ...p.avatar, width: 60, height: 60, fontSize: 21 }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...p.clientName, fontSize: 18 }}>{booking.first_name} {booking.last_name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 14px', marginTop: 5, fontSize: 12.5, color: '#64748B' }}>
                {booking.email && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, maxWidth: '100%' }}>
                    <span style={{ color: '#94A3B8', flexShrink: 0, display: 'inline-flex' }}><PIc name="mail" size={14} /></span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{booking.email}</span>
                  </span>
                )}
                {hdrPhone && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: '#94A3B8', display: 'inline-flex' }}><PIc name="phone" size={14} /></span>{hdrPhone}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                <SourceBadge source={booking._source_display || 'KANSO'} />
                {booking.event_name && (
                  <span title={booking.event_name} style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#475569', background: '#F1F5F9', border: '1px solid #E2E8F0', whiteSpace: 'nowrap', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }}>{booking.event_name}</span>
                )}
                <span style={{ ...p.statusBadge, color: meta.color, background: meta.bg }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.dot, display: 'inline-block' }} />
                  {meta.label}
                </span>
                {(() => {
                  if (!confirmation || confirmation.loading) return null;
                  const CONF = {
                    confirmed:   { label: '✓ Confirmed', color: '#15803D', bg: '#DCFCE7', border: '#BBF7D0' },
                    declined:    { label: '✗ Declined',  color: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
                    uncertain:   { label: '? Maybe',     color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' },
                  };
                  const c = CONF[confirmation.status];
                  if (!c) return null;
                  return (
                    <span title={confirmation.note || 'SMS confirmation status'} style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: c.color, background: c.bg, border: `1px solid ${c.border}`, whiteSpace: 'nowrap', cursor: confirmation.note ? 'help' : 'default' }}>
                      {c.label}
                    </span>
                  );
                })()}
              </div>
            </div>
            <button onClick={onClose} style={p.closeBtn}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <a href={hdrPhone ? `tel:${hdrPhone}` : undefined} style={{ ...p.hdrBtn, ...(hdrPhone ? {} : { opacity: 0.45, pointerEvents: 'none' }) }}>
              <PIc name="phone" size={15} /> Call
            </a>
            <a href={`mailto:${booking.email}`} style={p.hdrBtn}>
              <PIc name="mail" size={15} /> Email
            </a>
            <button onClick={openImessage} style={{ ...p.hdrBtn, cursor: 'pointer' }}>
              <PIc name="chat" size={15} /> iMessage
            </button>
            <a
              href={hdrCid ? `https://app.gohighlevel.com/v2/location/${GHL_LOCATION}/contacts/detail/${hdrCid}` : undefined}
              target="_blank" rel="noreferrer"
              style={{ ...p.hdrBtn, ...(hdrCid ? {} : { opacity: 0.45, pointerEvents: 'none' }) }}
            >
              <PIc name="external" size={15} /> Open
            </a>
          </div>
        </div>
          );
        })()}

        {/* Tab bar */}
        <div style={p.tabBar}>
          <button style={{ ...p.panelTab, ...(panelTab === 'info'     ? p.panelTabActive : {}) }} onClick={() => setPanelTab('info')}>Info</button>
          <button style={{ ...p.panelTab, ...(panelTab === 'imessage' ? p.panelTabActive : {}) }} onClick={openImessage}>iMessage</button>
          <button style={{ ...p.panelTab, ...(panelTab === 'timeline' ? p.panelTabActive : {}) }} onClick={openTimeline}>Timeline</button>
        </div>

        {/* Body */}
        <div style={p.scrollBody}>
          {panelTab === 'imessage' ? (
            <ImessagePanel
              messages={imMessages}
              loading={imLoading}
              text={imText}
              sending={imSending}
              phone={booking?.phone || lead?.phone || ghlContact?.phone || ''}
              onTextChange={setImText}
              onSend={sendImessage}
              bottomRef={imBottomRef}
            />
          ) : panelTab === 'timeline' ? (
            <TimelineView events={timeline} loading={tlLoading} bookingSource={booking.booking_source} />
          ) : loading ? (
            <div style={p.loadingMsg}>Loading…</div>
          ) : (
            <>
              {/* Lead Score */}
              {(() => {
                const emailOpened = (ghlTags || []).some(t => String(t).toLowerCase().includes('emailopen'));
                const { score, reasons } = computeLeadScore({ liquidRaw: liquidCapital, confStatus: confirmation?.status, status: booking.status, cqSent, cqReceived, emailOpened });
                const tier = scoreTier(score);
                return (
                  <div style={p.card}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <div style={{ flexShrink: 0, width: 60, textAlign: 'center' }}>
                        <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, color: tier.color }}>{score}</div>
                        <span style={{ display: 'inline-block', marginTop: 6, padding: '1px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: tier.color, background: tier.bg, border: `1px solid ${tier.border}` }}>{tier.label}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={p.sectionTitle}>Lead Score</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {reasons.length === 0 ? <span style={{ fontSize: 12, color: '#9CA3AF' }}>No signals yet</span> :
                            reasons.map((r, i) => (
                              <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, color: r.good ? '#334155' : '#B91C1C', background: r.good ? '#F1F5F9' : '#FEF2F2', border: `1px solid ${r.good ? '#E2E8F0' : '#FECACA'}` }}>
                                {r.good ? '+ ' : '− '}{String(r.t).replace(/_/g, ' ')}
                              </span>
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Contact / Booking Details */}
              <PanelSection title="Contact / Booking Details">
                {(() => { const phone = booking.phone || lead?.phone || ghlContact?.phone || ''; return <Row label="Phone" icon="phone"><a href={`tel:${phone}`} style={phone ? p.link : undefined}>{phone || '—'}</a></Row>; })()}
                <Row label="Email" icon="mail"><a href={`mailto:${booking.email}`} style={p.link}>{booking.email}</a></Row>
                <Row label="Scheduled" icon="calendar"><span style={p.val}>{slotLabel}</span></Row>
                <Row label="Consultant" icon="user"><span style={p.val}>{booking.assigned_to_email || ghlContact?.owner_name || '—'}</span></Row>
                {liquidCapital && <Row label="Liquid Cap." icon="dollar"><span style={p.val}>{String(liquidCapital).replace(/_/g, ' ')}</span></Row>}
                {ownedBusiness && <Row label="Owned Biz" icon="briefcase"><span style={p.val}>{String(ownedBusiness).replace(/_/g, ' ')}</span></Row>}
                {territory && <Row label="Territory" icon="pin"><span style={p.val}>{territory.primary}{territory.sub && <span style={{ color: '#9CA3AF', fontSize: 11, marginLeft: 6 }}>{territory.sub}</span>}</span></Row>}
                {booking.meet_link && <Row label="Meet Link" icon="external"><a href={booking.meet_link} target="_blank" rel="noreferrer" style={p.link}>Join call →</a></Row>}

                {(cqSentAt || cqReceivedAt) && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #F0F0F0', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {cqSentAt && (
                      <div style={{ fontSize: 11, color: '#64748B' }}>
                        <span style={{ fontWeight: 600, color: '#7C3AED' }}>CQ Sent:</span>{' '}
                        {new Date(cqSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' · '}
                        {new Date(cqSentAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    )}
                    {cqReceivedAt && (
                      <div style={{ fontSize: 11, color: '#64748B' }}>
                        <span style={{ fontWeight: 600, color: '#15803D' }}>CQ Received:</span>{' '}
                        {new Date(cqReceivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' · '}
                        {new Date(cqReceivedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        {cqSentAt && (
                          <span style={{ marginLeft: 6, color: '#94A3B8' }}>
                            ({Math.round((new Date(cqReceivedAt) - new Date(cqSentAt)) / 3600000 * 10) / 10}h turnaround)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </PanelSection>

              {/* GHL Tags */}
              <PanelSection title="GHL Tags">
                {ghlTagsLoading ? <div style={{ fontSize: 12, color: '#9CA3AF' }}>Loading tags…</div> : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {ghlTags.map(tag => (
                      <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: '#EEF2FF', border: '1px solid #C7D2FE', color: '#3730A3', borderRadius: 20, padding: '2px 6px 2px 10px', fontSize: 11, fontWeight: 500 }}>
                        {tag}
                        <button onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', color: '#818CF8', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px', fontFamily: 'inherit' }}>×</button>
                      </span>
                    ))}
                    {!showTagInput && <button onClick={() => setShowTagInput(true)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1.5px dashed #CBD5E1', background: 'transparent', color: '#9CA3AF', cursor: 'pointer', fontSize: 16, lineHeight: '1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', padding: 0 }} title="Add tag">+</button>}
                    {showTagInput && (
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center', width: '100%', marginTop: 4 }}>
                        <input autoFocus style={{ ...p.input, flex: 1, padding: '4px 8px', fontSize: 12 }} placeholder="Tag name…" value={newTagInput} onChange={e => setNewTagInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && newTagInput.trim()) { addTag(newTagInput); setShowTagInput(false); setNewTagInput(''); } if (e.key === 'Escape') { setNewTagInput(''); setShowTagInput(false); } }} />
                        <button onClick={() => { if (newTagInput.trim()) { addTag(newTagInput); setNewTagInput(''); } setShowTagInput(false); }} disabled={tagSaving} style={{ ...p.editBtn, fontSize: 11, padding: '4px 10px' }}>{tagSaving ? '…' : 'Add'}</button>
                        <button onClick={() => { setNewTagInput(''); setShowTagInput(false); }} style={{ ...p.cancelEditBtn, fontSize: 11, padding: '4px 8px' }}>✕</button>
                      </div>
                    )}
                  </div>
                )}
              </PanelSection>

              {/* Notes */}
              <PanelSection title="Notes" bg="#FFFEF5">
                <textarea ref={notesRef} style={{ ...p.notesArea, background: '#FFFDF0' }} rows={5} value={notes} placeholder="Add notes about this client…" onChange={e => setNotes(e.target.value)} />
                <div style={{ marginTop: 10 }}>
                  <button onClick={saveNotes} disabled={notesSaving} style={{ ...p.actionBtn, background: notesSaved ? '#2CA01C' : '#0077C5' }}>{notesSaving ? 'Saving…' : notesSaved ? '✓ Saved' : 'Save Notes'}</button>
                </div>
              </PanelSection>

              {/* Quick Actions */}
              <div style={p.card}>
                <div style={p.sectionTitle}>Quick Actions</div>
                {booking.status === 'scheduled' && (
                  <div style={p.qaGrid}>
                    <button style={{ ...p.qaBtn, background: '#2563EB', color: '#fff', border: 'none' }} onClick={() => onStatusChange('showed')}>
                      <PIc name="check" size={16} /> Mark Showed
                    </button>
                    <button style={{ ...p.qaBtn, background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB' }} onClick={() => onStatusChange('no-show')}>
                      <PIc name="ban" size={16} /> No-Show
                    </button>
                    <button style={{ ...p.qaBtn, background: '#fff', color: cqSent ? '#16A34A' : '#2563EB', border: `1px solid ${cqSent ? '#BBF7D0' : '#C7D9FF'}`, cursor: cqSent ? 'default' : 'pointer' }} onClick={sendCQ} disabled={cqSent}>
                      {cqSent ? <><PIc name="check" size={16} /> CQ Sent</> : <><PIc name="send" size={16} /> Send CQ</>}
                    </button>
                    <button style={{ ...p.qaBtn, background: '#fff', color: '#EA580C', border: '1px solid #FED7AA' }} onClick={() => onStatusChange('not-a-fit')}>
                      <PIc name="userx" size={16} /> Not a Good Fit
                    </button>
                  </div>
                )}
                {booking.status === 'showed' && (
                  <div style={p.qaGrid}>
                    {cqReceived ? (
                      <div style={{ ...p.qaBtn, ...p.qaSpan, background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0', cursor: 'default' }}><PIc name="check" size={16} /> CQ Received</div>
                    ) : (
                      <button style={{ ...p.qaBtn, ...p.qaSpan, background: cqSent ? '#16A34A' : '#2563EB', color: '#fff', border: 'none', cursor: cqSent ? 'default' : 'pointer', opacity: cqSent ? 0.95 : 1 }} onClick={sendCQ} disabled={cqSent}>
                        {cqSent ? <><PIc name="check" size={16} /> CQ Sent</> : <><PIc name="send" size={16} /> Send CQ</>}
                      </button>
                    )}
                    {cqSent && !cqReceived && (
                      <button style={{ ...p.qaBtn, ...p.qaSpan, background: '#fff', color: '#374151', border: '1px solid #E5E7EB' }} onClick={markCQReceived} disabled={cqRecvSaving}>
                        {cqRecvSaving ? 'Saving…' : 'Mark CQ Received'}
                      </button>
                    )}
                    <button style={{ ...p.qaBtn, background: '#fff', color: '#374151', border: '1px solid #E5E7EB' }} onClick={() => setShowFollowUp(true)}>
                      <PIc name="calendar" size={16} /> Follow-up
                    </button>
                    <button style={{ ...p.qaBtn, background: '#fff', color: '#DC2626', border: '1px solid #FECACA' }} onClick={() => onStatusChange('not-interested')}>
                      <PIc name="ban" size={16} /> Not Interested
                    </button>
                    <button style={{ ...p.qaBtn, ...p.qaSpan, background: '#fff', color: '#EA580C', border: '1px solid #FED7AA' }} onClick={() => onStatusChange('not-a-fit')}>
                      <PIc name="userx" size={16} /> Not a Good Fit
                    </button>
                  </div>
                )}
                {(booking.status === 'no-show' || booking.status === 'closed' || booking.status === 'not-interested' || booking.status === 'not-a-fit') && (
                  <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '8px 0' }}>
                    {booking.status === 'closed' ? 'Deal closed' : booking.status === 'not-interested' ? 'Marked not interested' : booking.status === 'not-a-fit' ? 'Marked not a good fit' : 'No further actions'}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showFollowUp && <FollowUpModal booking={booking} fuDate={fuDate} setFuDate={setFuDate} fuNote={fuNote} setFuNote={setFuNote} fuTemp={fuTemp} setFuTemp={setFuTemp} fuSaving={fuSaving} fuSaved={fuSaved} onSave={saveFollowUp} onClose={() => setShowFollowUp(false)} />}

      {pitchOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setPitchOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 6, width: '100%', maxWidth: 520, boxShadow: '0 8px 40px rgba(0,0,0,.2)', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #EBEBEB' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2B3C' }}>Phone Pitch</div>
                {pitchBrands.length > 1 && <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>{pitchBrands.map((fi, i) => <button key={fi.id} onClick={() => setPitchBrandIdx(i)} style={i === pitchBrandIdx ? p.brandChipActive : p.brandChip}>{fi.brand}</button>)}</div>}
                {pitchFI && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{pitchFI.brand}</div>}
              </div>
              <button onClick={() => setPitchOpen(false)} style={p.closeBtn}>✕</button>
            </div>
            <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              {pitchText ? <div style={{ fontSize: 14, color: '#1A2B3C', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{pitchText}</div>
                : <div style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', padding: '20px 0' }}>No pitch configured.<br /><a href="/dashboard" style={{ color: '#0077C5', textDecoration: 'none' }}>Set up pitches in Settings →</a></div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Follow-up Modal ──────────────────────────────────────────────────────────
const TEMP_LABELS = ['', 'Cold', 'Cool', 'Warm', 'Hot', 'On Fire'];
const TEMP_COLORS = ['', '#60A5FA', '#22D3EE', '#F59E0B', '#F97316', '#EF4444'];
const TEMP_BG     = ['', '#EFF6FF', '#ECFEFF', '#FFFBEB', '#FFF7ED', '#FEF2F2'];

function FollowUpModal({ booking, fuDate, setFuDate, fuNote, setFuNote, fuTemp, setFuTemp, fuSaving, fuSaved, onSave, onClose }) {
  const today = new Date().toISOString().split('T')[0];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 8, width: '100%', maxWidth: 440, boxShadow: '0 12px 48px rgba(0,0,0,.22)', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif", overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #EBEBEB' }}>
          <div><div style={{ fontSize: 15, fontWeight: 700, color: '#1A2B3C' }}>Schedule Follow-up</div><div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{booking.first_name} {booking.last_name} · {booking.email}</div></div>
          <button onClick={onClose} style={p.closeBtn}>✕</button>
        </div>
        <div style={{ padding: '20px 24px 24px' }}>
          {fuSaved ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 40 }}>✓</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#15803D', marginTop: 10 }}>Follow-up scheduled!</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>Added to your queue for {fuDate}</div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 18 }}><label style={p.editLabel}>Follow-up Date</label><input type="date" min={today} style={{ ...p.input, marginTop: 5, fontSize: 14 }} value={fuDate} onChange={e => setFuDate(e.target.value)} /></div>
              <div style={{ marginBottom: 18 }}>
                <label style={p.editLabel}>Likelihood to Engage</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
                  {[1,2,3,4,5].map(n => <button key={n} onClick={() => setFuTemp(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 30, lineHeight: 1, padding: '0 2px', color: fuTemp >= n ? TEMP_COLORS[fuTemp] : '#D1D5DB', transition: 'color .12s, transform .1s', transform: fuTemp === n ? 'scale(1.2)' : 'scale(1)' }}>★</button>)}
                </div>
                <div style={{ marginTop: 6, textAlign: 'center', fontSize: 12, fontWeight: 700, color: TEMP_COLORS[fuTemp], background: TEMP_BG[fuTemp], borderRadius: 20, padding: '3px 12px', display: 'inline-block', margin: '6px auto 0', width: '100%' }}>{TEMP_LABELS[fuTemp]}</div>
              </div>
              <div style={{ marginBottom: 22 }}><label style={p.editLabel}>Why follow up?</label><textarea style={{ ...p.notesArea, marginTop: 5, fontSize: 13 }} rows={3} placeholder="e.g. Wants to revisit after talking to spouse." value={fuNote} onChange={e => setFuNote(e.target.value)} /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onSave} disabled={!fuDate || fuSaving} style={{ ...p.actionBtn, flex: 1, background: !fuDate ? '#9CA3AF' : '#0077C5', cursor: !fuDate ? 'not-allowed' : 'pointer' }}>{fuSaving ? 'Scheduling…' : 'Schedule Follow-up'}</button>
                <button onClick={onClose} style={p.cancelBtn}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Panel helpers ────────────────────────────────────────────────────────────
function PanelSection({ title, bg, children }) {
  return (
    <div style={{ ...p.section, ...(bg ? { background: bg } : {}) }}>
      <div style={p.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}
function Row({ label, icon, children }) {
  return (
    <div className="crmRow" style={p.row}>
      {label && (
        <span style={p.rowLabel}>
          {icon && <span style={{ color: '#9AA4B2', display: 'inline-flex', flexShrink: 0 }}><PIc name={icon} size={15} /></span>}
          <span>{label}</span>
        </span>
      )}
      <span style={p.rowVal}>{children}</span>
    </div>
  );
}
function EditRow({ label, children }) {
  return <div style={{ marginBottom: 10 }}><label style={p.editLabel}>{label}</label>{children}</div>;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────
const EVENT_META = {
  lead_submitted:            { label: 'Lead Submitted',            color: '#9CA3AF' },
  ghl_contact_created:       { label: 'CRM Contact Created',       color: '#9CA3AF' },
  closebot_engaged:          { label: 'CloseBot Engaged',          color: '#7C3AED' },
  booking_page_viewed:       { label: 'Booking Page Viewed',       color: '#3B82F6' },
  recommended_slot_shown:    { label: 'Recommended Slot Shown',    color: '#3B82F6' },
  recommended_slot_accepted: { label: 'Slot Recommendation Taken', color: '#16A34A' },
  recommended_slot_rejected: { label: 'Slot Recommendation Skipped', color: '#D97706' },
  slot_selected:             { label: 'Slot Selected',             color: '#3B82F6' },
  appointment_booked:        { label: 'Appointment Booked',        color: '#16A34A' },
  confirmation_email_sent:   { label: 'Confirmation Email Sent',   color: '#9CA3AF' },
  calendar_add_clicked:      { label: 'Calendar Add Clicked',      color: '#3B82F6' },
  cq_email_sent:             { label: 'CQ Sent',                   color: '#7C3AED' },
  cq_received:               { label: 'CQ Received',               color: '#15803D' },
  appointment_showed:        { label: 'Showed Up',                 color: '#16A34A' },
  appointment_no_show:       { label: 'No Show',                   color: '#DC2626' },
  opportunity_closed:        { label: 'Deal Closed',               color: '#7C3AED' },
};
const SOURCE_LABELS = { direct: 'Direct', facebook_lead: 'Facebook Lead', closebot: 'CloseBot', sms: 'SMS', email: 'Email', retargeting: 'Retargeting', calendly: 'Calendly', gohighlevel: 'GoHighLevel' };

// ─── iMessage Panel ───────────────────────────────────────────────────────────

function ImessagePanel({ messages, loading, text, sending, phone, onTextChange, onSend, bottomRef }) {
  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  if (!phone) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
        No phone number on record for this lead.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 300 }}>
      {/* Phone label */}
      <div style={{ padding: '8px 16px 4px', fontSize: 11, color: '#9CA3AF', borderBottom: '1px solid #F3F4F6' }}>
        iMessage · {phone}
      </div>

      {/* Message thread */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading && (
          <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: 20 }}>Loading…</div>
        )}
        {!loading && messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: 20 }}>
            No messages yet. Send one below.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.guid || i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.isFromMe ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '76%',
              padding: '8px 12px',
              borderRadius: m.isFromMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: m.isFromMe ? '#0057FF' : '#F0F0F0',
              color: m.isFromMe ? '#fff' : '#111827',
              fontSize: 13,
              lineHeight: 1.45,
              wordBreak: 'break-word',
            }}>
              {m.text}
            </div>
            <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2, marginLeft: 2, marginRight: 2 }}>
              {fmtTime(m.dateCreated)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={text}
          onChange={e => onTextChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder="iMessage…"
          rows={1}
          style={{
            flex: 1, resize: 'none', border: '1px solid #E2E8F0', borderRadius: 18,
            padding: '7px 12px', fontSize: 13, fontFamily: 'inherit',
            outline: 'none', lineHeight: 1.4, maxHeight: 80, overflowY: 'auto',
          }}
        />
        <button
          onClick={onSend}
          disabled={!text.trim() || sending}
          style={{
            width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: text.trim() ? 'pointer' : 'default',
            background: text.trim() ? '#0057FF' : '#E2E8F0', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <svg width="14" height="14" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function TimelineView({ events, loading, bookingSource }) {
  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Loading timeline…</div>;
  return (
    <div style={{ padding: '16px 20px' }}>
      {bookingSource && <div style={{ marginBottom: 18 }}><div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 6, letterSpacing: '.4px', fontWeight: 600 }}>BOOKING SOURCE</div><div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: '#F0F4FF', border: '1px solid #C7D7F8', fontSize: 13, fontWeight: 600, color: '#1D4ED8' }}>{SOURCE_LABELS[bookingSource] || bookingSource}</div></div>}
      {events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9CA3AF', fontSize: 13 }}>No events recorded yet.<br /><span style={{ fontSize: 12 }}>Events appear as the lead interacts with your system.</span></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {events.map((ev, i) => {
            const meta = EVENT_META[ev.event_type] || { label: ev.event_type.replace(/_/g, ' '), color: '#9CA3AF' };
            const ts = new Date(ev.created_at);
            const isLast = i === events.length - 1;
            const detail = ev.event_data?.slot ? new Date(ev.event_data.slot).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ev.event_data?.source ? ev.event_data.source.replace(/_/g, ' ') : ev.event_data?.note || null;
            return (
              <div key={ev.id} style={{ display: 'flex', gap: 14 }}>
                <div style={{ width: 16, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                  {!isLast && <div style={{ width: 1, flex: 1, background: '#E5E7EB', marginTop: 4 }} />}
                </div>
                <div style={{ flex: 1, paddingBottom: isLast ? 4 : 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', lineHeight: 1.3 }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                    {ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    {detail && <span style={{ marginLeft: 6, color: '#6B7280' }}>· {detail}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QBBtn({ variant, onClick, children, disabled }) {
  const [hover, setHover] = useState(false);
  const vs = {
    success:  { color: '#1A7E24', bg: '#E3F4E5', hoverBg: '#C3E6C5', border: '#A8D5AA' },
    warning:  { color: '#92400E', bg: '#FEF3C7', hoverBg: '#FDE68A', border: '#FCD34D' },
    danger:   { color: '#C23934', bg: '#FDECEA', hoverBg: '#FFCDD2', border: '#EF9A9A' },
    primary:  { color: '#0077C5', bg: '#E0EFF9', hoverBg: '#B3D4EE', border: '#90CAF9' },
    cq:       { color: '#5C35A8', bg: '#EEE9FA', hoverBg: '#DDD5F7', border: '#C5B8F0' },
    pitch:    { color: '#1A7E24', bg: '#E3F4E5', hoverBg: '#C3E6C5', border: '#A8D5AA' },
    followup: { color: '#374151', bg: '#F3F4F6', hoverBg: '#E5E7EB', border: '#D1D5DB' },
  }[variant];
  return <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 3, border: `1px solid ${vs.border}`, color: vs.color, background: hover ? vs.hoverBg : vs.bg, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background .15s', whiteSpace: 'nowrap', opacity: disabled ? 0.5 : 1 }}>{children}</button>;
}

// ─── Page styles ──────────────────────────────────────────────────────────────
const s = {
  page: { display: 'flex', height: '100vh', overflow: 'hidden', background: '#F4F5F7', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },

  // White sidebar
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
  sideUserRow:      { display: 'flex', alignItems: 'center', gap: 9, padding: '10px 10px', borderRadius: 7, cursor: 'pointer', marginTop: 2 },
  sideUserAvatar:   { width: 30, height: 30, borderRadius: '50%', background: '#0057FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },

  // Main
  main:      { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  topBar:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', flexShrink: 0, gap: 16 },
  topTitle:  { fontSize: 20, fontWeight: 700, color: '#0F172A' },
  topDate:   { fontSize: 13, color: '#64748B', fontWeight: 400, cursor: 'default' },
  topNavArrow:{ background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B', fontSize: 14, fontFamily: 'inherit', padding: 0 },
  topActions:{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  searchInput:{ padding: '8px 12px 8px 32px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, color: '#0F172A', background: '#FAFBFD', fontFamily: 'inherit', outline: 'none', width: 260 },
  topBtn:    { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6, border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#475569', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' },
  topBtnPrimary:{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', background: '#0057FF', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  body:      { flex: 1, padding: '20px 24px', overflowY: 'auto' },
  headerArea:  { flexShrink: 0, padding: '20px 24px 12px', borderBottom: '1px solid #EDEFF2', background: '#F4F5F7' },
  tableScroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 24px 24px' },
  demoBanner:{ background: '#FFFBF0', border: '1px solid #F5A623', borderLeft: '4px solid #F5A623', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#7D4E00', marginBottom: 16 },

  // Stats — one connected row
  statsCard:     { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, display: 'flex', marginBottom: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.04)' },
  statCell:      { flex: 1, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 },
  statIconCircle:{ width: 42, height: 42, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statNum:       { fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1, marginBottom: 3 },
  statLabel:     { fontSize: 12, color: '#6B7280', fontWeight: 500 },

  // Next Up
  nextUp:         { background: '#F0F7FF', border: '1px solid #BFDBFE', borderLeft: '4px solid #2563EB', borderRadius: 10, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20 },
  nextUpTimeCol:  { flexShrink: 0, minWidth: 110 },
  nextUpLabel:    { fontSize: 10, fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 4 },
  nextUpTime:     { fontSize: 36, fontWeight: 800, color: '#111827', lineHeight: 1 },
  nextUpAMPM:     { fontSize: 18, fontWeight: 500 },
  nextUpIn:       { fontSize: 13, color: '#2563EB', fontWeight: 600, marginTop: 4 },
  nextUpDivider:  { width: 1, height: 54, background: '#BFDBFE', flexShrink: 0 },
  nextUpAvatar:   { width: 46, height: 46, borderRadius: '50%', background: '#2563EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 },
  nextUpInfo:     { flex: 1, minWidth: 0 },
  nextUpName:     { fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 2 },
  nextUpSub:      { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  nextUpRep:      { fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center' },
  nextUpActions:  { display: 'flex', gap: 8, flexShrink: 0 },
  nextUpBtnOutline:{ padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: '1.5px solid #2563EB', background: '#fff', color: '#2563EB', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  nextUpBtnFill:   { padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  // Filters
  filterBar:         { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  filterPillActive:  { padding: '7px 16px', borderRadius: 6, background: '#2563EB', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' },
  filterPillOutline: { padding: '7px 16px', borderRadius: 6, background: '#fff', color: '#374151', border: '1px solid #E5E7EB', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  filterPillBadge:   { background: 'rgba(255,255,255,.3)', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 },
  filterSelect:      { appearance: 'none', WebkitAppearance: 'none', padding: '7px 28px 7px 12px', border: '1px solid #E5E7EB', borderRadius: 6, background: '#fff', fontSize: 13, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' },
  filterMoreBtn:     { padding: '7px 12px', background: 'none', border: 'none', fontSize: 13, color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  // Table
  tableCard:  { background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.04)' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:         { textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#9CA3AF', fontSize: 11, letterSpacing: '.4px', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB', textTransform: 'uppercase' },
  tr:         { borderBottom: '1px solid #F3F4F6', transition: 'background .1s' },
  td:         { padding: '14px 14px', verticalAlign: 'middle' },
  tableEmpty: { textAlign: 'center', padding: 56, color: '#9CA3AF', fontSize: 14 },
  iconBtn:    { width: 30, height: 30, borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'background .12s, border-color .12s' },
};

// ─── Panel styles ─────────────────────────────────────────────────────────────
const p = {
  panelHdr:      { display: 'flex', flexDirection: 'column', padding: '22px 20px 18px', borderBottom: '1px solid #EBEBEB', flexShrink: 0, background: '#fff' },
  avatar:        { width: 54, height: 54, borderRadius: '50%', background: '#2563EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 700, flexShrink: 0 },
  clientName:    { fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 2, letterSpacing: '-0.2px' },
  statusBadge:   { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  closeBtn:      { background: 'none', border: 'none', fontSize: 18, color: '#9CA3AF', cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1, flexShrink: 0 },

  tabBar:        { display: 'flex', borderBottom: '1px solid #EBEBEB', flexShrink: 0, background: '#FAFAFA' },
  panelTab:      { flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 500, color: '#6B7280', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' },
  panelTabActive:{ color: '#2563EB', borderBottom: '2px solid #2563EB', fontWeight: 600 },

  scrollBody:    { flex: 1, overflowY: 'auto', padding: '16px 16px 28px', background: '#F4F5F7' },
  loadingMsg:    { textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 14 },

  // Header action buttons
  hdrBtn:        { flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 6px', fontSize: 12.5, fontWeight: 600, color: '#334155', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' },

  // Card wrapper (white rounded card on gray body)
  card:          { background: '#fff', border: '1px solid #EAECEF', borderRadius: 14, padding: '16px 18px', marginBottom: 14 },

  // Quick actions section
  quickActions:  { background: '#fff', border: '1px solid #EAECEF', borderRadius: 14, padding: '16px 18px', marginBottom: 14 },

  section:       { background: '#fff', border: '1px solid #EAECEF', borderRadius: 14, padding: '16px 18px', marginBottom: 14 },
  sectionTitle:  { fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 14 },

  // Quick action buttons
  qaGrid:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  qaSpan:        { gridColumn: '1 / -1' },
  qaBtn:         { width: '100%', padding: '12px 10px', fontSize: 13, fontWeight: 600, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, boxSizing: 'border-box' },

  editBtn:       { fontSize: 12, fontWeight: 500, color: '#0077C5', background: 'transparent', border: '1px solid #B3D4EE', borderRadius: 3, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit' },
  saveEditBtn:   { fontSize: 12, fontWeight: 600, color: '#fff', border: 'none', borderRadius: 3, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' },
  cancelEditBtn: { fontSize: 12, fontWeight: 400, color: '#4A5568', background: '#F5F6F7', border: '1px solid #C8CDD2', borderRadius: 3, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' },

  fieldGroupLabel:{ fontSize: 10, fontWeight: 700, color: '#B0B8C4', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 },
  row:           { display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 11, marginBottom: 11, fontSize: 14, borderBottom: '1px solid #F1F3F5' },
  rowLabel:      { display: 'inline-flex', alignItems: 'center', gap: 8, color: '#6B7280', width: 112, flexShrink: 0, fontSize: 13, whiteSpace: 'nowrap' },
  rowVal:        { color: '#1A2B3C', flex: 1, minWidth: 0, fontWeight: 500 },
  link:          { color: '#2563EB', textDecoration: 'none', fontSize: 14 },
  val:           { fontSize: 13, color: '#1A2B3C' },
  input:         { width: '100%', padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' },
  editLabel:     { display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 },

  emailToggleBtn:{ marginTop: 12, padding: '7px 14px', background: '#F5F6F7', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#0077C5', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  emailBox:      { marginTop: 12, background: '#F8F9FA', border: '1px solid #D8DCE0', borderRadius: 4, padding: '14px 14px 12px' },
  emailHeader:   { fontSize: 12, fontWeight: 700, color: '#1A2B3C', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.4px' },
  emailField:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  emailLabel:    { fontSize: 11, color: '#6B7280', width: 44, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', flexShrink: 0 },
  emailInput:    { flex: 1, padding: '6px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none' },
  emailBody:     { width: '100%', padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' },
  actionBtn:     { padding: '8px 18px', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .2s' },
  cancelBtn:     { padding: '8px 14px', background: '#fff', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#4A5568', cursor: 'pointer', fontFamily: 'inherit' },
  notesArea:     { width: '100%', padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 },
  brandChip:     { padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 20, border: '1px solid #C8CDD2', background: '#F5F6F7', color: '#4A5568', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  brandChipActive:{ padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 20, border: '1px solid #2563EB', background: '#2563EB', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  brandChipX:    { padding: '2px 6px', fontSize: 14, lineHeight: 1, background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontFamily: 'inherit', marginLeft: -2 },
  addBrandBtn:   { padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 20, border: '1px dashed #C8CDD2', background: 'transparent', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' },
  brandCard:     { background: '#F8F9FA', border: '1px solid #E5E7EB', borderRadius: 4, padding: '14px 14px 12px', marginBottom: 12 },
};
