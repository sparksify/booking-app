import { useState, useEffect, useRef } from "react";

const T = {
  navy:"#0D1B2E",navyMid:"#112240",blue:"#0057FF",blueBright:"#2D7EFF",
  teal:"#00C2A8",green:"#10B981",greenLight:"#D1FAE5",orange:"#F59E0B",
  purple:"#8B5CF6",purpleLight:"#EDE9FE",gray50:"#F8FAFC",gray100:"#F1F5F9",
  gray200:"#E2E8F0",gray300:"#CBD5E1",gray400:"#94A3B8",gray500:"#64748B",
  gray700:"#334155",gray900:"#0F172A",white:"#FFFFFF",
};

function MapViz({ state, city }) {
  const [pulse, setPulse] = useState(0);
  const [pins, setPins] = useState([]);
  const [arcs, setArcs] = useState([]);
  const PP = [
    {x:580,y:160,a:true},{x:420,y:200,a:true},{x:680,y:280,a:false},
    {x:310,y:340,a:true},{x:510,y:320,a:false},{x:740,y:180,a:true},
    {x:460,y:430,a:false},{x:620,y:420,a:true},{x:350,y:480,a:false},{x:550,y:490,a:true},
  ];
  useEffect(()=>{ const iv=setInterval(()=>setPulse(p=>(p+1)%100),50); return()=>clearInterval(iv); },[]);
  useEffect(()=>{
    if(state==="running"){
      let i=0;
      const t=setInterval(()=>{ if(i<PP.length){setPins(p=>[...p,i]);if(i>0)setArcs(a=>[...a,i]);i++;}else clearInterval(t); },400);
      return()=>clearInterval(t);
    } else { setPins(PP.map((_,i)=>i)); setArcs(PP.map((_,i)=>i)); }
  },[state]);
  const cx=550,cy=320;
  const r1=60+(pulse%30)*2,r2=100+(pulse%40)*2,r3=150+(pulse%50)*2;
  const a1=Math.max(0,0.4-(pulse%30)*0.015),a2=Math.max(0,0.25-(pulse%40)*0.007),a3=Math.max(0,0.12-(pulse%50)*0.003);
  return (
    <div style={{position:"relative",width:"100%",height:"100%",borderRadius:16,overflow:"hidden",background:T.navy}}>
      <svg width="100%" height="100%" viewBox="0 0 860 560" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="mg" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#0057FF" stopOpacity="0.25"/><stop offset="100%" stopColor="#0D1B2E" stopOpacity="0"/></radialGradient>
          <radialGradient id="cg" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#00C2A8" stopOpacity="0.5"/><stop offset="100%" stopColor="#0057FF" stopOpacity="0"/></radialGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <filter id="pg"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(45,126,255,0.08)" strokeWidth="0.5"/></pattern>
          <linearGradient id="ag" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#0057FF" stopOpacity="0.6"/><stop offset="50%" stopColor="#00C2A8" stopOpacity="0.8"/><stop offset="100%" stopColor="#0057FF" stopOpacity="0.6"/></linearGradient>
        </defs>
        <rect width="860" height="560" fill={T.navy}/>
        <rect width="860" height="560" fill="url(#grid)"/>
        <ellipse cx={cx} cy={cy} rx="320" ry="220" fill="url(#mg)"/>
        <circle cx={cx} cy={cy} r={r1} fill="none" stroke={`rgba(0,87,255,${a1})`} strokeWidth="1.5"/>
        <circle cx={cx} cy={cy} r={r2} fill="none" stroke={`rgba(0,87,255,${a2})`} strokeWidth="1"/>
        <circle cx={cx} cy={cy} r={r3} fill="none" stroke={`rgba(0,87,255,${a3})`} strokeWidth="0.5"/>
        <circle cx={cx} cy={cy} r="80" fill="none" stroke="rgba(0,87,255,0.12)" strokeWidth="1" strokeDasharray="4 6"/>
        <circle cx={cx} cy={cy} r="160" fill="none" stroke="rgba(0,87,255,0.08)" strokeWidth="1" strokeDasharray="4 8"/>
        <circle cx={cx} cy={cy} r="240" fill="none" stroke="rgba(0,87,255,0.05)" strokeWidth="1" strokeDasharray="4 10"/>
        {arcs.map(i=>{ if(i===0)return null; const f=PP[0],to=PP[i]; return <path key={`a${i}`} d={`M ${f.x} ${f.y} Q ${(f.x+to.x)/2} ${Math.min(f.y,to.y)-60} ${to.x} ${to.y}`} fill="none" stroke="url(#ag)" strokeWidth="1" opacity="0.6"/>; })}
        <circle cx={cx} cy={cy} r="40" fill="url(#cg)"/>
        <circle cx={cx} cy={cy} r="6" fill="#00C2A8" filter="url(#glow)" opacity="0.9"/>
        {PP.map((pos,i)=>{ if(!pins.includes(i))return null; const c=pos.a?T.blueBright:T.teal; return (<g key={`p${i}`} filter="url(#pg)"><circle cx={pos.x} cy={pos.y} r="10" fill={c} opacity="0.2"/><circle cx={pos.x} cy={pos.y} r="5" fill={c} opacity="0.8"/>{i===0&&<><path d={`M ${pos.x} ${pos.y-5} L ${pos.x-8} ${pos.y-22} L ${pos.x+8} ${pos.y-22} Z`} fill={T.white} opacity="0.9"/><circle cx={pos.x} cy={pos.y-22} r="8" fill={T.white} opacity="0.9"/><circle cx={pos.x} cy={pos.y-22} r="3" fill={T.blue}/></>}</g>); })}
        <text x={cx} y={cy+30} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="11" fontWeight="600" letterSpacing="3">{(city||"MARKET").toUpperCase()}</text>
        {[[180,130],[720,90],[100,380],[780,440],[240,510],[700,500],[150,250],[780,320],[380,80],[650,380]].map(([x,y],i)=><circle key={`n${i}`} cx={x} cy={y} r="2" fill={T.teal} opacity={0.3+Math.sin(pulse*0.1+i)*0.2}/>)}
      </svg>
      <div style={{position:"absolute",top:16,left:16,background:"rgba(255,255,255,0.1)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,padding:"5px 12px",display:"flex",alignItems:"center",gap:6}}>
        <div style={{width:6,height:6,borderRadius:"50%",background:T.teal,boxShadow:`0 0 8px ${T.teal}`}}/>
        <span style={{color:T.white,fontSize:11,fontWeight:600,letterSpacing:"0.05em"}}>AI PROSPECT MAPPING</span>
      </div>
      {state==="running"&&<div style={{position:"absolute",top:16,right:16,background:"rgba(16,185,129,0.15)",border:"1px solid rgba(16,185,129,0.4)",borderRadius:8,padding:"5px 12px",display:"flex",alignItems:"center",gap:6}}><div style={{width:6,height:6,borderRadius:"50%",background:T.green,animation:"gpulse 1s infinite"}}/><span style={{color:T.green,fontSize:11,fontWeight:700}}>LIVE</span></div>}
      {state==="running"&&<div style={{position:"absolute",bottom:16,left:16,background:"rgba(13,27,46,0.85)",backdropFilter:"blur(12px)",border:"1px solid rgba(45,126,255,0.2)",borderRadius:10,padding:"12px 16px",minWidth:160}}><div style={{color:T.gray400,fontSize:11,marginBottom:4}}>Market Coverage</div><div style={{color:T.white,fontSize:26,fontWeight:700,lineHeight:1}}>67%</div><div style={{marginTop:8,height:3,background:"rgba(255,255,255,0.1)",borderRadius:2}}><div style={{width:"67%",height:"100%",background:`linear-gradient(90deg,${T.blue},${T.teal})`,borderRadius:2}}/></div></div>}
      <div style={{position:"absolute",bottom:16,right:16,background:"rgba(13,27,46,0.85)",backdropFilter:"blur(12px)",border:"1px solid rgba(45,126,255,0.15)",borderRadius:10,padding:"10px 14px"}}>
        {[{c:T.blueBright,l:state==="running"?"High-fit venues":"High-fit zones",v:state==="running"?"24":null},{c:T.teal,l:state==="running"?"Potential matches":"Emerging areas",v:state==="running"?"87":null},{c:T.orange,l:state==="running"?"Filtered out":"Opportunity density",v:state==="running"?"163":null},{c:T.gray400,l:state==="running"?"Still scanning":"Market coverage",v:state==="running"?"...":null}].map(({c,l,v})=><div key={l} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}><div style={{width:7,height:7,borderRadius:"50%",background:c,flexShrink:0}}/><span style={{color:"rgba(255,255,255,0.7)",fontSize:11}}>{l}</span>{v?<span style={{color:T.white,fontSize:11,fontWeight:600,marginLeft:"auto"}}>{v}</span>:<div style={{marginLeft:"auto",width:24,height:2,borderTop:"1.5px dashed rgba(255,255,255,0.25)"}}/>}</div>)}
      </div>
      {state==="idle"&&<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"0 32px 32px",background:"linear-gradient(to top,rgba(13,27,46,0.95) 0%,transparent 100%)"}}><h2 style={{color:T.white,fontSize:28,fontWeight:700,margin:"0 0 10px",lineHeight:1.2}}>Ready to scan your market</h2><p style={{color:"rgba(255,255,255,0.65)",fontSize:14,margin:"0 0 20px",maxWidth:340,lineHeight:1.5}}>Launch Genesis to discover franchise-ready businesses, identify operators, and build outreach-ready prospect lists.</p><div style={{display:"flex",alignItems:"center",gap:8,color:"rgba(255,255,255,0.4)",fontSize:11}}><span>Lock</span><span>Secure. Compliant. Built for franchise growth.</span></div></div>}
      {state==="running"&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-60%)",textAlign:"center",pointerEvents:"none"}}><div style={{color:T.white,fontSize:16,fontWeight:600}}>Scanning <span style={{color:T.teal}}>{city||"your market"}</span></div><div style={{color:"rgba(255,255,255,0.5)",fontSize:12,marginTop:4}}>Discovering franchise-ready businesses</div></div>}
    </div>
  );
}

