import { useState, useEffect } from 'react';
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

const CITIES = ['Dallas, TX','Houston, TX','Austin, TX','San Antonio, TX','Phoenix, AZ','Scottsdale, AZ','Denver, CO','Nashville, TN','Charlotte, NC','Atlanta, GA','Tampa, FL','Orlando, FL','Miami, FL','Chicago, IL','Las Vegas, NV','Salt Lake City, UT','Raleigh, NC','Columbus, OH','Minneapolis, MN','Portland, OR'];
const INDUSTRIES = ['Food & Beverage','Health & Wellness','Fitness','Beauty & Personal Care','Pet Services','Auto Services','Home Services',"Children's Education",'Senior Care','Cleaning Services','Real Estate Services','Marketing & Media'];
const FRANCHISE_BREAKDOWN = [{points:3,label:'Multiple locations in same city'},{points:2,label:'4+ years in business'},{points:2,label:'200+ reviews at 4.2+ stars'},{points:2,label:'Systemized team roles'},{points:1,label:'Local press or awards'}];
const OWNERSHIP_BREAKDOWN = [{points:3,label:'Unique concept — no national competitor'},{points:2,label:'Strong brand or cult following'},{points:2,label:'Scalable low build-out model'},{points:2,label:'Owner at growth ceiling'},{points:1,label:'Hot franchise category'}];

