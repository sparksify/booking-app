import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { guardDashboardPage } from '@/lib/pageAccess';
import { visibleNav } from '@/lib/nav';
import BrandLogo from '@/components/BrandLogo';
import SidebarUser from '@/components/SidebarUser';

export async function getServerSideProps(ctx) {
  const gate = await guardDashboardPage(ctx, '/dashboard/inbox');
  if (gate.redirect) return gate;
  return { props: { perms: gate.perms, platformLogo: gate.logo, navOrder: gate.navOrder } };
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function SideIcon({ name }) {
  const p = { width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', style: { display: 'block' } };
  if (name === 'dashboard') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === 'ads')       return <svg {...p}><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>;
  if (name === 'leads')     return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  if (name === 'clients')   return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === 'meetings')  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (name === 'inbox')     return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/></svg>;
  if (name === 'cq')        return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
  if (name === 'nurture')   return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
  if (name === 'pipeline')  return <svg {...p}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="20" cy="14" r="2"/></svg>;
  if (name === 'settings')  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
  return null;
}

function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}
function timeAgo(ms) {
  if (!ms) return '';
  const d = typeof ms === 'number' ? ms : Date.parse(ms);
  if (!d) return '';
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Inbox({ perms = {}, platformLogo = null, navOrder = null }) {
  const [convos, setConvos]   = useState(null);   // null = loading
  const [scoped, setScoped]   = useState(true);
  const [active, setActive]   = useState(null);   // selected conversation
  const [thread, setThread]   = useState(null);   // null = loading
  const [reply, setReply]     = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote]       = useState('');
  const bottomRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/dashboard/inbox');
      const d = await r.json();
      setConvos(d.conversations || []);
      setScoped(d.scopedToUser !== false);
    } catch { setConvos([]); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const openConvo = useCallback(async (c) => {
    setActive(c); setThread(null); setReply(''); setNote('');
    try {
      const r = await fetch(`/api/dashboard/ghl-conversation?contactId=${encodeURIComponent(c.contactId)}`);
      const d = await r.json();
      setThread(d.messages || []);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 60);
    } catch { setThread([]); }
  }, []);

  async function sendReply() {
    if (!reply.trim() || !active) return;
    setSending(true); setNote('');
    try {
      const r = await fetch('/api/dashboard/send-sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: active.contactId, phone: active.phone, message: reply.trim() }),
      });
      const d = await r.json();
      if (d.ok) {
        // Optimistically append to the thread and drop the convo from the list
        // (it no longer "needs a reply").
        setThread(t => [...(t || []), { id: `local_${Date.now()}`, direction: 'outbound', body: reply.trim(), type: 'SMS', date: Date.now() }]);
        setReply('');
        setConvos(list => (list || []).filter(x => x.id !== active.id));
        setNote('Sent ✓');
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      } else if (d.fallback && d.smsLink) {
        window.location.href = d.smsLink;
      } else {
        setNote(d.error || 'Could not send. Try again.');
      }
    } catch {
      setNote('Could not send. Try again.');
    } finally {
      setSending(false);
    }
  }

  const list = convos || [];

  return (
    <>
      <Head><title>Inbox — KANSO</title></Head>
      <div style={s.page}>
        {/* Sidebar */}
        <aside style={s.sidebar}>
          <div style={s.sideLogoWrap}><BrandLogo logo={platformLogo} /></div>
          <nav style={s.sideNav}>
            {visibleNav(perms, navOrder).map(({ href, label, icon }) => {
              const active2 = href === '/dashboard/inbox';
              return (
                <Link key={label} href={href} style={{ ...s.sideNavItem, ...(active2 ? s.sideNavItemActive : {}) }}>
                  <span style={{ color: active2 ? '#0057FF' : '#9CA3AF', display: 'flex', alignItems: 'center' }}><SideIcon name={icon} /></span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
          <div style={s.sideBottom}><SidebarUser /></div>
        </aside>

        {/* Main */}
        <main style={s.main}>
          <div style={s.topbar}>
            <div>
              <div style={s.topTitle}>Inbox {list.length > 0 && <span style={s.countPill}>{list.length}</span>}</div>
              <div style={s.topSub}>Prospects who messaged you and are waiting on a reply.{!scoped && ' (showing all — your GHL user isn’t linked yet)'}</div>
            </div>
            <button style={s.toolBtn} onClick={load}>↻ Refresh</button>
          </div>

          <div style={s.body}>
            {/* Conversation list */}
            <div style={s.listPane}>
              {convos === null ? (
                <div style={s.empty}>Loading…</div>
              ) : list.length === 0 ? (
                <div style={s.empty}>
                  <div style={{ fontSize: 34, marginBottom: 8 }}>✅</div>
                  You're all caught up — no unread messages.
                </div>
              ) : list.map(c => {
                const on = active?.id === c.id;
                return (
                  <button key={c.id} onClick={() => openConvo(c)} style={{ ...s.row, ...(on ? s.rowOn : {}) }}>
                    <div style={s.avatar}>{initials(c.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={s.rowName}>{c.name}</span>
                        <span style={s.rowTime}>{timeAgo(c.lastDate)}</span>
                      </div>
                      <div style={s.rowMsg}>{c.lastMessage || '(no preview)'}</div>
                    </div>
                    {c.unreadCount > 0 && <span style={s.unread}>{c.unreadCount}</span>}
                  </button>
                );
              })}
            </div>

            {/* Thread + reply */}
            <div style={s.threadPane}>
              {!active ? (
                <div style={s.threadEmpty}>Select a message to read and reply.</div>
              ) : (
                <>
                  <div style={s.threadHead}>
                    <div style={s.avatar}>{initials(active.name)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>{active.name}</div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>{active.phone || active.email || ''}</div>
                    </div>
                  </div>

                  <div style={s.threadScroll}>
                    {thread === null ? (
                      <div style={s.empty}>Loading conversation…</div>
                    ) : thread.length === 0 ? (
                      <div style={s.empty}>No earlier messages.</div>
                    ) : thread.map(m => {
                      const out = String(m.direction).toLowerCase() === 'outbound';
                      return (
                        <div key={m.id} style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                          <div style={{ ...s.bubble, ...(out ? s.bubbleOut : s.bubbleIn) }}>
                            {m.body || '(no text)'}
                            <div style={{ ...s.bubbleTime, color: out ? 'rgba(255,255,255,.75)' : '#94A3B8' }}>{timeAgo(m.date)}</div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>

                  <div style={s.replyBar}>
                    <textarea
                      style={s.replyInput}
                      rows={2}
                      placeholder="Type your reply…"
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply(); }}
                    />
                    <button style={{ ...s.sendBtn, opacity: reply.trim() && !sending ? 1 : 0.5 }} disabled={!reply.trim() || sending} onClick={sendReply}>
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                  {note && <div style={{ fontSize: 12, color: note.includes('✓') ? '#16A34A' : '#DC2626', padding: '0 16px 10px' }}>{note}</div>}
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

const s = {
  page: { display: 'flex', height: '100vh', overflow: 'hidden', background: '#F4F5F7', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },
  sidebar: { width: 210, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column' },
  sideLogoWrap: { padding: '18px 18px 10px' },
  sideNav: { flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' },
  sideNavItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 7, fontSize: 13, fontWeight: 500, color: '#475569', textDecoration: 'none' },
  sideNavItemActive: { background: '#EFF6FF', color: '#0057FF', fontWeight: 600 },
  sideBottom: { padding: 12, borderTop: '1px solid #F1F5F9' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  topbar: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', background: '#fff', borderBottom: '1px solid #E2E8F0' },
  topTitle: { fontSize: 20, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 },
  countPill: { fontSize: 12, fontWeight: 700, color: '#fff', background: '#0057FF', borderRadius: 20, padding: '1px 9px' },
  topSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  toolBtn: { border: '1px solid #E2E8F0', background: '#fff', borderRadius: 8, padding: '7px 12px', fontSize: 13, color: '#475569', cursor: 'pointer', fontFamily: 'inherit' },
  body: { flex: 1, minHeight: 0, display: 'flex' },
  listPane: { width: 340, flexShrink: 0, borderRight: '1px solid #E2E8F0', overflowY: 'auto', background: '#fff' },
  empty: { padding: '40px 24px', textAlign: 'center', color: '#94A3B8', fontSize: 14 },
  row: { display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '13px 16px', border: 'none', borderBottom: '1px solid #F1F5F9', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' },
  rowOn: { background: '#EFF6FF' },
  avatar: { width: 38, height: 38, borderRadius: '50%', background: '#E0E7FF', color: '#3730A3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  rowName: { fontSize: 14, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowTime: { fontSize: 11, color: '#94A3B8', flexShrink: 0 },
  rowMsg: { fontSize: 13, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 },
  unread: { background: '#0057FF', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 20, minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', flexShrink: 0 },
  threadPane: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#F8FAFC' },
  threadEmpty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 14 },
  threadHead: { display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px', background: '#fff', borderBottom: '1px solid #E2E8F0' },
  threadScroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px' },
  bubble: { maxWidth: '76%', padding: '9px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  bubbleIn: { background: '#fff', border: '1px solid #E2E8F0', color: '#0F172A', borderBottomLeftRadius: 4 },
  bubbleOut: { background: '#0057FF', color: '#fff', borderBottomRightRadius: 4 },
  bubbleTime: { fontSize: 10, marginTop: 4 },
  replyBar: { display: 'flex', gap: 8, padding: '12px 16px', background: '#fff', borderTop: '1px solid #E2E8F0', alignItems: 'flex-end' },
  replyInput: { flex: 1, resize: 'none', border: '1px solid #CBD5E1', borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: '#0F172A' },
  sendBtn: { background: '#0057FF', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
};
