import { useCallback, useEffect, useRef, useState } from 'react';

const field = { padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 7, font: 'inherit', width: '100%', boxSizing: 'border-box' };
const button = { background: '#0057FF', color: 'white', border: 0, borderRadius: 7, padding: '10px 15px', cursor: 'pointer', font: 'inherit', fontWeight: 600 };
const labels = { ready_for_review: 'Verified · Ready for review', held_catch_all: 'Held · Catch-all email', held_invalid_email: 'Held · Invalid email', held_unverified: 'Held · Verification unavailable', no_email: 'No email found', loaded: 'Loaded to campaign', skipped_duplicate: 'Already in campaign', outreach_needs_review: 'Check campaign before retrying' };

export default function GenesisIntake() {
  const [rows, setRows] = useState([]), [configured, setConfigured] = useState(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState(''), [form, setForm] = useState({});
  const request = useRef(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/dashboard/genesis-intake'); const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRows(d.submissions); setConfigured(d.api_configured);
    } catch (e) { setError(e.message || 'Could not load submissions.'); }
  }, []);
  useEffect(() => { setOrigin(window.location.origin); load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    // Keep the same key after a network failure; new data receives a new key.
    const serialized = JSON.stringify(form);
    if (request.current?.body !== serialized) request.current = { body: serialized, key: crypto.randomUUID() };
    try {
      const r = await fetch('/api/dashboard/genesis-intake', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': request.current.key }, body: serialized });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      setNotice(`Saved ${d.business_name}. Genesis will process it in the background. Receipt: ${d.id}`); setForm({}); request.current = null; await load();
    } catch (e) { setError(e.message || 'Submission failed. You can safely retry.'); }
    finally { setBusy(false); }
  }
  async function action(id, name) {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/dashboard/genesis-intake', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: name }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error); await load();
    } catch (e) { setError(e.message || 'Could not update this lead.'); }
    finally { setBusy(false); }
  }
  return <section style={{ maxWidth: 1000 }}>
    <h2 style={{ margin: '0 0 8px', color: '#0F172A' }}>Incoming leads</h2>
    <p style={{ color: '#64748B', lineHeight: 1.6 }}>Send businesses Grok has already researched and confirmed are independent. With an email, Genesis verifies it. Without an email, Genesis discovers the owner and runs email enrichment. Verified leads wait here for you to load into the campaign.</p>
    <details style={{ background: '#F1F5F9', padding: 16, borderRadius: 10, marginBottom: 20 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Connect Grok to Genesis</summary>
      <p>POST one business to <code style={{ overflowWrap: 'anywhere' }}>{origin}/api/genesis/intake</code></p>
      <p>Use your Genesis bearer token and a unique <code>Idempotency-Key</code>. Reuse the same key when retrying the same submission.</p>
      <pre style={{ whiteSpace: 'pre-wrap', background: 'white', padding: 12, borderRadius: 6 }}>{JSON.stringify({ business_name: 'Example Coffee', owner_name: 'Jamie Morgan', email: 'jamie@example.com', phone: '+1 312 555 0100', website: 'https://example.com', city: 'Chicago, IL', research_notes: 'Independent owner-operated business with expansion potential.' }, null, 2)}</pre>
      <p><a href="/genesis-intake-openapi.json" target="_blank" rel="noreferrer">OpenAPI connection schema</a> · <a href="/genesis-grok-instructions.txt" target="_blank" rel="noreferrer">Instructions to give Grok</a></p>
      {configured === false && <p style={{ color: '#92400E' }}>The Grok API token still needs to be configured on the server. Signed-in form submissions are available.</p>}
    </details>
    {error && <p role="alert" style={{ color: '#B91C1C' }}>{error}</p>}
    {notice && <p role="status" style={{ color: '#047857' }}>{notice}</p>}
    <form onSubmit={submit} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, marginBottom: 24 }}>
      <h3 style={{ marginTop: 0 }}>Add a researched business</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {[['business_name', 'Business name', true], ['owner_name', 'Owner name'], ['email', 'Email'], ['phone', 'Phone'], ['website', 'Website'], ['city', 'City / state'], ['industry', 'Industry']].map(([key, label, required]) => <label key={key} style={{ fontSize: 13, display: 'grid', gap: 5 }}>{label}{required ? ' *' : ''}<input required={required} type={key === 'email' ? 'email' : 'text'} maxLength={key === 'website' ? 2000 : key === 'phone' ? 80 : key === 'email' ? 254 : 250} value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })} style={field} /></label>)}
      </div>
      <label style={{ display: 'grid', gap: 5, fontSize: 13, marginTop: 14 }}>Research and franchise potential<textarea maxLength={12000} rows={3} value={form.research_notes || ''} onChange={e => setForm({ ...form, research_notes: e.target.value })} style={field} /></label>
      <p style={{ color: '#64748B', fontSize: 12 }}>Submit only businesses already confirmed not to be franchises.</p>
      <button disabled={busy} style={{ ...button, opacity: busy ? .5 : 1 }}>{busy ? 'Working…' : 'Send to Genesis'}</button>
    </form>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><h3>Recent submissions</h3><button onClick={load} style={{ ...button, background: '#334155' }}>Refresh</button></div>
    {!rows.length && <p style={{ color: '#64748B' }}>No incoming leads yet.</p>}
    {rows.map(row => <article key={row.id} style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 10, padding: 18, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><strong>{row.business_name}</strong><span style={{ color: row.outcome === 'ready_for_review' || row.outcome === 'loaded' ? '#047857' : '#64748B' }}>{labels[row.outcome] || row.outcome || `${row.status} · ${row.stage}`}</span></div>
      <p style={{ color: '#475569', overflowWrap: 'anywhere' }}>{[row.owner_name, row.email, row.phone, row.city].filter(Boolean).join(' · ') || 'Researching contact details…'}</p>
      {(row.research_notes || row.franchise_information) && <details><summary style={{ cursor: 'pointer' }}>Research</summary><p style={{ whiteSpace: 'pre-wrap' }}>{[row.research_notes, row.franchise_information].filter(Boolean).join('\n\n')}</p></details>}
      {row.last_error && <p style={{ color: '#B45309' }}>{row.last_error}</p>}
      {row.status === 'failed' && <button disabled={busy} onClick={() => action(row.id, 'retry')} style={button}>Retry processing</button>}
      {row.outcome === 'ready_for_review' && <button disabled={busy} onClick={() => action(row.id, 'outreach')} style={button}>Load into outreach campaign</button>}
      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 12 }}>Grok intake · {new Date(row.created_at).toLocaleString()} · {row.id}</div>
    </article>)}
  </section>;
}