function SideIcon({ name }) {
  const p = { width:17,height:17,fill:'none',stroke:'currentColor',strokeWidth:1.75,strokeLinecap:'round',strokeLinejoin:'round',viewBox:'0 0 24 24',style:{display:'block'} };
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

function ScoreRing({ score, color, label }) {
  const r=18,cx=22,cy=22,circ=2*Math.PI*r,dash=Math.min((score||0)/10,1)*circ;
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
      <svg width={44} height={44} viewBox="0 0 44 44">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={4}/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={4} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>
        <text x={cx} y={cy+5} textAnchor="middle" fontSize={12} fontWeight={800} fill={color}>{score}</text>
      </svg>
      <div style={{fontSize:9,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div>
    </div>
  );
}

function Tooltip({ franchise_score, ownership_score, signals }) {
  return (
    <div style={{background:'#1E293B',borderRadius:8,padding:'14px 16px',width:260,boxShadow:'0 8px 24px rgba(0,0,0,.3)'}}>
      <div style={{fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Score Breakdown</div>
      <div style={{marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:700,color:'#60A5FA',marginBottom:4}}>Franchise Readiness: {franchise_score}/10</div>
        {FRANCHISE_BREAKDOWN.map((item,i)=><div key={i} style={{fontSize:11,color:'#CBD5E1',display:'flex',gap:6,marginBottom:2}}><span style={{color:'#4ADE80',fontWeight:700,flexShrink:0}}>+{item.points}</span><span>{item.label}</span></div>)}
      </div>
      <div>
        <div style={{fontSize:11,fontWeight:700,color:'#F59E0B',marginBottom:4}}>Ownership Signal: {ownership_score}/10</div>
        {OWNERSHIP_BREAKDOWN.map((item,i)=><div key={i} style={{fontSize:11,color:'#CBD5E1',display:'flex',gap:6,marginBottom:2}}><span style={{color:'#4ADE80',fontWeight:700,flexShrink:0}}>+{item.points}</span><span>{item.label}</span></div>)}
      </div>
      {signals?.length>0&&<div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #334155'}}><div style={{fontSize:11,fontWeight:700,color:'#94A3B8',marginBottom:4}}>Signals Found</div>{signals.map((s,i)=><div key={i} style={{fontSize:11,color:'#E2E8F0',marginBottom:2}}>· {s}</div>)}</div>}
    </div>
  );
}

function BusinessCard({ biz, index }) {
  const [expanded, setExpanded] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const fc = (biz.franchise_score||0)>=7?'#15803D':(biz.franchise_score||0)>=5?'#B45309':'#DC2626';
  const oc = (biz.ownership_score||0)>=7?'#15803D':(biz.ownership_score||0)>=5?'#B45309':'#DC2626';
  const summary = (biz.signals||[]).slice(0,2).join(' · ');
  const isDup = biz.status==='duplicate';
  return (
    <div style={{background:'#fff',border:`1px solid ${biz.ownership_candidate?'#FCD34D':'#E2E8F0'}`,borderLeft:`4px solid ${biz.ownership_candidate?'#F59E0B':isDup?'#9CA3AF':'#0057FF'}`,borderRadius:10,padding:'14px 16px',boxShadow:'0 1px 3px rgba(15,23,42,.04)',opacity:isDup?.65:1}}>
      <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
        <div style={{width:24,height:24,borderRadius:'50%',background:'#F1F5F9',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#64748B',flexShrink:0,marginTop:2}}>{index+1}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:2}}>
            {biz.ownership_candidate&&<span style={{fontSize:9,fontWeight:700,color:'#B45309',background:'#FEF3C7',border:'1px solid #FCD34D',borderRadius:4,padding:'1px 6px',textTransform:'uppercase',letterSpacing:'0.05em'}}>🏆 Ownership</span>}
            {isDup&&<span style={{fontSize:9,fontWeight:700,color:'#6B7280',background:'#F3F4F6',border:'1px solid #D1D5DB',borderRadius:4,padding:'1px 6px',textTransform:'uppercase',letterSpacing:'0.05em'}}>↩ Already in Pipeline</span>}
            <span style={{fontSize:14,fontWeight:700,color:'#0F172A'}}>{biz.business_name}</span>
          </div>
          {biz.owner_name&&<div style={{fontSize:12,color:'#64748B',marginBottom:3}}>{biz.owner_name}</div>}
          {isDup?<div style={{fontSize:11,color:'#9CA3AF'}}>{biz.reason}</div>:summary?<div style={{fontSize:11,color:'#94A3B8',lineHeight:1.4}}>{summary}</div>:null}
        </div>
        {!isDup&&<div style={{position:'relative',flexShrink:0}}>
          <div style={{display:'flex',gap:10,cursor:'pointer'}} onMouseEnter={()=>setShowTip(true)} onMouseLeave={()=>setShowTip(false)} onClick={()=>setShowTip(!showTip)}>
            <ScoreRing score={biz.franchise_score||0} color={fc} label="Franchise"/>
            <ScoreRing score={biz.ownership_score||0} color={oc} label="Ownership"/>
          </div>
          {showTip&&<div style={{position:'absolute',right:0,top:60,zIndex:100}}><Tooltip franchise_score={biz.franchise_score} ownership_score={biz.ownership_score} signals={biz.signals}/></div>}
        </div>}
        <div style={{display:'flex',flexDirection:'column',gap:4,flexShrink:0,alignItems:'flex-end'}}>
          <div style={{display:'flex',alignItems:'center',gap:4}}><span style={{fontSize:10,color:'#94A3B8'}}>Email</span><span style={{fontSize:13,fontWeight:700,color:biz.enriched?'#15803D':'#D1D5DB'}}>{biz.enriched?'✓':'—'}</span></div>
          <div style={{display:'flex',alignItems:'center',gap:4}}><span style={{fontSize:10,color:'#94A3B8'}}>Loaded</span><span style={{fontSize:13,fontWeight:700,color:biz.loaded?'#15803D':isDup?'#9CA3AF':'#D1D5DB'}}>{biz.loaded?'✓':isDup?'↩':'—'}</span></div>
        </div>
      </div>
      {!isDup&&<div style={{marginTop:10,paddingTop:8,borderTop:'1px solid #F1F5F9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        {biz.email?<span style={{fontSize:11,color:'#15803D',fontWeight:600}}>{biz.email}</span>:<span style={{fontSize:11,color:'#D1D5DB'}}>No email found</span>}
        <button style={{fontSize:11,color:'#64748B',background:'#F8FAFC',border:'none',cursor:'pointer',padding:'2px 8px',borderRadius:4}} onClick={()=>setExpanded(!expanded)}>{expanded?'▲ Less':'▼ Details'}</button>
      </div>}
      {expanded&&!isDup&&<div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #F1F5F9'}}>
        {biz.signals?.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:10,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:5}}>All Signals</div>{biz.signals.map((sig,i)=><div key={i} style={{fontSize:12,color:'#374151',display:'flex',gap:6,marginBottom:3}}><span style={{color:'#10B981',flexShrink:0}}>·</span>{sig}</div>)}</div>}
        {biz.website&&<a href={biz.website.startsWith('http')?biz.website:`https://${biz.website}`} target="_blank" rel="noreferrer" style={{fontSize:11,color:'#0057FF'}}>{biz.website}</a>}
        {biz.emails_preview?.length>0&&<div style={{marginTop:8}}><div style={{fontSize:10,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:5}}>Email Sequence</div>{biz.emails_preview.map((e,i)=><div key={i} style={{fontSize:11,color:'#374151',marginBottom:3}}><span style={{color:'#94A3B8',marginRight:6}}>Day {e.day}:</span>{e.subject}</div>)}</div>}
      </div>}
    </div>
  );
}

function ReplyCard({ reply, onMarkReviewed }) {
  const classColors = {INTERESTED:'#15803D',NOT_NOW:'#B45309',NOT_INTERESTED:'#6B7280',QUESTION:'#0057FF'};
  const classBg = {INTERESTED:'#DCFCE7',NOT_NOW:'#FEF3C7',NOT_INTERESTED:'#F3F4F6',QUESTION:'#EFF6FF'};
  const color = classColors[reply.classification]||'#6B7280';
  const bg = classBg[reply.classification]||'#F3F4F6';
  return (
    <div style={{background:'#fff',border:`1px solid ${reply.ownership_candidate?'#FCD34D':'#E2E8F0'}`,borderLeft:`4px solid ${reply.ownership_candidate?'#F59E0B':color}`,borderRadius:10,padding:'14px 16px',marginBottom:8}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
            {reply.ownership_candidate&&<span style={{fontSize:9,fontWeight:700,color:'#B45309',background:'#FEF3C7',border:'1px solid #FCD34D',borderRadius:4,padding:'1px 6px',textTransform:'uppercase'}}>🏆 Ownership</span>}
            <span style={{fontSize:14,fontWeight:700,color:'#111827'}}>{reply.business_name}</span>
            <span style={{fontSize:11,fontWeight:700,color,background:bg,padding:'2px 8px',borderRadius:4}}>{reply.classification}</span>
          </div>
          <div style={{fontSize:12,color:'#64748B',marginBottom:6}}>{reply.email} · {new Date(reply.replied_at).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
          <div style={{fontSize:13,color:'#374151',background:'#F8FAFC',borderRadius:6,padding:'8px 12px',fontStyle:'italic'}}>"{reply.reply_text?.slice(0,200)}{reply.reply_text?.length>200?'...':''}"</div>
        </div>
      </div>
      {reply.drafted_response&&<div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #F1F5F9'}}>
        <div style={{fontSize:10,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>Drafted Response</div>
        <div style={{fontSize:12,color:'#374151',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{reply.drafted_response}</div>
      </div>}
      <div style={{marginTop:10,display:'flex',gap:8}}>
        <button style={{fontSize:12,fontWeight:600,color:'#15803D',background:'#DCFCE7',border:'none',borderRadius:5,padding:'5px 12px',cursor:'pointer'}} onClick={()=>onMarkReviewed(reply.id)}>✓ Mark Reviewed</button>
        <button style={{fontSize:12,color:'#64748B',background:'#F3F4F6',border:'none',borderRadius:5,padding:'5px 12px',cursor:'pointer'}} onClick={()=>navigator.clipboard?.writeText(reply.drafted_response||'')}>Copy Response</button>
      </div>
    </div>
  );
}

export default function PipelinePage({ perms={}, platformLogo=null, navOrder=null }) {
  const [city, setCity] = useState('Dallas, TX');
  const [industry, setIndustry] = useState('Food & Beverage');
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [history, setHistory] = useState([]);
  const [replies, setReplies] = useState([]);
  const [activeTab, setActiveTab] = useState('run');
  const [loadingReplies, setLoadingReplies] = useState(false);

  useEffect(()=>{ loadHistory(); },[]);
  useEffect(()=>{ if(activeTab==='replies') loadReplies(); },[activeTab]);

  async function loadHistory() {
    try {
      const r = await fetch('/api/pipeline/runs?type=history');
      const d = await r.json();
      if (d.runs) setHistory(d.runs);
    } catch(e) {
      try { const s=localStorage.getItem('pipeline_history'); if(s) setHistory(JSON.parse(s)); } catch(e2) {}
    }
  }

  async function loadReplies() {
    setLoadingReplies(true);
    try {
      const r = await fetch('/api/pipeline/runs?type=replies');
      const d = await r.json();
      if (d.replies) setReplies(d.replies);
    } catch(e) {}
    setLoadingReplies(false);
  }

  async function markReviewed(replyId) {
    await fetch('/api/pipeline/runs', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({reply_id:replyId}) });
    setReplies(prev=>prev.filter(r=>r.id!==replyId));
  }

  async function runPipeline() {
    setRunning(true); setError(null); setResults(null);
    setStage('Searching for franchise-ready businesses...');
    try {
      const scoutRes = await fetch('/api/pipeline/scout', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({city,industry}) });
      const scoutData = await scoutRes.json();
      if (!scoutRes.ok) throw new Error(scoutData.error||'Scout failed');
      const businesses = scoutData.businesses||[];
      setStage(`Found ${businesses.length} businesses. Finding owner emails...`);

      const enrichRes = await fetch('/api/pipeline/enrich', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({businesses}) });
      const enrichData = await enrichRes.json();
      if (!enrichRes.ok) throw new Error(enrichData.error||'Enrichment failed');
      const enriched = enrichData.results||[];
      const enrichedCount = enriched.filter(b=>b.enriched).length;
      setStage(`Found ${enrichedCount} emails. Checking duplicates and loading to Smartlead...`);

      let run_id = null;
      try {
        const runRes = await fetch('/api/pipeline/runs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ city, industry, found:businesses.length, enriched_count:enrichedCount, enrichment_rate:businesses.length>0?Math.round((enrichedCount/businesses.length)*100):0, loaded:0, ownership_candidates:businesses.filter(b=>b.ownership_candidate).length }) });
        const runData = await runRes.json();
        run_id = runData.run_id;
      } catch(e) {}

      const outreachRes = await fetch('/api/pipeline/outreach', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({businesses:enriched,run_id}) });
      const outreachData = await outreachRes.json();
      if (!outreachRes.ok) throw new Error(outreachData.error||'Outreach failed');

      const outreachMap = {};
      (outreachData.results||[]).forEach(r=>{ outreachMap[r.business_name]=r; });
      const unified = enriched.map(biz=>({ ...biz, loaded:outreachMap[biz.business_name]?.status==='loaded', status:outreachMap[biz.business_name]?.status, reason:outreachMap[biz.business_name]?.reason, emails_preview:outreachMap[biz.business_name]?.emails_preview||[] }));

      const stats = { city, industry, run_at:new Date().toISOString(), found:businesses.length, enriched_count:enrichedCount, enrichment_rate:businesses.length>0?Math.round((enrichedCount/businesses.length)*100):0, loaded:outreachData.loaded||0, duplicates:outreachData.duplicates||0, ownership_candidates:businesses.filter(b=>b.ownership_candidate).length };
      setResults({ businesses:unified, stats });
      await loadHistory();
      setStage('');
    } catch(err) { setError(err.message); setStage(''); }
    setRunning(false);
  }

  const unreadCount = replies.filter(r=>!r.reviewed).length;

  return (
    <>
      <Head><title>Genesis Agent v1.4 — KANSO</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}*{box-sizing:border-box}button:not(:disabled):hover{opacity:.85}select,button{font-family:inherit}`}</style>
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
              <div style={s.topTitle}>Genesis Agent <span style={{fontSize:12,fontWeight:500,color:'#94A3B8',marginLeft:6}}>v1.4</span></div>
              <div style={s.topSub}>Find franchise-ready businesses → enrich → load to Smartlead automatically</div>
            </div>
            <div style={{display:'flex',gap:8}}>
              {['run','history','replies'].map(tab=>(
                <button key={tab} style={{...s.tabBtn,...(activeTab===tab?s.tabBtnActive:{})}} onClick={()=>setActiveTab(tab)}>
                  {tab==='run'?'Start Agent':tab==='history'?'History':
                    <span style={{display:'flex',alignItems:'center',gap:6}}>Replies{unreadCount>0&&<span style={{background:'#EF4444',color:'#fff',borderRadius:10,fontSize:10,fontWeight:700,padding:'1px 6px'}}>{unreadCount}</span>}</span>}
                </button>
              ))}
            </div>
          </div>
          <div style={s.body}>
            {activeTab==='run'&&<>
              <div style={s.controlCard}>
                <div style={{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
                  <div style={s.fieldGroup}><label style={s.fieldLabel}>City</label><select value={city} onChange={e=>setCity(e.target.value)} style={s.select} disabled={running}>{CITIES.map(c=><option key={c}>{c}</option>)}</select></div>
                  <div style={s.fieldGroup}><label style={s.fieldLabel}>Industry</label><select value={industry} onChange={e=>setIndustry(e.target.value)} style={s.select} disabled={running}>{INDUSTRIES.map(i=><option key={i}>{i}</option>)}</select></div>
                  <button style={{...s.btn,...s.btnBlue,opacity:running?.6:1,minWidth:140}} onClick={runPipeline} disabled={running}>
                    {running?<span style={{display:'flex',alignItems:'center',gap:8}}><span style={{width:14,height:14,borderRadius:'50%',border:'2px solid rgba(255,255,255,.4)',borderTopColor:'#fff',animation:'spin .8s linear infinite',display:'inline-block'}}/>Agent Running...</span>:'⚡ Start Agent'}
                  </button>
                </div>
                {stage&&<div style={{marginTop:12,display:'flex',alignItems:'center',gap:8}}><div style={{width:8,height:8,borderRadius:'50%',background:'#0057FF',animation:'pulse 1s ease infinite'}}/><span style={{fontSize:13,color:'#0057FF',fontWeight:500}}>{stage}</span></div>}
                {error&&<div style={{marginTop:10,padding:'8px 12px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:6,fontSize:12,color:'#B91C1C'}}>{error}</div>}
              </div>
              {results&&<>
                <div style={s.statsBar}>
                  {[
                    {label:'Found',value:results.stats.found,color:'#111827'},
                    {label:'Emerging',value:results.stats.emerging_count||0,color:'#7C3AED'},
                    {label:'Emails Found',value:`${results.stats.enriched_count}/${results.stats.found}`,color:'#0057FF'},
                    {label:'Enrichment Rate',value:`${results.stats.enrichment_rate}%`,color:results.stats.enrichment_rate>=50?'#15803D':'#B45309'},
                    {label:'Loaded',value:results.stats.loaded,color:'#15803D'},
                    {label:'Duplicates',value:results.stats.duplicates||0,color:'#9CA3AF'},
                    {label:'Ownership',value:results.stats.ownership_candidates,color:'#B45309'},
                  ].map(({label,value,color})=>(
                    <div key={label} style={s.statItem}><div style={{fontSize:22,fontWeight:800,color,lineHeight:1}}>{value}</div><div style={{fontSize:9,fontWeight:600,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.05em',marginTop:3}}>{label}</div></div>
                  ))}
                </div>
                <div style={{marginBottom:8,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div style={{fontSize:14,fontWeight:700,color:'#111827'}}>{results.stats.city} — {results.stats.industry}</div>
                  <div style={{fontSize:12,color:'#94A3B8'}}>Tap scores to see breakdown · Tap Details to expand</div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:24}}>
                  {results.businesses.map((biz,i)=><BusinessCard key={biz.id||i} biz={biz} index={i}/>)}
                </div>
              </>}
            </>}

            {activeTab==='history'&&<>
              <div style={{fontSize:14,fontWeight:700,color:'#111827',marginBottom:12}}>Run History</div>
              {history.length===0
                ?<div style={{color:'#94A3B8',fontSize:14,padding:'40px 0',textAlign:'center'}}>No runs yet. Run the pipeline to see history here.</div>
                :<div style={s.tableWrap}>
                  <div style={{display:'flex',gap:12,padding:'8px 16px',background:'#FAFBFD',borderBottom:'1px solid #E2E8F0'}}>
                    {['Date','City','Industry','Found','Enriched','Loaded','Dupes','Ownership'].map((h,i)=><div key={h} style={{width:i===0?110:i===1?undefined:i===2?120:55,flex:i===1?1:undefined,fontSize:10,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',textAlign:i>2?'center':'left'}}>{h}</div>)}
                  </div>
                  {history.map((run,i)=>{
                    const date=new Date(run.run_at).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
                    return <div key={i} style={{display:'flex',gap:12,padding:'10px 16px',borderBottom:'1px solid #F1F5F9',alignItems:'center'}}>
                      <div style={{width:110,color:'#94A3B8',fontSize:11,flexShrink:0}}>{date}</div>
                      <div style={{flex:1,fontWeight:600,color:'#111827',fontSize:13}}>{run.city}</div>
                      <div style={{width:120,color:'#64748B',fontSize:13}}>{run.industry}</div>
                      <div style={{width:55,textAlign:'center',fontSize:13,fontWeight:700,color:'#111827'}}>{run.found}</div>
                      <div style={{width:55,textAlign:'center',fontSize:13,fontWeight:700,color:run.enrichment_rate>=50?'#15803D':'#B45309'}}>{run.enrichment_rate}%</div>
                      <div style={{width:55,textAlign:'center',fontSize:13,fontWeight:700,color:'#0057FF'}}>{run.loaded}</div>
                      <div style={{width:55,textAlign:'center',fontSize:12,color:'#9CA3AF'}}>{run.duplicates||0}</div>
                      <div style={{width:55,textAlign:'center'}}><span style={{fontSize:11,fontWeight:700,color:'#B45309',background:'#FEF3C7',padding:'2px 6px',borderRadius:4}}>🏆 {run.ownership_candidates}</span></div>
                    </div>;
                  })}
                </div>}
            </>}

            {activeTab==='replies'&&<>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                <div><div style={{fontSize:14,fontWeight:700,color:'#111827'}}>Reply Queue</div><div style={{fontSize:12,color:'#94A3B8',marginTop:2}}>AI-classified replies. Ownership candidates appear first.</div></div>
                <button style={{...s.btn,background:'#F3F4F6',color:'#374151',fontSize:12}} onClick={loadReplies}>↻ Refresh</button>
              </div>
              {loadingReplies&&<div style={{color:'#94A3B8',fontSize:14,padding:'40px 0',textAlign:'center'}}>Loading replies...</div>}
              {!loadingReplies&&replies.length===0&&<div style={{color:'#94A3B8',fontSize:14,padding:'40px 0',textAlign:'center'}}>No unreviewed replies yet.</div>}
              {!loadingReplies&&replies.length>0&&<>
                {replies.filter(r=>r.ownership_candidate).length>0&&<>
                  <div style={{fontSize:11,fontWeight:700,color:'#B45309',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>🏆 Ownership Candidates</div>
                  {replies.filter(r=>r.ownership_candidate).map(r=><ReplyCard key={r.id} reply={r} onMarkReviewed={markReviewed}/>)}
                  <div style={{fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.05em',margin:'16px 0 8px'}}>Other Replies</div>
                </>}
                {replies.filter(r=>!r.ownership_candidate).map(r=><ReplyCard key={r.id} reply={r} onMarkReviewed={markReviewed}/>)}
              </>}
              <div style={{marginTop:16,padding:'12px 16px',background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:8,fontSize:12,color:'#64748B'}}>
                <strong>Smartlead Webhook URL:</strong><br/>
                <code style={{background:'#E2E8F0',padding:'3px 8px',borderRadius:4,fontSize:11,display:'inline-block',marginTop:4}}>https://www.trykanso.co/api/webhooks/pipeline-reply</code><br/>
                <span style={{fontSize:11,marginTop:4,display:'block'}}>Add in Smartlead → Settings → Webhooks → Reply Received event</span>
              </div>
            </>}
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
  topBar:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 24px',background:'#fff',borderBottom:'1px solid #E2E8F0',flexShrink:0,gap:16,flexWrap:'wrap'},
  topTitle:{fontSize:20,fontWeight:700,color:'#0F172A'},
  topSub:{fontSize:12,color:'#64748B',marginTop:2},
  body:{flex:1,padding:'20px 24px',overflowY:'auto'},
  controlCard:{background:'#fff',border:'1px solid #E2E8F0',borderRadius:10,padding:'20px 24px',marginBottom:20,boxShadow:'0 1px 3px rgba(15,23,42,.04)'},
  statsBar:{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8,marginBottom:20,background:'#fff',border:'1px solid #E2E8F0',borderRadius:10,padding:'14px 16px'},
  statItem:{textAlign:'center',padding:'4px 0'},
  fieldGroup:{display:'flex',flexDirection:'column',gap:5},
  fieldLabel:{fontSize:11,fontWeight:600,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.05em'},
  select:{padding:'8px 12px',borderRadius:6,border:'1px solid #D1D5DB',fontSize:13,color:'#111827',background:'#fff',cursor:'pointer',minWidth:180},
  btn:{padding:'9px 18px',fontSize:13,fontWeight:600,borderRadius:6,border:'none',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6},
  btnBlue:{background:'#0057FF',color:'#fff'},
  tableWrap:{background:'#fff',border:'1px solid #E2E8F0',borderRadius:10,overflow:'hidden'},
  tabBtn:{padding:'7px 16px',fontSize:13,fontWeight:500,borderRadius:6,border:'1px solid #E2E8F0',background:'#fff',color:'#64748B',cursor:'pointer'},
  tabBtnActive:{background:'#0057FF',color:'#fff',border:'1px solid #0057FF',fontWeight:600},
};
