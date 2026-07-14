import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { guardDashboardPage } from '@/lib/pageAccess';
import { visibleNav } from '@/lib/nav';
import BrandLogo from '@/components/BrandLogo';
import SidebarUser from '@/components/SidebarUser';
import { AD_STYLES } from '@/lib/adStyles';

// ─── Server-side auth ─────────────────────────────────────────────────────────

export async function getServerSideProps(context) {
  const gate = await guardDashboardPage(context, '/dashboard/ads');
  if (gate.redirect) return gate;
  const { session, perms } = gate;
  return { props: { session, perms, platformLogo: gate.logo, navOrder: gate.navOrder } };
}

// ─── Sidebar icon set ─────────────────────────────────────────────────────────

function SideIcon({ name }) {
  const p = { width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', style: { display: 'block' } };
  if (name === 'dashboard') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === 'ads')       return <svg {...p}><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>;
  if (name === 'leads')     return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  if (name === 'clients')   return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === 'meetings')  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (name === 'nurture')   return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
  if (name === 'settings')  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
  if (name === 'cq')        return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9.5 13.5a2 2 0 1 1 2.5 1.9c-.4.15-.5.4-.5.8"/><line x1="11.5" y1="18" x2="11.51" y2="18"/></svg>;
  return null;
}

