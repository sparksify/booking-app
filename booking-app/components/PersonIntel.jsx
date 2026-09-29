import { useState, useEffect } from 'react';

/**
 * Person Intelligence panel — an individual dossier researched from the open web
 * via Perplexity Sonar. Drops into the Meetings CRM panel next to <CompanyIntel/>.
 * Shows a cached dossier, or a one-click "Research person" button when nothing's
 * been pulled yet.
 *
 * Props: { email, name, phone, company, location, ghlContactId, leadId, isDemo }
 */
function capitalColor(sig) {
  if (sig === 'high')   return { c: '#15803D', bg: '#DCFCE7', b: '#BBF7D0', label: 'High capital' };
  if (sig === 'medium') return { c: '#B45309', bg: '#FEF3C7', b: '#FDE68A', label: 'Mid capital' };
  if (sig === 'low')    return { c: '#B91C1C', bg: '#FEE2E2', b: '#FECACA', label: 'Low capital' };
  return null;
}
function confColor(c) {
  if (c === 'high')   return { c: '#15803D', bg: '#DCFCE7' };
  if (c === 'medium') return { c: '#B45309', bg: '#FEF3C7' };
  return { c: '#64748B', bg: '#F1F5F9' };
}
function relColor(r) {
  if (r === 'high')   return { c: '#15803D', bg: '#DCFCE7', b: '#BBF7D0', label: 'High fit' };
  if (r === 'medium') return { c: '#B45309', bg: '#FEF3C7', b: '#FDE68A', label: 'Medium fit' };
  if (r === 'low')    return { c: '#B91C1C', bg: '#FEE2E2', b: '#FECACA', label: 'Low fit' };
  return null;
}

