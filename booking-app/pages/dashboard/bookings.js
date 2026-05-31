import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import Head from 'next/head';
import Link from 'next/link';
import { authOptions } from '../api/auth/[...nextauth]';

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) return { redirect: { destination: '/dashboard/login', permanent: false } };
  return { props: { session } };
}

const FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This Week' },
  { key: 'all',   label: 'All' },
];

const STATUS_META = {
  scheduled: { label: 'Scheduled',  color: '#0077C5', bg: '#E0EFF9', dot: '#0077C5' },
  showed:    { label: 'Showed',     color: '#1A7E24', bg: '#E3F4E5', dot: '#2CA01C' },
  'no-show': { label: 'No Show',    color: '#C23934', bg: '#FDECEA', dot: '#D4351B' },
  closed:    { label: 'Closed Won', color: '#5C35A8', bg: '#EEE9FA', dot: '#6B37BF' },
};

// ── Demo data ─────────────────────────────────────────────────────────────────
const DEMO = [
  {
    id: 'd1', first_name: 'Marcus', last_name: 'Thompson', email: 'marcus.t@email.com',
    phone: '(512) 555-0192',
    slot_start: (() => { const d = new Date(); d.setHours(9, 0); return d.toISOString(); })(),
    status: 'scheduled', investment_level: '$100k–$200k', assigned_to_email: 'steve@sparksify.com',
    meet_link: 'https://meet.google.com/abc-defg-hij',
  },
  {
    id: 'd2', first_name: 'Jennifer', last_name: 'Caldwell', email: 'jcaldwell@gmail.com',
    phone: '(214) 555-0847',
    slot_start: (() => { const d = new Date(); d.setHours(10, 30); return d.toISOString(); })(),
    status: 'showed', investment_level: '$50k–$100k', assigned_to_email: 'steve@sparksify.com',
    meet_link: null,
  },
  {
    id: 'd3', first_name: 'Robert', last_name: 'Kim', email: 'rob.kim@outlook.com',
    phone: '(713) 555-0334',
    slot_start: (() => { const d = new Date(); d.setHours(11, 45); return d.toISOString(); })(),
    status: 'no-show', investment_level: '$200k+', assigned_to_email: 'steve@sparksify.com',
    meet_link: null,
  },
  {
    id: 'd4', first_name: 'Angela', last_name: 'Rivera', email: 'angela.r@company.com',
    phone: '(469) 555-0561',
    slot_start: (() => { const d = new Date(); d.setHours(13, 0); return d.toISOString(); })(),
    status: 'closed', investment_level: '$100k–$200k', assigned_to_email: 'steve@sparksify.com',
    meet_link: 'https://meet.google.com/xyz-uvwx-rst',
  },
  {
    id: 'd5', first_name: 'David', last_name: 'Nguyen', email: 'dnguyen@email.com',
    phone: '(281) 555-0729',
    slot_start: (() => { const d = new Date(); d.setHours(14, 30); return d.toISOString(); })(),
    status: 'scheduled', investment_level: '$50k–$100k', assigned_to_email: 'steve@sparksify.com',
    meet_link: 'https://meet.google.com/lmn-opqr-stu',
  },
];

