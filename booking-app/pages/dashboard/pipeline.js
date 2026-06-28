import { useState } from 'react';
import { useSession } from 'next-auth/react';
import Head from 'next/head';
import Link from 'next/link';
import { guardDashboardPage } from '@/lib/pageAccess';
import { visibleNav } from '@/lib/nav';
import BrandLogo from '@/components/BrandLogo';
import SidebarUser from '@/components/SidebarUser';

export async function getServerSideProps(context) {
  const gate = await guardDashboardPage(context, '/dashboard/pipeline');
  if (gate.redirect) return gate;
  return { props: { session: gate.session, perms: gate.perms, platformLogo: gate.logo, navOrder: gate.navOrder } };
}

const CITIES = [
  'Dallas, TX','Houston, TX','Austin, TX','San Antonio, TX',
  'Phoenix, AZ','Scottsdale, AZ','Denver, CO','Nashville, TN',
  'Charlotte, NC','Atlanta, GA','Tampa, FL','Orlando, FL',
  'Miami, FL','Chicago, IL','Las Vegas, NV','Salt Lake City, UT',
  'Raleigh, NC','Columbus, OH','Minneapolis, MN','Portland, OR',
];

const INDUSTRIES = [
  'Food & Beverage','Health & Wellness','Fitness',
  'Beauty & Personal Care','Pet Services','Auto Services',
  'Home Services',"Children's Education",'Senior Care',
  'Cleaning Services','Real Estate Services','Marketing & Media',
];

function SideIcon({ name }) {
  const p = { width:17, height:17, fill:'none', stroke:'currentColor', strokeWidth:1.75, strokeLinecap:'round', strokeLinejoin:'round', viewBox:'0 0 24 24', style:{display:'block'} };
  if (name==='dashboard') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name==='leads')     return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  if (name==='clients')   return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name==='meetings')  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (name==='nurture')   return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
  if (name==='settings')  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
  if (name==='cq')        return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9.5 13.5a2 2 0 1 1 2.5 1.9c-.4.15-.5.4-.5.8"/><line x1="11.5" y1="18" x2="11.51" y2="18"/></svg>;
  if (name==='pipeline')  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>;
  return null;
}

