import { useEffect, useState } from 'react';

export default function EnginePage() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch('/api/pipeline/engine');
    setState(await r.json());
  }
  useEffect(() => { load(); const iv = setInterval(load, 10000); return () => clearInterval(iv); }, []);

  async function toggle(enabled) {
    setBusy(true);
    await fetch('/api/pipeline/engine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    await load();
    setBusy(false);
  }

  const e = state?.engine;
  const on = !!e?.enabled;

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', fontFamily: 'ui-sans-serif, system-ui', color: '#0F172A' }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Backlog Engine</h1>
      <p style={{ color: '#64748B', marginTop: 0 }}>
        Sweeps city × niche unattended, builds verified backlog, drips into Smartlead.
      </p>

      <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: '#64748B' }}>Status</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: on ? '#16A34A' : '#94A3B8' }}>
              {on ? '● Running' : '○ Off'}
            </div>
          </div>
          <button
            onClick={() => toggle(!on)} disabled={busy || !e}
            style={{
              background: on ? '#DC2626' : '#16A34A', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}>
            {busy ? '…' : on ? 'Turn OFF' : 'Turn ON'}
          </button>
        </div>

        {state && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 20 }}>
            <Stat label="Backlog ready (unsent)" value={state.backlog_ready ?? '—'} />
            <Stat label="Loaded to Smartlead (total)" value={state.dispatched_total ?? '—'} />
            <Stat label="Cells swept" value={`${state.cells?.done ?? 0} / ${state.cells?.total ?? 0}`} />
            <Stat label="SerpAPI spent today" value={`${e?.spent_today ?? 0} / ${e?.daily_budget ?? 0}`} />
            <Stat label="Send cap / day" value={e?.send_per_day ?? '—'} />
            <Stat label="Businesses / tick" value={e?.businesses_per_tick ?? '—'} />
          </div>
        )}
      </div>
      <p style={{ color: '#94A3B8', fontSize: 12, marginTop: 12 }}>
        Auto-refreshes every 10s. Generation + dispatch run on Vercel cron only when the engine is ON.
      </p>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 12, color: '#64748B' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
