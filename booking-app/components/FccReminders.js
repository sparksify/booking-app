import { useEffect, useRef, useState } from 'react';
import { CompactFollowupRow } from './CompactFollowupRow';
import { createPortal } from 'react-dom';
import { nextCheck, sourceLink } from '@/lib/fcc.mjs';
import { parseWallClock, wallClockValue, overdueLabel } from '@/lib/dealDesk';

const button={display:'inline-flex',alignItems:'center',justifyContent:'center',boxSizing:'border-box',border:'1px solid #CBD5E1',borderRadius:8,padding:'9px 12px',background:'#fff',color:'#334155',cursor:'pointer',fontSize:13,fontWeight:600,textDecoration:'none'};
const input={display:'block',width:'100%',boxSizing:'border-box',border:'1px solid #CBD5E1',borderRadius:8,padding:10,margin:'5px 0 12px',fontSize:16};
const primary={...button,background:'#B45309',color:'#fff',borderColor:'#B45309'};
const actions={display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'};
const time=(value,tz='America/Chicago')=>new Intl.DateTimeFormat('en-US',{timeZone:tz,dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
async function request(body) {
  const r=await fetch('/api/dashboard/fcc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json(); if(!r.ok)throw new Error(d.error || 'FCC action failed.');return d;
}
async function getData(query='') {
  const r=await fetch(`/api/dashboard/fcc${query}`);const d=await r.json();if(!r.ok)throw new Error(d.error || 'FCC reminders could not load.');return d;
}

export function FccModal({title,onClose,children}) {
  const ref=useRef(null),closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{
    const old=document.activeElement,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';ref.current?.querySelector('button,input,select,textarea,a[href]')?.focus();
    const key=e=>{
      if(e.key==='Escape')closeRef.current();
      if(e.key==='Tab'){
        const list=[...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);
        const first=list[0],last=list.at(-1);
        if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);old?.focus();};
  },[]);
  if(typeof document==='undefined')return null;
  return createPortal(<div style={{position:'fixed',inset:0,zIndex:400,background:'rgba(15,23,42,.55)',display:'grid',placeItems:'center',padding:12}} onClick={e=>e.target===e.currentTarget && onClose()}>
    <section ref={ref} role="dialog" aria-modal="true" aria-label={title} style={{width:'min(100%,580px)',maxHeight:'92dvh',boxSizing:'border-box',background:'#fff',borderRadius:16,display:'flex',flexDirection:'column',overflow:'hidden',color:'#0F172A',boxShadow:'0 25px 80px #0004'}}>
      <header style={{...actions,justifyContent:'space-between',padding:'16px 18px',borderBottom:'1px solid #E2E8F0',flexShrink:0}}><strong style={{fontSize:19}}>{title}</strong><button style={button} aria-label="Close FCC dialog" onClick={onClose}>✕</button></header>
      <div style={{overflowY:'auto',padding:18,overscrollBehavior:'contain',fontSize:14}}>{children}</div>
    </section>
  </div>,document.body);
}

function InlineFccAction({title,onClose,children}) {
  return <section aria-label={title} style={{marginTop:14,borderTop:'1px solid #E2E8F0',paddingTop:14}}><div style={{...actions,justifyContent:'space-between',marginBottom:14}}><strong>{title}</strong><button style={button} onClick={onClose}>Cancel</button></div>{children}</section>;
}

export function FccAction({row,mode,onClose,onChanged}) {
  const tz=row.mailbox?.timezone || 'America/Chicago',d=row.deal || {};
  const [outcome,setOutcome]=useState(mode==='snooze'?'snooze':mode==='reopen'?'reopen':'attempt');
  const [note,setNote]=useState('');
  const [due,setDue]=useState(wallClockValue(nextCheck(new Date(),tz,row.mailbox?.check_hour ?? 9),tz));
  const [draft,setDraft]=useState(`Hi ${d.developer_name || 'there'}, checking that you received ${row.candidate_name}'s registration for ${d.brand || row.brand_label}, submitted ${time(row.submitted_at,tz)}. Have you had a chance to reach out, and is anything needed from me?`);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const lock=useRef(false),key=useRef(globalThis.crypto?.randomUUID());
  const needsDate=['attempt','snooze','reopen'].includes(outcome),date=parseWallClock(due,tz);
  async function save(e) {
    e.preventDefault();if(lock.current)return;
    const selectedDate=needsDate?parseWallClock(new FormData(e.currentTarget).get('reminder_due'),tz):null;
    if(needsDate && (!selectedDate || +selectedDate<=Date.now())){setError('Choose a valid future reminder date.');return;}
    lock.current=true;setBusy(true);setError('');
    try{await request({action:'reminder',id:row.id,request_key:key.current,outcome,note,due_at:selectedDate?.toISOString()});await onChanged?.();onClose();}
    catch(err){setError(err.message);}finally{lock.current=false;setBusy(false);}
  }
  return <InlineFccAction title={mode==='draft'?'Draft developer email':mode==='snooze'?'Snooze developer reminder':mode==='reopen'?'Correct acknowledgment':'Record developer follow-up'} onClose={()=>!busy && onClose()}>
    <p style={{marginTop:0}}><strong>{row.candidate_name} · {d.brand || row.brand_label}</strong></p>
    {mode==='draft'?<><p>This opens an editable draft in your email app. Nothing is sent or recorded automatically.</p><label>Email draft<textarea rows={7} value={draft} onChange={e=>setDraft(e.target.value)} style={input}/></label>{d.developer_email?<a style={primary} href={`mailto:${encodeURIComponent(d.developer_email)}?subject=${encodeURIComponent(`${row.candidate_name} — registration follow-up`)}&body=${encodeURIComponent(draft)}`}>Open email draft</a>:<p>Add the developer’s email in Deal details first.</p>}</>:<form onSubmit={save}>
      {!['snooze','reopen'].includes(mode) && <label>What happened?<select style={input} value={outcome} onChange={e=>setOutcome(e.target.value)}>
        <option value="attempt">Contact attempted — still waiting</option><option value="acknowledged">Developer acknowledged receipt</option><option value="outreach_planned">Developer plans to contact candidate</option><option value="contact_reported">Developer reports contacting candidate</option><option value="candidate_confirmed">Candidate confirms developer contact</option><option value="dismissed">Dismiss this obligation (give a reason)</option>
      </select></label>}
      <label>{mode==='reopen'?'Why was the acknowledgment incorrect?':'Note (optional unless dismissing)'}<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={500} rows={3} style={input}/></label>
      {needsDate && <><div style={actions}><button type="button" style={button} onClick={()=>setDue(wallClockValue(nextCheck(new Date(),tz,row.mailbox?.check_hour ?? 9),tz))}>Next business morning</button></div><label>Next reminder ({tz})<input name="reminder_due" required type="datetime-local" min={wallClockValue(new Date(),tz)} value={due} onInput={e=>setDue(e.currentTarget.value)} onChange={e=>setDue(e.target.value)} style={input}/></label><p>{date?time(date,tz):'Choose a valid date and time.'}</p></>}
      <p style={{fontSize:12,color:'#64748B'}}>This changes only the FCC reminder. Your regular next action stays in place. A contact attempt does not confirm acknowledgment or a conversation.</p>
      {error && <p role="alert" style={{color:'#B91C1C'}}>{error}</p>}
      <footer style={{...actions,position:'sticky',bottom:-18,background:'#fff',padding:'12px 0',justifyContent:'space-between'}}><button type="button" disabled={busy} style={button} onClick={onClose}>Cancel</button><button disabled={busy || (needsDate && (!date || +date<=Date.now())) || (['dismissed','reopen'].includes(outcome) && !note.trim())} style={primary}>{busy?'Saving…':mode==='snooze'?'Snooze reminder':'Save outcome'}</button></footer>
    </form>}
  </InlineFccAction>;
}

export function FccReminderRow({row,onOpen}) {
  return <CompactFollowupRow name={row.candidate_name} brand={row.deal?.brand || row.brand_label} dueAt={row.due_at} timezone={row.mailbox?.timezone || 'America/Chicago'} kind="Developer acknowledgment" onOpen={()=>onOpen(row.deal_id)} />;
}

export function FccDealEvidence({dealId,onChanged}) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[selected,setSelected]=useState(null);
  async function load(){try{setData(await getData(`?deal_id=${encodeURIComponent(dealId)}`));setError('');}catch(e){setError(e.message);}}
  useEffect(()=>{load();},[dealId]);
  return <section style={{border:'1px solid #E2E8F0',borderRadius:10,padding:12}}><strong>Developer acknowledgment</strong>
    {error?<p role="alert">{error} <button onClick={load} style={button}>Retry</button></p>:!data?<p>Loading FCC evidence…</p>:!data.rows.length?<p style={{fontSize:12}}>No FCC receipt recorded for this deal.</p>:data.rows.map(row=><div key={row.id} style={{marginTop:12,fontSize:12,borderTop:'1px solid #E2E8F0',paddingTop:10}}>
      <a href={row.source_link} target="_blank" rel="noreferrer">Submitted {time(row.submitted_at,row.mailbox.timezone)}</a> · {row.timestamp_source==='email_received'?'email received time':'receipt timestamp'}
      <p>{row.status==='dismissed'?'Obligation dismissed':row.check_label}<br/>Contact planned: {row.outreach_planned_at?'Yes':'Not recorded'}<br/>Developer reports contact: {row.contact_reported_at?'Yes':'Not recorded'}<br/>Candidate confirms contact: {row.candidate_confirmed_at?'Yes':'Not recorded'}</p>
      <p style={{color:'#64748B'}}>{row.deal?.developer_name || 'Developer'}{row.due_at ? ` · Due ${time(row.due_at,row.mailbox.timezone)}` : ''}</p>
      {!selected && <div style={actions}>
        {row.deal?.developer_phone && <><a href={`tel:${row.deal.developer_phone}`} style={button}>Call</a><a href={`sms:${row.deal.developer_phone}`} style={button}>Text</a></>}
        <button style={button} onClick={()=>setSelected({row,mode:'draft'})}>Draft email</button>
        {row.can_edit && <><button style={{...button,background:'#2563EB',color:'#fff',borderColor:'#2563EB'}} onClick={()=>setSelected({row,mode:'done'})}>Done</button>
          {!['acknowledged','dismissed'].includes(row.status) && <button style={button} onClick={()=>setSelected({row,mode:'snooze'})}>Snooze</button>}
          {['acknowledged','dismissed'].includes(row.status) && row.deal.status==='active' && <button style={button} onClick={()=>setSelected({row,mode:'reopen'})}>Correct & reopen reminder</button>}
        </>}
      </div>}
      <details style={{marginTop:14}}><summary style={{cursor:'pointer',color:'#64748B'}}>Evidence & history</summary>
      {data.evidence.filter(e=>e.submission_id===row.id).map(e=><div key={e.id} style={{paddingTop:8}}><strong>{e.classification.replaceAll('_',' ')}</strong> · {e.manual?'Manual':'Detected'} · {time(e.occurred_at,row.mailbox.timezone)}{e.source_message_id && <> · <a href={sourceLink(row.mailbox.mailbox_email,e.source_message_id)} target="_blank" rel="noreferrer">Evidence email</a></>}{e.excerpt && <div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{e.excerpt}</div>}</div>)}
      </details>
    </div>)}
    {selected && <FccAction {...selected} onClose={()=>setSelected(null)} onChanged={async()=>{await load();await onChanged?.();}}/>}
  </section>;
}

export function FccSettings({onChanged,reviewCount=0}) {
  const [open,setOpen]=useState(false),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [zone,setZone]=useState('America/Chicago'),[hour,setHour]=useState(9),[brand,setBrand]=useState('');
  const [aliases,setAliases]=useState(''),[emails,setEmails]=useState(''),[domains,setDomains]=useState('');
  const [preview,setPreview]=useState(null),[ids,setIds]=useState([]),[reviewBrand,setReviewBrand]=useState({});
  async function load(){const d=await getData();setData(d);setZone(d.box?.timezone || 'America/Chicago');setHour(d.box?.check_hour ?? 9);}
  useEffect(()=>{if(open)load().catch(e=>setError(e.message));},[open]);
  useEffect(()=>{
    const result=new URLSearchParams(window.location.search).get('fcc');
    if(result){setOpen(true);if(result!=='connected')setError(result==='wrong_mailbox'?'Please reconnect the originally linked mailbox.':'Google connection failed. Check that Gmail API is enabled, the callback URL is allowed, and read-only access was granted.');}
  },[]);
  async function run(body){if(busy)return;setBusy(true);setError('');try{const d=await request(body);if(body.action==='preview'){setPreview(d);setIds([]);}else{setPreview(null);await load();await onChanged?.();}}catch(e){setError(e.message);}finally{setBusy(false);}}
  function chooseBrand(id){setBrand(id);const rule=data.rules.find(r=>r.brand_id===id);setAliases((rule?.aliases || []).join(', '));setEmails((rule?.verified_emails || []).join(', '));setDomains((rule?.verified_domains || []).join(', '));}
  return <><button style={button} onClick={()=>setOpen(true)}>FCC reminders{reviewCount?` · ${reviewCount} to review`:''}</button>{open && <FccModal title="FCC reminders · Deal Desk" onClose={()=>!busy && setOpen(false)}>
    <p style={{marginTop:0}}>Record FCC submissions and remind you to confirm receipt with the developer. Your existing follow-ups remain unchanged. No automatic emails.</p>
    {error && <p role="alert" style={{color:'#B91C1C'}}>{error}</p>}
    {!data?<button style={button} onClick={()=>load().catch(e=>setError(e.message))}>Load connection settings</button>:<>
      {!data.production && <p role="alert">Mailbox setup and ingestion are disabled on preview deployments. Use app.trykanso.co.</p>}
      <p><strong>{data.box?.mailbox_email || 'No FCC mailbox connected'}</strong><br/>{data.box?.enabled?'Processing enabled':'Processing is off'}{data.box?.activation_at && ` · Activated ${time(data.box.activation_at,data.box.timezone)}`}</p>
      {data.box?.last_error && <p role="alert" style={{color:'#B91C1C'}}>{data.box.last_error}</p>}
      {data.production && <a style={primary} href="/api/dashboard/fcc/connect">{data.box?'Reconnect':'Connect Gmail (read-only)'}</a>}
      <p style={{fontSize:12,color:'#64748B'}}>Select ssparks@thefranchiseconsultingcompany.com for your FCC receipts. Google will ask you to approve read-only access. Existing calendar access is unchanged.</p>
      {data.box && <>
        <details><summary style={{cursor:'pointer',fontWeight:600}}>Reminder timing & verified brand contacts</summary><div style={{paddingTop:12}}>
          <label>Consultant timezone<input style={input} value={zone} onChange={e=>setZone(e.target.value)}/></label>
          <label>Next-business-morning hour (0–23)<input style={input} type="number" min={0} max={23} value={hour} onChange={e=>setHour(Number(e.target.value))}/></label>
          <button disabled={busy || !data.production} style={button} onClick={()=>run({action:'configure',timezone:zone,check_hour:hour})}>Save timing</button><p style={{fontSize:12}}>Weekends are skipped; holidays are not. Changes apply to new receipts, not manually selected dates.</p>
          <label>Canonical brand<select style={input} value={brand} onChange={e=>chooseBrand(e.target.value)}><option value="">Select existing brand</option>{data.brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label>Receipt brand aliases (comma-separated)<input style={input} value={aliases} onChange={e=>setAliases(e.target.value)}/></label>
          <label>Verified developer emails (comma-separated)<input style={input} value={emails} onChange={e=>setEmails(e.target.value)}/></label>
          <label>Verified franchise domains (optional)<input style={input} value={domains} onChange={e=>setDomains(e.target.value)}/></label>
          <p style={{fontSize:12}}>Only add addresses/domains you have verified belong to this franchise. A saved deal’s developer email also counts. Never add a general email-provider domain.</p>
          <button disabled={busy || !brand || !data.production} style={button} onClick={()=>run({action:'rule',brand_id:brand,aliases,verified_emails:emails,verified_domains:domains})}>Save verified contacts & aliases</button>
        </div></details>
        <hr style={{border:0,borderTop:'1px solid #E2E8F0',margin:'18px 0'}}/>
        <strong>Preview receipts before importing</strong><p style={{fontSize:12}}>Read up to 25 recent receipts. Nothing is imported until you select messages and confirm.</p><div style={actions}>{[7,30].map(days=><button key={days} disabled={busy || !data.production} style={button} onClick={()=>run({action:'preview',days})}>Preview last {days} days</button>)}</div>
        {preview && <div style={{marginTop:12}}>{!preview.rows.length && <p>No matching receipts found in this bounded preview.</p>}{preview.truncated && <p>More than 25 matching emails; this preview shows only the most recent 25.</p>}{preview.rows.map(r=><label key={`${r.message_id}-${r.brand}`} style={{display:'block',padding:'8px 0'}}><input type="checkbox" checked={ids.includes(r.message_id)} onChange={e=>setIds(list=>e.target.checked?[...new Set([...list,r.message_id])]:list.filter(id=>id!==r.message_id))}/> {r.name} · {r.brand}<small style={{display:'block'}}>{r.review_reason || `Matches ${r.canonical?.name}`} · {time(r.submitted_at,data.box.timezone)}</small></label>)}<button disabled={busy || !ids.length} style={primary} onClick={()=>run({action:'import',ids,token:preview.token})}>Import selected receipts (all brands)</button></div>}
        {!!data.review.length && <details open><summary style={{marginTop:18,fontWeight:600}}>Receipts needing review ({data.review.length})</summary>{data.review.map(r=><div key={r.id} style={{padding:'12px 0',borderBottom:'1px solid #E2E8F0'}}><strong>{r.candidate_name} · {r.brand_label}</strong><p>{r.review_reason}</p><a href={sourceLink(data.box.mailbox_email,r.source_message_id)} target="_blank" rel="noreferrer">Inspect FCC receipt</a><select aria-label={`Canonical brand for ${r.candidate_name}`} style={input} value={reviewBrand[r.id] || ''} onChange={e=>setReviewBrand(v=>({...v,[r.id]:e.target.value}))}><option value="">Select canonical brand</option>{data.brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><button disabled={busy || !reviewBrand[r.id]} style={button} onClick={()=>run({action:'review',id:r.id,brand_id:reviewBrand[r.id],confirmed:true})}>Confirm source & link safely</button><p style={{fontSize:11}}>Confirm this receipt is yours and the candidate/brand are correct. Paused/closed or ambiguous deals are never reopened.</p></div>)}</details>}
        <footer style={{...actions,position:'sticky',bottom:-18,background:'#fff',padding:'14px 0',marginTop:14,borderTop:'1px solid #E2E8F0'}}>
          {!data.scheduler_ready && <p role="alert">Server scheduler configuration is required before activation.</p>}
          <button disabled={busy || !data.production || (!data.box.enabled && !data.scheduler_ready)} style={primary} onClick={()=>run({action:data.box.enabled?'pause':'activate'})}>{busy?'Working…':data.box.enabled?'Turn off email processing':'Activate new receipts from now'}</button>
          <button disabled={busy || !data.production} style={button} onClick={()=>run({action:'disconnect'})}>Disconnect Gmail</button>
        </footer>
      </>}
    </>}
  </FccModal>}</>;
}