// ── Demo lead detail ──────────────────────────────────────────────────────────
function makeDemoLead(booking) {
  return {
    id: booking.id,
    first_name: booking.first_name,
    last_name:  booking.last_name,
    email:      booking.email,
    phone:      booking.phone,
    investment_level: booking.investment_level,
    status:     booking.status,
    franchise_brand:  'Wet Fuel',
    developer_name:   'Janet Okafor',
    developer_phone:  '(972) 555-0182',
    developer_email:  'janet.okafor@wetfuel.com',
    notes:            'Very motivated buyer. Has previous business ownership experience. Interested in multi-unit.',
    bookings:    [booking],
    created_at:  new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export default function BookingsDashboard() {
  const { data: session } = useSession();
  const [filter,   setFilter]   = useState('today');
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [updating, setUpdating] = useState({});
  const [isDemo,   setIsDemo]   = useState(false);

  // Panel state
  const [panelBooking, setPanelBooking] = useState(null);
  const [lead,         setLead]         = useState(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelOpen,    setPanelOpen]    = useState(false); // drives animation

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/dashboard/bookings?filter=${filter}`)
      .then(r => r.json())
      .then(d => {
        const real = d.bookings || [];
        if (real.length === 0) { setBookings(DEMO); setIsDemo(true); }
        else                   { setBookings(real); setIsDemo(false); }
        setLoading(false);
      })
      .catch(() => { setBookings(DEMO); setIsDemo(true); setLoading(false); });
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Close panel on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') closePanel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  function openPanel(booking) {
    setPanelBooking(booking);
    setLead(null);
    setPanelOpen(true);

    if (isDemo) {
      setLead(makeDemoLead(booking));
      return;
    }
    setPanelLoading(true);
    fetch(`/api/dashboard/lead-detail?email=${encodeURIComponent(booking.email)}`)
      .then(r => r.json())
      .then(d => { setLead(d.lead); setPanelLoading(false); })
      .catch(() => setPanelLoading(false));
  }

  function closePanel() {
    setPanelOpen(false);
    setTimeout(() => { setPanelBooking(null); setLead(null); }, 260);
  }

  async function updateStatus(booking, status) {
    if (isDemo) {
      setBookings(bs => bs.map(b => b.id === booking.id ? { ...b, status } : b));
      if (panelBooking?.id === booking.id) setPanelBooking(b => ({ ...b, status }));
      return;
    }
    setUpdating(u => ({ ...u, [booking.id]: true }));
    await fetch('/api/dashboard/update-booking-status', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bookingId: booking.id, email: booking.email, status }),
    }).catch(console.error);
    setBookings(bs => bs.map(b => b.id === booking.id ? { ...b, status } : b));
    if (panelBooking?.id === booking.id) setPanelBooking(b => ({ ...b, status }));
    setUpdating(u => ({ ...u, [booking.id]: false }));
  }

  const counts = bookings.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1; return acc;
  }, {});

  return (
    <>
      <Head><title>Bookings — FranchiseBook</title></Head>
      <div style={s.page}>

        {/* ── Header ── */}
        <header style={s.header}>
          <div style={s.headerLeft}>
            <span style={s.logo}>⬡ FranchiseBook</span>
            <nav style={s.nav}>
              <Link href="/dashboard/bookings"  style={{ ...s.navLink, ...s.navActive }}>Bookings</Link>
              <Link href="/dashboard/leads"     style={s.navLink}>Leads</Link>
              <Link href="/dashboard/analytics" style={s.navLink}>Analytics</Link>
            </nav>
          </div>
          <div style={s.headerRight}>
            <Link href="/dashboard" style={s.settingsLink}>⚙ Settings</Link>
            <span style={s.headerUser}>{session?.user?.email}</span>
          </div>
        </header>

        <div style={s.body}>
          {/* Title bar */}
          <div style={s.titleBar}>
            <div>
              <h1 style={s.pageTitle}>Bookings</h1>
              <p style={s.pageSubtitle}>Click any row to open the client panel</p>
            </div>
            <button onClick={load} style={s.refreshBtn}>↻ Refresh</button>
          </div>

          {/* Demo banner */}
          {isDemo && (
            <div style={s.demoBanner}>
              Preview mode — no real bookings found. Showing sample data. Click any row to try the panel.
            </div>
          )}

          {/* Summary cards */}
          <div style={s.summaryRow}>
            {[
              { label: 'Scheduled', key: 'scheduled', dot: '#0077C5' },
              { label: 'Showed',    key: 'showed',    dot: '#2CA01C' },
              { label: 'No Shows',  key: 'no-show',   dot: '#D4351B' },
              { label: 'Closed',    key: 'closed',    dot: '#6B37BF' },
            ].map(({ label, key, dot }) => (
              <div key={key} style={s.summaryCard}>
                <div style={{ ...s.summaryDot, background: dot }} />
                <div style={s.summaryNum}>{counts[key] || 0}</div>
                <div style={s.summaryLabel}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={s.tabBar}>
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{ ...s.tab, ...(filter === f.key ? s.tabActive : {}) }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Table */}
          <div style={s.card}>
            {loading ? (
              <div style={s.empty}>Loading…</div>
            ) : bookings.length === 0 ? (
              <div style={s.empty}>No bookings for this period.</div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr style={s.thead}>
                    {['Time', 'Client', 'Phone', 'Investment', 'Rep', 'Status', 'Actions'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b, i) => (
                    <BookingRow
                      key={b.id}
                      booking={b}
                      striped={i % 2 === 1}
                      busy={!!updating[b.id]}
                      selected={panelBooking?.id === b.id}
                      onRowClick={() => openPanel(b)}
                      onStatus={status => updateStatus(b, status)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── CRM Side Panel ── */}
        {panelBooking && (
          <CRMPanel
            booking={panelBooking}
            lead={lead}
            loading={panelLoading}
            open={panelOpen}
            isDemo={isDemo}
            onClose={closePanel}
            onStatusChange={status => updateStatus(panelBooking, status)}
          />
        )}
      </div>
    </>
  );
}

// ─── Table Row ────────────────────────────────────────────────────────────────

function BookingRow({ booking: b, striped, busy, selected, onRowClick, onStatus }) {
  const slot      = b.slot_start ? new Date(b.slot_start) : null;
  const dateLabel = slot ? slot.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
  const timeLabel = slot ? slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  const meta      = STATUS_META[b.status] || STATUS_META.scheduled;

  const rowBg = selected ? '#EBF4FF' : striped ? '#F8F9FA' : '#FFFFFF';

  return (
    <tr
      style={{ ...s.tr, background: rowBg, cursor: 'pointer' }}
      onClick={onRowClick}
    >
      <td style={s.td}>
        <div style={{ fontWeight: 600, color: '#1A2B3C', fontSize: 13 }}>{timeLabel}</div>
        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{dateLabel}</div>
      </td>
      <td style={s.td}>
        <div style={{ fontWeight: 600, color: '#0077C5', fontSize: 13 }}>{b.first_name} {b.last_name}</div>
        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{b.email}</div>
      </td>
      <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 13, color: '#1A2B3C' }}>{b.phone || '—'}</span>
      </td>
      <td style={s.td}>
        <span style={{ fontSize: 11, color: '#4A5568', background: '#EAECEF', padding: '3px 8px', borderRadius: 3 }}>
          {b.investment_level || '—'}
        </span>
      </td>
      <td style={s.td}>
        <span style={{ fontSize: 13, color: '#4A5568' }}>
          {b.assigned_to_email ? b.assigned_to_email.split('@')[0] : '—'}
        </span>
      </td>
      <td style={s.td} onClick={e => e.stopPropagation()}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
          color: meta.color, background: meta.bg,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.dot, display: 'inline-block' }} />
          {meta.label}
        </span>
        {b.meet_link && (
          <a href={b.meet_link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            style={{ display: 'block', fontSize: 11, color: '#0077C5', marginTop: 3 }}>
            📹 Join
          </a>
        )}
      </td>
      <td style={s.td} onClick={e => e.stopPropagation()}>
        {busy ? (
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>Saving…</span>
        ) : b.status === 'scheduled' ? (
          <div style={{ display: 'flex', gap: 5 }}>
            <QBBtn variant="success" onClick={() => onStatus('showed')}>Showed</QBBtn>
            <QBBtn variant="danger"  onClick={() => onStatus('no-show')}>No-Show</QBBtn>
          </div>
        ) : b.status === 'showed' ? (
          <QBBtn variant="primary" onClick={() => onStatus('closed')}>Close Won</QBBtn>
        ) : (
          <span style={{ fontSize: 12, color: '#C8CDD2' }}>—</span>
        )}
      </td>
    </tr>
  );
}

// ─── CRM Side Panel ───────────────────────────────────────────────────────────

function CRMPanel({ booking, lead, loading, open, isDemo, onClose, onStatusChange }) {
  const [form,       setForm]       = useState({});
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [showEmail,  setShowEmail]  = useState(false);
  const [email,      setEmail]      = useState({ to: '', subject: '', body: '' });
  const [emailSent,  setEmailSent]  = useState(false);
  const panelRef = useRef(null);

  // Sync form from lead data when it loads
  useEffect(() => {
    if (lead) {
      setForm({
        franchise_brand:  lead.franchise_brand  || '',
        developer_name:   lead.developer_name   || '',
        developer_phone:  lead.developer_phone  || '',
        developer_email:  lead.developer_email  || '',
        notes:            lead.notes            || '',
      });
      setEmail(e => ({ ...e, to: lead.developer_email || '' }));
    }
  }, [lead]);

  // Reset email state when panel closes
  useEffect(() => {
    if (!open) { setShowEmail(false); setEmailSent(false); }
  }, [open]);

  async function saveLead() {
    if (!lead || isDemo) { setSaved(true); setTimeout(() => setSaved(false), 2000); return; }
    setSaving(true);
    await fetch('/api/dashboard/update-lead', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: lead.id, ...form }),
    }).catch(console.error);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function sendEmail() {
    // Framework — wire to SendGrid/Resend later
    console.log('[email] sending to:', email.to, 'subject:', email.subject);
    setEmailSent(true);
    setTimeout(() => { setEmailSent(false); setShowEmail(false); }, 2500);
  }

  const meta     = STATUS_META[booking.status] || STATUS_META.scheduled;
  const initials = `${booking.first_name?.[0] || ''}${booking.last_name?.[0] || ''}`.toUpperCase();
  const slot     = booking.slot_start ? new Date(booking.slot_start) : null;
  const slotLabel = slot
    ? slot.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' · ' + slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '—';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.25)',
          zIndex: 100, opacity: open ? 1 : 0,
          transition: 'opacity .25s ease',
          pointerEvents: open ? 'auto' : 'none',
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 440, background: '#fff',
          boxShadow: '-4px 0 24px rgba(0,0,0,.12)',
          zIndex: 101, display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform .25s cubic-bezier(.4,0,.2,1)',
          fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif",
        }}
      >
        {/* Panel header */}
        <div style={p.panelHdr}>
          <div style={p.avatar}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={p.clientName}>{booking.first_name} {booking.last_name}</div>
            <div style={p.clientEmail}>{booking.email}</div>
            <span style={{ ...p.statusBadge, color: meta.color, background: meta.bg }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.dot, display: 'inline-block' }} />
              {meta.label}
            </span>
          </div>
          <button onClick={onClose} style={p.closeBtn} aria-label="Close">✕</button>
        </div>

        {/* Scrollable body */}
        <div style={p.scrollBody}>
          {loading ? (
            <div style={p.loadingMsg}>Loading client details…</div>
          ) : (
            <>
              {/* ── Contact info ── */}
              <Section title="Contact">
                <Row icon="📞" label="Phone">
                  <a href={`tel:${booking.phone}`} style={p.link}>{booking.phone || '—'}</a>
                </Row>
                <Row icon="✉️" label="Email">
                  <a href={`mailto:${booking.email}`} style={p.link}>{booking.email}</a>
                </Row>
                <Row icon="💰" label="Investment">
                  <span style={p.tag}>{booking.investment_level || '—'}</span>
                </Row>
              </Section>

              {/* ── Booking info ── */}
              <Section title="Booking">
                <Row icon="📅" label="Scheduled">
                  <span style={p.val}>{slotLabel}</span>
                </Row>
                <Row icon="👤" label="Rep">
                  <span style={p.val}>{booking.assigned_to_email || '—'}</span>
                </Row>
                {booking.meet_link && (
                  <Row icon="📹" label="Meet">
                    <a href={booking.meet_link} target="_blank" rel="noreferrer" style={p.link}>Join call →</a>
                  </Row>
                )}
                {/* Status change buttons */}
                {booking.status === 'scheduled' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <QBBtn variant="success" onClick={() => onStatusChange('showed')}>Mark Showed</QBBtn>
                    <QBBtn variant="danger"  onClick={() => onStatusChange('no-show')}>Mark No-Show</QBBtn>
                  </div>
                )}
                {booking.status === 'showed' && (
                  <div style={{ marginTop: 12 }}>
                    <QBBtn variant="primary" onClick={() => onStatusChange('closed')}>Mark Closed Won 🏆</QBBtn>
                  </div>
                )}
              </Section>

              {/* ── Franchise interest ── */}
              <Section title="Franchise Interest">
                <EditRow label="Brand / Concept">
                  <input
                    style={p.input}
                    placeholder="e.g. Wet Fuel"
                    value={form.franchise_brand || ''}
                    onChange={e => setForm(f => ({ ...f, franchise_brand: e.target.value }))}
                  />
                </EditRow>
              </Section>

              {/* ── Franchise developer ── */}
              <Section title="Franchise Developer">
                <EditRow label="Name">
                  <input
                    style={p.input}
                    placeholder="Developer name"
                    value={form.developer_name || ''}
                    onChange={e => setForm(f => ({ ...f, developer_name: e.target.value }))}
                  />
                </EditRow>
                <EditRow label="Phone">
                  <input
                    style={p.input}
                    placeholder="(555) 000-0000"
                    value={form.developer_phone || ''}
                    onChange={e => setForm(f => ({ ...f, developer_phone: e.target.value }))}
                  />
                </EditRow>
                <EditRow label="Email">
                  <input
                    style={p.input}
                    placeholder="developer@brand.com"
                    value={form.developer_email || ''}
                    onChange={e => {
                      setForm(f => ({ ...f, developer_email: e.target.value }));
                      setEmail(em => ({ ...em, to: e.target.value }));
                    }}
                  />
                </EditRow>
                {/* Email to developer button */}
                <button
                  onClick={() => setShowEmail(v => !v)}
                  style={p.emailToggleBtn}
                >
                  ✉️ {showEmail ? 'Hide email' : 'Email developer'}
                </button>

                {/* Email composer */}
                {showEmail && (
                  <div style={p.emailBox}>
                    <div style={p.emailHeader}>New Email</div>
                    <div style={p.emailField}>
                      <span style={p.emailLabel}>To</span>
                      <input
                        style={p.emailInput}
                        value={email.to}
                        onChange={e => setEmail(em => ({ ...em, to: e.target.value }))}
                        placeholder="developer@brand.com"
                      />
                    </div>
                    <div style={p.emailField}>
                      <span style={p.emailLabel}>Subject</span>
                      <input
                        style={p.emailInput}
                        value={email.subject}
                        onChange={e => setEmail(em => ({ ...em, subject: e.target.value }))}
                        placeholder={`Re: ${booking.first_name} ${booking.last_name}`}
                      />
                    </div>
                    <textarea
                      style={p.emailBody}
                      rows={5}
                      value={email.body}
                      onChange={e => setEmail(em => ({ ...em, body: e.target.value }))}
                      placeholder={`Hi ${form.developer_name || 'there'},\n\nI wanted to follow up regarding ${booking.first_name} ${booking.last_name}…`}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        onClick={sendEmail}
                        disabled={!email.to || emailSent}
                        style={{
                          ...p.sendBtn,
                          background: emailSent ? '#2CA01C' : '#0077C5',
                          opacity: !email.to ? 0.5 : 1,
                        }}
                      >
                        {emailSent ? '✓ Sent!' : 'Send Email'}
                      </button>
                      <button onClick={() => setShowEmail(false)} style={p.cancelBtn}>Cancel</button>
                    </div>
                    {isDemo && (
                      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
                        Email integration coming soon — connect Resend or Gmail to activate sending.
                      </p>
                    )}
                  </div>
                )}
              </Section>

              {/* ── Notes ── */}
              <Section title="Notes">
                <textarea
                  style={p.notesArea}
                  rows={5}
                  value={form.notes || ''}
                  placeholder="Add notes about this client…"
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </Section>
            </>
          )}
        </div>

        {/* Save bar */}
        {!loading && (
          <div style={p.saveBar}>
            <button onClick={saveLead} disabled={saving} style={p.saveBtn}>
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
            </button>
            {saved && !saving && (
              <span style={{ fontSize: 12, color: '#2CA01C', fontWeight: 500 }}>Changes saved</span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Panel helper components ──────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={p.section}>
      <div style={p.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function Row({ icon, label, children }) {
  return (
    <div style={p.row}>
      <span style={p.rowIcon}>{icon}</span>
      <span style={p.rowLabel}>{label}</span>
      <span style={p.rowVal}>{children}</span>
    </div>
  );
}

function EditRow({ label, children }) {
  return (
    <div style={p.editRow}>
      <label style={p.editLabel}>{label}</label>
      {children}
    </div>
  );
}

function QBBtn({ variant, onClick, children, disabled }) {
  const [hover, setHover] = useState(false);
  const vs = {
    success: { color: '#1A7E24', bg: '#E3F4E5', hoverBg: '#C3E6C5', border: '#A8D5AA' },
    danger:  { color: '#C23934', bg: '#FDECEA', hoverBg: '#FFCDD2', border: '#EF9A9A' },
    primary: { color: '#0077C5', bg: '#E0EFF9', hoverBg: '#B3D4EE', border: '#90CAF9' },
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 3,
        border: `1px solid ${vs.border}`, color: vs.color,
        background: hover ? vs.hoverBg : vs.bg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background .15s', whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ─── Table styles ─────────────────────────────────────────────────────────────
const s = {
  page:        { minHeight: '100vh', background: '#F5F6F7', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },

  header:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 50, background: '#33485E' },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: 28 },
  logo:        { fontWeight: 600, fontSize: 15, color: '#FFFFFF', letterSpacing: '-0.2px', flexShrink: 0 },
  nav:         { display: 'flex', gap: 2 },
  navLink:     { fontSize: 13, color: '#A8BED0', textDecoration: 'none', padding: '7px 14px', borderRadius: 3, fontWeight: 400 },
  navActive:   { color: '#FFFFFF', background: 'rgba(255,255,255,.13)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  settingsLink:{ fontSize: 13, color: '#A8BED0', textDecoration: 'none', fontWeight: 400 },
  headerUser:  { fontSize: 13, color: '#A8BED0' },

  body:        { maxWidth: 1160, margin: '0 auto', padding: '24px 20px' },
  titleBar:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  pageTitle:   { fontSize: 20, fontWeight: 600, color: '#1A2B3C', margin: 0 },
  pageSubtitle:{ fontSize: 13, color: '#6B7280', margin: '3px 0 0' },
  refreshBtn:  { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 3, border: '1px solid #C8CDD2', background: '#FFFFFF', color: '#4A5568', cursor: 'pointer' },

  demoBanner:  { background: '#FFFBF0', border: '1px solid #F5A623', borderLeft: '4px solid #F5A623', borderRadius: 4, padding: '10px 14px', fontSize: 13, color: '#7D4E00', marginBottom: 18 },

  summaryRow:  { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 },
  summaryCard: { background: '#FFFFFF', border: '1px solid #D8DCE0', borderRadius: 4, padding: '16px 18px', position: 'relative', overflow: 'hidden' },
  summaryDot:  { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  summaryNum:  { fontSize: 28, fontWeight: 600, color: '#1A2B3C', lineHeight: 1 },
  summaryLabel:{ fontSize: 12, color: '#6B7280', marginTop: 5, fontWeight: 400 },

  tabBar:      { display: 'flex', marginBottom: 14, background: '#FFFFFF', border: '1px solid #C8CDD2', borderRadius: 3, width: 'fit-content', overflow: 'hidden' },
  tab:         { padding: '7px 18px', border: 'none', borderRight: '1px solid #C8CDD2', background: 'transparent', color: '#4A5568', fontSize: 13, fontWeight: 400, cursor: 'pointer' },
  tabActive:   { background: '#0077C5', color: '#FFFFFF', fontWeight: 600 },

  card:        { background: '#FFFFFF', border: '1px solid #D8DCE0', borderRadius: 4, overflow: 'hidden' },
  table:       { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  thead:       { background: '#F5F6F7' },
  th:          { textAlign: 'left', padding: '9px 14px', fontWeight: 600, color: '#6B7280', fontSize: 11, letterSpacing: '.4px', borderBottom: '1px solid #D8DCE0' },
  tr:          { borderBottom: '1px solid #EBEBEB', transition: 'background .1s' },
  td:          { padding: '13px 14px', verticalAlign: 'middle' },
  empty:       { textAlign: 'center', padding: 56, color: '#9CA3AF', fontSize: 14 },
};

// ─── Panel styles ─────────────────────────────────────────────────────────────
const p = {
  panelHdr:     { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '20px 20px 16px', borderBottom: '1px solid #EBEBEB', flexShrink: 0 },
  avatar:       { width: 46, height: 46, borderRadius: '50%', background: '#33485E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, flexShrink: 0 },
  clientName:   { fontSize: 16, fontWeight: 600, color: '#1A2B3C', marginBottom: 2 },
  clientEmail:  { fontSize: 12, color: '#6B7280', marginBottom: 6 },
  statusBadge:  { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  closeBtn:     { background: 'none', border: 'none', fontSize: 18, color: '#9CA3AF', cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1, flexShrink: 0 },

  scrollBody:   { flex: 1, overflowY: 'auto', padding: '0 0 8px' },
  loadingMsg:   { textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 14 },

  section:      { padding: '16px 20px', borderBottom: '1px solid #F0F0F0' },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 12 },

  row:          { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 13 },
  rowIcon:      { fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 },
  rowLabel:     { color: '#6B7280', width: 72, flexShrink: 0, fontSize: 12 },
  rowVal:       { color: '#1A2B3C', flex: 1 },
  link:         { color: '#0077C5', textDecoration: 'none', fontSize: 13 },
  tag:          { background: '#EAECEF', borderRadius: 3, padding: '2px 8px', fontSize: 12, color: '#4A5568' },
  val:          { fontSize: 13, color: '#1A2B3C' },

  editRow:      { marginBottom: 10 },
  editLabel:    { display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 },
  input:        { width: '100%', padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' },

  emailToggleBtn: { marginTop: 12, padding: '7px 14px', background: '#F5F6F7', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#0077C5', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },

  emailBox:     { marginTop: 12, background: '#F8F9FA', border: '1px solid #D8DCE0', borderRadius: 4, padding: '14px 14px 12px' },
  emailHeader:  { fontSize: 12, fontWeight: 700, color: '#1A2B3C', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.4px' },
  emailField:   { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  emailLabel:   { fontSize: 11, color: '#6B7280', width: 44, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', flexShrink: 0 },
  emailInput:   { flex: 1, padding: '6px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none' },
  emailBody:    { width: '100%', padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' },
  sendBtn:      { padding: '8px 18px', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .2s' },
  cancelBtn:    { padding: '8px 14px', background: '#fff', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#4A5568', cursor: 'pointer', fontFamily: 'inherit' },

  notesArea:    { width: '100%', padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 },

  saveBar:      { padding: '12px 20px', borderTop: '1px solid #EBEBEB', background: '#fff', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  saveBtn:      { padding: '9px 20px', background: '#0077C5', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
};
