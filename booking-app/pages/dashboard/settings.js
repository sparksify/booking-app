import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import Head from 'next/head';
import Link from 'next/link';
import { authOptions } from '../api/auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

const TIMEZONES = [
  { label: 'Eastern  (ET)',  value: 'America/New_York'    },
  { label: 'Central  (CT)',  value: 'America/Chicago'     },
  { label: 'Mountain (MT)',  value: 'America/Denver'      },
  { label: 'Pacific  (PT)',  value: 'America/Los_Angeles' },
];
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Server-side data fetch ───────────────────────────────────────────────────
export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) {
    return { redirect: { destination: '/dashboard/login', permanent: false } };
  }

  const supabase = getSupabaseAdmin();

  const [{ data: members }, { data: bookings }, { data: settingsRow }] = await Promise.all([
    supabase.from('team_members').select('id, name, email, active, investment_ranges, created_at').order('created_at'),
    supabase.from('bookings')
      .select('id, first_name, last_name, email, phone, slot_start, assigned_to_email, meet_link')
      .order('slot_start', { ascending: false })
      .limit(20),
    supabase.from('settings').select('*').eq('id', 1).single(),
  ]);

  return {
    props: {
      session,
      initialMembers:  members  || [],
      initialBookings: bookings || [],
      initialSettings: settingsRow || {
        work_start: 9, work_end: 18, timezone: 'America/Chicago',
        meeting_duration: 30, meeting_title: 'Franchise Discovery Call',
        days_ahead: 14, buffer_minutes: 15,
        show_revenue: false, show_franchise_metrics: false,
        event_description: null, event_location: null,
        event_color: null, event_reminder_mins: 15,
      },
    },
  };
}

// ─── Side icon component ──────────────────────────────────────────────────────

function SideIcon({ name }) {
  const p = { width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', style: { display: 'block' } };
  if (name === 'dashboard') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === 'leads')     return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  if (name === 'clients')   return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === 'meetings')  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (name === 'nurture')   return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
  if (name === 'settings')  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
  if (name === 'help')      return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
  return null;
}

