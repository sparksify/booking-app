import { Html, Head, Main, NextScript } from 'next/document';

/**
 * Custom document — injects the uploadable favicon app-wide. The href is a
 * static API route (/api/favicon) that serves whatever icon is set in Settings,
 * so this link works on every page (dashboard + public booking pages).
 */
export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" href="/api/favicon" />
        <link rel="shortcut icon" href="/api/favicon" />
        <link rel="apple-touch-icon" href="/api/favicon" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
