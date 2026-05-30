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
  const [members,  setMembers]  = useState(initialMembers);
  const [bookings]              = useState(initialBookings);
  const [settings, setSettings] = useState(initialSettings);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [copied,   setCopied]   = useState(false);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={s.headerTitle}>Booking Dashboard</span>
            <Link href="/dashboard/leads" style={s.navLink}>Lead Pipeline →</Link>
          </div>
          <div style={s.headerRight}>
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
  page:       { minHeight: '100vh', background: '#F9FAFB', fontFamily: "'Inter',system-ui,sans-serif", color: '#111827' },
  header:     { background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 },
  headerTitle:{ fontSize: 15, fontWeight: 700, color: '#111827', letterSpacing: '-.01em' },
  headerRight:{ display: 'flex', alignItems: 'center', gap: 12 },
  headerUser: { fontSize: 13, color: '#6B7280' },
  signOutBtn: { fontSize: 13, fontWeight: 500, color: '#6B7280', background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },
  main:       { maxWidth: 900, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 32 },
  section:    { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: '28px 28px 32px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' },
  sectionHdr: { marginBottom: 20 },
  sectionTitle:{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 4 },
  sectionSub: { fontSize: 13, color: '#6B7280', lineHeight: 1.6 },
  urlBox:     { display: 'flex', alignItems: 'center', gap: 10, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 9, padding: '12px 16px', marginBottom: 10 },
  urlCode:    { flex: 1, fontSize: 12, fontFamily: 'monospace', color: '#374151', wordBreak: 'break-all' },
  chip:       { flexShrink: 0, padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' },
  urlNote:    { fontSize: 12, color: '#9CA3AF', lineHeight: 1.6 },
  inlineCode: { background: '#F3F4F6', borderRadius: 3, padding: '1px 4px', fontFamily: 'monospace', fontSize: 11 },
  navLink:    { fontSize: 13, color: '#1D4ED8', fontWeight: 600, textDecoration: 'none' },
  memberGrid: { display: 'flex', flexDirection: 'column', gap: 10 },
  memberCard: { background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', transition: 'opacity .2s' },
  memberCardTop: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' },
  avatar:     { width: 38, height: 38, borderRadius: '50%', background: '#EFF6FF', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 },
  memberInfo: { flex: 1, minWidth: 0 },
  memberName: { fontSize: 14, fontWeight: 600, color: '#111827' },
  memberEmail:{ fontSize: 12, color: '#6B7280', marginTop: 1 },
  memberRangeNote: { fontSize: 11, color: '#9CA3AF', marginTop: 3, fontStyle: 'italic' },
  statusDot:  { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  toggleBtn:  { fontSize: 12, fontWeight: 500, color: '#6B7280', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' },
  rangesWrap: { borderTop: '1px solid #E5E7EB', padding: '12px 16px', background: '#fff' },
  rangesLabel:{ fontSize: 11, color: '#6B7280', marginBottom: 10 },
  rangesRow:  { display: 'flex', gap: 16, flexWrap: 'wrap' },
  rangeCheck: { display: 'flex', alignItems: 'center', fontSize: 13, color: '#111827', cursor: 'pointer', fontWeight: 500 },
  addMemberLink:{ fontSize: 13, color: '#1D4ED8', fontWeight: 500, textDecoration: 'none' },
  form:       { display: 'flex', flexDirection: 'column', gap: 16 },
  formRow:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 },
  field:      { display: 'flex', flexDirection: 'column', gap: 6 },
  label:      { fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '.04em' },
  select:     { padding: '9px 12px', border: '1.5px solid #D1D5DB', borderRadius: 7, fontSize: 14, color: '#111827', background: '#fff', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' },
  input:      { padding: '9px 12px', border: '1.5px solid #D1D5DB', borderRadius: 7, fontSize: 14, color: '#111827', background: '#fff', fontFamily: 'inherit', outline: 'none' },
  saveBtn:    { padding: '11px 24px', background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' },
  tableWrap:  { overflowX: 'auto', borderRadius: 9, border: '1px solid #E5E7EB' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:         { padding: '10px 14px', background: '#F9FAFB', color: '#6B7280', fontWeight: 600, textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' },
  td:         { padding: '11px 14px', borderBottom: '1px solid #F3F4F6', color: '#111827', verticalAlign: 'middle', whiteSpace: 'nowrap' },
  tr:         { transition: 'background .1s' },
  meetLink:   { color: '#1D4ED8', fontWeight: 500, textDecoration: 'none' },
  empty:      { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '32px 0' },
};