// ─── Dashboard page ───────────────────────────────────────────────────────────
export default function Dashboard({ initialMembers, initialBookings, initialSettings }) {
  const { data: session } = useSession();
  const [members,       setMembers]       = useState(initialMembers);
  const [bookings]                        = useState(initialBookings);
  const [settings,      setSettings]      = useState(initialSettings);
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [copied,        setCopied]        = useState(false);

  // Brand Pitches state
  const [brandPitches,  setBrandPitches]  = useState(initialSettings.brand_pitches || {});
  const [newPitchBrand, setNewPitchBrand] = useState('');
  const [pitchSaving,   setPitchSaving]   = useState({});

  // Form Tag Rules state
  const [tagRules,      setTagRules]      = useState(initialSettings.form_tag_rules || []);
  const [tagRuleSaving, setTagRuleSaving] = useState(false);
  const [tagRuleSaved,  setTagRuleSaved]  = useState(false);

  // BlueBubbles state
  const [bbUrl,        setBbUrl]        = useState(initialSettings.bluebubbles_url      || '');
  const [bbPassword,   setBbPassword]   = useState(initialSettings.bluebubbles_password || '');
  const [bbSaving,     setBbSaving]     = useState(false);
  const [bbSaved,      setBbSaved]      = useState(false);
  const [bbTesting,    setBbTesting]    = useState(false);
  const [bbTestResult, setBbTestResult] = useState(null); // { ok, version } | { error }

  // Brands state
  const [brands,        setBrands]        = useState([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [expandedBrand, setExpandedBrand] = useState(null); // brand id
  const [brandSaving,   setBrandSaving]   = useState({});
  const [brandSaved,    setBrandSaved]    = useState({});

  // Workflow Automations state
  const [workflowMappings, setWorkflowMappings] = useState(initialSettings.workflow_mappings || {});
  const [ghlWorkflows,     setGhlWorkflows]     = useState([]);
  const [ghlUsers,         setGhlUsers]         = useState([]);
  const [workflowSaving,   setWorkflowSaving]   = useState(false);
  const [workflowSaved,    setWorkflowSaved]    = useState(false);
  const [avatarUploading,  setAvatarUploading]  = useState(false);
  const [repAvatars,       setRepAvatars]       = useState(initialSettings.rep_avatars || {});
  const [repAvatarUploading, setRepAvatarUploading] = useState({});

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      await fetch('/api/dashboard/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ host_avatar_url: dataUrl }),
      });
      setSettings(p => ({ ...p, host_avatar_url: dataUrl }));
      setAvatarUploading(false);
    };
    reader.readAsDataURL(file);
  }

  async function handleRepAvatarUpload(member, file) {
    if (!file) return;
    setRepAvatarUploading(u => ({ ...u, [member.email]: true }));
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      // Key by both email and name so GHL (name-based) and Calendly (email-based) both match
      const updated = { ...repAvatars, [member.email]: dataUrl, [member.name]: dataUrl };
      await fetch('/api/dashboard/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rep_avatars: updated }),
      });
      setRepAvatars(updated);
      setRepAvatarUploading(u => ({ ...u, [member.email]: false }));
    };
    reader.readAsDataURL(file);
  }

  async function removeRepAvatar(member) {
    const updated = { ...repAvatars };
    delete updated[member.email];
    delete updated[member.name];
    await fetch('/api/dashboard/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rep_avatars: updated }),
    });
    setRepAvatars(updated);
  }

  async function removeAvatar() {
    await fetch('/api/dashboard/settings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ host_avatar_url: null }),
    });
    setSettings(p => ({ ...p, host_avatar_url: null }));
  }

  useEffect(() => { loadBrands(); }, []);

  useEffect(() => {
    fetch('/api/dashboard/ghl-workflows')
      .then(r => r.ok ? r.json() : { workflows: [], users: [] })
      .then(({ workflows, users }) => {
        setGhlWorkflows(workflows || []);
        setGhlUsers(users || []);
      })
      .catch(() => {});
  }, []);

  const bookingUrl = `https://bookkanso.co/?first_name={{first_name}}&last_name={{last_name}}&phone={{phone_number}}&email={{email}}&investment_level={{investment_level}}`;

  async function saveSettings(e) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/dashboard/settings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function toggleMember(email, active) {
    await fetch('/api/dashboard/settings', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, active }),
    });
    setMembers(prev =>
      prev.map(m => m.email === email ? { ...m, active } : m)
    );
  }

  async function updateInvestmentRanges(email, ranges) {
    await fetch('/api/dashboard/settings', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, investment_ranges: ranges }),
    });
    setMembers(prev =>
      prev.map(m => m.email === email ? { ...m, investment_ranges: ranges } : m)
    );
  }

  function copyUrl() {
    navigator.clipboard.writeText(bookingUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Brand Pitches helpers ──────────────────────────────────────────────────
  function addPitch() {
    const brand = newPitchBrand.trim();
    if (!brand) return;
    setBrandPitches(p => ({ ...p, [brand]: '' }));
    setNewPitchBrand('');
  }

  function deletePitch(brand) {
    setBrandPitches(p => { const n = { ...p }; delete n[brand]; return n; });
  }

  async function savePitch(brand) {
    setPitchSaving(s => ({ ...s, [brand]: true }));
    await fetch('/api/dashboard/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand_pitches: brandPitches }),
    });
    setPitchSaving(s => ({ ...s, [brand]: false }));
  }

  async function saveAllPitches() {
    await fetch('/api/dashboard/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand_pitches: brandPitches }),
    });
  }

  // ── Form Tag Rules helpers ─────────────────────────────────────────────────
  function addTagRule() {
    setTagRules(r => [...r, { id: Date.now().toString(), form_id: '', form_name: '', tags: [] }]);
  }

  function updateTagRule(id, field, value) {
    setTagRules(r => r.map(rule => rule.id === id ? { ...rule, [field]: value } : rule));
  }

  function addTagToRule(id, tag) {
    const t = tag.trim();
    if (!t) return;
    setTagRules(r => r.map(rule =>
      rule.id === id && !rule.tags.includes(t) ? { ...rule, tags: [...rule.tags, t] } : rule
    ));
  }

  function removeTagFromRule(id, tag) {
    setTagRules(r => r.map(rule =>
      rule.id === id ? { ...rule, tags: rule.tags.filter(t => t !== tag) } : rule
    ));
  }

  function removeTagRule(id) {
    setTagRules(r => r.filter(rule => rule.id !== id));
  }

  async function saveTagRules() {
    setTagRuleSaving(true);
    setTagRuleSaved(false);
    await fetch('/api/dashboard/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form_tag_rules: tagRules }),
    });
    setTagRuleSaving(false);
    setTagRuleSaved(true);
    setTimeout(() => setTagRuleSaved(false), 3000);
  }

  // ── Brands helpers ─────────────────────────────────────────────────────────
  async function loadBrands() {
    setBrandsLoading(true);
    const r = await fetch('/api/dashboard/brands');
    const d = await r.json();
    setBrands(d.brands || []);
    setBrandsLoading(false);
  }

  async function saveBrand(brand) {
    setBrandSaving(s => ({ ...s, [brand.id]: true }));
    const method = brand.id && !brand.id.startsWith('new_') ? 'PUT' : 'POST';
    const r = await fetch('/api/dashboard/brands', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(brand),
    });
    const d = await r.json();
    if (d.brand) {
      setBrands(bs => method === 'POST'
        ? [...bs.filter(b => !b.id.startsWith('new_')), d.brand]
        : bs.map(b => b.id === brand.id ? d.brand : b)
      );
      setExpandedBrand(d.brand.id);
    }
    setBrandSaving(s => ({ ...s, [brand.id]: false }));
    setBrandSaved(s => ({ ...s, [d.brand?.id || brand.id]: true }));
    setTimeout(() => setBrandSaved(s => ({ ...s, [d.brand?.id || brand.id]: false })), 3000);
  }

  async function deleteBrand(id) {
    if (!confirm('Delete this brand? This cannot be undone.')) return;
    await fetch('/api/dashboard/brands', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setBrands(bs => bs.filter(b => b.id !== id));
    if (expandedBrand === id) setExpandedBrand(null);
  }

  function addNewBrand() {
    const newBrand = {
      id: `new_${Date.now()}`,
      slug: '', name: '', active: true,
      booking_headline: '', booking_subtitle: '', booking_description: '',
      meeting_title: '15-Minute Phone Call', meeting_duration: 15,
      event_description: '', event_location: '', event_color: null, event_reminder_mins: 15,
      fb_form_ids: [], ghl_tags: [], rep_emails: [],
      routing_rules: {},
    };
    setBrands(bs => [...bs, newBrand]);
    setExpandedBrand(newBrand.id);
  }

  function updateBrandField(id, field, value) {
    setBrands(bs => bs.map(b => b.id === id ? { ...b, [field]: value } : b));
  }

  // ── BlueBubbles helpers ────────────────────────────────────────────────────
  async function saveBBCredentials() {
    setBbSaving(true);
    setBbSaved(false);
    setBbTestResult(null);
    await fetch('/api/dashboard/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bluebubbles_url: bbUrl.trim(), bluebubbles_password: bbPassword }),
    });
    setBbSaving(false);
    setBbSaved(true);
    setTimeout(() => setBbSaved(false), 3000);
  }

  async function testBBConnection() {
    setBbTesting(true);
    setBbTestResult(null);
    // Save first so lib picks up latest creds
    await fetch('/api/dashboard/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bluebubbles_url: bbUrl.trim(), bluebubbles_password: bbPassword }),
    });
    try {
      const r = await fetch('/api/dashboard/test-bb');
      const d = await r.json();
      setBbTestResult(d);
    } catch (e) {
      setBbTestResult({ error: e.message });
    }
    setBbTesting(false);
  }

  // ── Workflow Automations helpers ───────────────────────────────────────────
  function setWorkflow(action, userId, workflowId) {
    setWorkflowMappings(prev => ({
      ...prev,
      [action]: { ...(prev[action] || {}), [userId]: workflowId },
    }));
  }

  async function saveWorkflowMappings() {
    setWorkflowSaving(true);
    await fetch('/api/dashboard/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow_mappings: workflowMappings }),
    });
    setWorkflowSaving(false);
    setWorkflowSaved(true);
    setTimeout(() => setWorkflowSaved(false), 2000);
  }

  function formatSlot(iso) {
    const d   = new Date(iso);
    const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
    const h   = d.getHours();
    const m   = d.getMinutes();
    const p   = h >= 12 ? 'PM' : 'AM';
    const dh  = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${dow} ${MON[d.getMonth()]} ${d.getDate()} · ${dh}:${String(m).padStart(2,'0')} ${p}`;
  }

  return (
    <>
      <Head><title>Dashboard</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}button:hover{opacity:.88}`}</style>
      <div style={s.page}>

        {/* App sidebar */}
        <aside style={s.appSidebar}>
          <div style={s.sideLogoWrap}>
            <div style={s.sideLogoRow}>
              <div style={s.sideLogoIcon}>K</div>
              <span style={s.sideLogoText}>KANSO</span>
            </div>
          </div>
          <nav style={s.sideNav}>
            {[
              { href: '/dashboard/analytics', label: 'Dashboard',   icon: 'dashboard' },
              { href: '/dashboard/leads',     label: 'Leads',       icon: 'leads' },
              { href: '/dashboard/prospects', label: 'Prospecting', icon: 'clients' },
              { href: '/dashboard/bookings',  label: 'Meetings',    icon: 'meetings' },
              { href: '/dashboard/nurture',   label: 'Nurture',     icon: 'nurture' },
              { href: '/dashboard/settings',  label: 'Settings',    icon: 'settings', active: true },
            ].map(({ href, label, icon, active }) => (
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
            <div style={s.sideUserRow}>
              <div style={s.sideUserAvatar}>{(session?.user?.email?.[0] || 'U').toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {session?.user?.name || session?.user?.email?.split('@')[0] || 'User'}
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>Rep</div>
              </div>
              <span style={{ color: '#9CA3AF', fontSize: 14 }}>›</span>
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div style={s.mainCol}>
          <div style={s.topBar}>
            <div>
              <div style={s.topTitle}>Settings</div>
              <div style={s.topDate}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            </div>
          </div>

        <main style={s.main}>

          {/* ── Booking URL ─────────────────────────────────────────────── */}
          <Section title="Your Booking URL" subtitle="Paste this as the thank-you button destination in your Facebook Lead Ad.">
            <div style={s.urlBox}>
              <code style={s.urlCode}>{bookingUrl}</code>
              <button style={{ ...s.chip, background: copied ? '#16A34A' : '#1D4ED8', color: '#fff' }} onClick={copyUrl}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <p style={s.urlNote}>
              Facebook substitutes <code style={s.inlineCode}>{'{{first_name}}'}</code> etc. with the lead's real data — your booking page then pre-fills their info and skips straight to the calendar.
            </p>
          </Section>

          {/* ── Team Members ────────────────────────────────────────────── */}
          <Section
            title="Team Members"
            subtitle="Each person's Google Calendar is queried for availability. Sign in at /dashboard/login to connect a new calendar."
          >
            {members.length === 0 ? (
              <EmptyState icon="📅" message="No calendars connected yet. Sign in with Google to connect yours." />
            ) : (
              <div style={s.memberGrid}>
                {members.map(m => (
                  <MemberCard
                    key={m.email}
                    member={m}
                    avatarUrl={repAvatars[m.email] || null}
                    uploading={!!repAvatarUploading[m.email]}
                    onAvatarUpload={file => handleRepAvatarUpload(m, file)}
                    onAvatarRemove={() => removeRepAvatar(m)}
                    onToggle={toggleMember}
                    onUpdateRanges={updateInvestmentRanges}
                  />
                ))}
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <a
                href="/dashboard/login"
                style={s.addMemberLink}
                target="_blank"
                rel="noreferrer"
              >
                + Add another team member →
              </a>
            </div>
          </Section>

          {/* ── Availability Settings ────────────────────────────────────── */}
          <Section title="Availability Settings" subtitle="Changes take effect immediately for new availability lookups.">
            <form onSubmit={saveSettings} style={s.form}>
              <div style={s.formRow}>
                <Field label="Work hours start">
                  <select style={s.select} value={settings.work_start}
                    onChange={e => setSettings(p => ({ ...p, work_start: +e.target.value }))}>
                    {hours().map(h => <option key={h.v} value={h.v}>{h.l}</option>)}
                  </select>
                </Field>
                <Field label="Work hours end">
                  <select style={s.select} value={settings.work_end}
                    onChange={e => setSettings(p => ({ ...p, work_end: +e.target.value }))}>
                    {hours().map(h => <option key={h.v} value={h.v}>{h.l}</option>)}
                  </select>
                </Field>
                <Field label="Timezone">
                  <select style={s.select} value={settings.timezone}
                    onChange={e => setSettings(p => ({ ...p, timezone: e.target.value }))}>
                    {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                  </select>
                </Field>
              </div>

              <div style={s.formRow}>
                <Field label="Meeting duration (min)">
                  <select style={s.select} value={settings.meeting_duration}
                    onChange={e => setSettings(p => ({ ...p, meeting_duration: +e.target.value }))}>
                    {[15, 30, 45, 60].map(d => <option key={d} value={d}>{d} min</option>)}
                  </select>
                </Field>
                <Field label="Buffer between meetings (min)">
                  <select style={s.select} value={settings.buffer_minutes}
                    onChange={e => setSettings(p => ({ ...p, buffer_minutes: +e.target.value }))}>
                    {[0, 5, 10, 15, 30].map(b => <option key={b} value={b}>{b} min</option>)}
                  </select>
                </Field>
                <Field label="Days shown ahead">
                  <select style={s.select} value={settings.days_ahead}
                    onChange={e => setSettings(p => ({ ...p, days_ahead: +e.target.value }))}>
                    {[7, 14, 21, 30].map(d => <option key={d} value={d}>{d} days</option>)}
                  </select>
                </Field>
              </div>

              <div style={s.formRow}>
                <Field label="Max slots shown per day">
                  <select style={s.select} value={settings.max_slots_per_day ?? 15}
                    onChange={e => setSettings(p => ({ ...p, max_slots_per_day: +e.target.value }))}>
                    {[5, 8, 10, 12, 15, 20, 25].map(n => <option key={n} value={n}>{n} slots</option>)}
                  </select>
                </Field>
                <Field label="Slots randomly hidden per day">
                  <select style={s.select} value={settings.hidden_slots_count ?? 1}
                    onChange={e => setSettings(p => ({ ...p, hidden_slots_count: +e.target.value }))}>
                    {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n === 0 ? 'None' : `${n} slot${n > 1 ? 's' : ''}`}</option>)}
                  </select>
                </Field>
              </div>

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #E0E3E7' }}>
                <Field label="Revenue per close ($)">
                  <input
                    style={{ ...s.input, width: 160 }}
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0"
                    value={settings.revenue_per_close ?? 0}
                    onChange={e => setSettings(p => ({ ...p, revenue_per_close: +e.target.value }))}
                  />
                </Field>
              </div>

              <div style={{ marginTop: 20 }}>
                <button type="submit" style={s.saveBtn} disabled={saving}>
                  {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save settings'}
                </button>
              </div>
            </form>
          </Section>

          {/* ── Booking Page Content ────────────────────────────────────── */}
          <Section
            title="Booking Page Content"
            subtitle="Edit the text leads see on the scheduling page. Changes go live immediately after saving."
          >
            <form onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              await fetch('/api/dashboard/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  booking_headline:     settings.booking_headline,
                  booking_subtitle:     settings.booking_subtitle,
                  booking_description:  settings.booking_description,
                  booking_meeting_type: settings.booking_meeting_type,
                }),
              });
              setSaving(false);
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }} style={s.form}>

              <Field label="Headline">
                <input
                  style={s.input}
                  type="text"
                  placeholder="{first_name}, let's see if this could be a fit."
                  value={settings.booking_headline || ''}
                  onChange={e => setSettings(p => ({ ...p, booking_headline: e.target.value || null }))}
                />
                <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                  <button type="button" style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, border: '1px solid #E2E8F0', background: '#FAFBFD', color: '#475569', cursor: 'pointer', fontFamily: 'monospace' }}
                    onClick={() => setSettings(p => ({ ...p, booking_headline: (p.booking_headline || '') + '{first_name}' }))}>
                    {'{first_name}'}
                  </button>
                </div>
                <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Use <code style={{ fontSize: 11 }}>{'{first_name}'}</code> to personalize with the lead's name. If no name is available, that part is omitted automatically.</p>
              </Field>

              <Field label="Subtitle (blue line)">
                <input
                  style={s.input}
                  type="text"
                  placeholder="Learn More About the Opportunity"
                  value={settings.booking_subtitle || ''}
                  onChange={e => setSettings(p => ({ ...p, booking_subtitle: e.target.value || null }))}
                />
              </Field>

              <Field label="Description paragraph">
                <textarea
                  style={{ ...s.input, minHeight: 80, resize: 'vertical', lineHeight: 1.6 }}
                  placeholder="15-minute conversation. Ask questions, get details, and see if it's worth exploring further. No pressure."
                  value={settings.booking_description || ''}
                  onChange={e => setSettings(p => ({ ...p, booking_description: e.target.value || null }))}
                />
              </Field>

              <Field label="Meeting type label">
                <input
                  style={s.input}
                  type="text"
                  placeholder="Phone call"
                  value={settings.booking_meeting_type || ''}
                  onChange={e => setSettings(p => ({ ...p, booking_meeting_type: e.target.value || null }))}
                />
                <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Shown in the meta row beside the clock icon, e.g. "Phone call", "Zoom", "Video call". Duration and timezone come from Availability Settings.</p>
              </Field>

              <div style={{ marginTop: 4 }}>
                <button type="submit" style={s.saveBtn} disabled={saving}>
                  {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save page content'}
                </button>
              </div>
            </form>
          </Section>

          {/* ── Calendar Event Settings ─────────────────────────────────── */}
          <Section
            title="Calendar Event Settings"
            subtitle="Controls what appears on the Google Calendar invite sent when someone books through KANSO."
          >
            <form onSubmit={saveSettings} style={s.form}>

              <Field label="Booking page avatar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  {/* Preview circle */}
                  <div style={{
                    width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                    border: '2px solid #E5E7EB', background: '#F3F4F6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {settings.host_avatar_url
                      ? <img src={settings.host_avatar_url} alt="Avatar preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 28, color: '#D1D5DB' }}>👤</span>
                    }
                  </div>
                  <div>
                    <label style={{
                      display: 'inline-block', padding: '7px 16px', borderRadius: 6,
                      border: '1px solid #D1D5DB', background: '#F9FAFB', color: '#374151',
                      fontSize: 13, fontWeight: 600, cursor: avatarUploading ? 'wait' : 'pointer',
                    }}>
                      {avatarUploading ? 'Uploading…' : 'Upload image'}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleAvatarUpload}
                        disabled={avatarUploading}
                      />
                    </label>
                    {settings.host_avatar_url && (
                      <button type="button" onClick={removeAvatar} style={{ marginLeft: 10, fontSize: 12, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                        Remove
                      </button>
                    )}
                    <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6, maxWidth: 280 }}>
                      Shown as a circular icon beside the headline on the booking page. Square image, 200×200 px or larger recommended.
                    </p>
                  </div>
                </div>
              </Field>

              <Field label="Meeting title (calendar event name)">
                <input
                  style={s.input}
                  type="text"
                  placeholder="e.g. Franchise Discovery Call"
                  value={settings.meeting_title || ''}
                  onChange={e => setSettings(p => ({ ...p, meeting_title: e.target.value }))}
                />
              </Field>

              <Field label="Event description">
                <textarea
                  style={{ ...s.input, minHeight: 110, resize: 'vertical', lineHeight: 1.6 }}
                  placeholder={'Leave blank for a smart default, or write a custom message.\n\nAvailable variables:\n{name}  {first_name}  {last_name}  {phone}  {email}\n{date}  {time}  {investment_level}  {meeting_title}'}
                  value={settings.event_description || ''}
                  onChange={e => setSettings(p => ({ ...p, event_description: e.target.value || null }))}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                  {['{name}','{first_name}','{last_name}','{phone}','{email}','{date}','{time}','{investment_level}','{meeting_title}'].map(v => (
                    <button
                      key={v}
                      type="button"
                      style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, border: '1px solid #E2E8F0', background: '#FAFBFD', color: '#475569', cursor: 'pointer', fontFamily: 'monospace' }}
                      onClick={() => setSettings(p => ({ ...p, event_description: (p.event_description || '') + v }))}
                    >{v}</button>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Click a variable to insert it, or type it directly. Leave blank and the invite will include the lead's name, phone, email, and investment level automatically.</p>
              </Field>

              <Field label="Event location (optional)">
                <input
                  style={s.input}
                  type="text"
                  placeholder="e.g. https://zoom.us/j/... or 123 Main St, Chicago IL"
                  value={settings.event_location || ''}
                  onChange={e => setSettings(p => ({ ...p, event_location: e.target.value || null }))}
                />
                <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Shown on the calendar event as the location field. Leave blank to omit.</p>
              </Field>

              <div style={s.formRow}>
                <Field label="Event color">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4 }}>
                    {[
                      { id: null,  name: 'Default',   hex: '#4285F4' },
                      { id: 1,     name: 'Lavender',   hex: '#7986CB' },
                      { id: 2,     name: 'Sage',        hex: '#33B679' },
                      { id: 3,     name: 'Grape',       hex: '#8E24AA' },
                      { id: 4,     name: 'Flamingo',    hex: '#E67C73' },
                      { id: 5,     name: 'Banana',      hex: '#F6BF26' },
                      { id: 6,     name: 'Tangerine',   hex: '#F4511E' },
                      { id: 7,     name: 'Peacock',     hex: '#039BE5' },
                      { id: 8,     name: 'Blueberry',   hex: '#3F51B5' },
                      { id: 9,     name: 'Basil',       hex: '#0B8043' },
                      { id: 10,    name: 'Tomato',      hex: '#D50000' },
                      { id: 11,    name: 'Sage (alt)',   hex: '#616161' },
                    ].map(c => {
                      const isSelected = (settings.event_color ?? null) === c.id;
                      return (
                        <button
                          key={String(c.id)}
                          type="button"
                          title={c.name}
                          onClick={() => setSettings(p => ({ ...p, event_color: c.id }))}
                          style={{
                            width: 26, height: 26, borderRadius: '50%',
                            background: c.hex, border: isSelected ? '3px solid #1A2B3C' : '3px solid transparent',
                            boxShadow: isSelected ? '0 0 0 2px #fff inset' : 'none',
                            cursor: 'pointer', padding: 0, flexShrink: 0,
                          }}
                        />
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
                    {settings.event_color === null ? 'Default calendar color' :
                      ['','Lavender','Sage','Grape','Flamingo','Banana','Tangerine','Peacock','Blueberry','Basil','Tomato','Graphite'][settings.event_color]}
                  </p>
                </Field>

                <Field label="Email reminder before meeting">
                  <select
                    style={s.select}
                    value={settings.event_reminder_mins ?? 15}
                    onChange={e => setSettings(p => ({ ...p, event_reminder_mins: +e.target.value }))}
                  >
                    {[5, 10, 15, 30, 60, 120, 1440].map(m => (
                      <option key={m} value={m}>
                        {m < 60 ? `${m} minutes` : m === 60 ? '1 hour' : m === 120 ? '2 hours' : '1 day'}
                      </option>
                    ))}
                  </select>
                  <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>A popup reminder always fires 10 minutes before the meeting as well.</p>
                </Field>
              </div>

              <div style={{ marginTop: 4 }}>
                <button type="submit" style={s.saveBtn} disabled={saving}>
                  {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save calendar settings'}
                </button>
              </div>
            </form>
          </Section>

          {/* ── Analytics Display ───────────────────────────────────────── */}
          <Section title="Analytics Display" subtitle="Choose which sections appear on the Analytics page. Changes take effect on next page load.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <ToggleSwitch
                  checked={!!settings.show_revenue}
                  onChange={val => setSettings(p => ({ ...p, show_revenue: val }))}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2B3C' }}>Revenue Metrics</div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>Revenue generated, revenue per appointment, revenue per lead, and opportunity loss values. Requires Revenue per Close to be set below.</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <ToggleSwitch
                  checked={!!settings.show_franchise_metrics}
                  onChange={val => setSettings(p => ({ ...p, show_franchise_metrics: val }))}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2B3C' }}>Franchise &amp; CQ Metrics</div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>CQ funnel KPIs, best slots for CQ returns, CQ by consultant, and pipeline value. Shown immediately after the Executive Summary.</div>
                </div>
              </label>
            </div>
            <div style={{ marginTop: 16 }}>
              <button type="button" style={s.saveBtn} onClick={saveSettings} disabled={saving}>
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save settings'}
              </button>
            </div>
          </Section>

          {/* ── Brand Pitches ───────────────────────────────────────────── */}
          <Section title="Brand Pitches" subtitle="Phone pitch scripts shown in the CRM panel when you click 'Brand Pitch'. Keyed by brand name.">
            {Object.entries(brandPitches).map(([brand, pitch]) => (
              <div key={brand} style={{ marginBottom: 18, background: '#FAFBFD', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1A2B3C' }}>{brand}</span>
                  <button
                    style={{ fontSize: 12, color: '#C23934', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                    onClick={() => { deletePitch(brand); saveAllPitches(); }}
                  >Delete</button>
                </div>
                <textarea
                  style={{ ...s.input, width: '100%', minHeight: 100, resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }}
                  value={pitch}
                  placeholder={`Enter your phone pitch script for ${brand}…`}
                  onChange={e => setBrandPitches(p => ({ ...p, [brand]: e.target.value }))}
                />
                <button
                  style={{ marginTop: 8, ...s.saveBtn, fontSize: 12, padding: '6px 16px' }}
                  onClick={() => savePitch(brand)}
                  disabled={pitchSaving[brand]}
                >
                  {pitchSaving[brand] ? 'Saving…' : 'Save Pitch'}
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: Object.keys(brandPitches).length > 0 ? 0 : 0 }}>
              <input
                style={{ ...s.input, flex: 1 }}
                placeholder="Brand name (e.g. Wet Fuel)"
                value={newPitchBrand}
                onChange={e => setNewPitchBrand(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPitch()}
              />
              <button style={s.saveBtn} onClick={addPitch}>+ Add Brand</button>
            </div>
          </Section>

          {/* ── Form Tag Rules ───────────────────────────────────────────── */}
          <Section title="Form Tag Rules" subtitle="Tags automatically applied to a lead in GoHighLevel when they arrive from a specific Facebook form.">
            {tagRules.map((rule, i) => (
              <FormTagRule
                key={rule.id}
                rule={rule}
                onUpdate={(field, val) => updateTagRule(rule.id, field, val)}
                onAddTag={tag => addTagToRule(rule.id, tag)}
                onRemoveTag={tag => removeTagFromRule(rule.id, tag)}
                onDelete={() => { removeTagRule(rule.id); saveTagRules(); }}
                styles={s}
              />
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
              <button style={s.saveBtn} onClick={addTagRule}>+ Add Rule</button>
              <button
                style={{ ...s.saveBtn, background: tagRuleSaved ? '#15803D' : '#0057FF', minWidth: 120 }}
                onClick={saveTagRules}
                disabled={tagRuleSaving}
              >
                {tagRuleSaving ? 'Saving…' : tagRuleSaved ? '✓ Saved' : 'Save All Rules'}
              </button>
            </div>
          </Section>

          {/* ── Workflow Automations ─────────────────────────────────────── */}
          <Section
            title="Workflow Automations"
            subtitle="Map each button action to a GoHighLevel workflow, per consultant. The workflow fires automatically when the button is clicked on a meeting."
          >
            {ghlWorkflows.length === 0 ? (
              <div style={{ fontSize: 13, color: '#9CA3AF', padding: '12px 0' }}>Loading workflows from GoHighLevel…</div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ ...s.table, marginBottom: 0 }}>
                    <thead>
                      <tr>
                        <th style={s.th}>Action</th>
                        {ghlUsers.map(u => (
                          <th key={u.id} style={s.th}>{u.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: 'send_cq',       label: 'Send CQ' },
                        { key: 'mark_no_show',  label: 'Mark No-Show' },
                      ].map(action => (
                        <tr key={action.key} style={s.tr}>
                          <td style={{ ...s.td, fontWeight: 600, whiteSpace: 'nowrap', color: '#1A2B3C' }}>
                            {action.label}
                          </td>
                          {ghlUsers.map(u => (
                            <td key={u.id} style={s.td}>
                              <select
                                style={{ ...s.select, width: '100%', minWidth: 200 }}
                                value={(workflowMappings[action.key] || {})[u.id] || ''}
                                onChange={e => setWorkflow(action.key, u.id, e.target.value)}
                              >
                                <option value="">— No workflow —</option>
                                {ghlWorkflows.map(wf => (
                                  <option key={wf.id} value={wf.id}>{wf.name}</option>
                                ))}
                              </select>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 16 }}>
                  <button style={s.saveBtn} onClick={saveWorkflowMappings} disabled={workflowSaving}>
                    {workflowSaving ? 'Saving…' : workflowSaved ? '✓ Saved' : 'Save Workflow Mappings'}
                  </button>
                </div>
              </>
            )}
          </Section>

          {/* ── Recent Bookings ──────────────────────────────────────────── */}
          <Section
            title="Recent Bookings"
            subtitle={`Last ${bookings.length} bookings`}
          >
            {bookings.length === 0 ? (
              <EmptyState icon="📋" message="No bookings yet. Once leads start booking, they'll appear here." />
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {['Name', 'Email', 'Phone', 'Slot', 'Assigned to', 'Meet'].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map(b => (
                      <tr key={b.id} style={s.tr}>
                        <td style={s.td}>{b.first_name} {b.last_name}</td>
                        <td style={s.td}>{b.email}</td>
                        <td style={s.td}>{b.phone || '—'}</td>
                        <td style={s.td}>{formatSlot(b.slot_start)}</td>
                        <td style={s.td}>{b.assigned_to_email || '—'}</td>
                        <td style={s.td}>
                          {b.meet_link
                            ? <a href={b.meet_link} target="_blank" rel="noreferrer" style={s.meetLink}>Join</a>
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ── Brands ───────────────────────────────────────────────────── */}
          <Section
            title="Brands"
            subtitle="Each brand gets its own booking URL, calendar content, GHL tags, assigned reps, and liquid capital routing rules."
          >
            <BrandsEditor
              brands={brands}
              loading={brandsLoading}
              expandedBrand={expandedBrand}
              setExpandedBrand={setExpandedBrand}
              brandSaving={brandSaving}
              brandSaved={brandSaved}
              members={members}
              onSave={saveBrand}
              onDelete={deleteBrand}
              onAdd={addNewBrand}
              onUpdate={updateBrandField}
              styles={s}
            />
          </Section>

          {/* ── BlueBubbles iMessage ─────────────────────────────────────── */}
          <Section
            title="BlueBubbles iMessage"
            subtitle="Connect a BlueBubbles server to send and receive iMessages directly from the CRM. Requires a dedicated always-on Mac running the BlueBubbles server app."
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={s.label}>Server URL</label>
                  <input
                    style={s.input}
                    type="url"
                    placeholder="https://abc123.trycloudflare.com"
                    value={bbUrl}
                    onChange={e => setBbUrl(e.target.value)}
                  />
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                    Found in BlueBubbles Server → Connection → Proxy URL
                  </div>
                </div>
                <div>
                  <label style={s.label}>Server Password</label>
                  <input
                    style={s.input}
                    type="password"
                    placeholder="Your BlueBubbles server password"
                    value={bbPassword}
                    onChange={e => setBbPassword(e.target.value)}
                  />
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                    Set in BlueBubbles Server → Connection → Server Password
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button style={s.saveBtn} onClick={saveBBCredentials} disabled={bbSaving}>
                  {bbSaving ? 'Saving…' : bbSaved ? '✓ Saved' : 'Save'}
                </button>
                <button
                  style={{ ...s.saveBtn, background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}
                  onClick={testBBConnection}
                  disabled={bbTesting || !bbUrl}
                >
                  {bbTesting ? 'Testing…' : 'Test Connection'}
                </button>
                {bbTestResult && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: bbTestResult.ok ? '#15803D' : '#DC2626' }}>
                    {bbTestResult.ok
                      ? `Connected (v${bbTestResult.version})`
                      : `Failed: ${bbTestResult.error || 'unknown error'}`}
                  </span>
                )}
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Incoming message webhook</div>
                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>
                  In BlueBubbles Server, go to Settings → Webhooks → Add and enter this URL to receive incoming iMessages in the CRM:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ fontSize: 12, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 4, padding: '4px 10px', flex: 1, color: '#0057FF', fontFamily: 'monospace' }}>
                    https://trykanso.co/api/webhooks/bluebubbles
                  </code>
                  <button
                    style={{ fontSize: 12, padding: '5px 12px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', color: '#475569' }}
                    onClick={() => navigator.clipboard.writeText('https://trykanso.co/api/webhooks/bluebubbles')}
                  >
                    Copy
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
                  Subscribe to: <strong>new-message</strong> events. Incoming messages will appear in the lead timeline and CRM iMessage tab.
                </div>
              </div>
            </div>
          </Section>

        </main>
        </div>{/* /mainCol */}
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, subtitle, children }) {
  return (
    <div style={s.section}>
      <div style={s.sectionHdr}>
        <h2 style={s.sectionTitle}>{title}</h2>
        {subtitle && <p style={s.sectionSub}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      {children}
    </div>
  );
}

const INV_RANGES = [
  { key: 'lt_100k',    label: 'Under $100k'  },
  { key: '100k_250k',  label: '$100k–$250k'  },
  { key: '250k_500k',  label: '$250k–$500k'  },
  { key: 'gt_500k',    label: 'Over $500k'   },
];

function MemberCard({ member, avatarUrl, uploading, onAvatarUpload, onAvatarRemove, onToggle, onUpdateRanges }) {
  const [expanded, setExpanded] = useState(false);
  const [hoveringAvatar, setHoveringAvatar] = useState(false);
  const ranges = member.investment_ranges || [];
  const initials = member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  function toggleRange(key) {
    const next = ranges.includes(key) ? ranges.filter(r => r !== key) : [...ranges, key];
    onUpdateRanges(member.email, next);
  }

  return (
    <div style={{ ...s.memberCard, opacity: member.active ? 1 : 0.5 }}>
      <div style={s.memberCardTop}>
        {/* Avatar with upload overlay */}
        <div style={{ position: 'relative', flexShrink: 0, width: 44, height: 44 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', border: '2px solid #E2E8F0', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {avatarUrl
              ? <img src={avatarUrl} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 14, fontWeight: 600, color: '#0057FF' }}>{initials}</span>
            }
          </div>
          <label
            title="Upload photo"
            onMouseEnter={() => setHoveringAvatar(true)}
            onMouseLeave={() => setHoveringAvatar(false)}
            style={{ position: 'absolute', inset: 0, borderRadius: '50%', cursor: uploading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: hoveringAvatar ? 'rgba(0,0,0,.38)' : 'rgba(0,0,0,0)', transition: 'background .15s' }}
          >
            {hoveringAvatar && !uploading && (
              <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            )}
            {uploading && <span style={{ color: '#fff', fontSize: 10 }}>…</span>}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onAvatarUpload(f); e.target.value = ''; }} disabled={uploading} />
          </label>
        </div>
        <div style={s.memberInfo}>
          <div style={s.memberName}>{member.name}</div>
          <div style={s.memberEmail}>{member.email}</div>
          {ranges.length === 0 ? (
            <div style={s.memberRangeNote}>Handles all investment levels</div>
          ) : (
            <div style={s.memberRangeNote}>{INV_RANGES.filter(r => ranges.includes(r.key)).map(r => r.label).join(', ')}</div>
          )}
          {avatarUrl && (
            <button type="button" onClick={onAvatarRemove} style={{ fontSize: 11, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 3, textDecoration: 'underline', fontFamily: 'inherit' }}>
              Remove photo
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ ...s.statusDot, background: member.active ? '#16A34A' : '#CBD5E1' }} title={member.active ? 'Active' : 'Inactive'} />
          <button style={s.toggleBtn} onClick={() => onToggle(member.email, !member.active)}>
            {member.active ? 'Pause' : 'Resume'}
          </button>
          <button style={s.toggleBtn} onClick={() => setExpanded(e => !e)}>
            {expanded ? 'Done' : 'Routing'}
          </button>
        </div>
      </div>
      {expanded && (
        <div style={s.rangesWrap}>
          <div style={s.rangesLabel}>Investment ranges this rep handles (leave all unchecked = handles all)</div>
          <div style={s.rangesRow}>
            {INV_RANGES.map(r => (
              <label key={r.key} style={s.rangeCheck}>
                <input
                  type="checkbox"
                  checked={ranges.includes(r.key)}
                  onChange={() => toggleRange(r.key)}
                  style={{ marginRight: 6 }}
                />
                {r.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, message }) {
  return (
    <div style={s.empty}>
      <span style={{ fontSize: 28 }}>{icon}</span>
      <span style={{ fontSize: 14, color: '#6B7280', maxWidth: 280, textAlign: 'center' }}>{message}</span>
    </div>
  );
}

function FormTagRule({ rule, onUpdate, onAddTag, onRemoveTag, onDelete, styles: s }) {
  const [newTag, setNewTag] = useState('');
  return (
    <div style={{ marginBottom: 14, background: '#FAFBFD', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={s.label}>Form ID</label>
          <input style={s.input} placeholder="Facebook form_id"
            value={rule.form_id} onChange={e => onUpdate('form_id', e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={s.label}>Form Name (for reference)</label>
          <input style={s.input} placeholder="e.g. Wet Fuel Ad"
            value={rule.form_name} onChange={e => onUpdate('form_name', e.target.value)} />
        </div>
        <button style={{ alignSelf: 'flex-end', marginBottom: 1, fontSize: 12, color: '#C23934', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '8px 0' }}
          onClick={onDelete}>Delete</button>
      </div>
      <label style={s.label}>Auto-apply tags in GHL</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {rule.tags.map(tag => (
          <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#EFF6FF', color: '#0057FF', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 500 }}>
            {tag}
            <button onClick={() => onRemoveTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0057FF', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ ...s.input, flex: 1 }} placeholder="Add tag (e.g. wet-fuel-lead)"
          value={newTag}
          onChange={e => setNewTag(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onAddTag(newTag); setNewTag(''); } }}
        />
        <button style={s.saveBtn} onClick={() => { onAddTag(newTag); setNewTag(''); }}>Add</button>
      </div>
    </div>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', width: 40, height: 22, borderRadius: 11, flexShrink: 0,
        background: checked ? '#0057FF' : '#CBD5E1',
        cursor: 'pointer', transition: 'background .2s',
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: checked ? 20 : 3,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left .18s',
      }} />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hours() {
  const out = [];
  for (let h = 6; h <= 20; h++) {
    const p  = h >= 12 ? 'PM' : 'AM';
    const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
    out.push({ v: h, l: `${dh}:00 ${p}` });
  }
  return out;
}

// ─── BrandsEditor component ───────────────────────────────────────────────────

const TIERS = [
  { key: 't25_50',   label: '$25k – $50k' },
  { key: 't50_75',   label: '$50k – $75k' },
  { key: 't75_150',  label: '$75k – $150k' },
  { key: 't150_500', label: '$150k – $500k' },
  { key: 't500_plus',label: '$500k+' },
  { key: 't_null',   label: 'No data (null)' },
];

function BrandsEditor({ brands, loading, expandedBrand, setExpandedBrand, brandSaving, brandSaved, members, onSave, onDelete, onAdd, onUpdate, styles: s }) {
  if (loading) return <div style={{ padding: 20, color: '#64748B', fontSize: 13 }}>Loading brands…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {brands.length === 0 && (
        <div style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic' }}>No brands yet. Add your first brand below.</div>
      )}

      {brands.map(brand => {
        const isOpen   = expandedBrand === brand.id;
        const isSaving = brandSaving[brand.id];
        const isSaved  = brandSaved[brand.id];
        const bookingUrl = `https://bookkanso.co/${brand.slug || '[slug]'}`;

        return (
          <div key={brand.id} style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', background: '#FFFFFF' }}>
            {/* Brand header row */}
            <div
              onClick={() => setExpandedBrand(isOpen ? null : brand.id)}
              style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', cursor: 'pointer', background: isOpen ? '#F8FAFC' : '#FFFFFF', borderBottom: isOpen ? '1px solid #E2E8F0' : 'none', gap: 12 }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{brand.name || 'New Brand'}</div>
                {brand.slug && <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>bookkanso.co/{brand.slug}</div>}
              </div>
              <span style={{ fontSize: 11, color: brand.active ? '#16A34A' : '#94A3B8', fontWeight: 600 }}>{brand.active ? 'Active' : 'Inactive'}</span>
              <span style={{ fontSize: 16, color: '#94A3B8' }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {/* Expanded edit form */}
            {isOpen && (
              <div style={{ padding: '18px 18px 20px' }}>
                {/* Basic info */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={s.label}>Brand Name *</label>
                    <input style={s.input} value={brand.name} onChange={e => onUpdate(brand.id, 'name', e.target.value)} placeholder="WetFuel B2B Franchise" />
                  </div>
                  <div>
                    <label style={s.label}>URL Slug * (lowercase, hyphens OK)</label>
                    <input style={s.input} value={brand.slug} onChange={e => onUpdate(brand.id, 'slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))} placeholder="wetfuel" />
                    {brand.slug && <div style={{ fontSize: 11, color: '#0057FF', marginTop: 3, fontFamily: 'monospace' }}>bookkanso.co/{brand.slug}</div>}
                  </div>
                </div>

                {/* Booking page content */}
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Booking Page Content</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={s.label}>Headline</label>
                    <input style={s.input} value={brand.booking_headline || ''} onChange={e => onUpdate(brand.id, 'booking_headline', e.target.value)} placeholder="Book Your Free WetFuel Call" />
                  </div>
                  <div>
                    <label style={s.label}>Subtitle</label>
                    <input style={s.input} value={brand.booking_subtitle || ''} onChange={e => onUpdate(brand.id, 'booking_subtitle', e.target.value)} placeholder="Choose a time that works for you" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  <div>
                    <label style={s.label}>Meeting Title</label>
                    <input style={s.input} value={brand.meeting_title || ''} onChange={e => onUpdate(brand.id, 'meeting_title', e.target.value)} placeholder="15-Minute Phone Call" />
                  </div>
                  <div>
                    <label style={s.label}>Duration (minutes)</label>
                    <input style={s.input} type="number" value={brand.meeting_duration || 15} onChange={e => onUpdate(brand.id, 'meeting_duration', parseInt(e.target.value) || 15)} />
                  </div>
                </div>

                {/* Facebook forms + GHL tags */}
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Facebook Forms → GHL Tags</div>
                <ArrayField label="Facebook Form IDs" values={brand.fb_form_ids || []} onChange={v => onUpdate(brand.id, 'fb_form_ids', v)} placeholder="2100967397128522" />
                <ArrayField label="GHL Tags (auto-applied on lead arrival)" values={brand.ghl_tags || []} onChange={v => onUpdate(brand.id, 'ghl_tags', v)} placeholder="wetfuel" />

                {/* Reps */}
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.5px', margin: '16px 0 8px' }}>Assigned Reps (in fallback rotation order)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {(members || []).map(m => {
                    const included = (brand.rep_emails || []).includes(m.email);
                    return (
                      <button
                        key={m.email}
                        type="button"
                        onClick={() => {
                          const current = brand.rep_emails || [];
                          onUpdate(brand.id, 'rep_emails', included ? current.filter(e => e !== m.email) : [...current, m.email]);
                        }}
                        style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: included ? 'none' : '1px solid #E2E8F0', background: included ? '#0057FF' : '#F8FAFC', color: included ? '#fff' : '#475569' }}
                      >
                        {m.name || m.email.split('@')[0]}
                      </button>
                    );
                  })}
                  {(!members || members.length === 0) && <div style={{ fontSize: 12, color: '#94A3B8' }}>No team members connected yet.</div>}
                </div>

                {/* Routing rules */}
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.5px', margin: '16px 0 10px' }}>Liquid Capital Routing</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {TIERS.map(tier => {
                    const rules   = (brand.routing_rules || {})[tier.key] || [];
                    const repList  = brand.rep_emails || [];
                    return (
                      <div key={tier.key} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '10px 12px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>{tier.label}</div>
                        {repList.length === 0 ? (
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>Add reps above first.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {repList.map(email => {
                              const rule    = Array.isArray(rules) ? rules.find(r => r.email === email) : null;
                              const weight  = rule?.weight ?? 0;
                              const name    = (members || []).find(m => m.email === email)?.name || email.split('@')[0];
                              const total   = Array.isArray(rules) ? rules.reduce((s, r) => s + (r.weight || 0), 0) : 0;
                              const pct     = total > 0 ? Math.round((weight / total) * 100) : 0;
                              return (
                                <div key={email} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ width: 80, fontSize: 12, color: '#475569', fontWeight: 500, flexShrink: 0 }}>{name}</div>
                                  <input
                                    type="range" min="0" max="20" value={weight}
                                    onChange={e => {
                                      const w = parseInt(e.target.value);
                                      const existing = Array.isArray(rules) ? rules : [];
                                      const updated  = existing.filter(r => r.email !== email);
                                      if (w > 0) updated.push({ email, weight: w });
                                      onUpdate(brand.id, 'routing_rules', { ...brand.routing_rules, [tier.key]: updated });
                                    }}
                                    style={{ flex: 1 }}
                                  />
                                  <div style={{ width: 44, fontSize: 12, fontWeight: 700, color: weight > 0 ? '#0057FF' : '#CBD5E1', textAlign: 'right', flexShrink: 0 }}>
                                    {weight > 0 ? `${pct}%` : 'Off'}
                                  </div>
                                </div>
                              );
                            })}
                            {Array.isArray(rules) && rules.length > 0 && (
                              <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                                Cycle: {rules.filter(r => r.weight > 0).map(r => {
                                  const n = (members || []).find(m => m.email === r.email)?.name || r.email.split('@')[0];
                                  return `${n} ×${r.weight}`;
                                }).join(', ')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Save / Delete */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
                  <button
                    style={{ ...s.saveBtn, background: isSaved ? '#15803D' : '#0057FF', minWidth: 100 }}
                    onClick={() => onSave(brand)}
                    disabled={isSaving || !brand.name || !brand.slug}
                  >
                    {isSaving ? 'Saving…' : isSaved ? '✓ Saved' : 'Save Brand'}
                  </button>
                  <button onClick={() => onDelete(brand.id)} style={{ fontSize: 12, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                    Delete brand
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button style={{ ...s.saveBtn, background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', marginTop: 4 }} onClick={onAdd}>
        + Add Brand
      </button>
    </div>
  );
}

// ── ArrayField: comma-based tag list editor ────────────────────────────────
function ArrayField({ label, values, onChange, placeholder }) {
  const [input, setInput] = useState('');
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 5 }}>{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {values.map(v => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#EFF6FF', color: '#0057FF', borderRadius: 4, padding: '3px 8px', fontSize: 12, fontWeight: 600 }}>
            {v}
            <button type="button" onClick={() => onChange(values.filter(x => x !== v))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0057FF', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { onChange([...values, input.trim()]); setInput(''); } }}
          placeholder={placeholder}
          style={{ flex: 1, padding: '7px 10px', fontSize: 13, border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: 'inherit', outline: 'none' }}
        />
        <button
          type="button"
          onClick={() => { if (input.trim()) { onChange([...values, input.trim()]); setInput(''); } }}
          style={{ padding: '7px 14px', background: '#0057FF', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  // Page
  page:        { display: 'flex', minHeight: '100vh', background: '#FAFBFD', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif", color: '#333' },

  // App-level left sidebar
  appSidebar:       { width: 210, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', zIndex: 10 },
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
  mainCol:          { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  topBar:           { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', flexShrink: 0, gap: 16 },
  topTitle:         { fontSize: 20, fontWeight: 700, color: '#0F172A' },
  topDate:          { fontSize: 13, color: '#64748B', fontWeight: 400, marginTop: 2 },

  // QB dark header — precise color (kept for reference, no longer rendered)
  header:      { background: '#151719', padding: '0 20px', height: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 28 },
  logo:        { fontWeight: 600, fontSize: 15, color: '#FFFFFF', letterSpacing: '-0.2px', flexShrink: 0 },
  nav:         { display: 'flex', gap: 2 },
  navLink:     { fontSize: 13, color: '#9FA6B2', textDecoration: 'none', padding: '7px 14px', borderRadius: 3, fontWeight: 400 },
  navActive:   { color: '#FFFFFF', background: 'rgba(255,255,255,.13)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  headerUser:  { fontSize: 13, color: '#9FA6B2' },
  signOutBtn:  { fontSize: 12, fontWeight: 400, color: '#9FA6B2', background: 'transparent', border: '1px solid rgba(255,255,255,.18)', borderRadius: 3, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },

  // Body
  main:        { flex: 1, padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 },

  // Section cards — design system white card
  section:     { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '22px 24px 26px', boxShadow: '0 1px 3px rgba(15,23,42,.04)' },
  sectionHdr:  { marginBottom: 16 },
  sectionTitle:{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginBottom: 4 },
  sectionSub:  { fontSize: 13, color: '#64748B', lineHeight: 1.6 },

  // Booking URL
  urlBox:      { display: 'flex', alignItems: 'center', gap: 10, background: '#FAFBFD', border: '1px solid #E2E8F0', borderRadius: 6, padding: '11px 14px', marginBottom: 10 },
  urlCode:     { flex: 1, fontSize: 12, fontFamily: 'monospace', color: '#475569', wordBreak: 'break-all' },
  chip:        { flexShrink: 0, padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' },
  urlNote:     { fontSize: 12, color: '#64748B', lineHeight: 1.6 },
  inlineCode:  { background: '#F1F5F9', borderRadius: 4, padding: '1px 4px', fontFamily: 'monospace', fontSize: 11 },

  // Team members
  memberGrid:  { display: 'flex', flexDirection: 'column', gap: 8 },
  memberCard:  { background: '#FAFBFD', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', transition: 'opacity .2s' },
  memberCardTop:{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' },
  avatar:      { width: 34, height: 34, borderRadius: '50%', background: '#EFF6FF', color: '#0057FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 },
  memberInfo:  { flex: 1, minWidth: 0 },
  memberName:  { fontSize: 14, fontWeight: 600, color: '#0F172A' },
  memberEmail: { fontSize: 12, color: '#64748B', marginTop: 1 },
  memberRangeNote: { fontSize: 11, color: '#94A3B8', marginTop: 3, fontStyle: 'italic' },
  statusDot:   { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  toggleBtn:   { fontSize: 12, fontWeight: 500, color: '#475569', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' },
  rangesWrap:  { borderTop: '1px solid #E2E8F0', padding: '12px 14px', background: '#FFFFFF' },
  rangesLabel: { fontSize: 11, color: '#64748B', marginBottom: 10 },
  rangesRow:   { display: 'flex', gap: 16, flexWrap: 'wrap' },
  rangeCheck:  { display: 'flex', alignItems: 'center', fontSize: 13, color: '#0F172A', cursor: 'pointer', fontWeight: 400 },
  addMemberLink:{ fontSize: 13, color: '#0057FF', fontWeight: 500, textDecoration: 'none' },

  // Form
  form:        { display: 'flex', flexDirection: 'column', gap: 16 },
  formRow:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 },
  field:       { display: 'flex', flexDirection: 'column', gap: 6 },
  label:       { fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.5px' },
  select:      { padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, color: '#0F172A', background: '#FFFFFF', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' },
  input:       { padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, color: '#0F172A', background: '#FFFFFF', fontFamily: 'inherit', outline: 'none' },
  saveBtn:     { padding: '9px 20px', background: '#0057FF', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },

  // Table
  tableWrap:   { overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:          { padding: '9px 14px', background: '#FAFBFD', color: '#64748B', fontWeight: 700, textAlign: 'left', fontSize: 10, letterSpacing: '.05em', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' },
  td:          { padding: '11px 14px', borderBottom: '1px solid #F1F5F9', color: '#0F172A', verticalAlign: 'middle', whiteSpace: 'nowrap' },
  tr:          { transition: 'background .1s' },
  meetLink:    { color: '#0057FF', fontWeight: 500, textDecoration: 'none' },
  empty:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '32px 0' },
};