function ScoreBadge({ score, label }) {
  const pct = score / 10;
  const color = pct>=0.7 ? '#15803D' : pct>=0.5 ? '#B45309' : '#DC2626';
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
      <div style={{fontSize:18,fontWeight:800,color,lineHeight:1}}>{score}</div>
      <div style={{fontSize:9,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div>
    </div>
  );
}

export default function PipelinePage({ perms={}, platformLogo=null, navOrder=null }) {
  const { data: session } = useSession();
  const [city, setCity]         = useState('Dallas, TX');
  const [industry, setIndustry] = useState('Food & Beverage');
  const [running, setRunning]   = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError]       = useState(null);
  const [scoutResults, setScoutResults]   = useState(null);
  const [enrichResults, setEnrichResults] = useState(null);
  const [outreachResults, setOutreachResults] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedId, setExpandedId]   = useState(null);
  const [currentStep, setCurrentStep] = useState(0);

  async function runScout() {
    setRunning(true); setError(null); setCurrentStep(1);
    setScoutResults(null); setEnrichResults(null); setOutreachResults(null); setSelectedIds(new Set());
    setStatusMsg(`Scouting ${city} — ${industry}…`);
    try {
      const res = await fetch('/api/pipeline/scout', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({city,industry}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scout failed');
      setScoutResults(data);
      setSelectedIds(new Set(data.businesses.map(b => b.id)));
      setCurrentStep(0);
    } catch(err) { setError(err.message); setCurrentStep(0); }
    setRunning(false); setStatusMsg('');
  }

  async function runEnrich() {
    const toEnrich = (scoutResults?.businesses||[]).filter(b => selectedIds.has(b.id));
    if (!toEnrich.length) return;
    setRunning(true); setError(null); setCurrentStep(2);
    setStatusMsg(`Enriching ${toEnrich.length} businesses…`);
    try {
      const res = await fetch('/api/pipeline/enrich', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({businesses:toEnrich}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enrichment failed');
      setEnrichResults(data);
      setCurrentStep(0);
    } catch(err) { setError(err.message); setCurrentStep(0); }
    setRunning(false); setStatusMsg('');
  }

  async function runOutreach() {
    const enriched = (enrichResults?.results||[]).filter(b => b.enriched);
    if (!enriched.length) return;
    setRunning(true); setError(null); setCurrentStep(3);
    setStatusMsg(`Writing sequences and loading ${enriched.length} contacts to Smartlead…`);
    try {
      const res = await fetch('/api/pipeline/outreach', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({businesses:enriched}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Outreach failed');
      setOutreachResults(data);
      setCurrentStep(0);
    } catch(err) { setError(err.message); setCurrentStep(0); }
    setRunning(false); setStatusMsg('');
  }

  function reset() {
    setScoutResults(null); setEnrichResults(null); setOutreachResults(null);
    setSelectedIds(new Set()); setCurrentStep(0); setError(null);
  }

  const businesses = scoutResults?.businesses || [];
  const enriched   = (enrichResults?.results||[]).filter(b => b.enriched);

  return (
    <>
      <Head><title>Scout Pipeline — KANSO</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}*{box-sizing:border-box}button:not(:disabled):hover{opacity:.85}select,button{font-family:inherit}`}</style>
      <div style={s.page}>
        <aside style={s.sidebar}>
          <div style={s.sideLogoWrap}><div style={s.sideLogoRow}><BrandLogo logo={platformLogo}/></div></div>
          <nav style={s.sideNav}>
            {visibleNav(perms,navOrder).map(({href,label,icon})=>{
              const active=href==='/dashboard/pipeline';
              return <Link key={label} href={href} style={{...s.sideNavItem,...(active?s.sideNavItemActive:{})}}><span style={{color:active?'#0057FF':'#9CA3AF',display:'flex',alignItems:'center'}}><SideIcon name={icon}/></span><span>{label}</span></Link>;
            })}
          </nav>
          <div style={s.sideBottom}><SidebarUser/></div>
        </aside>

        <div style={s.main}>
          <div style={s.topBar}>
            <div>
              <div style={s.topTitle}>Scout Pipeline</div>
              <div style={s.topSub}>Find franchise-ready businesses → enrich owners → load to Smartlead</div>
            </div>
            {outreachResults && <div style={{fontSize:13,fontWeight:700,color:'#15803D',background:'#DCFCE7',border:'1px solid #86EFAC',borderRadius:6,padding:'6px 14px'}}>✓ {outreachResults.loaded} contacts loaded to Smartlead</div>}
          </div>

          <div style={s.body}>
            {/* Control Panel */}
            <div style={s.card}>
              <div style={{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
                <div style={s.fieldGroup}>
                  <label style={s.fieldLabel}>City</label>
                  <select value={city} onChange={e=>setCity(e.target.value)} style={s.select} disabled={running}>
                    {CITIES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={s.fieldGroup}>
                  <label style={s.fieldLabel}>Industry</label>
                  <select value={industry} onChange={e=>setIndustry(e.target.value)} style={s.select} disabled={running}>
                    {INDUSTRIES.map(i=><option key={i}>{i}</option>)}
                  </select>
                </div>
                <button style={{...s.btn,...s.btnBlue,opacity:running?.5:1}} onClick={runScout} disabled={running}>
                  {currentStep===1?'⟳ Scouting…':'🔍 Run Scout'}
                </button>
              </div>

              <div style={{display:'flex',alignItems:'center',gap:8,marginTop:16,flexWrap:'wrap'}}>
                {[{n:1,label:'Scout'},{n:2,label:'Enrich'},{n:3,label:'Load to Smartlead'}].map(({n,label},i)=>{
                  const done = (n===1&&!!scoutResults)||(n===2&&!!enrichResults)||(n===3&&!!outreachResults);
                  const active = currentStep===n;
                  return <span key={n} style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{width:22,height:22,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,background:done?'#15803D':active?'#0057FF':'#E5E7EB',color:(done||active)?'#fff':'#9CA3AF',animation:active?'pulse 1.2s ease infinite':'none'}}>{done?'✓':n}</span>
                    <span style={{fontSize:12,fontWeight:done?700:500,color:done?'#15803D':active?'#0057FF':'#9CA3AF'}}>{label}</span>
                    {i<2&&<span style={{color:'#D1D5DB',margin:'0 4px'}}>→</span>}
                  </span>;
                })}
              </div>

              {statusMsg&&<div style={{display:'flex',alignItems:'center',gap:8,marginTop:10}}>
                <div style={{width:14,height:14,borderRadius:'50%',border:'2px solid #0057FF',borderTopColor:'transparent',animation:'spin .8s linear infinite'}}/>
                <span style={{fontSize:12,color:'#0057FF',fontWeight:600}}>{statusMsg}</span>
              </div>}
              {error&&<div style={{marginTop:10,padding:'8px 12px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:6,fontSize:12,color:'#B91C1C'}}>{error}</div>}
            </div>

            {/* Scout Results */}
            {businesses.length>0&&(
              <div style={s.section}>
                <div style={s.sectionHeader}>
                  <div>
                    <div style={s.sectionTitle}>Scout Results — {scoutResults.city}</div>
                    <div style={s.sectionSub}>{businesses.length} found · {scoutResults.ownership_candidates} ownership candidates · {selectedIds.size} selected</div>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                    <button style={s.btnSm} onClick={()=>setSelectedIds(new Set(businesses.map(b=>b.id)))}>Select All</button>
                    <button style={s.btnSm} onClick={()=>setSelectedIds(new Set())}>Clear</button>
                    <button style={{...s.btn,...s.btnBlue,opacity:(running||selectedIds.size===0)?.5:1}} onClick={runEnrich} disabled={running||selectedIds.size===0}>
                      {currentStep===2?'⟳ Enriching…':`Enrich ${selectedIds.size} →`}
                    </button>
                  </div>
                </div>
                <div style={s.cardGrid}>
                  {businesses.map(biz=>{
                    const selected=selectedIds.has(biz.id);
                    const expanded=expandedId===biz.id;
                    return <div key={biz.id} style={{...s.bizCard,borderColor:biz.ownership_candidate?'#FCD34D':selected?'#BFDBFE':'#E5E7EB',background:biz.ownership_candidate?'#FFFBEB':selected?'#EFF6FF':'#fff',outline:biz.ownership_candidate?'2px solid #FCD34D':selected?'2px solid #BFDBFE':'none'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                        <div style={{flex:1}}>
                          {biz.ownership_candidate&&<span style={{fontSize:9,fontWeight:700,color:'#B45309',background:'#FEF3C7',border:'1px solid #FCD34D',borderRadius:4,padding:'2px 6px',textTransform:'uppercase',letterSpacing:'0.05em',display:'inline-block',marginBottom:4}}>🏆 Ownership Candidate</span>}
                          <div style={{fontSize:15,fontWeight:700,color:'#111827',marginBottom:2}}>{biz.business_name}</div>
                          <div style={{fontSize:12,color:'#6B7280'}}>{biz.city} · {biz.industry}</div>
                          {biz.owner_name&&<div style={{fontSize:11,color:'#9CA3AF',marginTop:2}}>{biz.owner_name}</div>}
                        </div>
                        <div style={{display:'flex',gap:12,flexShrink:0,marginLeft:12}}>
                          <ScoreBadge score={biz.franchise_score} label="Franchise"/>
                          <ScoreBadge score={biz.ownership_score} label="Ownership"/>
                        </div>
                      </div>
                      {expanded&&biz.signals?.length>0&&(
                        <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #E5E7EB'}}>
                          <div style={{fontSize:10,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>Signals</div>
                          {biz.signals.map((sig,i)=><div key={i} style={{fontSize:12,color:'#374151',display:'flex',gap:6,marginBottom:3}}><span style={{color:'#10B981'}}>·</span>{sig}</div>)}
                          {biz.website&&<a href={biz.website} target="_blank" rel="noreferrer" style={{fontSize:11,color:'#0057FF',marginTop:6,display:'block'}}>{biz.website}</a>}
                        </div>
                      )}
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12}}>
                        <button style={{fontSize:11,color:'#6B7280',background:'transparent',border:'none',cursor:'pointer',padding:0}} onClick={()=>setExpandedId(expanded?null:biz.id)}>{expanded?'▲ Less':'▼ Signals'}</button>
                        <button style={{padding:'5px 14px',fontSize:12,fontWeight:600,borderRadius:5,background:selected?'#0057FF':'#F3F4F6',color:selected?'#fff':'#374151',border:`1px solid ${selected?'#0057FF':'#D1D5DB'}`,cursor:'pointer'}} onClick={()=>{const n=new Set(selectedIds);selected?n.delete(biz.id):n.add(biz.id);setSelectedIds(n);}}>
                          {selected?'✓ Selected':'Select'}
                        </button>
                      </div>
                    </div>;
                  })}
                </div>
              </div>
            )}

            {/* Enrich Results */}
            {enrichResults&&(
              <div style={s.section}>
                <div style={s.sectionHeader}>
                  <div>
                    <div style={s.sectionTitle}>Enrichment Results</div>
                    <div style={s.sectionSub}>{enrichResults.enriched_count} of {enrichResults.total} emails found ({enrichResults.hit_rate}% hit rate)</div>
                  </div>
                  <button style={{...s.btn,...s.btnGreen,opacity:(running||enriched.length===0)?.5:1}} onClick={runOutreach} disabled={running||enriched.length===0}>
                    {currentStep===3?'⟳ Loading…':`Load ${enriched.length} to Smartlead →`}
                  </button>
                </div>
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead><tr><th style={s.th}>Business</th><th style={s.th}>Owner</th><th style={s.th}>Email</th><th style={s.th}>Status</th><th style={s.th}>Ownership</th></tr></thead>
                    <tbody>
                      {enrichResults.results.map((b,i)=>(
                        <tr key={i} style={{background:i%2?'#fff':'#F9FAFB'}}>
                          <td style={s.td}><div style={{fontWeight:600,fontSize:13,color:'#111827'}}>{b.business_name}</div><div style={{fontSize:11,color:'#9CA3AF'}}>{b.city}</div></td>
                          <td style={s.td}><span style={{fontSize:13,color:'#374151'}}>{b.owner_name||'—'}</span></td>
                          <td style={s.td}>{b.email?<span style={{fontSize:12,color:'#15803D',fontWeight:600}}>{b.email}</span>:<span style={{fontSize:12,color:'#D1D5DB'}}>Not found</span>}</td>
                          <td style={s.td}><span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:4,background:b.enriched?'#DCFCE7':'#F3F4F6',color:b.enriched?'#15803D':'#9CA3AF'}}>{b.enriched?'✓ Found':'No email'}</span></td>
                          <td style={s.td}>{b.ownership_candidate?<span style={{fontSize:11,fontWeight:700,color:'#B45309',background:'#FEF3C7',padding:'2px 7px',borderRadius:4}}>🏆 Yes</span>:<span style={{fontSize:11,color:'#D1D5DB'}}>—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Outreach Results */}
            {outreachResults&&(
              <div style={s.section}>
                <div style={s.sectionTitle} style={{marginBottom:12}}>Loaded to Smartlead</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
                  {[{label:'Contacts Loaded',value:outreachResults.loaded,color:'#15803D',bg:'#DCFCE7'},{label:'Sequences Written',value:outreachResults.results?.filter(r=>r.sequence_written).length||0,color:'#0057FF',bg:'#EFF6FF'},{label:'Failed',value:outreachResults.failed||0,color:outreachResults.failed>0?'#DC2626':'#9CA3AF',bg:outreachResults.failed>0?'#FEE2E2':'#F3F4F6'}].map(({label,value,color,bg})=>(
                    <div key={label} style={{background:bg,border:`1px solid ${color}33`,borderRadius:8,padding:'16px 20px',textAlign:'center'}}>
                      <div style={{fontSize:32,fontWeight:800,color,lineHeight:1}}>{value}</div>
                      <div style={{fontSize:11,fontWeight:600,color:'#6B7280',marginTop:4,textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div>
                    </div>
                  ))}
                </div>
                {outreachResults.results?.map((r,i)=>(
                  <div key={i} style={{padding:'12px 16px',background:'#fff',border:'1px solid #E5E7EB',borderRadius:6,marginBottom:6,display:'flex',alignItems:'flex-start',gap:12}}>
                    <div style={{width:8,height:8,borderRadius:'50%',marginTop:4,flexShrink:0,background:r.status==='loaded'?'#10B981':'#EF4444'}}/>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:13,color:'#111827'}}>{r.business_name}</div>
                      <div style={{fontSize:11,color:'#9CA3AF'}}>{r.email}</div>
                      {r.emails_preview?.length>0&&<div style={{marginTop:6,display:'flex',flexWrap:'wrap',gap:6}}>
                        {r.emails_preview.map((e,ei)=><span key={ei} style={{fontSize:10,color:'#6B7280',background:'#F3F4F6',borderRadius:4,padding:'2px 8px'}}>Day {e.day}: {e.subject}</span>)}
                      </div>}
                    </div>
                    {r.ownership_candidate&&<span style={{fontSize:10,fontWeight:700,color:'#B45309',background:'#FEF3C7',padding:'2px 7px',borderRadius:4,flexShrink:0}}>🏆 Ownership</span>}
                  </div>
                ))}
                <div style={{marginTop:16,display:'flex',gap:10}}>
                  <button style={{...s.btn,...s.btnBlue}} onClick={reset}>↻ Run Another City</button>
                  <a href="https://app.smartlead.ai" target="_blank" rel="noreferrer" style={{...s.btn,background:'#fff',color:'#374151',border:'1px solid #D1D5DB',textDecoration:'none',display:'flex',alignItems:'center'}}>View in Smartlead →</a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const s = {
  page:{display:'flex',minHeight:'100vh',background:'#FAFBFD',fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif"},
  sidebar:{width:210,flexShrink:0,background:'#fff',borderRight:'1px solid #E2E8F0',display:'flex',flexDirection:'column',position:'sticky',top:0,height:'100vh'},
  sideLogoWrap:{padding:'20px 16px 16px',borderBottom:'1px solid #E2E8F0'},
  sideLogoRow:{display:'flex',alignItems:'center',gap:9},
  sideNav:{flex:1,padding:'10px 8px',display:'flex',flexDirection:'column',gap:1,overflowY:'auto'},
  sideNavItem:{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:7,fontSize:13,fontWeight:500,color:'#475569',textDecoration:'none',transition:'all .15s'},
  sideNavItemActive:{background:'#EFF6FF',color:'#0057FF',fontWeight:600},
  sideBottom:{borderTop:'1px solid #E2E8F0',padding:'8px 8px 16px'},
  main:{flex:1,display:'flex',flexDirection:'column',minWidth:0},
  topBar:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 24px',background:'#fff',borderBottom:'1px solid #E2E8F0',flexShrink:0},
  topTitle:{fontSize:20,fontWeight:700,color:'#0F172A'},
  topSub:{fontSize:12,color:'#64748B',marginTop:2},
  body:{flex:1,padding:'20px 24px',overflowY:'auto'},
  card:{background:'#fff',border:'1px solid #E2E8F0',borderRadius:10,padding:'20px 24px',marginBottom:20,boxShadow:'0 1px 3px rgba(15,23,42,.04)'},
  section:{marginBottom:24},
  sectionHeader:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14,gap:12,flexWrap:'wrap'},
  sectionTitle:{fontSize:15,fontWeight:700,color:'#111827'},
  sectionSub:{fontSize:12,color:'#6B7280',marginTop:2},
  cardGrid:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12},
  bizCard:{background:'#fff',border:'1px solid #E5E7EB',borderRadius:10,padding:16,boxShadow:'0 1px 3px rgba(15,23,42,.03)',transition:'all .15s'},
  tableWrap:{background:'#fff',border:'1px solid #E2E8F0',borderRadius:10,overflow:'hidden'},
  table:{width:'100%',borderCollapse:'collapse'},
  th:{fontSize:10,fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'0.05em',padding:'9px 14px',background:'#FAFBFD',borderBottom:'1px solid #E2E8F0',textAlign:'left'},
  td:{fontSize:13,color:'#0F172A',padding:'11px 14px',borderBottom:'1px solid #F1F5F9',verticalAlign:'middle'},
  fieldGroup:{display:'flex',flexDirection:'column',gap:5},
  fieldLabel:{fontSize:11,fontWeight:600,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.05em'},
  select:{padding:'8px 12px',borderRadius:6,border:'1px solid #D1D5DB',fontSize:13,color:'#111827',background:'#fff',cursor:'pointer',minWidth:180},
  btn:{padding:'8px 18px',fontSize:13,fontWeight:600,borderRadius:6,border:'none',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6},
  btnBlue:{background:'#0057FF',color:'#fff'},
  btnGreen:{background:'#15803D',color:'#fff'},
  btnSm:{padding:'5px 12px',fontSize:12,fontWeight:500,borderRadius:5,border:'1px solid #E2E8F0',background:'#fff',color:'#374151',cursor:'pointer'},
};