export default function PersonIntel({ email, name, phone, company, location, brand, ghlContactId, leadId, isDemo }) {
  const [intel, setIntel] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | researchable | running | none
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    setIntel(null); setState('loading'); setShowSources(false);
    if (isDemo || (!email && !leadId && !ghlContactId)) { setState('none'); return; }
    const params = new URLSearchParams();
    if (email)        params.set('email', email);
    if (leadId)       params.set('lead_id', leadId);
    if (ghlContactId) params.set('ghl_contact_id', ghlContactId);
    let cancelled = false;
    fetch(`/api/dashboard/person-intel?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.intel) { setIntel(d.intel); setState('ready'); }
        else if (d.researchable) { setState('researchable'); }
        else { setState('none'); }
      })
      .catch(() => { if (!cancelled) setState('none'); });
    return () => { cancelled = true; };
  }, [email, leadId, ghlContactId, isDemo]);

  async function research(force = false) {
    setState('running');
    try {
      const r = await fetch('/api/dashboard/person-intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, phone, company, location, brand, lead_id: leadId, ghl_contact_id: ghlContactId, force }),
      });
      const d = await r.json();
      if (d.intel) { setIntel(d.intel); setState('ready'); }
      else { setState('researchable'); }
    } catch {
      setState('researchable');
    }
  }

  if (state === 'none' || state === 'loading') return null;

  const card  = { background: '#fff', border: '1px solid #EAECEF', borderRadius: 14, padding: '16px 18px', marginBottom: 14 };
  const pill  = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' };
  const label = { fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.04em' };
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        Person Dossier
      </span>
    </div>
  );

  // Not researched yet — the one-click button.
  if (state === 'researchable' || state === 'running') {
    return (
      <div style={card}>
        {header}
        <button
          onClick={() => research(false)}
          disabled={state === 'running'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#fff', background: '#7C3AED', border: 'none', borderRadius: 8, cursor: state === 'running' ? 'default' : 'pointer', fontFamily: 'inherit', opacity: state === 'running' ? 0.6 : 1 }}
        >
          {state === 'running' ? 'Researching the web…' : '🕵️ Research this person'}
        </button>
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>
          Searches the open web and builds a dossier — to the best of public knowledge (~1–2¢, a few seconds).
        </div>
      </div>
    );
  }

  // state === 'ready'
  const cap  = capitalColor(intel.capital_signal);
  const conf = confColor(intel.confidence);
  const rel  = relColor(intel.relevance);
  const background = Array.isArray(intel.background) ? intel.background : [];
  const interests  = Array.isArray(intel.business_interests) ? intel.business_interests : [];
  const facts      = Array.isArray(intel.notable_facts) ? intel.notable_facts : [];
  const presence   = Array.isArray(intel.online_presence) ? intel.online_presence.filter(p => p && p.url) : [];
  const sources    = Array.isArray(intel.sources) ? intel.sources : [];

  // Almost-empty result — say so plainly instead of showing a blank card.
  const emptyish = !intel.summary && !background.length && !facts.length && !presence.length;

  return (
    <div style={card}>
      {header}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{intel.full_name || name}</span>
        {intel.confidence && <span style={{ ...pill, color: conf.c, background: conf.bg }}>{intel.confidence} confidence</span>}
      </div>

      {intel.headline && <div style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>{intel.headline}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {rel && <span style={{ ...pill, color: rel.c, background: rel.bg, border: `1px solid ${rel.b}` }}>{rel.label}</span>}
        {cap && <span style={{ ...pill, color: cap.c, background: cap.bg, border: `1px solid ${cap.b}` }}>{cap.label}</span>}
        {(intel.current_title || intel.employer) && <span style={{ ...pill, color: '#0369A1', background: '#E0F2FE' }}>{[intel.current_title, intel.employer].filter(Boolean).join(' @ ')}</span>}
        {intel.location && <span style={{ ...pill, color: '#475569', background: '#F1F5F9' }}>📍 {intel.location}</span>}
      </div>

      {intel.relevance_reason && (
        <div style={{ marginBottom: 10, background: rel ? rel.bg : '#F1F5F9', border: `1px solid ${rel ? rel.b : '#E2E8F0'}`, borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ ...label, color: rel ? rel.c : '#64748B' }}>FIT FOR THIS BRAND</div>
          <div style={{ fontSize: 13, color: '#0F172A', marginTop: 2, lineHeight: 1.55 }}>{intel.relevance_reason}</div>
        </div>
      )}

      {emptyish ? (
        <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.55 }}>
          Not much turned up publicly about this specific person. Try again after adding their company, or research their business instead.
        </div>
      ) : (
        <>
          {intel.summary && <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, marginBottom: 10 }}>{intel.summary}</div>}

          {intel.franchise_read && (
            <div style={{ marginBottom: 10, background: '#F5F3FF', border: '1px solid #EDE9FE', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ ...label, color: '#6D28D9' }}>HOW TO APPROACH</div>
              <div style={{ fontSize: 13, color: '#4C1D95', marginTop: 2, lineHeight: 1.55 }}>{intel.franchise_read}</div>
            </div>
          )}

          {background.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={label}>BACKGROUND</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {background.map((b, i) => <li key={i} style={{ fontSize: 12.5, color: '#475569', marginBottom: 2 }}>{b}</li>)}
              </ul>
            </div>
          )}

          {interests.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={label}>BUSINESS INTERESTS</div>
              <div style={{ fontSize: 12.5, color: '#475569', marginTop: 3 }}>{interests.join(' · ')}</div>
            </div>
          )}

          {facts.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={label}>NOTABLE</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {facts.map((f, i) => <li key={i} style={{ fontSize: 12.5, color: '#475569', marginBottom: 2 }}>{f}</li>)}
              </ul>
            </div>
          )}

          {presence.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={label}>ONLINE</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {presence.map((p, i) => (
                  <a key={i} href={p.url} target="_blank" rel="noreferrer"
                     style={{ fontSize: 12, color: '#2563EB', textDecoration: 'none', background: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: 6, padding: '3px 8px' }}>
                    {p.label || p.type || 'Link'} ↗
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        {sources.length > 0 && (
          <button onClick={() => setShowSources(o => !o)} style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
            {showSources ? 'Hide sources' : `${sources.length} source${sources.length > 1 ? 's' : ''}`}
          </button>
        )}
        <button onClick={() => research(true)} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>↻ Re-research</button>
      </div>

      {showSources && sources.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {sources.map((u, i) => (
            <li key={i} style={{ fontSize: 11.5, marginBottom: 2, wordBreak: 'break-all' }}>
              <a href={u} target="_blank" rel="noreferrer" style={{ color: '#2563EB', textDecoration: 'none' }}>{u}</a>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 10, fontSize: 10.5, color: '#B6BdC6', lineHeight: 1.4 }}>
        AI-compiled from public web sources — verify before relying on any detail.
      </div>
    </div>
  );
}
