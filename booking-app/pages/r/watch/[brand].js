/**
 * /r/watch/[brand]  —  branded interstitial between the FB Lead Ad button
 * and the lead's unique video page.
 *
 * Facebook's completion button can't carry the lead's answers, and the
 * webhook (Pabbly / native FB) that delivers them can lag a few seconds
 * behind the click. Instead of blocking server-side with a blank screen,
 * this page renders INSTANTLY with a "locating your territory" loader and
 * polls /api/watch-match until the lead's data lands. The server claims the
 * lead and mints their unique page, and we redirect to
 * /watch/[brand]/[token] — fully prepopulated, video identified to them.
 *
 * Timeout budget ~25s (far beyond normal webhook lag); after that we fall
 * through to the plain lander so nobody dead-ends.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { getSupabaseAdmin } from '@/lib/supabase';

const POLL_MS = 1000;
const MAX_POLLS = 25;

const STAGES = [
  'Confirming your submission…',
  'Locating your territory…',
  'Pulling up your information…',
  'Preparing your page…',
];

export async function getServerSideProps({ params }) {
  const slug = (params?.brand || '').toString().toLowerCase();
  const supabase = getSupabaseAdmin();

  const { data: brand } = await supabase
    .from('brands')
    .select('slug, name')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();

  return { props: { slug, brandName: brand?.name || '' } };
}

export default function WatchInterstitial({ slug, brandName }) {
  const router = useRouter();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    let polls = 0;
    let stopped = false;

    // Rotate the status line every few seconds so the wait feels purposeful.
    const stageTimer = setInterval(
      () => setStage(s => Math.min(s + 1, STAGES.length - 1)),
      3500
    );

    const poll = async () => {
      if (stopped) return;
      polls += 1;
      try {
        const r = await fetch(`/api/watch-match?brand=${encodeURIComponent(slug)}`);
        const data = await r.json();
        if (data?.url) {
          stopped = true;
          clearInterval(stageTimer);
          router.replace(data.url);
          return;
        }
      } catch {
        // transient network blip — keep polling
      }
      if (polls >= MAX_POLLS) {
        stopped = true;
        clearInterval(stageTimer);
        router.replace(`/watch/${encodeURIComponent(slug)}`);
        return;
      }
      setTimeout(poll, POLL_MS);
    };

    poll();
    return () => { stopped = true; clearInterval(stageTimer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return (
    <>
      <Head>
        <title>{brandName ? `${brandName} — One moment` : 'One moment…'}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20,
        background: '#0b0d12', color: '#fff', padding: 24, textAlign: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          border: '3px solid rgba(255,255,255,.15)', borderTopColor: '#4f7cff',
          animation: 'spin 0.9s linear infinite',
        }} />
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
        <h1 style={{ fontSize: 'clamp(20px, 4vw, 28px)', margin: 0 }}>
          {brandName ? `Thanks for your interest in ${brandName}!` : 'Thanks for your submission!'}
        </h1>
        <p style={{ opacity: 0.75, margin: 0, minHeight: '1.4em' }}>{STAGES[stage]}</p>
      </main>
    </>
  );
}
