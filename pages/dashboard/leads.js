import { useState, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import Head from 'next/head';
import Link from 'next/link';
import { authOptions } from '../api/auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES = [
  { key: 'scheduled', label: 'New Lead',          color: '#6366F1', bg: '#EEF2FF' },
  { key: 'showed',    label: 'Showed / Completed', color: '#0EA5E9', bg: '#E0F2FE' },
  { key: 'qualified', label: 'Qualified',          color: '#16A34A', bg: '#DCFCE7' },
  { key: 'lost',      label: 'Lost',               color: '#DC2626', bg: '#FEE2E2' },
];

const INV_LABELS = {
  lt_100k:    { label: 'Under $100k',    color: '#92400E', bg: '#FEF3C7' },
  '100k_250k':{ label: '$100k–$250k',   color: '#1D4ED8', bg: '#DBEAFE' },
  '250k_500k':{ label: '$250k–$500k',   color: '#6D28D9', bg: '#EDE9FE' },
  gt_500k:    { label: 'Over $500k',    color: '#065F46', bg: '#D1FAE5' },
};

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Server-side data fetch ───────────────────────────────────────────────────

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) {
    return { redirect: { destination: '/dashboard/login', permanent: false } };
  }

  const supabase = getSupabaseAdmin();

  const [{ data: bookings }, { data: members }] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, first_name, last_name, email, phone, slot_start, slot_end, assigned_to_email, meet_link, status, investment_level, notes, created_at')
      .order('slot_start', { ascending: false })
      .limit(200),
    supabase
      .from('team_members')
      .select('id, name, email, active')
      .eq('active', true)
      .order('name'),
  ]);

  return {
    props: {
      session,
      initialBookings: bookings || [],
      repList: members || [],
    },
  };
}

// ─── Leads Dashboard ─────────────────────────────────────────────────────────

export default function LeadsDashboard({ initialBookings, repList }) {
  const { data: session } = useSession();

  const [bookings, setBookings]   = useState(initialBookings);
  const [viewMode, setViewMode]   = useState('kanban'); // 'kanban' | 'list'
  const [repFilter, setRepFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [movingId, setMovingId]   = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // Filtered bookings
  const filtered = useMemo(() => {
    let b = bookings;
    if (repFilter !== 'all') b = b.filter(x => x.assigned_to_email === repFilter);
    if (stageFilter !== 'all') b = b.filter(x => x.status === stageFilter);
    return b;
  }, [bookings, repFilter, stageFilter]);

  // Move a lead to a different status
  async function moveStatus(id, newStatus) {
    setMovingId(id);
    await fetch('/api/dashboard/leads', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, status: newStatus }),
    });
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b));
    setMovingId(null);
  }

  // Save notes
  async function saveNotes(id, notes) {
    await fetch('/api/dashboard/leads', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, status: bookings.find(b => b.id === id)?.status, notes }),
    });
    setBookings(prev => prev.map(b => b.id === id ? { ...b, notes } : b));
  }

  const stageMap = useMemo(() => {
    const m = {};
    STAGES.forEach(s => { m[s.key] = filtered.filter(b => b.status === s.key); });
    return m;
  }, [filtered]);

  return (
    <>
      <Head><title>Lead Pipeline</title></Head>
      <div style={s.page}>

        {/* ── Header ── */}
        <header style={s.header}>
          <div style={s.headerLeft}>
            <Link href="/dashboard" style={s.backLink}>← Dashboard</Link>
            <span style={s.headerTitle}>Lead Pipeline</span>
          </div>
          <div style={s.headerRight}>
            <span style={s.headerUser}>{session?.user?.email}</span>
            <button style={s.signOutBtn} onClick={() => signOut({ callbackUrl: '/dashboard/login' })}>
              Sign out
            </button>
          </div>
        </header>

        {/* ── Toolbar ── */}
        <div style={s.toolbar}>
          <div style={s.toolbarLeft}>
            {/* Rep filter */}
            <select style={s.filterSelect} value={repFilter} onChange={e => setRepFilter(e.target.value)}>
              <option value="all">All reps</option>
              {repList.map(r => (
                <option key={r.email} value={r.email}>{r.name}</option>
              ))}
            </select>

            {/* Stage filter (list view only) */}
            {viewMode === 'list' && (
              <select style={s.filterSelect} value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
                <option value="all">All stages</option>
                {STAGES.map(st => (
                  <option key={st.key} value={st.key}>{st.label}</option>
                ))}
              </select>
            )}

            <span style={s.countBadge}>{filtered.length} leads</span>
          </div>

          {/* View toggle */}
          <div style={s.viewToggle}>
            <button
              style={{ ...s.toggleBtn, ...(viewMode === 'kanban' ? s.toggleActive : {}) }}
              onClick={() => { setViewMode('kanban'); setStageFilter('all'); }}
            >
              ⊞ Kanban
            </button>
            <button
              style={{ ...s.toggleBtn, ...(viewMode === 'list' ? s.toggleActive : {}) }}
              onClick={() => setViewMode('list')}
            >
              ☰ List
            </button>
          </div>
        </div>

        {/* ── Main content ── */}
        <main style={s.main}>
          {viewMode === 'kanban' ? (
            <KanbanBoard stageMap={stageMap} movingId={movingId} onMove={moveStatus} expandedId={expandedId} setExpandedId={setExpandedId} onSaveNotes={saveNotes} />
          ) : (
            <ListView leads={filtered} movingId={movingId} onMove={moveStatus} expandedId={expandedId} setExpandedId={setExpandedId} onSaveNotes={saveNotes} />
          )}
        </main>
      </div>
    </>
  );
}