function Stepper({ state, step }) {
  const steps=[
    {l:"Scout",sub:state==="complete"?"30 scanned":"Map the market"},
    {l:"Filter",sub:state==="complete"?"29 independent":"Qualify opportunities"},
    {l:"Discover",sub:state==="complete"?"28 names found":"Find high-fit businesses"},
    {l:"Enrich",sub:state==="complete"?"25 emails found":"Gather intel & contacts"},
    {l:"Outreach",sub:state==="complete"?"21 ready":"Prepare to connect"},
  ];
  const icons=["S","F","D","E","O"];
  const gs=i=>{ if(state==="idle")return"idle"; if(state==="complete")return"done"; if(i<step)return"done"; if(i===step)return"active"; return"queued"; };
  return (
    <div style={{display:"flex",alignItems:"center",padding:"16px 24px",background:T.white,borderBottom:`1px solid ${T.gray200}`}}>
      {steps.map((s,i)=>{ const st=gs(i); return (
        <div key={s.l} style={{display:"flex",alignItems:"center",flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flex:"0 0 auto"}}>
            <div style={{width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,flexShrink:0,background:st==="done"?T.greenLight:st==="active"?"rgba(0,87,255,0.1)":T.gray100,border:st==="done"?`2px solid ${T.green}`:st==="active"?`2px solid ${T.blue}`:`2px solid ${T.gray300}`,color:st==="done"?T.green:st==="active"?T.blue:T.gray400,boxShadow:st==="active"?"0 0 0 4px rgba(0,87,255,0.12)":"none"}}>{st==="done"?"V":icons[i]}</div>
            <div><div style={{fontSize:13,fontWeight:600,color:st==="idle"||st==="queued"?T.gray400:st==="done"?T.gray700:T.blue}}>{s.l}</div><div style={{fontSize:11,color:st==="done"&&state==="complete"?T.green:T.gray400}}>{s.sub}</div></div>
          </div>
          {i<steps.length-1&&<div style={{flex:1,height:2,margin:"0 12px",background:st==="done"?T.green:st==="active"?`linear-gradient(90deg,${T.blue},${T.gray200})`:T.gray200,borderRadius:1}}/>}
        </div>
      ); })}
      {state==="complete"&&<div style={{marginLeft:16,flexShrink:0,padding:"8px 16px",background:T.greenLight,border:"1px solid rgba(16,185,129,0.3)",borderRadius:10}}><div style={{color:T.green,fontSize:12,fontWeight:700}}>Pipeline complete</div><div style={{color:T.green,fontSize:10,opacity:0.7}}>All steps finished</div></div>}
    </div>
  );
}

