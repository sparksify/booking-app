import { useState, useEffect } from 'react';

/**
 * Call Intelligence panel — surfaces Granola → Kanso call_logs for a contact.
 * Self-styled so it drops into both the Meetings CRM panel and the Prospects
 * page. Renders nothing when there are no calls (so it never adds clutter).
 *
 * Props: { ghlContactId, leadId, email, isDemo }
 */
function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ''; }
}
function interestColor(n) {
  if (n >= 8) return { c: '#15803D', bg: '#DCFCE7', b: '#BBF7D0' };
  if (n >= 5) return { c: '#B45309', bg: '#FEF3C7', b: '#FDE68A' };
  return { c: '#B91C1C', bg: '#FEE2E2', b: '#FECACA' };
}
function sentimentColor(s) {
  if (s === 'positive') return { c: '#15803D', bg: '#DCFCE7' };
  if (s === 'negative') return { c: '#B91C1C', bg: '#FEE2E2' };
  return { c: '#475569', bg: '#F1F5F9' };
}

export default function CallIntel({ ghlContactId, leadId, email, isDemo }) {
  const [calls, setCalls] = useState(null);        // null = loading, [] = none
  const [openTranscript, setOpenTranscript] = useState(false);
  const [showOlder, setShowOlder] = useState(false);

  useEffect(() => {
    setOpenTranscript(false); setShowOlder(false);
    if (isDemo) { setCalls([]); return; }
    const params = new URLSearchParams();
    if (ghlContactId) params.set('ghl_contact_id', ghlContactId);
    if (leadId)       params.set('lead_id', leadId);
    if (email)        params.set('email', email);
    if (![...params.keys()].length) { setCalls([]); return; }
    let cancelled = false;
    setCalls(null);
    fetch(`/api/dashboard/call-logs?${params.toString()}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setCalls(d.calls || []); })
      .catch(() => { if (!cancelled) setCalls([]); });
    return () => { cancelled = true; };
  }, [ghlContactId, leadId, email, isDemo]);

  if (!calls || !calls.length) return null;

  const latest = calls[0];
  const older  = calls.slice(1);
  const ic = interestColor(latest.interest_level || 0);
  const sc = sentimentColor(latest.sentiment);
  const steveItems = Array.isArray(latest.action_items_steve) ? latest.action_items_steve : [];

  const card  = { background: '#fff', border: '1px solid #EAECEF', borderRadius: 14, padding: '16px 18px', marginBottom: 14 };
  const pill  = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' };
  const label = { fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.04em' };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          Call Intelligence
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>
          {calls.length} call{calls.length !== 1 ? 's' : ''} · {fmtDate(latest.call_started_at)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {latest.interest_level != null && (
          <span style={{ ...pill, color: ic.c, background: ic.bg, border: `1px solid ${ic.b}` }}>Interest {latest.interest_level}/10</span>
        )}
        {latest.sentiment && (
          <span style={{ ...pill, color: sc.c, background: sc.bg }}>{latest.sentiment[0].toUpperCase() + latest.sentiment.slice(1)}</span>
        )}
        {latest.granola_note_url && (
          <a href={latest.granola_note_url} target="_blank" rel="noreferrer" style={{ ...pill, color: '#2563EB', background: '#EFF6FF', textDecoration: 'none' }}>Open in Granola ↗</a>
        )}
      </div>

      {latest.summary && (
        <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{latest.summary}</div>
      )}

      {latest.next_step && (
        <div style={{ marginBottom: 8 }}>
          <div style={label}>NEXT STEP</div>
          <div style={{ fontSize: 13, color: '#0F172A', marginTop: 2 }}>{latest.next_step}{latest.follow_up_date ? ` · by ${fmtDate(latest.follow_up_date)}` : ''}</div>
        </div>
      )}

      {steveItems.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={label}>YOUR ACTION ITEMS</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {steveItems.map((it, i) => <li key={i} style={{ fontSize: 13, color: '#334155', marginBottom: 2 }}>{it}</li>)}
          </ul>
        </div>
      )}

      {latest.transcript && (
        <div style={{ marginTop: 6 }}>
          <button onClick={() => setOpenTranscript(o => !o)} style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
            {openTranscript ? 'Hide transcript' : 'Show transcript'}
          </button>
          {openTranscript && (
            <div style={{ marginTop: 8, maxHeight: 260, overflowY: 'auto', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {latest.transcript}
            </div>
          )}
        </div>
      )}

      {older.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid #F1F3F5', paddingTop: 10 }}>
          <button onClick={() => setShowOlder(o => !o)} style={{ background: 'none', border: 'none', color: '#64748B', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
            {showOlder ? 'Hide earlier calls' : `${older.length} earlier call${older.length > 1 ? 's' : ''}`}
          </button>
          {showOlder && older.map(c => (
            <div key={c.id} style={{ marginTop: 8, fontSize: 12.5 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: '#334155' }}>{fmtDate(c.call_started_at)}</span>
                {c.interest_level != null && <span style={{ color: interestColor(c.interest_level).c, fontWeight: 600 }}>Interest {c.interest_level}/10</span>}
                {c.granola_note_url && <a href={c.granola_note_url} target="_blank" rel="noreferrer" style={{ color: '#2563EB', textDecoration: 'none' }}>↗</a>}
              </div>
              {c.summary && <div style={{ marginTop: 2, color: '#64748B', lineHeight: 1.5 }}>{c.summary.length > 200 ? c.summary.slice(0, 200) + '…' : c.summary}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