// ─── Kanban Board ─────────────────────────────────────────────────────────────

function KanbanBoard({ stageMap, movingId, onMove, expandedId, setExpandedId, onSaveNotes }) {
  return (
    <div style={s.kanban}>
      {STAGES.map(stage => (
        <div key={stage.key} style={s.kanbanCol}>
          <div style={s.kanbanColHdr}>
            <span style={{ ...s.stageLabel, color: stage.color, background: stage.bg }}>
              {stage.label}
            </span>
            <span style={s.kanbanCount}>{stageMap[stage.key]?.length ?? 0}</span>
          </div>
          <div style={s.kanbanCards}>
            {(stageMap[stage.key] || []).length === 0 ? (
              <div style={s.emptyCol}>No leads</div>
            ) : (
              (stageMap[stage.key] || []).map(lead => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  currentStage={stage}
                  movingId={movingId}
                  onMove={onMove}
                  expanded={expandedId === lead.id}
                  onToggle={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                  onSaveNotes={onSaveNotes}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ leads, movingId, onMove, expandedId, setExpandedId, onSaveNotes }) {
  if (leads.length === 0) {
    return <div style={s.emptyFull}>No leads match your filters.</div>;
  }
  return (
    <div style={s.listWrap}>
      {leads.map(lead => {
        const stage = STAGES.find(st => st.key === lead.status) || STAGES[0];
        return (
          <LeadCard
            key={lead.id}
            lead={lead}
            currentStage={stage}
            movingId={movingId}
            onMove={onMove}
            expanded={expandedId === lead.id}
            onToggle={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
            onSaveNotes={onSaveNotes}
            listMode
          />
        );
      })}
    </div>
  );
}

// ─── Lead Card ────────────────────────────────────────────────────────────────

function LeadCard({ lead, currentStage, movingId, onMove, expanded, onToggle, onSaveNotes, listMode }) {
  const [noteText, setNoteText] = useState(lead.notes || '');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const inv = lead.investment_level ? INV_LABELS[lead.investment_level] : null;
  const isMoving = movingId === lead.id;

  const otherStages = STAGES.filter(s => s.key !== lead.status);
  const stageIdx = STAGES.findIndex(s => s.key === lead.status);
  const nextStage = STAGES[stageIdx + 1];
  const prevStage = stageIdx > 0 ? STAGES[stageIdx - 1] : null;

  async function handleSaveNotes() {
    setSavingNote(true);
    await onSaveNotes(lead.id, noteText);
    setSavingNote(false);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  }

  return (
    <div style={{ ...s.card, ...(listMode ? s.cardList : {}), opacity: isMoving ? 0.6 : 1 }}>
      {/* Top row */}
      <div style={s.cardTop} onClick={onToggle}>
        <div style={s.cardMain}>
          <div style={s.cardName}>{lead.first_name} {lead.last_name}</div>
          <div style={s.cardMeta}>
            {formatSlot(lead.slot_start)}
          </div>
          {listMode && (
            <div style={s.cardMetaSmall}>
              <span style={{ ...s.stageLabel, color: currentStage.color, background: currentStage.bg, fontSize: 10, padding: '2px 7px' }}>
                {currentStage.label}
              </span>
            </div>
          )}
        </div>
        <div style={s.cardRight}>
          {inv && (
            <span style={{ ...s.invBadge, color: inv.color, background: inv.bg }}>
              {inv.label}
            </span>
          )}
          <span style={{ ...s.expandChevron, transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
        </div>
      </div>

      {/* Assigned rep */}
      {lead.assigned_to_email && (
        <div style={s.cardRep}>👤 {lead.assigned_to_email}</div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div style={s.cardDetail}>
          <div style={s.detailGrid}>
            <DetailRow label="Email"  value={<a href={`mailto:${lead.email}`} style={s.detailLink}>{lead.email}</a>} />
            <DetailRow label="Phone"  value={lead.phone ? <a href={`tel:${lead.phone}`} style={s.detailLink}>{formatPhone(lead.phone)}</a> : '—'} />
            {lead.meet_link && (
              <DetailRow label="Meet" value={<a href={lead.meet_link} target="_blank" rel="noreferrer" style={s.detailLink}>Join call →</a>} />
            )}
          </div>

          {/* Notes */}
          <div style={s.notesWrap}>
            <label style={s.notesLabel}>Notes</label>
            <textarea
              style={s.notesTA}
              rows={3}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add rep notes…"
            />
            <button
              style={{ ...s.notesBtn, background: noteSaved ? '#16A34A' : '#1D4ED8' }}
              onClick={handleSaveNotes}
              disabled={savingNote}
            >
              {savingNote ? 'Saving…' : noteSaved ? '✓ Saved' : 'Save notes'}
            </button>
          </div>

          {/* Move actions */}
          <div style={s.moveRow}>
            <span style={s.moveLabel}>Move to:</span>
            {prevStage && (
              <button style={{ ...s.moveBtn, borderColor: prevStage.color, color: prevStage.color }}
                onClick={() => onMove(lead.id, prevStage.key)} disabled={isMoving}>
                ← {prevStage.label}
              </button>
            )}
            {nextStage && (
              <button style={{ ...s.moveBtn, borderColor: nextStage.color, color: nextStage.color }}
                onClick={() => onMove(lead.id, nextStage.key)} disabled={isMoving}>
                {nextStage.label} →
              </button>
            )}
            {otherStages.filter(s => s.key !== (prevStage?.key) && s.key !== (nextStage?.key)).map(st => (
              <button key={st.key} style={{ ...s.moveBtn, borderColor: st.color, color: st.color }}
                onClick={() => onMove(lead.id, st.key)} disabled={isMoving}>
                {st.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={s.detailRow}>
      <span style={s.detailLabel}>{label}</span>
      <span style={s.detailVal}>{value}</span>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSlot(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const p = h >= 12 ? 'PM' : 'AM';
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${MON[d.getMonth()]} ${d.getDate()} · ${dh}:${String(m).padStart(2,'0')} ${p}`;
}

function formatPhone(p) {
  const d = (p || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return p;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page:          { minHeight: '100vh', background: '#F3F4F6', fontFamily: "'Inter',system-ui,sans-serif", color: '#111827', display: 'flex', flexDirection: 'column' },
  header:        { background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 },
  headerLeft:    { display: 'flex', alignItems: 'center', gap: 16 },
  backLink:      { fontSize: 13, color: '#6B7280', textDecoration: 'none', fontWeight: 500 },
  headerTitle:   { fontSize: 15, fontWeight: 700, color: '#111827' },
  headerRight:   { display: 'flex', alignItems: 'center', gap: 12 },
  headerUser:    { fontSize: 13, color: '#6B7280' },
  signOutBtn:    { fontSize: 13, fontWeight: 500, color: '#6B7280', background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },

  toolbar:       { background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  toolbarLeft:   { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  filterSelect:  { padding: '7px 12px', border: '1.5px solid #D1D5DB', borderRadius: 7, fontSize: 13, color: '#111827', background: '#fff', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' },
  countBadge:    { fontSize: 12, color: '#6B7280', fontWeight: 600 },
  viewToggle:    { display: 'flex', gap: 0, border: '1.5px solid #D1D5DB', borderRadius: 8, overflow: 'hidden' },
  toggleBtn:     { padding: '7px 14px', fontSize: 13, fontWeight: 500, color: '#6B7280', background: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit' },
  toggleActive:  { background: '#EFF6FF', color: '#1D4ED8', fontWeight: 700 },

  main:          { flex: 1, overflowX: 'auto', padding: '20px 24px' },

  // Kanban
  kanban:        { display: 'flex', gap: 16, alignItems: 'flex-start', minWidth: 'max-content' },
  kanbanCol:     { width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  kanbanColHdr:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  kanbanCount:   { fontSize: 12, fontWeight: 700, color: '#9CA3AF', background: '#F3F4F6', borderRadius: 10, padding: '2px 8px' },
  kanbanCards:   { display: 'flex', flexDirection: 'column', gap: 10 },
  emptyCol:      { fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '20px 0' },

  // List
  listWrap:      { maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 },
  emptyFull:     { textAlign: 'center', padding: '60px 0', fontSize: 14, color: '#9CA3AF' },

  // Cards
  card:          { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.05)', transition: 'box-shadow .15s' },
  cardList:      { /* list mode — full width already set by listWrap */ },
  cardTop:       { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 14px', cursor: 'pointer' },
  cardMain:      { flex: 1, minWidth: 0 },
  cardName:      { fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 2 },
  cardMeta:      { fontSize: 12, color: '#6B7280' },
  cardMetaSmall: { marginTop: 4 },
  cardRight:     { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 },
  cardRep:       { fontSize: 11, color: '#9CA3AF', padding: '0 14px 8px', marginTop: -4 },

  // Badges
  stageLabel:    { fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '3px 9px', display: 'inline-block' },
  invBadge:      { fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap' },
  expandChevron: { fontSize: 16, color: '#9CA3AF', transition: 'transform .2s', display: 'inline-block', lineHeight: 1 },

  // Expanded
  cardDetail:    { borderTop: '1px solid #F3F4F6', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 },
  detailGrid:    { display: 'flex', flexDirection: 'column', gap: 6 },
  detailRow:     { display: 'flex', gap: 8, alignItems: 'baseline' },
  detailLabel:   { fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', width: 44, flexShrink: 0 },
  detailVal:     { fontSize: 13, color: '#111827' },
  detailLink:    { color: '#1D4ED8', textDecoration: 'none', fontWeight: 500 },

  // Notes
  notesWrap:     { display: 'flex', flexDirection: 'column', gap: 6 },
  notesLabel:    { fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.04em' },
  notesTA:       { resize: 'vertical', padding: '8px 10px', border: '1.5px solid #D1D5DB', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', color: '#111827', outline: 'none', lineHeight: 1.5 },
  notesBtn:      { alignSelf: 'flex-end', padding: '6px 14px', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' },

  // Move buttons
  moveRow:       { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  moveLabel:     { fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase' },
  moveBtn:       { padding: '5px 12px', background: '#fff', border: '1.5px solid', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' },
};