function KpiCard({ number, label, sub, icon, color, accent }) {
  return (
    <div style={{background:T.white,border:`1px solid ${T.gray200}`,borderRadius:12,padding:"18px 20px",flex:1,minWidth:0}}>
      <div style={{width:36,height:36,borderRadius:8,background:accent||T.gray100,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,marginBottom:8}}>{icon}</div>
      <div style={{fontSize:28,fontWeight:700,color:color||T.gray900,lineHeight:1}}>{number}</div>
      <div style={{fontSize:12,fontWeight:600,color:T.gray500,marginTop:2,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</div>
      {sub&&<div style={{fontSize:11,color:T.gray400,marginTop:3}}>{sub}</div>}
    </div>
  );
}

function ProspectCard({ biz }) {
  return (
    <div style={{background:T.white,border:`1px solid ${T.gray200}`,borderRadius:14,overflow:"hidden",marginBottom:16,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
      <div style={{display:"flex"}}>
        <div style={{width:160,flexShrink:0,background:`linear-gradient(135deg,${biz.c1},${biz.c2})`,display:"flex",alignItems:"center",justifyContent:"center",minHeight:160,fontSize:40}}>{biz.emoji}</div>
        <div style={{flex:1,padding:"18px 20px"}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
            <div style={{textAlign:"center",flexShrink:0}}>
              <div style={{width:58,height:58,borderRadius:"50%",border:`3px solid ${T.blue}`,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,87,255,0.05)"}}><span style={{fontSize:18,fontWeight:700,color:T.blue}}>{biz.score}</span></div>
              <div style={{fontSize:10,color:T.gray400,marginTop:3}}>Fit Score</div>
              <div style={{fontSize:10,color:T.green,fontWeight:600,marginTop:1}}>{biz.scoreLabel}</div>
            </div>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                <span style={{fontSize:16,fontWeight:700,color:T.gray900}}>{biz.name}</span>
                <span style={{fontSize:11,fontWeight:600,color:T.green,background:T.greenLight,padding:"2px 8px",borderRadius:20}}>Validated</span>
                <span style={{fontSize:11,fontWeight:600,color:T.blue,background:"rgba(0,87,255,0.08)",padding:"2px 8px",borderRadius:20}}>Verified</span>
              </div>
              <div style={{fontSize:12,color:T.blue,fontWeight:500,marginBottom:6}}>{biz.owner} - Owner</div>
              <div style={{display:"flex",gap:16,marginBottom:8}}><span style={{fontSize:12,color:T.gray500}}>{biz.email}</span><span style={{fontSize:12,color:T.gray500}}>{biz.phone}</span></div>
              <div style={{fontSize:11,color:T.gray400,marginBottom:8}}>{biz.category} - 1 Location - Independent</div>
              <div style={{fontSize:12,color:T.gray500,lineHeight:1.5}}>{biz.desc}</div>
            </div>
          </div>
        </div>
        <div style={{width:220,flexShrink:0,borderLeft:`1px solid ${T.gray100}`,padding:"18px 16px",display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:14,color:T.orange}}>*</span><span style={{fontSize:18,fontWeight:700,color:T.gray900}}>{biz.rating}</span><span style={{fontSize:11,color:T.gray400}}>{biz.reviews} reviews</span></div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>{biz.signals.map(s=><span key={s} style={{fontSize:11,color:T.gray500,background:T.gray50,border:`1px solid ${T.gray200}`,borderRadius:6,padding:"3px 8px"}}>{s}</span>)}</div>
          <div style={{marginTop:"auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><div style={{width:7,height:7,borderRadius:"50%",background:T.green}}/><span style={{fontSize:12,fontWeight:600,color:T.green}}>Outreach Ready</span></div>
            <div style={{fontSize:11,color:T.gray400,marginBottom:10}}>Best contact: Email</div>
            <button style={{width:"100%",padding:"8px 0",background:T.blue,color:T.white,border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>View Prospect</button>
            <button style={{width:"100%",marginTop:6,padding:"6px 0",background:"transparent",color:T.gray500,border:`1px solid ${T.gray200}`,borderRadius:8,fontSize:12,cursor:"pointer"}}>Add to List</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GenesisAgentPage() {
  const [state, setState] = useState("idle");
  const [city, setCity] = useState("");
  const [industry, setIndustry] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [feed, setFeed] = useState([]);
  const [kpis, setKpis] = useState({s:0,q:0,o:0,e:0,p:0});
  const timerRef = useRef(null);

  const industries = ["Food & Beverage","Fitness","Health & Wellness","Beauty & Personal Care","Pet Services","Auto Services","Home Services","Senior Care","Cleaning Services","Children's Education","Real Estate Services","Marketing & Media"];

  const feedData = [
    {color:T.blueBright,title:"Discovered: The Twisted Fork",desc:"Independent - American - 45 seats",time:"3:42 PM"},
    {color:T.gray400,title:"Filtered out: Pizza Palace Reno",desc:"Low fit: Limited growth potential",time:"3:42 PM"},
    {color:T.purple,title:"Identified: Arturo Torres",desc:"Owner / Operator",time:"3:41 PM"},
    {color:T.green,title:"Verified email: michael@twistedfork915.com",desc:"Deliverable",time:"3:41 PM"},
    {color:T.blueBright,title:"Discovered: The Kitchen Table Reno",desc:"Independent - Brunch - 38 seats",time:"3:41 PM"},
    {color:T.gray400,title:"Filtered out: Sweet Treats Bakery",desc:"Low fit: Not scalable concept",time:"3:40 PM"},
  ];

  const runScan = () => {
    if(!city||!industry) return;
    setState("running"); setElapsed(0); setActiveStep(0); setFeed([]); setKpis({s:0,q:0,o:0,e:0,p:0});
    let t=0;
    timerRef.current=setInterval(()=>{
      t++;
      setElapsed(t);
      if(t===3)setActiveStep(1); if(t===6)setActiveStep(2); if(t===10)setActiveStep(3); if(t===15)setActiveStep(4);
      setKpis({s:Math.min(128,t*9),q:Math.min(46,t*3),o:Math.min(31,t*2),e:Math.min(19,Math.floor(t*1.3)),p:Math.min(12,Math.floor(t*0.8))});
      if(t<=feedData.length) setFeed(feedData.slice(0,t));
      if(t>=18){ clearInterval(timerRef.current); setState("complete"); }
    },1000);
  };

  const prospects = [
    {name:"The Twisted Fork",score:95,scoreLabel:"Excellent",owner:"Arturo Torres",email:"michael@twistedfork915.com",phone:"(775) 853-6033",category:"Casual Dining",rating:4.5,reviews:175,desc:"Modern American cuisine with a Latin twist. Strong local following with high repeat business and prime downtown location.",signals:["Multiple competitors nearby","High online engagement","Consistent review growth"],c1:"#1a1a2e",c2:"#16213e",emoji:"[fork]"},
    {name:"The Kitchen Table Reno",score:92,scoreLabel:"Excellent",owner:"Alexander Alioto",email:"info@thekitchentablereno.com",phone:"(775) 384-3959",category:"Breakfast & Brunch",rating:4.5,reviews:205,desc:"Beloved neighborhood brunch spot with creative farm-to-table dishes and an exceptionally loyal customer base.",signals:["High customer loyalty","Strong weekend traffic","Franchise competitors present"],c1:"#1a2f1a",c2:"#1a3a1a",emoji:"[coffee]"},
  ];

  const fmt=s=>`${Math.floor(s/60)}m ${s%60}s`;

  return (
    <>
      <style>{`
        @keyframes gpulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes gspin{to{transform:rotate(360deg)}}
        @keyframes gslide{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        .genesis-root *{box-sizing:border-box}
        .genesis-root input,.genesis-root select{font-family:inherit}
      `}</style>
      <div className="genesis-root" style={{display:"flex",height:"100vh",fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,sans-serif",background:T.gray50,position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:9999}}>

        {/* Sidebar */}
        <aside style={{width:200,background:T.white,borderRight:`1px solid ${T.gray200}`,display:"flex",flexDirection:"column",flexShrink:0}}>
          <div style={{padding:"20px 16px 16px",display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:28,height:28,background:`linear-gradient(135deg,${T.blue},${T.teal})`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:T.white,fontWeight:900,fontSize:13}}>K</span></div>
            <span style={{fontWeight:700,fontSize:16,color:T.gray900}}>kanso</span>
          </div>
          <nav style={{padding:"4px 8px",flex:1}}>
            {[{l:"Dashboard"},{l:"Meetings"},{l:"CQ Recovery"},{l:"Nurture"},{l:"Prospecting"},{l:"Leads"},{l:"Settings"}].map(({l})=><div key={l} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:7,cursor:"pointer",color:T.gray500,fontSize:13,marginBottom:1}}><span style={{width:16}}></span>{l}</div>)}
            <div style={{margin:"12px 10px 6px",fontSize:10,fontWeight:700,color:T.gray400,letterSpacing:"0.08em",textTransform:"uppercase"}}>AI Workflows</div>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:7,background:"rgba(0,87,255,0.06)",cursor:"pointer",color:T.blue,fontSize:13,fontWeight:600,borderLeft:`3px solid ${T.blue}`}}>Genesis Agent</div>
          </nav>
          <div style={{padding:"12px 8px",borderTop:`1px solid ${T.gray100}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:`linear-gradient(135deg,${T.blue},${T.purple})`,display:"flex",alignItems:"center",justifyContent:"center",color:T.white,fontSize:12,fontWeight:700}}>S</div>
              <div><div style={{fontSize:12,fontWeight:600,color:T.gray700}}>Steve Sparks</div><div style={{fontSize:10,color:T.gray400}}>ssparks@thefranchis...</div></div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column"}}>

          {/* Header */}
          <div style={{padding:"20px 28px 0",display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <h1 style={{margin:0,fontSize:24,fontWeight:800,color:T.gray900}}>Genesis Agent</h1>
                {state==="idle"&&<span style={{fontSize:11,fontWeight:700,color:T.gray400,background:T.gray100,border:`1px solid ${T.gray200}`,padding:"3px 10px",borderRadius:20}}>READY</span>}
                {state==="running"&&<span style={{fontSize:11,fontWeight:700,color:T.blue,background:"rgba(0,87,255,0.1)",border:"1px solid rgba(0,87,255,0.25)",padding:"3px 10px",borderRadius:20}}>SCANNING - {fmt(elapsed)}</span>}
                {state==="complete"&&<span style={{fontSize:11,fontWeight:700,color:T.green,background:T.greenLight,border:"1px solid rgba(16,185,129,0.3)",padding:"3px 10px",borderRadius:20}}>Scan complete - 2m 14s</span>}
              </div>
              <p style={{margin:"3px 0 0",fontSize:13,color:T.gray400}}>{state==="complete"?"AI-powered prospect discovery for franchise growth":"Find franchise-ready businesses in any market."}</p>
            </div>
            <span style={{fontSize:11,color:T.gray400,background:T.gray100,border:`1px solid ${T.gray200}`,padding:"3px 10px",borderRadius:20}}>v4.1</span>
          </div>

          {/* Control Bar */}
          <div style={{padding:"14px 28px",borderBottom:`1px solid ${T.gray200}`,display:"flex",gap:10,alignItems:"center"}}>
            <div style={{flex:1,position:"relative"}}>
              <input value={city} onChange={e=>setCity(e.target.value)} placeholder="City or Metro Area" disabled={state==="running"} style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${T.gray200}`,borderRadius:10,fontSize:14,color:T.gray700,outline:"none",background:T.white}}/>
            </div>
            <div style={{flex:1,position:"relative"}}>
              <select value={industry} onChange={e=>setIndustry(e.target.value)} disabled={state==="running"} style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${T.gray200}`,borderRadius:10,fontSize:14,color:industry?T.gray700:T.gray400,outline:"none",background:T.white,appearance:"none",cursor:"pointer"}}>
                <option value="">Select industry</option>
                {industries.map(ind=><option key={ind} value={ind}>{ind}</option>)}
              </select>
            </div>
            <div style={{width:180}}>
              <select disabled={state==="running"} style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${T.gray200}`,borderRadius:10,fontSize:14,color:T.gray700,outline:"none",background:T.white,appearance:"none",cursor:"pointer"}}>
                <option>Deep Scan</option><option>Quick Scan</option><option>Aggressive Scan</option>
              </select>
            </div>
            {state==="complete"
              ?<div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setState("idle");setCity("");setIndustry("");}} style={{padding:"10px 18px",background:T.white,color:T.gray700,border:`1.5px solid ${T.gray200}`,borderRadius:10,fontSize:14,fontWeight:600,cursor:"pointer"}}>Rerun Scan</button>
                <button style={{padding:"10px 20px",background:T.blue,color:T.white,border:"none",borderRadius:10,fontSize:14,fontWeight:600,cursor:"pointer"}}>Launch Outreach</button>
              </div>
              :<button onClick={runScan} disabled={!city||!industry||state==="running"} style={{padding:"10px 22px",borderRadius:10,fontSize:14,fontWeight:600,cursor:(!city||!industry||state==="running")?"default":"pointer",background:(!city||!industry)?T.gray200:state==="running"?T.navyMid:T.blue,color:(!city||!industry)?T.gray400:T.white,border:"none",whiteSpace:"nowrap"}}>
                {state==="running"?"Scanning...":"Run Genesis Scan"}
              </button>}
          </div>

          {/* Stepper */}
          <Stepper state={state} step={activeStep}/>

          {/* Content */}
          <div style={{flex:1,padding:"20px 28px 28px",overflow:"auto"}}>

            {/* IDLE */}
            {state==="idle"&&<>
              <div style={{display:"flex",gap:20,marginBottom:20}}>
                <div style={{flex:"0 0 65%",height:340,borderRadius:16,overflow:"hidden"}}><MapViz state="idle" city=""/></div>
                <div style={{flex:1,background:T.white,border:`1px solid ${T.gray200}`,borderRadius:14,padding:"20px 22px",overflow:"auto"}}>
                  <h3 style={{margin:"0 0 4px",fontSize:15,fontWeight:700,color:T.gray900}}>What Genesis will do</h3>
                  <p style={{margin:"0 0 16px",fontSize:12,color:T.gray400}}>A five-step AI workflow that finds your best opportunities.</p>
                  {[{l:"Scout",d:"Map the market and identify businesses to evaluate."},{l:"Filter",d:"Apply AI quality scoring to surface best-fit prospects."},{l:"Discover",d:"Find high-potential businesses and decision-makers."},{l:"Enrich",d:"Gather contact info, digital signals, and business intel."},{l:"Outreach",d:"Prepare personalized outreach and export your list."}].map(({l,d})=><div key={l} style={{display:"flex",gap:12,marginBottom:12,paddingBottom:12,borderBottom:`1px solid ${T.gray100}`}}><div style={{width:32,height:32,borderRadius:8,background:T.gray50,border:`1px solid ${T.gray200}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:T.blue,flexShrink:0}}>{l[0]}</div><div><div style={{fontSize:13,fontWeight:600,color:T.gray700,marginBottom:2}}>{l}</div><div style={{fontSize:11,color:T.gray400,lineHeight:1.4}}>{d}</div></div></div>)}
                  <div style={{padding:"8px 12px",background:T.gray50,borderRadius:8,fontSize:11,color:T.gray400}}>Each scan is unique to your market and criteria.</div>
                </div>
              </div>
              <div style={{display:"flex",gap:16,marginBottom:16}}>
                <div style={{width:200,flexShrink:0,background:T.white,border:`1px solid ${T.gray200}`,borderRadius:14,padding:"16px 18px"}}><h4 style={{margin:"0 0 8px",fontSize:13,fontWeight:700,color:T.gray700}}>What you will uncover</h4><p style={{margin:0,fontSize:11,color:T.gray400,lineHeight:1.4}}>Illustrative sample based on similar markets.</p></div>
                {[{l:"Businesses Scouted",v:"120 - 250",s:"Total businesses analyzed",a:"rgba(0,87,255,0.08)"},{l:"Owners Identified",v:"40 - 90",s:"Decision-makers found",a:"rgba(139,92,246,0.08)"},{l:"Verified Emails",v:"15 - 45",s:"Contactable emails",a:"rgba(0,194,168,0.08)"},{l:"High-Fit Prospects",v:"10 - 30",s:"Likely franchise-ready",a:"rgba(245,158,11,0.08)"}].map(({l,v,s,a})=><div key={l} style={{flex:1,background:T.white,border:`1px solid ${T.gray200}`,borderRadius:14,padding:"16px 18px"}}><div style={{width:36,height:36,borderRadius:8,background:a,marginBottom:10}}/><div style={{fontSize:22,fontWeight:700,color:T.gray900,marginBottom:2}}>{v}</div><div style={{fontSize:12,fontWeight:600,color:T.gray500,marginBottom:4}}>{l}</div><div style={{fontSize:11,color:T.gray400,marginBottom:8}}>{s}</div><span style={{fontSize:10,fontWeight:600,color:T.blue,background:"rgba(0,87,255,0.08)",border:"1px solid rgba(0,87,255,0.15)",padding:"2px 8px",borderRadius:20}}>Sample range</span></div>)}
              </div>
              <div style={{background:T.white,border:`1px solid ${T.gray200}`,borderRadius:14,padding:"16px 20px",display:"flex",alignItems:"center",gap:20}}>
                <div><div style={{fontSize:13,fontWeight:700,color:T.gray700,marginBottom:3}}>Sample prospect preview</div><div style={{fontSize:11,color:T.gray400}}>Here is the kind of franchise-ready business you will discover.</div></div>
                <div style={{flex:1,display:"flex",alignItems:"center",gap:14,padding:"10px 16px",background:T.gray50,borderRadius:10}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,${T.blue},${T.navy})`,display:"flex",alignItems:"center",justifyContent:"center",color:T.white,fontSize:12,fontWeight:700}}>TF</div>
                  <div><div style={{fontSize:13,fontWeight:700,color:T.gray900}}>The Twisted Fork</div><div style={{fontSize:10,color:T.gray400,marginTop:2}}>Restaurant - Reno, NV - 18 employees - $2.1M revenue - Independent</div></div>
                  <div style={{marginLeft:"auto",display:"flex",gap:6}}>
                    <span style={{fontSize:11,fontWeight:600,color:T.green,background:T.greenLight,padding:"3px 9px",borderRadius:20}}>High Franchise Fit</span>
                    <span style={{fontSize:11,fontWeight:600,color:T.purple,background:T.purpleLight,padding:"3px 9px",borderRadius:20}}>Verified Contact</span>
                  </div>
                </div>
                <div style={{fontSize:10,color:T.gray300,flexShrink:0,maxWidth:120,textAlign:"right"}}>Real results will appear after your scan.</div>
              </div>
            </>}

            {/* RUNNING */}
            {state==="running"&&<>
              <div style={{display:"flex",gap:20,marginBottom:20}}>
                <div style={{flex:"0 0 65%",height:360,borderRadius:16,overflow:"hidden"}}><MapViz state="running" city={city}/></div>
                <div style={{flex:1,background:T.white,border:`1px solid ${T.gray200}`,borderRadius:14,padding:"16px",overflow:"hidden",display:"flex",flexDirection:"column"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                    <h3 style={{margin:0,fontSize:14,fontWeight:700,color:T.gray900}}>Live Activity</h3>
                    <span style={{fontSize:11,color:T.teal,background:"rgba(0,194,168,0.1)",border:"1px solid rgba(0,194,168,0.25)",padding:"2px 9px",borderRadius:20}}>Streaming</span>
                  </div>
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:4,overflow:"auto"}}>
                    {feed.map((item,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 10px",background:i===0?"rgba(0,87,255,0.04)":"transparent",borderRadius:8,alignItems:"flex-start"}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:item.color,flexShrink:0,marginTop:4}}/>
                      <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:T.gray700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div><div style={{fontSize:11,color:T.gray400}}>{item.desc}</div></div>
                      <div style={{fontSize:10,color:T.gray300,flexShrink:0}}>{item.time}</div>
                    </div>)}
                  </div>
                  <div style={{marginTop:12,padding:"8px 10px",background:T.gray50,borderRadius:8,fontSize:11,color:T.gray400}}>Analyzing hundreds of businesses in real time...</div>
                </div>
              </div>
              <div style={{display:"flex",gap:14}}>
                {[{n:kpis.s,l:"Businesses Scouted",s:"64% of estimated market",c:T.blue,a:"rgba(0,87,255,0.06)"},{n:kpis.q,l:"Qualified Operators",s:"Filtering in progress",c:T.teal,a:"rgba(0,194,168,0.06)"},{n:kpis.o,l:"Owners Identified",s:"Building decision-maker list",c:T.purple,a:"rgba(139,92,246,0.06)"},{n:kpis.e,l:"Emails Verified",s:"Verifying deliverability",c:T.green,a:"rgba(16,185,129,0.06)"},{n:kpis.p,l:"High-Fit Prospects",s:"Scoring and ranking...",c:T.orange,a:"rgba(245,158,11,0.06)"}].map(({n,l,s,c,a})=><div key={l} style={{flex:1,background:T.white,border:`1px solid ${T.gray200}`,borderRadius:12,padding:"16px"}}>
                  <div style={{width:32,height:32,borderRadius:8,background:a,marginBottom:8}}/>
                  <div style={{fontSize:26,fontWeight:700,color:c,lineHeight:1}}>{n}</div>
                  <div style={{fontSize:11,fontWeight:600,color:T.gray500,marginTop:2}}>{l}</div>
                  <div style={{fontSize:10,color:T.gray400,marginTop:3}}>{s}</div>
                  <div style={{marginTop:8,height:3,background:T.gray100,borderRadius:2}}><div style={{width:`${Math.min(100,(n/128)*100)}%`,height:"100%",background:c,borderRadius:2,transition:"width 0.5s ease"}}/></div>
                </div>)}
              </div>
            </>}

            {/* COMPLETE */}
            {state==="complete"&&<>
              <div style={{display:"flex",gap:12,marginBottom:20}}>
                <KpiCard number="30" label="Scouted" sub="Businesses scanned" icon="S" color={T.blue} accent="rgba(0,87,255,0.08)"/>
                <KpiCard number="29" label="Independent" sub="97% of scouted" icon="I" color={T.teal} accent="rgba(0,194,168,0.08)"/>
                <KpiCard number="28" label="Names Found" sub="96% of independent" icon="N" color={T.orange} accent="rgba(245,158,11,0.08)"/>
                <KpiCard number="25" label="Emails Found" sub="89% of names found" icon="E" color={T.purple} accent="rgba(139,92,246,0.08)"/>
                <KpiCard number="21" label="Deliverable" sub="72% of emails" icon="D" color={T.blue} accent="rgba(0,87,255,0.08)"/>
                <KpiCard number="21" label="Loaded" sub="100% ready" icon="L" color={T.green} accent={T.greenLight}/>
              </div>
              <div style={{background:T.white,border:`1px solid ${T.gray200}`,borderRadius:14,padding:"20px 24px",marginBottom:20,display:"flex",gap:24,flexWrap:"wrap"}}>
                <div style={{flex:"0 0 auto"}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.gray400,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Top Result</div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:24}}>Trophy</span><div><div style={{fontSize:18,fontWeight:800,color:T.gray900}}><span style={{color:T.blue}}>21</span> high-fit franchise prospects identified</div><div style={{fontSize:12,color:T.gray400,marginTop:3}}>Independent, owner-operated businesses in {city||"your market"}.</div></div></div>
                </div>
                <div style={{flex:"0 0 auto",borderLeft:`1px solid ${T.gray100}`,paddingLeft:24}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.gray400,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Average Rating</div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:28,fontWeight:800,color:T.gray900}}>4.5</span><div><div style={{color:T.orange}}>* * * * *</div><div style={{fontSize:11,color:T.gray400}}>Across 205 reviews</div></div></div>
                </div>
                <div style={{flex:1,borderLeft:`1px solid ${T.gray100}`,paddingLeft:24}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.gray400,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Top Opportunity Clusters</div>
                  {[["Casual Dining",7],["Fast Casual",6],["Beverage / Bar",4],["Coffee / Cafe",4]].map(([l,v])=><div key={l} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}><span style={{fontSize:12,color:T.gray500,width:120}}>{l}</span><div style={{flex:1,height:4,background:T.gray100,borderRadius:2}}><div style={{width:`${(v/7)*100}%`,height:"100%",background:T.blue,borderRadius:2}}/></div><span style={{fontSize:12,fontWeight:600,color:T.gray700,width:16,textAlign:"right"}}>{v}</span></div>)}
                </div>
                <div style={{flex:1,borderLeft:`1px solid ${T.gray100}`,paddingLeft:24}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.gray400,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Most Common Expansion Signals</div>
                  {[["Multiple locations nearby",11],["High customer demand",9],["Strong online presence",8],["Franchise competitors present",7]].map(([l,v])=><div key={l} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}><span style={{color:T.green,fontSize:12}}>V</span><span style={{fontSize:12,color:T.gray500,flex:1}}>{l}</span><span style={{fontSize:12,fontWeight:600,color:T.gray700}}>{v}</span></div>)}
                </div>
              </div>
              <div style={{fontSize:12,color:T.gray400,marginBottom:14}}>21 prospects - Sorted by franchise-fit score</div>
              {prospects.map(p=><ProspectCard key={p.name} biz={p}/>)}
            </>}

          </div>
        </main>
      </div>
    </>
  );
}
