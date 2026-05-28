import { signIn } from 'next-auth/react';
import Head from 'next/head';

export default function Login() {
  return (
    <>
      <Head><title>Dashboard Login</title></Head>
      <div style={styles.root}>
        <div style={styles.card}>
          <div style={styles.logo}>
            <span style={styles.logoText}>{process.env.NEXT_PUBLIC_HOST_NAME || 'Booking App'}</span>
          </div>
          <h1 style={styles.heading}>Dashboard Login</h1>
          <p style={styles.sub}>
            Sign in with your Google account to access the operator dashboard
            and connect your calendar.
          </p>
          <button
            style={styles.btn}
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
          >
            <GoogleIcon />
            Sign in with Google
          </button>
          <p style={styles.note}>
            Each team member signs in here to connect their own Google Calendar.
          </p>
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

const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F9FAFB',
    padding: '24px',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  card: {
    background: '#fff',
    border: '1px solid #E5E7EB',
    borderRadius: '16px',
    padding: '40px 36px',
    maxWidth: '400px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
  },
  logo: {
    marginBottom: '24px',
  },
  logoText: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: '.06em',
  },
  heading: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#111827',
    marginBottom: '8px',
    letterSpacing: '-.02em',
  },
  sub: {
    fontSize: '14px',
    color: '#6B7280',
    lineHeight: '1.6',
    marginBottom: '28px',
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    padding: '13px 20px',
    background: '#fff',
    border: '1.5px solid #D1D5DB',
    borderRadius: '9px',
    fontSize: '15px',
    fontWeight: '600',
    color: '#111827',
    cursor: 'pointer',
    fontFamily: "'Inter', system-ui, sans-serif",
    transition: 'all .15s',
    marginBottom: '16px',
  },
  note: {
    fontSize: '12px',
    color: '#9CA3AF',
    lineHeight: '1.5',
  },
};
