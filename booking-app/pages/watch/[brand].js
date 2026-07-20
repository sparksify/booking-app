/**
 * /watch/[brand]  —  Wistia video (VSL) lander with per-lead tracking
 *
 * Arrival paths (both carry the lead's info in the query string):
 *   1. /r/watch/[brand] — instant prefill redirect after a FB Lead Ad submit
 *   2. Static FB merge-token URL, e.g.
 *      https://bookkanso.co/watch/wetfuel?first_name={{first_name}}&last_name={{last_name}}&phone={{phone_number}}&email={{email}}&lead_id=...
 *
 * Tracking is two-layered:
 *   • Wistia-native: the player is initialized with the lead's email, so every
 *     play/seek/heatmap in Wistia's Stats API is attributed to that person.
 *   • First-party: player events stream to /api/track/video-event →
 *     video_events table (+ lead_events milestones) for real-time dashboards.
 *
 * The brand row supplies wistia_media_id / watch_headline / watch_subtitle
 * (migration 033). The CTA forwards the same prefill params to the booking page.
 */
import { useEffect, useMemo, useRef } from 'react';
import Head from 'next/head';
import Script from 'next/script';
import { getSupabaseAdmin } from '@/lib/supabase';

const scrub = v => {
  const s = (v ?? '').toString().trim();
  return !s || /^\{\{.*\}\}$/.test(s) ? '' : s; // drop unresolved {{merge_tokens}}
};

export async function getServerSideProps({ params, query }) {
  const slug = (params?.brand || '').toString().toLowerCase();
  const supabase = getSupabaseAdmin();

  const { data: brand } = await supabase
    .from('brands')
    .select('slug, name, wistia_media_id, watch_headline, watch_subtitle')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();

  if (!brand || !brand.wistia_media_id) return { notFound: true };

  return {
    props: {
      brand: {
        slug: brand.slug,
        name: brand.name,
        mediaId: brand.wistia_media_id,
        headline: brand.watch_headline || `A quick message for you, from ${brand.name}`,
        subtitle: brand.watch_subtitle || 'Watch this short video before your call.',
      },
      prefill: {
        firstName:     scrub(query.first_name),
        lastName:      scrub(query.last_name),
        email:         scrub(query.email),
        phone:         scrub(query.phone_number || query.phone),
        liquidCapital: scrub(query.liquid_capital || query.cash_available || query.investment_level),
        leadId:        scrub(query.lead_id),
      },
    },
  };
}

export default function WatchPage({ brand, prefill }) {
  const sessionIdRef = useRef(null);
  if (!sessionIdRef.current && typeof window !== 'undefined') {
    sessionIdRef.current = `vs_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }

  const track = useMemo(() => (event_type, event_data = {}) => {
    const payload = JSON.stringify({
      media_id:   brand.mediaId,
      session_id: sessionIdRef.current,
      brand_slug: brand.slug,
      email:      prefill.email || undefined,
      lead_id:    prefill.leadId || undefined,
      event_type,
      event_data,
    });
    // sendBeacon survives tab closes mid-video; fetch keepalive is the fallback
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track/video-event', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/track/video-event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: payload, keepalive: true,
      }).catch(() => {});
    }
  }, [brand.mediaId, brand.slug, prefill.email, prefill.leadId]);

  useEffect(() => {
    track('video_page_viewed', { referrer: document.referrer || '' });

    const milestones = [25, 50, 75, 95];
    const fired = new Set();

    window._wq = window._wq || [];
    window._wq.push({
      id: brand.mediaId,
      onReady: video => {
        // Ties Wistia's own visitor analytics (heatmaps, watch %) to this lead
        if (prefill.email) video.email(prefill.email);

        video.bind('play',  () => track('play',  { t: video.time() }));
        video.bind('pause', () => track('pause', { t: video.time() }));
        video.bind('seek', (to, from) => track('seek', { from, to }));
        video.bind('percentwatchedchanged', percent => {
          const pct = Math.round(percent * 100);
          for (const m of milestones) {
            if (pct >= m && !fired.has(m)) {
              fired.add(m);
              track('percent_watched', { percent: m });
            }
          }
        });
        video.bind('end', () => track('end', {}));
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CTA forwards the same prefill into the existing booking flow
  const bookHref = useMemo(() => {
    const qp = new URLSearchParams({ brand: brand.slug });
    if (prefill.firstName)     qp.set('first_name', prefill.firstName);
    if (prefill.lastName)      qp.set('last_name', prefill.lastName);
    if (prefill.phone)         qp.set('phone', prefill.phone);
    if (prefill.email)         qp.set('email', prefill.email);
    if (prefill.liquidCapital) qp.set('liquid_capital', prefill.liquidCapital);
    if (prefill.leadId)        qp.set('lead_id', prefill.leadId);
    return `/?${qp.toString()}`;
  }, [brand.slug, prefill]);

  const greeting = prefill.firstName ? `${prefill.firstName}, ` : '';

  return (
    <>
      <Head>
        <title>{`${brand.name} — Watch`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Script src={`https://fast.wistia.com/embed/medias/${brand.mediaId}.jsonp`} strategy="afterInteractive" />
      <Script src="https://fast.wistia.com/assets/external/E-v1.js" strategy="afterInteractive" />

      <main style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '32px 16px', background: '#0b0d12', color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <div style={{ width: '100%', maxWidth: 880, textAlign: 'center' }}>
          <h1 style={{ fontSize: 'clamp(22px, 4vw, 34px)', margin: '0 0 8px' }}>
            {greeting}{brand.headline}
          </h1>
          <p style={{ opacity: 0.75, margin: '0 0 24px' }}>{brand.subtitle}</p>

          <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,.5)' }}>
            <div className={`wistia_embed wistia_async_${brand.mediaId} videoFoam=true`}
                 style={{ width: '100%', aspectRatio: '16 / 9', position: 'relative' }} />
          </div>

          <a
            href={bookHref}
            onClick={() => track('cta_clicked', {})}
            style={{
              display: 'inline-block', marginTop: 28, padding: '14px 36px', borderRadius: 8,
              background: '#4f7cff', color: '#fff', fontWeight: 600, textDecoration: 'none',
              fontSize: 17,
            }}
          >
            Book Your Call →
          </a>
        </div>
      </main>
    </>
  );
}
