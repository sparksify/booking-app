import { useState, useEffect } from 'react';

/**
 * Watch Intelligence — video watch progress + funnel questionnaire answers for
 * a contact (from the /watch funnel). Self-styled to drop into the Meetings CRM
 * panel and the Prospects card. Renders nothing when there's no funnel data.
 *
 * Props: { ghlContactId, leadId, email, isDemo }
 */
function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return ''; }
}
function pctColor(p) {
  if (p >= 75) return '#15803D';
  if (p >= 40) return '#B45309';
  return '#DC2626';
}
const LIQUID_LABEL = { lt_100k: 'Under $100k', '100k_250k': '$100k–$250k', '250k_500k': '$250k–$500k', gt_500k: '$500k+' };

export default function WatchIntel({ ghlContactId, leadId, email, isDemo }) {
  const [w, setW] = useState(undefined); // undefined = loading

  useEffect(() => {
    if (isDemo) { setW(null); return; }
    const params = new URLSearchParams();
    if (ghlContactId) params.set('ghl_contact_id', ghlContactId);
    if (leadId)       params.set('lead_id', leadId);
    if (email)        params.set('email', email);
    if (![...params.keys()].length) { setW(null); return; }
    let cancelled = false;
    setW(undefined);
    fetch(`/api/dashboard/watch-intel?${params.toString()}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setW(d.watch || null); })
      .catch(() => { if (!cancelled) setW(null); });
    return () => { cancelled = true; };
  }, [ghlContactId, leadId, email, isDemo]);

  if (w === undefined || w === null) return null;

  const pct = Number(w.video_watch_pct || 0);
  const answers = [
    (w.franchise_city || w.franchise_state) && ['Target market', [w.franchise_city, w.franchise_state].filter(Boolean).join(', ')],
    w.operated_business != null && ['Operated a business', w.operated_business ? 'Yes' : 'No'],
    (w.investment_level) && ['Liquid capital', LIQUID_LABEL[w.investment_level] || w.investment_level],
    w.net_worth && ['Net worth', w.net_worth],
  ].filter(Boolean);

  // Nothing to show if they never watched and answered nothing.
  if (!pct && !answers.length && !w.video_last_watched_at) return null;

  const card  = { background: '#fff', border: '1px solid #EAECEF', borderRadius: 14, padding: '16px 18px', marginBottom: 14 };
  const label = { fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.04em' };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Video &amp; Questionnaire</span>
        {w.video_last_watched_at && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>watched {fmtDate(w.video_last_watched_at)}</span>}
      </div>

      {(pct > 0 || w.video_last_watched_at) && (
        <div style={{ marginBottom: answers.length ? 14 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={label}>VIDEO WATCHED</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: pctColor(pct) }}>{pct}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 20, background: '#EEF2F6', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: pctColor(pct) }} />
          </div>
        </div>
      )}

      {answers.length > 0 && (
        <div>
          <div style={{ ...label, marginBottom: 6 }}>THEIR ANSWERS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {answers.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                <span style={{ color: '#64748B' }}>{k}</span>
                <span style={{ color: '#0F172A', fontWeight: 600, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
