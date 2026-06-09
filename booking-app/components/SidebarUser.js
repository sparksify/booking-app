import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';

/**
 * Sidebar user chip with a click-to-open popover containing Log out.
 * Self-contained (reads the session itself) so it can drop into every page's
 * sidebar bottom.
 */
export default function SidebarUser({ avatarUrl = null }) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const email   = session?.user?.email || '';
  const name    = session?.user?.name || email.split('@')[0] || 'User';
  const initial = (email[0] || 'U').toUpperCase();

  return (
    <div ref={ref} style={{ position: 'relative', marginTop: 2 }}>
      {open && (
        <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, background: '#fff', border: '1px solid #E5E8EC', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,.14)', padding: 6, zIndex: 60 }}>
          <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid #F1F3F5', marginBottom: 4 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ fontSize: 11, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/dashboard/login' })}
            style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 10px', fontSize: 13, fontWeight: 500, color: '#B91C1C', background: 'transparent', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Log out
          </button>
        </div>
      )}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px', borderRadius: 7, cursor: 'pointer', background: open ? '#F1F5F9' : 'transparent' }}
      >
        {avatarUrl
          ? <img src={avatarUrl} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          : <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#0057FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initial}</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
        </div>
        <span style={{ color: '#9CA3AF', fontSize: 14 }}>›</span>
      </div>
    </div>
  );
}
