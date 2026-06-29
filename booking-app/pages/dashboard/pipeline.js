import { useState } from 'react';
import Nav from '../../lib/nav';

const INDUSTRIES = [
  'Food & Beverage',
  'Health & Wellness',
  'Fitness',
  'Beauty & Personal Care',
  'Pet Services',
  'Auto Services',
  'Home Services',
  'Senior Care',
  'Cleaning Services',
  "Children's Education",
  'Real Estate Services',
  'Marketing & Media',
];

const STAGE_LABELS = {
  idle:      { text: 'Ready',          color: '#888' },
  scout:     { text: 'Scouting...',    color: '#f59e0b' },
  filter:    { text: 'Filtering...',   color: '#f59e0b' },
  discover:  { text: 'Discovering...', color: '#f59e0b' },
  enrich:    { text: 'Enriching...',   color: '#f59e0b' },
  outreach:  { text: 'Loading...',     color: '#f59e0b' },
  done:      { text: 'Complete',       color: '#10b981' },
  error:     { text: 'Error',          color: '#ef4444' },
};

export default function Pipeline() {
  const [city, setCity]         = useState('');
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [stage, setStage]       = useState('idle');
  const [log, setLog]           = useState([]);
  const [results, setResults]   = useState(null);
  const [error, setError]       = useState(null);

  function addLog(msg) {
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`]);
  }

  async function callStage(endpoint, body) {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(err.error || r.statusText);
    }
    return r.json();
  }

  async function runPipeline() {
    if (!city.trim()) return;
    setStage('idle');
    setLog([]);
    setResults(null);
    setError(null);

    try {
      // ── 1. Scout ──────────────────────────────────────────────
      setStage('scout');
      addLog(`Scouting ${industry} businesses in ${city}...`);
      const scoutData = await callStage('/api/pipeline/scout', { city, industry });
      addLog(`Found ${scoutData.count} businesses`);

      if (!scoutData.businesses?.length) {
        throw new Error('No businesses found. Try a different city or industry.');
      }

      // ── 2. Filter ─────────────────────────────────────────────
      setStage('filter');
      addLog(`Checking ${scoutData.businesses.length} businesses for franchise status...`);
      const filterData = await callStage('/api/pipeline/filter', {
        businesses: scoutData.businesses,
      });
      addLog(`${filterData.filtered} franchises removed — ${filterData.passed} independents remaining`);

      if (!filterData.businesses?.length) {
        throw new Error('All businesses were franchises. Try a different search.');
      }

      // ── 3. Discover ───────────────────────────────────────────
      setStage('discover');
      addLog(`Hunting owner names and signals for ${filterData.businesses.length} businesses...`);
      const discoverData = await callStage('/api/pipeline/discover', {
        businesses: filterData.businesses,
      });
      addLog(`Owner names found: ${discoverData.owner_found} of ${discoverData.total} (${discoverData.hit_rate}%)`);

      // ── 4. Enrich ─────────────────────────────────────────────
      setStage('enrich');
      addLog(`Enriching emails for ${discoverData.businesses.length} businesses...`);
      const enrichData = await callStage('/api/pipeline/enrich', {
        businesses: discoverData.businesses,
      });
      addLog(`Emails found: ${enrichData.enriched_count} of ${enrichData.total} (${enrichData.hit_rate}%)`);

      const enriched = enrichData.results.filter(b => b.enriched);
      if (!enriched.length) {
        addLog('No emails found — pipeline complete with no outreach loaded');
        setStage('done');
        setResults({ scout: scoutData, filter: filterData, discover: discoverData, enrich: enrichData, outreach: null });
        return;
      }

      // ── 5. Outreach ───────────────────────────────────────────
      setStage('outreach');
      addLog(`Writing sequences and loading ${enriched.length} contacts to Smartlead...`);
      const outreachData = await callStage('/api/pipeline/outreach', {
        businesses: enriched,
      });
      addLog(`Loaded: ${outreachData.loaded} | Skipped: ${outreachData.skipped} | Failed: ${outreachData.failed}`);

      // ── Done ──────────────────────────────────────────────────
      setStage('done');
      addLog('Pipeline complete ✓');
      setResults({ scout: scoutData, filter: filterData, discover: discoverData, enrich: enrichData, outreach: outreachData });

    } catch (err) {
      setStage('error');
      setError(err.message);
      addLog(`Error: ${err.message}`);
    }
  }

  const stageInfo = STAGE_LABELS[stage] || STAGE_LABELS.idle;
  const isRunning = !['idle', 'done', 'error'].includes(stage);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f0f0f', color: '#f0f0f0', fontFamily: 'Inter, sans-serif' }}>
      <Nav />
      <div style={{ flex: 1, padding: '40px', maxWidth: '860px' }}>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>Genesis Agent</h1>
            <span style={{ fontSize: '11px', background: '#1e1e1e', border: '1px solid #333', borderRadius: '4px', padding: '2px 8px', color: '#888' }}>v2.3</span>
            <span style={{ fontSize: '12px', color: stageInfo.color, fontWeight: 600 }}>{stageInfo.text}</span>
          </div>
          <p style={{ margin: 0, color: '#666', fontSize: '13px' }}>Scout → Filter → Discover → Enrich → Outreach</p>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <input
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="City (e.g. Dallas, TX)"
            disabled={isRunning}
            style={{ flex: 1, minWidth: '200px', padding: '10px 14px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#f0f0f0', fontSize: '14px' }}
          />
          <select
            value={industry}
            onChange={e => setIndustry(e.target.value)}
            disabled={isRunning}
            style={{ flex: 1, minWidth: '200px', padding: '10px 14px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', color: '#f0f0f0', fontSize: '14px' }}
          >
            {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
          </select>
          <button
            onClick={runPipeline}
            disabled={isRunning || !city.trim()}
            style={{
              padding: '10px 24px',
              background: isRunning ? '#333' : '#10b981',
              color: isRunning ? '#666' : '#000',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: isRunning ? 'not-allowed' : 'pointer',
            }}
          >
            {isRunning ? 'Running...' : 'Run Pipeline'}
          </button>
        </div>

        {/* Progress log */}
        {log.length > 0 && (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
            <div style={{ fontSize: '11px', color: '#555', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pipeline Log</div>
            {log.map((line, i) => (
              <div key={i} style={{ fontSize: '13px', color: '#aaa', lineHeight: '1.8' }}>{line}</div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: '#1a0a0a', border: '1px solid #4a1a1a', borderRadius: '8px', padding: '14px 16px', marginBottom: '24px', color: '#f87171', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {/* Results summary */}
        {results && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '32px' }}>
            {[
              { label: 'Scouted',   value: results.scout?.count ?? 0 },
              { label: 'Passed Filter', value: results.filter?.passed ?? 0 },
              { label: 'Names Found',  value: results.discover?.owner_found ?? 0 },
              { label: 'Emails Found', value: results.enrich?.enriched_count ?? 0 },
              { label: 'Loaded',    value: results.outreach?.loaded ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: '#10b981' }}>{value}</div>
                <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Loaded prospects detail */}
        {results?.outreach?.results?.filter(r => r.outreach_status === 'loaded').map((biz, i) => (
          <div key={i} style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '20px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{biz.business_name}</div>
                <div style={{ color: '#666', fontSize: '12px', marginTop: '2px' }}>{biz.city} · {biz.industry}</div>
              </div>
              <span style={{ fontSize: '11px', background: '#0d2e1e', color: '#10b981', border: '1px solid #10b981', borderRadius: '4px', padding: '2px 8px' }}>Loaded</span>
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
              <span style={{ color: '#aaa' }}>{biz.email_owner}</span> · {biz.email} · via {biz.email_source}
            </div>
            {biz.signal && (
              <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic', marginBottom: '12px' }}>"{biz.signal}"</div>
            )}
            {biz.sequence && (
              <div style={{ borderTop: '1px solid #1e1e1e', paddingTop: '12px' }}>
                <div style={{ fontSize: '11px', color: '#555', marginBottom: '6px' }}>EMAIL 1 — {biz.sequence.email1.subject}</div>
                <div style={{ fontSize: '12px', color: '#888', lineHeight: '1.6', marginBottom: '12px', whiteSpace: 'pre-wrap' }}>{biz.sequence.email1.body}</div>
                <div style={{ fontSize: '11px', color: '#555', marginBottom: '6px' }}>EMAIL 2 — {biz.sequence.email2.subject}</div>
                <div style={{ fontSize: '12px', color: '#888', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{biz.sequence.email2.body}</div>
              </div>
            )}
          </div>
        ))}

      </div>
    </div>
  );
}
