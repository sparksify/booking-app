import { useState } from "react";

const T = {
  navy:"#0D1B2E",blue:"#0057FF",blueBright:"#2D7EFF",teal:"#00C2A8",
  green:"#10B981",greenLight:"#D1FAE5",orange:"#F59E0B",red:"#EF4444",redLight:"#FEE2E2",
  purple:"#8B5CF6",purpleLight:"#EDE9FE",gray50:"#F8FAFC",gray100:"#F1F5F9",
  gray200:"#E2E8F0",gray300:"#CBD5E1",gray400:"#94A3B8",gray500:"#64748B",
  gray700:"#334155",gray900:"#0F172A",white:"#FFFFFF",
};

const STYLE_PRESETS = [
  { key:"hormozi", label:"Hormozi", desc:"Short, punchy, direct-response hook. Low-friction specific ask." },
  { key:"consultative", label:"Consultative", desc:"Advisory tone, measured and credible. Open-ended ask, no pressure." },
  { key:"direct", label:"Direct & Blunt", desc:"Plain, no fluff. Under 60 words. Straight to the point." },
  { key:"warm", label:"Warm & Relational", desc:"Friendly, genuine, conversational. Soft, low-pressure ask." },
];

const PLACEHOLDERS = ["{business_name}","{owner_name}","{owner_first_name}","{city}","{category}","{rating}","{review_count}"];

function newVariant(n) {
  return {
    id: Date.now() + Math.random(),
    label: "Variant " + n,
    mode: "ai_styled",
    style: "consultative",
    custom_prompt: "",
    template_subject1: "",
    template1: "",
    template_subject2: "",
    template2: "",
  };
}

