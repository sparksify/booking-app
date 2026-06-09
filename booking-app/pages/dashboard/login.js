import { signIn } from 'next-auth/react';
import Head from 'next/head';
import BrandLogo from '@/components/BrandLogo';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function getServerSideProps() {
  let logo = null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('settings').select('platform_logo_url').eq('id', 1).single();
    logo = data?.platform_logo_url || null;
  } catch { /* non-fatal */ }
  return { props: { logo } };
}

export default function Login({ logo = null }) {
  return (
    <>
      <Head><title>Sign In — KANSO</title></Head>
      <div style={st.root}>
        {/* Centered card */}
        <div style={st.body}>
          <div style={st.card}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <BrandLogo logo={logo} />
            </div>
            <h1 style={st.heading}>Sign in</h1>
            <p style={st.sub}>
              Access your operator dashboard and connect your Google Calendar to start receiving bookings.
            </p>
            <button
              style={st.googleBtn}
              onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <p style={st.note}>
              Each team member signs in here to connect their own calendar.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
    <path d="M3.964 10.705A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.705V4.963H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.037l3.007-2.332Z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.963L3.964 7.295C4.672 5.169 6.656 3.58 9 3.58Z" fill="#EA4335"/>
  </svg>
);

const st = {
  root:      { minHeight: '100vh', background: '#F5F6F7', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", display: 'flex', flexDirection: 'column' },

  topBar:    { background: '#151719', height: 52, display: 'flex', alignItems: 'center', padding: '0 24px' },
  topLogo:   { color: '#fff', fontWeight: 600, fontSize: 15, letterSpacing: '-0.3px' },

  body:      { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },

  card:      { background: '#fff', border: '1px solid #D8DCE0', borderRadius: 8, padding: '40px 36px', maxWidth: 400, width: '100%', textAlign: 'center' },

  brandMark: { fontSize: 36, color: '#0077C5', marginBottom: 16 },

  heading:   { fontSize: 22, fontWeight: 600, color: '#1A2B3C', margin: '0 0 8px', letterSpacing: '-0.3px' },
  sub:       { fontSize: 14, color: '#6B7280', lineHeight: 1.6, margin: '0 0 28px' },

  googleBtn: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            10,
    width:          '100%',
    padding:        '11px 20px',
    background:     '#fff',
    border:         '1px solid #D0D7DE',
    borderRadius:   4,
    fontSize:       14,
    fontWeight:     600,
    color:          '#333',
    cursor:         'pointer',
    fontFamily:     'inherit',
    marginBottom:   16,
  },

  note:      { fontSize: 12, color: '#9CA3AF', lineHeight: 1.5, margin: 0 },
};
