import { useState } from 'react';
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
      },
    },
  };
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
  const [tagRuleSaving, setTagRuleSaving] = useState({});

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const bookingUrl = `${baseUrl}/?first_name={{first_name}}&last_name={{last_name}}&phone={{phone_number}}&email={{email}}&investment_level={{investment_level}}`;

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
    await fetch('/api/dashboard/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form_tag_rules: tagRules }),
    });
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
      <div style={s.page}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header style={s.header}>
          <div style={s.headerLeft}>
            <span style={s.logo}>⬡ FranchiseBook</span>
            <nav style={s.nav}>
              <Link href="/dashboard/bookings"  style={s.navLink}>Bookings</Link>
              <Link href="/dashboard/leads"     style={s.navLink}>Leads</Link>
              <Link href="/dashboard/analytics" style={s.navLink}>Analytics</Link>
            </nav>
          </div>
          <div style={s.headerRight}>
            <Link href="/dashboard/settings" style={{ ...s.navLink, ...s.navActive }}>⚙ Settings</Link>
            <span style={s.headerUser}>{session?.user?.email}</span>
            <button style={s.signOutBtn} onClick={() => signOut({ callbackUrl: '/dashboard/login' })}>
              Sign out
            </button>
          </div>
        </header>

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
                  <MemberCard key={m.email} member={m} onToggle={toggleMember} onUpdateRanges={updateInvestmentRanges} />
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

              <Field label="Meeting title (shown on calendar invite)">
                <input style={s.input} type="text"
                  value={settings.meeting_title}
                  onChange={e => setSettings(p => ({ ...p, meeting_title: e.target.value }))}
                />
              </Field>

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

              <div style={{ marginTop: 20 }}>
                <button type="submit" style={s.saveBtn} disabled={saving}>
                  {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save settings'}
                </button>
              </div>
            </form>
          </Section>

          {/* ── Brand Pitches ───────────────────────────────────────────── */}
          <Section title="Brand Pitches" subtitle="Phone pitch scripts shown in the CRM panel when you click 'Brand Pitch'. Keyed by brand name.">
            {Object.entries(brandPitches).map(([brand, pitch]) => (
              <div key={brand} style={{ marginBottom: 18, background: '#F5F6F7', border: '1px solid #D8DCE0', borderRadius: 4, padding: '14px 16px' }}>
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
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button style={s.saveBtn} onClick={addTagRule}>+ Add Rule</button>
              {tagRules.length > 0 && (
                <button style={{ ...s.saveBtn, background: '#1A7E24' }} onClick={saveTagRules}>Save All Rules</button>
              )}
            </div>
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

        </main>
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

function MemberCard({ member, onToggle, onUpdateRanges }) {
  const [expanded, setExpanded] = useState(false);
  const ranges = member.investment_ranges || [];
  const initials = member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  function toggleRange(key) {
    const next = ranges.includes(key) ? ranges.filter(r => r !== key) : [...ranges, key];
    onUpdateRanges(member.email, next);
  }

  return (
    <div style={{ ...s.memberCard, opacity: member.active ? 1 : 0.5 }}>
      <div style={s.memberCardTop}>
        <div style={s.avatar}>{initials}</div>
        <div style={s.memberInfo}>
          <div style={s.memberName}>{member.name}</div>
          <div style={s.memberEmail}>{member.email}</div>
          {ranges.length === 0 ? (
            <div style={s.memberRangeNote}>Handles all investment levels</div>
          ) : (
            <div style={s.memberRangeNote}>{INV_RANGES.filter(r => ranges.includes(r.key)).map(r => r.label).join(', ')}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ ...s.statusDot, background: member.active ? '#16A34A' : '#D1D5DB' }} title={member.active ? 'Active' : 'Inactive'} />
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
    <div style={{ marginBottom: 14, background: '#F5F6F7', border: '1px solid #D8DCE0', borderRadius: 4, padding: '14px 16px' }}>
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
          <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#E0EFF9', color: '#0077C5', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 500 }}>
            {tag}
            <button onClick={() => onRemoveTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0077C5', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  // Page
  page:        { minHeight: '100vh', background: '#F5F6F7', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif", color: '#333' },

  // QB dark header — precise color
  header:      { background: '#33485E', padding: '0 20px', height: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 28 },
  logo:        { fontWeight: 600, fontSize: 15, color: '#FFFFFF', letterSpacing: '-0.2px', flexShrink: 0 },
  nav:         { display: 'flex', gap: 2 },
  navLink:     { fontSize: 13, color: '#A8BED0', textDecoration: 'none', padding: '7px 14px', borderRadius: 3, fontWeight: 400 },
  navActive:   { color: '#FFFFFF', background: 'rgba(255,255,255,.13)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  headerUser:  { fontSize: 13, color: '#A8BED0' },
  signOutBtn:  { fontSize: 12, fontWeight: 400, color: '#A8BED0', background: 'transparent', border: '1px solid rgba(255,255,255,.18)', borderRadius: 3, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },

  // Body
  main:        { maxWidth: 960, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 },

  // Section cards — QB white card with thin border, no shadow
  section:     { background: '#fff', border: '1px solid #D8DCE0', borderRadius: 4, padding: '22px 24px 26px' },
  sectionHdr:  { marginBottom: 16 },
  sectionTitle:{ fontSize: 15, fontWeight: 600, color: '#1A2B3C', marginBottom: 4 },
  sectionSub:  { fontSize: 13, color: '#6B7280', lineHeight: 1.6 },

  // Booking URL
  urlBox:      { display: 'flex', alignItems: 'center', gap: 10, background: '#F5F6F7', border: '1px solid #D8DCE0', borderRadius: 3, padding: '11px 14px', marginBottom: 10 },
  urlCode:     { flex: 1, fontSize: 12, fontFamily: 'monospace', color: '#444', wordBreak: 'break-all' },
  chip:        { flexShrink: 0, padding: '6px 14px', borderRadius: 3, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' },
  urlNote:     { fontSize: 12, color: '#9CA3AF', lineHeight: 1.6 },
  inlineCode:  { background: '#EAECEF', borderRadius: 2, padding: '1px 4px', fontFamily: 'monospace', fontSize: 11 },

  // Team members
  memberGrid:  { display: 'flex', flexDirection: 'column', gap: 8 },
  memberCard:  { background: '#F5F6F7', border: '1px solid #D8DCE0', borderRadius: 4, overflow: 'hidden', transition: 'opacity .2s' },
  memberCardTop:{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' },
  avatar:      { width: 34, height: 34, borderRadius: '50%', background: '#E0EFF9', color: '#0077C5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 },
  memberInfo:  { flex: 1, minWidth: 0 },
  memberName:  { fontSize: 14, fontWeight: 600, color: '#1A2B3C' },
  memberEmail: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  memberRangeNote: { fontSize: 11, color: '#9CA3AF', marginTop: 3, fontStyle: 'italic' },
  statusDot:   { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  toggleBtn:   { fontSize: 12, fontWeight: 400, color: '#4A5568', background: '#fff', border: '1px solid #C8CDD2', borderRadius: 3, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' },
  rangesWrap:  { borderTop: '1px solid #D8DCE0', padding: '12px 14px', background: '#fff' },
  rangesLabel: { fontSize: 11, color: '#6B7280', marginBottom: 10 },
  rangesRow:   { display: 'flex', gap: 16, flexWrap: 'wrap' },
  rangeCheck:  { display: 'flex', alignItems: 'center', fontSize: 13, color: '#1A2B3C', cursor: 'pointer', fontWeight: 400 },
  addMemberLink:{ fontSize: 13, color: '#0077C5', fontWeight: 500, textDecoration: 'none' },

  // Form
  form:        { display: 'flex', flexDirection: 'column', gap: 16 },
  formRow:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 },
  field:       { display: 'flex', flexDirection: 'column', gap: 6 },
  label:       { fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.5px' },
  select:      { padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', background: '#fff', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' },
  input:       { padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', background: '#fff', fontFamily: 'inherit', outline: 'none' },
  saveBtn:     { padding: '9px 20px', background: '#0077C5', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },

  // Table
  tableWrap:   { overflowX: 'auto', border: '1px solid #D8DCE0', borderRadius: 4 },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:          { padding: '9px 14px', background: '#F5F6F7', color: '#6B7280', fontWeight: 600, textAlign: 'left', fontSize: 11, letterSpacing: '.4px', borderBottom: '1px solid #D8DCE0', whiteSpace: 'nowrap' },
  td:          { padding: '11px 14px', borderBottom: '1px solid #EBEBEB', color: '#1A2B3C', verticalAlign: 'middle', whiteSpace: 'nowrap' },
  tr:          { transition: 'background .1s' },
  meetLink:    { color: '#0077C5', fontWeight: 500, textDecoration: 'none' },
  empty:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '32px 0' },
};