function VariantEditor({ variant, onChange, onRemove, canRemove }) {
  const set = (patch) => onChange({ ...variant, ...patch });

  return (
    <div style={{background:T.white,border:"1px solid "+T.gray200,borderRadius:14,padding:18,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <input
          value={variant.label}
          onChange={e=>set({label:e.target.value})}
          style={{fontSize:14,fontWeight:700,color:T.gray900,border:"1.5px solid "+T.gray200,borderRadius:8,padding:"6px 10px",flex:1,outline:"none"}}
        />
        {canRemove && (
          <button onClick={onRemove} style={{fontSize:12,color:T.red,background:T.redLight,border:"1px solid rgba(239,68,68,0.25)",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontWeight:600}}>
            Remove
          </button>
        )}
      </div>

      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <button
          onClick={()=>set({mode:"ai_styled"})}
          style={{flex:1,padding:"8px 0",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",border:"1.5px solid "+(variant.mode==="ai_styled"?T.blue:T.gray200),background:variant.mode==="ai_styled"?"rgba(0,87,255,0.06)":T.white,color:variant.mode==="ai_styled"?T.blue:T.gray500}}
        >
          AI Style
        </button>
        <button
          onClick={()=>set({mode:"custom_template"})}
          style={{flex:1,padding:"8px 0",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",border:"1.5px solid "+(variant.mode==="custom_template"?T.blue:T.gray200),background:variant.mode==="custom_template"?"rgba(0,87,255,0.06)":T.white,color:variant.mode==="custom_template"?T.blue:T.gray500}}
        >
          My Own Message
        </button>
      </div>

      {variant.mode === "ai_styled" ? (
        <>
          <div style={{fontSize:11,fontWeight:700,color:T.gray500,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Style</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
            {STYLE_PRESETS.map(p=>(
              <button
                key={p.key}
                onClick={()=>set({style:p.key})}
                title={p.desc}
                style={{padding:"7px 14px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",border:"1.5px solid "+(variant.style===p.key?T.blue:T.gray200),background:variant.style===p.key?T.blue:T.white,color:variant.style===p.key?T.white:T.gray600}}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div style={{fontSize:11,color:T.gray400,marginBottom:8}}>
            {STYLE_PRESETS.find(p=>p.key===variant.style)?.desc}
          </div>
          <div style={{fontSize:11,fontWeight:700,color:T.gray500,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Custom instructions (optional — overrides style above)</div>
          <textarea
            value={variant.custom_prompt}
            onChange={e=>set({custom_prompt:e.target.value})}
            placeholder="Leave blank to use the style preset, or write your own tone/approach instructions here..."
            rows={3}
            style={{width:"100%",border:"1.5px solid "+T.gray200,borderRadius:8,padding:"9px 11px",fontSize:13,color:T.gray700,outline:"none",fontFamily:"inherit",resize:"vertical"}}
          />
        </>
      ) : (
        <>
          <div style={{fontSize:11,fontWeight:700,color:T.gray500,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Email 1 — Subject</div>
          <input
            value={variant.template_subject1}
            onChange={e=>set({template_subject1:e.target.value})}
            placeholder="Quick question about {business_name}"
            style={{width:"100%",border:"1.5px solid "+T.gray200,borderRadius:8,padding:"8px 11px",fontSize:13,color:T.gray700,outline:"none",marginBottom:10,fontFamily:"inherit"}}
          />
          <div style={{fontSize:11,fontWeight:700,color:T.gray500,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Email 1 — Body</div>
          <textarea
            value={variant.template1}
            onChange={e=>set({template1:e.target.value})}
            placeholder={"Hey {owner_first_name}, ..."}
            rows={5}
            style={{width:"100%",border:"1.5px solid "+T.gray200,borderRadius:8,padding:"9px 11px",fontSize:13,color:T.gray700,outline:"none",fontFamily:"inherit",resize:"vertical",marginBottom:12}}
          />
          <div style={{fontSize:11,fontWeight:700,color:T.gray500,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Email 2 (follow-up) — Subject</div>
          <input
            value={variant.template_subject2}
            onChange={e=>set({template_subject2:e.target.value})}
            placeholder="Optional"
            style={{width:"100%",border:"1.5px solid "+T.gray200,borderRadius:8,padding:"8px 11px",fontSize:13,color:T.gray700,outline:"none",marginBottom:10,fontFamily:"inherit"}}
          />
          <div style={{fontSize:11,fontWeight:700,color:T.gray500,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Email 2 — Body</div>
          <textarea
            value={variant.template2}
            onChange={e=>set({template2:e.target.value})}
            placeholder="Optional follow-up..."
            rows={3}
            style={{width:"100%",border:"1.5px solid "+T.gray200,borderRadius:8,padding:"9px 11px",fontSize:13,color:T.gray700,outline:"none",fontFamily:"inherit",resize:"vertical",marginBottom:10}}
          />
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {PLACEHOLDERS.map(p=>(
              <span key={p} style={{fontSize:10,color:T.gray500,background:T.gray50,border:"1px solid "+T.gray200,borderRadius:6,padding:"2px 8px",fontFamily:"monospace"}}>{p}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EmailPreviewCard({ variantResult }) {
  const isTemplate = variantResult.mode === "custom_template";
  return (
    <div style={{background:T.white,border:"1px solid "+T.gray200,borderRadius:14,overflow:"hidden",marginBottom:14}}>
      <div style={{padding:"12px 16px",background:T.gray50,borderBottom:"1px solid "+T.gray200,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:13,fontWeight:700,color:T.gray900}}>{variantResult.variant_label}</span>
        <span style={{fontSize:10,fontWeight:600,color:isTemplate?T.purple:T.blue,background:isTemplate?T.purpleLight:"rgba(0,87,255,0.08)",padding:"2px 9px",borderRadius:20}}>
          {isTemplate ? "Custom" : "AI · " + (variantResult.style||"")}
        </span>
      </div>
      <div style={{padding:16}}>
        <div style={{fontSize:10,fontWeight:700,color:T.gray400,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Email 1</div>
        <div style={{fontSize:13,fontWeight:700,color:T.gray900,marginBottom:6}}>{variantResult.email1_subject}</div>
        <div style={{fontSize:13,color:T.gray700,lineHeight:1.6,whiteSpace:"pre-wrap",marginBottom:14}}>{variantResult.email1_body}</div>
        {variantResult.email2_body && (
          <>
            <div style={{fontSize:10,fontWeight:700,color:T.gray400,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4,borderTop:"1px solid "+T.gray100,paddingTop:12}}>Email 2 (follow-up)</div>
            <div style={{fontSize:13,fontWeight:700,color:T.gray900,marginBottom:6}}>{variantResult.email2_subject}</div>
            <div style={{fontSize:13,color:T.gray700,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{variantResult.email2_body}</div>
          </>
        )}
      </div>
    </div>
  );
}

export default function OutreachStudio() {
  const [variants, setVariants] = useState([newVariant(1)]);
  const [biz, setBiz] = useState({
    business_name: "Thunder Gym",
    owner_name: "Gus Perez",
    city: "Miami, FL",
    category: "Fitness",
    rating: "4.5",
    review_count: "112",
  });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const addVariant = () => setVariants(v => [...v, newVariant(v.length + 1)]);
  const updateVariant = (id, updated) => setVariants(v => v.map(x => x.id === id ? updated : x));
  const removeVariant = (id) => setVariants(v => v.filter(x => x.id !== id));

  const generate = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const payload = {
        businesses: [{
          business_name: biz.business_name,
          owner_name: biz.owner_name,
          city: biz.city,
          category: biz.category,
          rating: biz.rating,
          review_count: biz.review_count,
          email: "preview@example.com",
          loadable: true,
        }],
        variants: variants.map(v => v.mode === "ai_styled"
          ? { label: v.label, mode: "ai_styled", style: v.style, custom_prompt: v.custom_prompt }
          : { label: v.label, mode: "custom_template", subject1: v.template_subject1, template: v.template1, subject2: v.template_subject2, template2: v.template2 }
        ),
      };
      const r = await fetch("/api/pipeline/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Request failed");
      setResults(data.results?.[0]?.outreach_variants || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,sans-serif",background:T.gray50,position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:9999,overflow:"hidden"}}>

      <aside style={{width:196,background:T.white,borderRight:"1px solid "+T.gray200,display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:"18px 14px 14px",display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:26,height:26,background:"linear-gradient(135deg,"+T.blue+","+T.teal+")",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{color:T.white,fontWeight:900,fontSize:12}}>K</span>
          </div>
          <span style={{fontWeight:700,fontSize:15,color:T.gray900}}>kanso</span>
        </div>
        <nav style={{padding:"4px 8px",flex:1}}>
          {["Dashboard","Meetings","CQ Recovery","Nurture","Prospecting","Leads","Settings"].map(l=>(
            <div key={l} style={{padding:"7px 10px",borderRadius:7,cursor:"pointer",color:T.gray500,fontSize:13,marginBottom:1}}>{l}</div>
          ))}
          <div style={{margin:"12px 10px 6px",fontSize:10,fontWeight:700,color:T.gray400,letterSpacing:"0.08em",textTransform:"uppercase"}}>AI Workflows</div>
          <div style={{padding:"7px 10px",borderRadius:7,cursor:"pointer",color:T.gray500,fontSize:13,marginBottom:1}}>Genesis Agent</div>
          <div style={{padding:"8px 10px",borderRadius:7,background:"rgba(0,87,255,0.06)",cursor:"pointer",color:T.blue,fontSize:13,fontWeight:600,borderLeft:"3px solid "+T.blue}}>Outreach Studio</div>
        </nav>
      </aside>

      <main style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column",minWidth:0}}>
        <div style={{padding:"18px 24px 0",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <h1 style={{margin:0,fontSize:22,fontWeight:800,color:T.gray900}}>Outreach Studio</h1>
            <span style={{fontSize:11,fontWeight:700,color:T.purple,background:T.purpleLight,padding:"2px 10px",borderRadius:20}}>Preview mode</span>
          </div>
          <p style={{margin:"3px 0 16px",fontSize:13,color:T.gray400}}>Build and split-test outreach styles before running them on real prospects.</p>
        </div>

        <div style={{flex:1,padding:"0 24px 24px",overflow:"auto",display:"flex",gap:20}}>

          <div style={{width:420,flexShrink:0,display:"flex",flexDirection:"column"}}>

            <div style={{background:T.white,border:"1px solid "+T.gray200,borderRadius:14,padding:16,marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,color:T.gray700,marginBottom:10}}>Test business (for preview only)</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <input value={biz.business_name} onChange={e=>setBiz({...biz,business_name:e.target.value})} placeholder="Business name" style={{border:"1.5px solid "+T.gray200,borderRadius:8,padding:"7px 10px",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                <input value={biz.owner_name} onChange={e=>setBiz({...biz,owner_name:e.target.value})} placeholder="Owner name" style={{border:"1.5px solid "+T.gray200,borderRadius:8,padding:"7px 10px",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                <div style={{display:"flex",gap:8}}>
                  <input value={biz.city} onChange={e=>setBiz({...biz,city:e.target.value})} placeholder="City" style={{flex:1,border:"1.5px solid "+T.gray200,borderRadius:8,padding:"7px 10px",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                  <input value={biz.category} onChange={e=>setBiz({...biz,category:e.target.value})} placeholder="Category" style={{flex:1,border:"1.5px solid "+T.gray200,borderRadius:8,padding:"7px 10px",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <input value={biz.rating} onChange={e=>setBiz({...biz,rating:e.target.value})} placeholder="Rating" style={{flex:1,border:"1.5px solid "+T.gray200,borderRadius:8,padding:"7px 10px",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                  <input value={biz.review_count} onChange={e=>setBiz({...biz,review_count:e.target.value})} placeholder="Review count" style={{flex:1,border:"1.5px solid "+T.gray200,borderRadius:8,padding:"7px 10px",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                </div>
              </div>
            </div>

            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:700,color:T.gray700}}>Variants ({variants.length})</div>
              <button onClick={addVariant} style={{fontSize:12,fontWeight:600,color:T.blue,background:"rgba(0,87,255,0.06)",border:"1px solid rgba(0,87,255,0.2)",borderRadius:8,padding:"5px 12px",cursor:"pointer"}}>
                + Add Variant
              </button>
            </div>

            {variants.map(v => (
              <VariantEditor
                key={v.id}
                variant={v}
                onChange={(updated)=>updateVariant(v.id, updated)}
                onRemove={()=>removeVariant(v.id)}
                canRemove={variants.length > 1}
              />
            ))}

            <button
              onClick={generate}
              disabled={loading}
              style={{padding:"12px 0",background:loading?T.gray300:T.blue,color:T.white,border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:loading?"default":"pointer",boxShadow:loading?"none":"0 4px 14px rgba(0,87,255,0.3)"}}
            >
              {loading ? "Generating..." : "Generate Preview"}
            </button>
            {error && <div style={{marginTop:10,fontSize:12,color:T.red,background:T.redLight,border:"1px solid rgba(239,68,68,0.25)",borderRadius:8,padding:"8px 12px"}}>{error}</div>}
          </div>

          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:700,color:T.gray700,marginBottom:10}}>
              {results ? results.length + " variant" + (results.length===1?"":"s") + " generated" : "Preview will appear here"}
            </div>
            {!results && !loading && (
              <div style={{background:T.white,border:"1px dashed "+T.gray300,borderRadius:14,padding:40,textAlign:"center",color:T.gray400,fontSize:13}}>
                Configure your variants on the left, then click Generate Preview to see how each one reads.
              </div>
            )}
            {loading && (
              <div style={{background:T.white,border:"1px solid "+T.gray200,borderRadius:14,padding:40,textAlign:"center",color:T.gray400,fontSize:13}}>
                Generating {variants.length} variant{variants.length===1?"":"s"}...
              </div>
            )}
            {results && results.map((r,i) => <EmailPreviewCard key={i} variantResult={r}/>)}
          </div>

        </div>
      </main>
    </div>
  );
}
