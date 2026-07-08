import { useState, useEffect } from 'react';

/**
 * Company Intelligence panel — auto-researched profile of the lead's business.
 * Self-styled so it drops into both the Meetings CRM panel and the Prospects
 * page, next to <CallIntel/>. For a business email it shows the cached profile,
 * or a one-click "Research company" button when nothing's been pulled yet.
 * Renders nothing for freemail / consumer leads (no company to show).
 *
 * Props: { email, ghlContactId, leadId, isDemo }
 */
function capitalColor(sig) {
  if (sig === 'high')   return { c: '#15803D', bg: '#DCFCE7', b: '#BBF7D0', label: 'High capital' };
  if (sig === 'medium') return { c: '#B45309', bg: '#FEF3C7', b: '#FDE68A', label: 'Mid capital' };
  if (sig === 'low')    return { c: '#B91C1C', bg: '#FEE2E2', b: '#FECACA', label: 'Low capital' };
  return null;
}
function sizeLabel(s) {
  if (!s || s === 'unknown') return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function CompanyIntel({ email, ghlContactId, leadId, isDemo }) {
  const [intel, setIntel]   = useState(null);   // null = none/loading
  const [state, setState]   = useState('loading'); // loading | ready | researchable | running
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    setIntel(null); setState('loading'); setShowRaw(false);
    if (isDemo || (!email && !ghlContactId)) { setState('none'); return; }
    const params = new URLSearchParams();
    if (email)        params.set('email', email);
    if (ghlContactId) params.set('ghl_contact_id', ghlContactId);
    if (leadId)       params.set('lead_id', leadId);
    let cancelled = false;
    fetch(`/api/dashboard/company-intel?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.intel) { setIntel(d.intel); setState('ready'); }
        else if (d.researchable) { setState('researchable'); }
        else { setState('none'); }
      })
      .catch(() => { if (!cancelled) setState('none'); });
    return () => { cancelled = true; };
  }, [email, ghlContactId, leadId, isDemo]);

  async function research(force = false) {
    setState('running');
    try {
      const r = await fetch('/api/dashboard/company-intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, ghl_contact_id: ghlContactId, lead_id: leadId, force }),
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
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9h.01M9 13h.01M9 17h.01"/></svg>
        Company Intelligence
      </span>
    </div>
  );

  // Un-researched business lead — offer the one-click button.
  if (state === 'researchable' || state === 'running') {
    return (
      <div style={card}>
        {header}
        <button
          onClick={() => research(false)}
          disabled={state === 'running'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#fff', background: '#0EA5E9', border: 'none', borderRadius: 8, cursor: state === 'running' ? 'default' : 'pointer', fontFamily: 'inherit', opacity: state === 'running' ? 0.6 : 1 }}
        >
          {state === 'running' ? 'Researching…' : '🔍 Research company'}
        </button>
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>Pulls their website and summarizes the business (~1¢).</div>
      </div>
    );
  }

  // state === 'ready'
  const cap = capitalColor(intel.capital_signal);
  const size = sizeLabel(intel.company_size);
  const services = Array.isArray(intel.services) ? intel.services : [];
  const signals  = Array.isArray(intel.scale_signals) ? intel.scale_signals : [];

  return (
    <div style={card}>
      {header}

      {/* Identity row: logo + name + link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {intel.logo_url && (
          <img src={intel.logo_url} alt="" width="36" height="36"
               style={{ borderRadius: 8, objectFit: 'contain', background: '#F8FAFC', border: '1px solid #EEF2F6' }}
               onError={e => { e.currentTarget.style.display = 'none'; }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{intel.company_name || intel.domain}</div>
          {intel.website_url && (
            <a href={intel.website_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#2563EB', textDecoration: 'none' }}>{intel.domain} ↗</a>
          )}
        </div>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {cap  && <span style={{ ...pill, color: cap.c, background: cap.bg, border: `1px solid ${cap.b}` }}>{cap.label}</span>}
        {intel.industry && <span style={{ ...pill, color: '#0369A1', background: '#E0F2FE' }}>{intel.industry}</span>}
        {size && <span style={{ ...pill, color: '#475569', background: '#F1F5F9' }}>{size}</span>}
        {intel.location && <span style={{ ...pill, color: '#475569', background: '#F1F5F9' }}>📍 {intel.location}</span>}
      </div>

      {intel.what_they_do && (
        <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, marginBottom: 10 }}>{intel.what_they_do}</div>
      )}

      {(intel.owner_name || intel.owner_title) && (
        <div style={{ marginBottom: 8 }}>
          <div style={label}>LEADERSHIP</div>
          <div style={{ fontSize: 13, color: '#0F172A', marginTop: 2 }}>{[intel.owner_name, intel.owner_title].filter(Boolean).join(' · ')}</div>
        </div>
      )}

      {intel.franchise_read && (
        <div style={{ marginBottom: 8, background: '#F0F9FF', border: '1px solid #E0F2FE', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ ...label, color: '#0369A1' }}>FRANCHISE READ</div>
          <div style={{ fontSize: 13, color: '#0C4A6E', marginTop: 2, lineHeight: 1.55 }}>{intel.franchise_read}</div>
        </div>
      )}

      {services.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={label}>SERVICES</div>
          <div style={{ fontSize: 12.5, color: '#475569', marginTop: 3 }}>{services.join(' · ')}</div>
        </div>
      )}

      {signals.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <button onClick={() => setShowRaw(o => !o)} style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
            {showRaw ? 'Hide scale signals' : `${signals.length} scale signal${signals.length > 1 ? 's' : ''}`}
          </button>
          {showRaw && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {signals.map((s, i) => <li key={i} style={{ fontSize: 12.5, color: '#475569', marginBottom: 2 }}>{s}</li>)}
            </ul>
          )}
        </div>
      )}

      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => research(true)} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>↻ Re-research</button>
      </div>
    </div>
  );
}