const CTA_LABELS = { LEARN_MORE: 'Learn More', SIGN_UP: 'Sign Up', APPLY_NOW: 'Apply Now', GET_QUOTE: 'Get Quote', CONTACT_US: 'Contact Us' };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdStudio({ perms = {}, platformLogo = null, navOrder = null }) {
  const { data: session } = useSession();
  const [tab, setTab] = useState('generate');

  // Docs
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState('');
  const [openSummary, setOpenSummary] = useState(null);

  async function resummarize(id) {
    const r = await fetch('/api/ad-studio/docs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'summarize', id }),
    });
    const d = await r.json();
    if (d.error) alert(d.error);
    loadDocs();
  }

  // Library
  const [libraryAds, setLibraryAds] = useState([]);
  const [scrapeTerms, setScrapeTerms] = useState('franchise opportunity');
  const [scraping, setScraping] = useState(false);
  const [libMsg, setLibMsg] = useState('');

  // Brief / generate
  const [form, setForm] = useState({ name: '', brand: '', objective: '', offer: '', audience: '', brief: '' });
  const [styles, setStyles] = useState(['hormozi', 'brunson', 'schwartz']);
  const [variantsPerStyle, setVariantsPerStyle] = useState(3);
  const [selDocs, setSelDocs] = useState([]);
  const [selAds, setSelAds] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [generations, setGenerations] = useState([]);
  const [imgBusy, setImgBusy] = useState({});
  const [pubBusy, setPubBusy] = useState({});

  useEffect(() => { loadDocs(); loadLibrary(); }, []);

  function loadDocs() { fetch('/api/ad-studio/docs').then(r => r.json()).then(d => setDocs(d.docs || [])); }
  function loadLibrary() { fetch('/api/ad-studio/library').then(r => r.json()).then(d => setLibraryAds(d.ads || [])); }

  // Uploads run one-by-one; each PDF is text-extracted and AI-summarized into
  // stored brand knowledge. autoSelect wires new docs straight into the brief.
  async function uploadFiles(files, { autoSelect = false } = {}) {
    setUploading(true);
    setUploadNote(`Uploading & summarizing ${files.length} document${files.length > 1 ? 's' : ''}… (this reads each doc with AI, ~15s per file)`);
    const newIds = [];
    for (const file of files) {
      const b64 = await new Promise((resolve) => {
        const rd = new FileReader();
        rd.onload = () => resolve(rd.result.split(',')[1]);
        rd.readAsDataURL(file);
      });
      const r = await fetch('/api/ad-studio/docs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mimeType: file.type || 'application/octet-stream', contentBase64: b64, brand: form.brand || null }),
      });
      const d = await r.json();
      if (d.error) { setUploadNote(`⚠️ ${file.name}: ${d.error}`); setUploading(false); loadDocs(); return; }
      if (d.doc?.id) newIds.push(d.doc.id);
    }
    setUploading(false);
    setUploadNote(`✓ ${newIds.length} document${newIds.length > 1 ? 's' : ''} saved to brand knowledge`);
    if (autoSelect) setSelDocs(sd => [...new Set([...sd, ...newIds])]);
    loadDocs();
  }

  async function deleteDoc(id) {
    await fetch(`/api/ad-studio/docs?id=${id}`, { method: 'DELETE' });
    setSelDocs(sd => sd.filter(x => x !== id));
    loadDocs();
  }

  async function runScrape() {
    setScraping(true); setLibMsg('');
    const r = await fetch('/api/ad-studio/library', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'scrape', searchTerms: scrapeTerms, limit: 25 }),
    });
    const d = await r.json();
    setScraping(false);
    setLibMsg(d.error ? `⚠️ ${d.error}` : `Imported ${d.imported} new ads`);
    loadLibrary();
  }

  async function toggleStar(ad) {
    await fetch('/api/ad-studio/library', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'star', id: ad.id, starred: !ad.starred }),
    });
    loadLibrary();
  }

  async function runGenerate() {
    setGenerating(true); setGenError('');
    try {
      const r = await fetch('/api/ad-studio/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, styles, variantsPerStyle, docIds: selDocs, libraryIds: selAds }),
      });
      const d = await r.json();
      if (d.error) { setGenError(d.error); }
      else {
        setGenerations(d.generations || []);
        if (d.failures?.length) setGenError(`Some styles failed: ${d.failures.join('; ')}`);
      }
    } catch (e) { setGenError(e.message); }
    setGenerating(false);
  }

  async function makeImage(gen) {
    setImgBusy(b => ({ ...b, [gen.id]: true }));
    const r = await fetch('/api/ad-studio/images', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId: gen.id }),
    });
    const d = await r.json();
    setImgBusy(b => ({ ...b, [gen.id]: false }));
    if (d.error) { alert(d.error); return; }
    setGenerations(gs => gs.map(g => g.id === gen.id ? { ...g, image_url: d.imageUrl } : g));
  }

  async function publishAd(gen) {
    const leadFormId = window.prompt('Meta Lead Form ID to attach to this ad:');
    if (!leadFormId) return;
    setPubBusy(b => ({ ...b, [gen.id]: true }));
    const r = await fetch('/api/ad-studio/publish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId: gen.id, leadFormId }),
    });
    const d = await r.json();
    setPubBusy(b => ({ ...b, [gen.id]: false }));
    if (d.error) { alert(d.error); return; }
    setGenerations(gs => gs.map(g => g.id === gen.id ? { ...g, status: 'published', fb_ad_id: d.adId } : g));
    alert(`Published (PAUSED) to Meta.\nCampaign: ${d.campaignId}\nAd: ${d.adId}\nReview & activate in Ads Manager.`);
  }

  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  return (
    <>
      <Head><title>Ad Studio — KANSO</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}`}</style>
      <div style={s.page}>

        <aside style={s.sidebar}>
          <div style={s.sideLogoWrap}><div style={s.sideLogoRow}><BrandLogo logo={platformLogo} /></div></div>
          <nav style={s.sideNav}>
            {visibleNav(perms, navOrder).map(({ href, label, icon }) => {
              const active = href === '/dashboard/ads';
              return (
                <Link key={label} href={href} style={{ ...s.sideNavItem, ...(active ? s.sideNavItemActive : {}) }}>
                  <span style={{ color: active ? '#0057FF' : '#9CA3AF', display: 'flex', alignItems: 'center' }}><SideIcon name={icon} /></span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
          <div style={s.sideBottom}><SidebarUser /></div>
        </aside>

        <div style={s.mainCol}>
          <div style={s.topBar}>
            <div>
              <div style={s.topTitle}>Ad Studio</div>
              <div style={s.topDate}>Brief → AI copy in legendary styles → images → publish to Meta</div>
            </div>
            <div style={s.tabRow}>
              {[['generate', 'Generate'], ['library', `Ad Library (${libraryAds.length})`], ['docs', `Reference Docs (${docs.length})`]].map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} style={{ ...s.tabBtn, ...(tab === k ? s.tabBtnActive : {}) }}>{label}</button>
              ))}
            </div>
          </div>

          <div style={s.main}>

            {/* ── GENERATE TAB ─────────────────────────────────────────── */}
            {tab === 'generate' && (
              <>
                <div style={s.card}>
                  <div style={s.cardTitle}>Campaign Brief</div>
                  <div style={s.cardSub}>Tell the studio what you&apos;re promoting and what you want from the campaign.</div>
                  <div style={s.formGrid}>
                    <input style={s.input} placeholder="Brief name (e.g. Q3 Franchise Push)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    <input style={s.input} placeholder="Brand" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
                    <input style={s.input} placeholder="Objective / goals (e.g. 50 qualified leads @ <$40)" value={form.objective} onChange={e => setForm(f => ({ ...f, objective: e.target.value }))} />
                    <input style={s.input} placeholder="Offer (what are we promoting?)" value={form.offer} onChange={e => setForm(f => ({ ...f, offer: e.target.value }))} />
                    <input style={{ ...s.input, gridColumn: '1 / -1' }} placeholder="Target audience" value={form.audience} onChange={e => setForm(f => ({ ...f, audience: e.target.value }))} />
                    <textarea style={{ ...s.input, gridColumn: '1 / -1', minHeight: 90, resize: 'vertical' }} placeholder="Full brief — anything else the copywriter should know..." value={form.brief} onChange={e => setForm(f => ({ ...f, brief: e.target.value }))} />
                  </div>

                  <div style={s.secLabel}>Copywriting styles</div>
                  <div style={s.styleGrid}>
                    {Object.values(AD_STYLES).map(st => {
                      const on = styles.includes(st.key);
                      return (
                        <div key={st.key} onClick={() => toggle(styles, setStyles, st.key)}
                          style={{ ...s.styleCard, borderColor: on ? st.color : '#E2E8F0', background: on ? `${st.color}12` : '#fff' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>{on ? '✓ ' : ''}{st.label}</div>
                          <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>{st.tagline}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={s.secLabel}>Reference documents</div>
                  <div style={s.uploadZone}>
                    <label style={{ ...s.smallBtn, cursor: uploading ? 'wait' : 'pointer', display: 'inline-block' }}>
                      {uploading ? 'Processing…' : '＋ Upload PDFs / docs'}
                      <input type="file" multiple accept=".pdf,.txt,.md,.csv,application/pdf,text/plain,text/markdown" style={{ display: 'none' }} disabled={uploading}
                        onChange={e => { if (e.target.files?.length) uploadFiles([...e.target.files], { autoSelect: true }); e.target.value = ''; }} />
                    </label>
                    <span style={{ fontSize: 11.5, color: '#64748B' }}>
                      Each doc is read, AI-summarized, and saved to this brand&apos;s knowledge base for future campaigns. Selected docs feed this generation:
                    </span>
                    {uploadNote && <div style={{ fontSize: 12, color: uploadNote.startsWith('⚠️') ? '#EF4444' : '#059669', width: '100%' }}>{uploadNote}</div>}
                    <div style={{ width: '100%' }}>
                      {docs.map(d => (
                        <span key={d.id} onClick={() => toggle(selDocs, setSelDocs, d.id)} title={d.brand ? `Brand: ${d.brand}` : ''}
                          style={{ ...s.chip, background: selDocs.includes(d.id) ? '#EFF6FF' : '#F1F5F9', borderColor: selDocs.includes(d.id) ? '#0057FF' : '#E2E8F0', color: selDocs.includes(d.id) ? '#0057FF' : '#475569' }}>
                          {selDocs.includes(d.id) ? '✓ ' : ''}{d.filename}
                          {d.summary_status === 'ready' && ' 🧠'}
                        </span>
                      ))}
                      {!docs.length && <span style={{ fontSize: 11.5, color: '#94A3B8' }}>No documents yet.</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                      Variants per style{' '}
                      <select value={variantsPerStyle} onChange={e => setVariantsPerStyle(e.target.value)} style={{ ...s.input, width: 64, padding: '6px 8px', marginLeft: 6 }}>
                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    {libraryAds.filter(a => a.starred).length > 0 && (
                      <div style={{ fontSize: 12, color: '#475569' }}>
                        <b>Inspiration (starred ads):</b>{' '}
                        {libraryAds.filter(a => a.starred).map(a => (
                          <span key={a.id} onClick={() => toggle(selAds, setSelAds, a.id)}
                            style={{ ...s.chip, background: selAds.includes(a.id) ? '#FEF3C7' : '#F1F5F9', borderColor: selAds.includes(a.id) ? '#F59E0B' : '#E2E8F0' }}>
                            ★ {a.advertiser || a.headline || 'Ad'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <button onClick={runGenerate} disabled={generating || !styles.length} style={{ ...s.primaryBtn, marginTop: 16, opacity: generating || !styles.length ? 0.6 : 1 }}>
                    {generating ? 'Generating…' : `Generate ${styles.length * variantsPerStyle} Ads`}
                  </button>
                  {genError && <div style={{ marginTop: 10, fontSize: 12, color: '#EF4444' }}>{genError}</div>}
                </div>

                {generating && (
                  <div style={s.loadingWrap}><div style={s.spinner} /><div style={s.loadingText}>Writing ads in {styles.length} style{styles.length > 1 ? 's' : ''}…</div></div>
                )}

                {generations.length > 0 && (
                  <>
                    <div style={s.secTitle}>Generated Ads ({generations.length})</div>
                    <div style={s.adGrid}>
                      {generations.map(g => {
                        const st = AD_STYLES[g.style] || {};
                        return (
                          <div key={g.id} style={s.adCard}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ ...s.styleBadge, background: `${st.color}18`, color: st.color }}>{st.label || g.style}</span>
                              {g.status === 'published' && <span style={{ ...s.styleBadge, background: '#D1FAE5', color: '#059669' }}>Published</span>}
                            </div>
                            {g.image_url
                              ? <img src={g.image_url} alt="" style={{ width: '100%', borderRadius: 8, margin: '10px 0' }} />
                              : <div style={s.imgPlaceholder}>
                                  <button onClick={() => makeImage(g)} disabled={imgBusy[g.id]} style={s.smallBtn}>
                                    {imgBusy[g.id] ? 'Creating image…' : '🎨 Generate Image'}
                                  </button>
                                </div>}
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>{g.headline}</div>
                            <div style={{ fontSize: 12.5, color: '#334155', whiteSpace: 'pre-wrap', margin: '8px 0', lineHeight: 1.5 }}>{g.primary_text}</div>
                            <div style={{ fontSize: 11, color: '#64748B' }}>{g.description} · <b>{CTA_LABELS[g.cta] || g.cta}</b></div>
                            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6, borderTop: '1px solid #F1F5F9', paddingTop: 6 }}>
                              <b>Lead form:</b> {g.lead_form_subject}<br />{g.lead_form_greeting}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                              {g.image_url && <button onClick={() => makeImage(g)} disabled={imgBusy[g.id]} style={s.smallBtn}>{imgBusy[g.id] ? '…' : '↻ Re-image'}</button>}
                              <button onClick={() => publishAd(g)} disabled={pubBusy[g.id] || g.status === 'published'} style={{ ...s.smallBtn, background: '#0057FF', color: '#fff', border: 'none' }}>
                                {pubBusy[g.id] ? 'Publishing…' : g.status === 'published' ? '✓ On Meta' : '🚀 Publish to Meta'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── LIBRARY TAB ──────────────────────────────────────────── */}
            {tab === 'library' && (
              <>
                <div style={s.card}>
                  <div style={s.cardTitle}>Scrape Meta Ad Library</div>
                  <div style={s.cardSub}>Pull active ads running right now in the franchise space. Star the good ones to use as inspiration when generating.</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <input style={{ ...s.input, flex: 1 }} value={scrapeTerms} onChange={e => setScrapeTerms(e.target.value)} placeholder="Search terms (e.g. franchise opportunity)" />
                    <button onClick={runScrape} disabled={scraping} style={s.primaryBtn}>{scraping ? 'Scraping…' : 'Scrape Active Ads'}</button>
                  </div>
                  {libMsg && <div style={{ marginTop: 8, fontSize: 12, color: libMsg.startsWith('⚠️') ? '#EF4444' : '#059669' }}>{libMsg}</div>}
                </div>
                <div style={s.adGrid}>
                  {libraryAds.map(a => (
                    <div key={a.id} style={s.adCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>{a.advertiser || 'Unknown advertiser'}</div>
                        <button onClick={() => toggleStar(a)} style={{ ...s.starBtn, color: a.starred ? '#F59E0B' : '#CBD5E1' }}>★</button>
                      </div>
                      {a.headline && <div style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', marginTop: 6 }}>{a.headline}</div>}
                      <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'pre-wrap', marginTop: 6, lineHeight: 1.5, maxHeight: 140, overflow: 'auto' }}>{a.body || '—'}</div>
                      {a.snapshot_url && <a href={a.snapshot_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#0057FF', marginTop: 8, display: 'inline-block' }}>View in Ad Library ↗</a>}
                    </div>
                  ))}
                  {!libraryAds.length && <div style={s.empty}>No ads in the library yet — run a scrape above.</div>}
                </div>
              </>
            )}

            {/* ── DOCS TAB ─────────────────────────────────────────────── */}
            {tab === 'docs' && (
              <div style={s.card}>
                <div style={s.cardTitle}>Reference Documents</div>
                <div style={s.cardSub}>Upload brand guides, offer docs, or past winning copy — PDFs and text files are read, AI-summarized, and stored as reusable brand knowledge.</div>
                <label style={{ ...s.primaryBtn, display: 'inline-block', marginTop: 12, cursor: 'pointer' }}>
                  {uploading ? 'Uploading…' : '＋ Upload Documents'}
                  <input type="file" multiple style={{ display: 'none' }} disabled={uploading}
                    onChange={e => { if (e.target.files?.length) uploadFiles([...e.target.files]); e.target.value = ''; }} />
                </label>
                <div style={{ marginTop: 16 }}>
                  {docs.map(d => (
                    <div key={d.id} style={{ borderBottom: '1px solid #F1F5F9', padding: '10px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>
                            {d.filename}
                            {d.brand && <span style={{ ...s.chip, cursor: 'default', marginLeft: 8 }}>{d.brand}</span>}
                          </div>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>
                            {new Date(d.created_at).toLocaleDateString()} ·{' '}
                            {d.summary_status === 'ready' ? '🧠 brand knowledge saved'
                              : d.summary_status === 'failed' ? '⚠️ summary failed'
                              : d.extracted_text ? `${d.extracted_text.length.toLocaleString()} chars readable by AI`
                              : 'stored (not text-readable)'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {d.ai_summary && (
                            <button onClick={() => setOpenSummary(o => o === d.id ? null : d.id)} style={s.smallBtn}>
                              {openSummary === d.id ? 'Hide summary' : 'View summary'}
                            </button>
                          )}
                          {d.summary_status === 'failed' && (
                            <button onClick={() => resummarize(d.id)} style={s.smallBtn}>↻ Retry summary</button>
                          )}
                          <button onClick={() => deleteDoc(d.id)} style={{ ...s.smallBtn, color: '#EF4444' }}>Delete</button>
                        </div>
                      </div>
                      {openSummary === d.id && d.ai_summary && <div style={s.summaryBox}>{d.ai_summary}</div>}
                    </div>
                  ))}
                  {!docs.length && <div style={s.empty}>No documents uploaded yet.</div>}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page:        { display: 'flex', minHeight: '100vh', background: '#FAFBFD', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },
  sidebar:          { width: 210, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' },
  sideLogoWrap:     { padding: '20px 16px 16px', borderBottom: '1px solid #E2E8F0' },
  sideLogoRow:      { display: 'flex', alignItems: 'center', gap: 9 },
  sideNav:          { flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' },
  sideNavItem:      { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 7, fontSize: 13, fontWeight: 500, color: '#475569', textDecoration: 'none', transition: 'all .15s' },
  sideNavItemActive:{ background: '#EFF6FF', color: '#0057FF', fontWeight: 600 },
  sideBottom:       { borderTop: '1px solid #E2E8F0', padding: '8px 8px 16px' },
  mainCol:   { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  topBar:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', flexShrink: 0, gap: 16 },
  topTitle:  { fontSize: 20, fontWeight: 700, color: '#0F172A' },
  topDate:   { fontSize: 13, color: '#64748B', fontWeight: 400, marginTop: 2 },
  main:      { flex: 1, padding: '20px 24px', overflowY: 'auto' },

  tabRow:    { display: 'flex', gap: 6 },
  tabBtn:    { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6, border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' },
  tabBtnActive: { background: '#0057FF', color: '#fff', borderColor: '#0057FF', fontWeight: 600 },

  card:      { background: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', padding: '18px 20px', boxShadow: '0 1px 3px rgba(15,23,42,.04)', marginBottom: 16 },
  cardTitle: { fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 2 },
  cardSub:   { fontSize: 12, color: '#64748B', lineHeight: 1.5 },
  secTitle:  { fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 20, marginBottom: 10 },
  secLabel:  { fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },

  formGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 },
  input:     { padding: '9px 12px', fontSize: 13, borderRadius: 7, border: '1px solid #E2E8F0', fontFamily: 'inherit', color: '#0F172A', background: '#fff', outline: 'none' },
  styleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 },
  styleCard: { border: '2px solid #E2E8F0', borderRadius: 9, padding: '12px 14px', cursor: 'pointer', transition: 'all .15s' },
  chip:      { display: 'inline-block', padding: '3px 9px', borderRadius: 99, border: '1px solid #E2E8F0', margin: '2px 3px', cursor: 'pointer', fontSize: 11.5 },

  primaryBtn:{ padding: '10px 20px', fontSize: 13, fontWeight: 600, borderRadius: 7, border: 'none', background: '#0057FF', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' },
  smallBtn:  { padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 6, border: '1px solid #E2E8F0', background: '#fff', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' },
  starBtn:   { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', lineHeight: 1 },

  adGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 },
  adCard:    { background: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', padding: '14px 16px', boxShadow: '0 1px 3px rgba(15,23,42,.04)' },
  styleBadge:{ display: 'inline-block', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 },
  imgPlaceholder: { background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 8, margin: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 },
  docRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F1F5F9' },
  uploadZone:{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 8, padding: '12px 14px' },
  summaryBox:{ fontSize: 12, color: '#334155', background: '#F8FAFC', borderRadius: 7, padding: '10px 12px', marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.5, maxHeight: 300, overflow: 'auto' },

  empty:       { padding: 24, color: '#9CA3AF', fontSize: 12, textAlign: 'center', gridColumn: '1 / -1' },
  loadingWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, gap: 16 },
  spinner:     { width: 28, height: 28, borderRadius: '50%', border: '2px solid #E2E8F0', borderTopColor: '#0057FF', animation: 'spin 0.8s linear infinite' },
  loadingText: { color: '#6B7280', fontSize: 13 },
};
