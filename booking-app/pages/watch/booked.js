import Head from 'next/head';
import { useRouter } from 'next/router';

/**
 * Standalone booking confirmation page. The funnel navigates here after a
 * successful booking so the prospect clearly lands on a new "done" screen.
 * Details are passed via query string (no PII beyond what they just entered).
 */
export default function Booked() {
  const { query } = useRouter();
  const when  = query.when || '';
  const phone = query.phone || '';
  const ac    = query.ac ? `#${query.ac}` : '#15803D';
  const brand = query.brand || '';

  return (
    <>
      <Head><title>You're booked{brand ? ` — ${brand}` : ''}</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <div style={{ minHeight: '100vh', background: '#EEF1F5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" }}>
        <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 16, boxShadow: '0 4px 30px rgba(15,23,42,.12)', padding: '44px 30px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: ac, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 20px' }}>✓</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>You're all set!</h1>
          <p style={{ fontSize: 15, color: '#475569', margin: '0 0 22px' }}>Your call is booked. We're looking forward to speaking with you.</p>

          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 18px', textAlign: 'left' }}>
            {when && <div style={{ fontSize: 15, color: '#0F172A', marginBottom: phone ? 8 : 0 }}>📅 <strong style={{ color: ac }}>{when}</strong></div>}
            {phone && <div style={{ fontSize: 15, color: '#0F172A' }}>📞 <strong style={{ color: ac }}>We'll call you at:</strong> {phone}</div>}
          </div>

          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 20 }}>
            No video link needed — your consultant will call you by phone at the time above. A confirmation is on its way.
          </p>
        </div>
      </div>
    </>
  );
}
