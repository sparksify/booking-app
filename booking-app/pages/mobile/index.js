/**
 * pages/mobile/index.js
 * The installable PWA entry point — lives at trykanso.co/mobile
 * Add this URL to your iPhone home screen via Safari Share → Add to Home Screen
 */

import Head from "next/head";
import { useEffect } from "react";
import KansoPWA from "../../components/mobile/KansoPWA";

export default function MobilePage() {
  useEffect(() => {
    // Register service worker for PWA install capability
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(reg => console.log("[kanso] SW registered:", reg.scope))
        .catch(err => console.error("[kanso] SW error:", err));
    }
  }, []);

  return (
    <>
      <Head>
        <title>Kanso</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="description" content="Kanso broker dashboard" />

        {/* PWA meta */}
        <meta name="application-name" content="Kanso" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Kanso" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* Manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Apple touch icons */}
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512.png" />

        {/* Prevent zoom on input focus (iOS) */}
        <style>{`
          * { -webkit-tap-highlight-color: transparent; }
          input, textarea, select { font-size: 16px !important; }
          body { overscroll-behavior: none; }
        `}</style>
      </Head>

      <KansoPWA />
    </>
  );
}

// Protect this page — redirect to login if no session
export async function getServerSideProps(context) {
  const { getServerSession } = await import("next-auth");
  const { authOptions } = await import("../api/auth/[...nextauth]");

  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session) {
    return {
      redirect: {
        destination: `/api/auth/signin?callbackUrl=${encodeURIComponent("/mobile")}`,
        permanent: false,
      },
    };
  }

  return { props: { user: session.user } };
}
