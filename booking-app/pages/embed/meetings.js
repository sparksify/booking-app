/**
 * Embeddable Meetings dashboard — for loading inside GoHighLevel (iframe / custom
 * menu link). Same meetings page, but chrome-less: no left sidebar; a hamburger
 * menu in the top-right reaches the other sections (the deal/Nurture module is
 * hidden here). Reuses the Meetings page component and its auth/permission gate.
 *
 * Auth inside the iframe: the session cookie is SameSite=None (see
 * pages/api/auth/[...nextauth].js) so it flows into the cross-site frame once
 * the user has signed in to the app. Google's OAuth pages refuse to render in
 * an iframe, so when there is no session we show a sign-in prompt that opens
 * the login in a new tab instead of redirecting inside the frame.
 */
import BookingsDashboard, { getServerSideProps as meetingsGate } from '../dashboard/bookings';

function SignInPrompt() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#F8FAFC',
    }}>
      <div style={{ textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', marginBottom: 6 }}>
          Sign in to view meetings
        </div>
        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 16 }}>
          Sign in opens in a new tab. Come back here and refresh when you&apos;re done.
        </div>
        <a
          href="/dashboard/login"
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-block', padding: '8px 18px', borderRadius: 8, background: '#0F172A',
            color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none', marginRight: 8,
          }}
        >
          Sign in
        </a>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '8px 18px', borderRadius: 8, background: '#fff', border: '1px solid #CBD5E1',
            color: '#0F172A', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

export default function EmbeddedMeetings(props) {
  if (props.needsAuth) return <SignInPrompt />;
  return <BookingsDashboard {...props} embed />;
}

export async function getServerSideProps(context) {
  const result = await meetingsGate(context);
  // Unauthenticated → render the sign-in prompt instead of redirecting; the
  // login flow (Google OAuth) cannot run inside a cross-site iframe.
  if (result?.redirect?.destination === '/dashboard/login') {
    return { props: { needsAuth: true } };
  }
  return result;
}
