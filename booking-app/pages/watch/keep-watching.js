import Head from 'next/head';
import { useRouter } from 'next/router';

/**
 * "Not yet" thank-you page. Shown when a lead says they haven't watched the
 * video. They've been tagged for the watch-nurture; this page points them back
 * to the video so they can watch and then come back to book.
 */
export default function KeepWatching() {
  const { query } = useRouter();
  const ac    = query.ac ? `#${query.ac}` : '#15803D';
  const brand = query.brand || '';
  const token = query.token || '';

  // Link straight back to their personalized video page when we have the slug.
  const watchHref = query.brandSlug && token ? `/watch/${query.brandSlug}/${token}` : null;

  return (
    <>
      <Head><title>Finish the video{brand ? ` — ${brand}` : ''}</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <div style={{ minHeight: '100vh', background: '#EEF1F5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" }}>
        <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 16, boxShadow: '0 4px 30px rgba(15,23,42,.12)', padding: '44px 30px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: ac, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
          <h1 style={{ fontSize: 25, fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>Watch the video first</h1>
          <p style={{ fontSize: 15, color: '#475569', margin: '0 0 22px', lineHeight: 1.55 }}>
            The video covers everything you'll want to understand before we talk — how the business works, what it takes, and whether your market is open. Give it a watch, then come back and we'll help you find your territory.
          </p>

          {watchHref ? (
            <a href={watchHref} style={{ display: 'inline-block', background: ac, color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none', padding: '13px 26px', borderRadius: 10 }}>
              ← Back to the video
            </a>
          ) : (
            <button onClick={() => (typeof window !== 'undefined' && window.history.length > 1 ? window.history.back() : null)} style={{ background: ac, color: '#fff', fontSize: 15, fontWeight: 700, border: 'none', padding: '13px 26px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
              ← Back to the video
            </button>
          )}

          <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 20 }}>
            We'll also send you a reminder with your link so you can pick up right where you left off.
          </p>
        </div>
      </div>
    </>
  );
}
