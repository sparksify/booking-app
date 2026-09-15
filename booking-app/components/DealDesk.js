import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FccDealEvidence } from './FccReminders';
import { addBusinessDays, addDaysAtWorkTime, DEFAULT_DEAL_TIMEZONE, overdueLabel, parseWallClock, wallClockValue } from '@/lib/dealDesk';

const ui = {
  button: { border: '1px solid #D1D5DB', background: '#fff', color: '#334155', borderRadius: 7, padding: '7px 10px', fontSize: 12, fontWeight: 650, cursor: 'pointer', textDecoration: 'none' },
  input: { width: '100%', boxSizing: 'border-box', border: '1px solid #CBD5E1', borderRadius: 7, padding: '9px 10px', fontSize: 13, marginTop: 4 },
  label: { color: '#475569', fontSize: 12, fontWeight: 650 },
};
const freshKey = () => globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });
const ENTRY_STEPS = ['Deal', 'Contacts', 'Follow-up'];
const stageLabel = stage => stage === 'cq_received' ? 'CQ Received' : stage.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

function Modal({ title, children, onClose, wide = false }) {
  return <>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,.45)' }} />
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'fixed', zIndex: 201, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: `min(94vw, ${wide ? 680 : 480}px)`, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 12, boxShadow: '0 24px 60px rgba(0,0,0,.2)', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><strong style={{ fontSize: 18 }}>{title}</strong><button aria-label="Close" onClick={onClose} style={{ ...ui.button, border: 0 }}>✕</button></div>
      {children}
    </div>
  </>;
}

function DealEntryModal({ booking, form, setForm, duplicate, error, saving, timezone, onClose, onSave }) {
  const [step, setStep] = useState(0);
  const candidateName = `${booking.first_name || ''} ${booking.last_name || ''}`.trim() || booking.email;
  const canContinue = step !== 0 || (!!form.brand.trim() && !duplicate);

  useEffect(() => {
    const closeOnEscape = event => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(<>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,.58)', backdropFilter: 'blur(2px)' }} />
    <section role="dialog" aria-modal="true" aria-labelledby="deal-entry-title" style={{ position: 'fixed', zIndex: 301, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(94vw, 560px)', maxHeight: 'min(92dvh, 760px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', borderRadius: 18, boxShadow: '0 28px 80px rgba(15,23,42,.28)' }}>
      <header style={{ padding: '17px 18px 13px', borderBottom: '1px solid #E2E8F0', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#B45309', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>New deal</div>
            <h2 id="deal-entry-title" style={{ margin: '2px 0 0', color: '#0F172A', fontSize: 19, lineHeight: 1.2 }}>Enter Deal Desk</h2>
            <div style={{ marginTop: 3, color: '#64748B', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidateName} · {booking.email}</div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ ...ui.button, flex: '0 0 auto', border: 0, padding: 7, fontSize: 15 }}>✕</button>
        </div>
        <div aria-label={`Step ${step + 1} of ${ENTRY_STEPS.length}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 13 }}>
          {ENTRY_STEPS.map((label, index) => <div key={label} style={{ minWidth: 0 }}>
            <div style={{ height: 4, borderRadius: 99, background: index <= step ? '#D97706' : '#E2E8F0' }} />
            <div style={{ marginTop: 5, color: index === step ? '#92400E' : '#94A3B8', fontSize: 10, fontWeight: index === step ? 800 : 650, textAlign: 'center' }}>{label}</div>
          </div>)}
        </div>
      </header>

      <div style={{ minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: 18 }}>
        {step === 0 && <div style={{ display: 'grid', gap: 13 }}>
          <div><strong style={{ color: '#0F172A', fontSize: 15 }}>Deal essentials</strong><div style={{ marginTop: 2, color: '#64748B', fontSize: 12 }}>Start with the brand and where the deal stands today.</div></div>
          <label style={ui.label}>Brand *<input autoFocus value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="Franchise brand" style={ui.input} /></label>
          {duplicate && <div role="alert" style={{ padding: 9, color: '#B91C1C', background: '#FEF2F2', borderRadius: 8, fontSize: 12 }}>This candidate already has an active deal for that brand.</div>}
          <label style={ui.label}>Current stage<select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))} style={ui.input}>{['cq_received','submitted','brand_contact','education','validation','discovery_day','decision'].map(stage => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}</select></label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
            <label style={ui.label}>Units or territories <span style={{ color: '#94A3B8', fontWeight: 500 }}>(optional)</span><input value={form.units} onChange={e => setForm(f => ({ ...f, units: e.target.value }))} style={ui.input} /></label>
            <label style={ui.label}>Estimated commission <span style={{ color: '#94A3B8', fontWeight: 500 }}>(optional)</span><input type="number" min="0" inputMode="decimal" value={form.estimated_deal_value} onChange={e => setForm(f => ({ ...f, estimated_deal_value: e.target.value }))} style={ui.input} /></label>
          </div>
          <div style={{ padding: 11, background: '#F8FAFC', borderRadius: 10, color: '#475569', fontSize: 12 }}>
            <div style={{ marginBottom: 8 }}>CQ receipt is already recorded. Select only milestones that actually happened:</div>
            <label style={{ ...ui.label, display: 'flex', alignItems: 'center', gap: 7 }}><input type="checkbox" checked={form.submitted} onChange={e => setForm(f => ({ ...f, submitted: e.target.checked }))} /> Submitted to brand</label>
            <label style={{ ...ui.label, display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}><input type="checkbox" checked={form.introduced} onChange={e => setForm(f => ({ ...f, introduced: e.target.checked }))} /> Candidate introduced to developer</label>
          </div>
        </div>}

        {step === 1 && <div style={{ display: 'grid', gap: 13 }}>
          <div><strong style={{ color: '#0F172A', fontSize: 15 }}>Who is involved?</strong><div style={{ marginTop: 2, color: '#64748B', fontSize: 12 }}>Candidate details are already attached. Developer details are optional.</div></div>
          <div style={{ padding: 11, border: '1px solid #E2E8F0', borderRadius: 10, background: '#F8FAFC', fontSize: 12 }}><strong>{candidateName}</strong><div style={{ marginTop: 2, color: '#64748B' }}>{booking.phone || 'No phone'} · {booking.email}</div></div>
          <div>
            <div style={{ ...ui.label, marginBottom: 6 }}>First follow-up is with</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              {[['Candidate','candidate'],['Developer','developer']].map(([label, value]) => <button type="button" key={value} onClick={() => setForm(f => ({ ...f, contact_target: value }))} style={{ ...ui.button, padding: 10, background: form.contact_target === value ? '#FEF3C7' : '#fff', borderColor: form.contact_target === value ? '#D97706' : '#CBD5E1', color: form.contact_target === value ? '#92400E' : '#475569' }}>{label}</button>)}
            </div>
          </div>
          <label style={ui.label}>Developer name <span style={{ color: '#94A3B8', fontWeight: 500 }}>(optional)</span><input value={form.developer_name} onChange={e => setForm(f => ({ ...f, developer_name: e.target.value }))} style={ui.input} /></label>
          <label style={ui.label}>Developer email <span style={{ color: '#94A3B8', fontWeight: 500 }}>(optional)</span><input type="email" inputMode="email" value={form.developer_email} onChange={e => setForm(f => ({ ...f, developer_email: e.target.value }))} style={ui.input} /></label>
          <label style={ui.label}>Developer phone <span style={{ color: '#94A3B8', fontWeight: 500 }}>(optional)</span><input type="tel" inputMode="tel" value={form.developer_phone} onChange={e => setForm(f => ({ ...f, developer_phone: e.target.value }))} style={ui.input} /></label>
        </div>}

        {step === 2 && <div style={{ display: 'grid', gap: 13 }}>
          <div><strong style={{ color: '#0F172A', fontSize: 15 }}>Schedule the first follow-up</strong><div style={{ marginTop: 2, color: '#64748B', fontSize: 12 }}>Every active deal needs one clear next action and due date.</div></div>
          <label style={ui.label}>What should I do next? *<textarea autoFocus rows={2} value={form.next_action} onChange={e => setForm(f => ({ ...f, next_action: e.target.value }))} placeholder="Confirm submission plan with candidate" style={{ ...ui.input, resize: 'vertical', minHeight: 64 }} /></label>
          <DateChooser timezone={timezone} value={form.due} onChange={(iso, choice) => setForm(f => ({ ...f, due: { iso, choice } }))} options={[{label:'Tomorrow',days:1},{label:'2 business days',days:2,business:true},{label:'3 days',days:3},{label:'5 days',days:5}]} />
          <div style={{ padding: 11, borderRadius: 10, background: '#FFFBEB', color: '#78350F', fontSize: 12 }}><strong>{form.brand || 'Brand'}</strong> · Contact {form.contact_target === 'developer' ? 'developer' : 'candidate'}<br/>{form.next_action || 'Add the next action above.'}</div>
        </div>}

        {error && <div role="alert" style={{ marginTop: 12, padding: 9, color: '#B91C1C', background: '#FEF2F2', borderRadius: 8, fontSize: 12 }}>{error}</div>}
      </div>

      <footer style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '12px 18px', borderTop: '1px solid #E2E8F0', background: '#fff' }}>
        <button type="button" onClick={step === 0 ? onClose : () => setStep(current => current - 1)} style={ui.button}>{step === 0 ? 'Cancel' : 'Back'}</button>
        {step < ENTRY_STEPS.length - 1
          ? <button type="button" disabled={!canContinue} onClick={() => canContinue && setStep(current => current + 1)} style={{ ...ui.button, minWidth: 100, padding: '9px 13px', background: '#D97706', borderColor: '#D97706', color: '#fff', opacity: canContinue ? 1 : .5 }}>Continue</button>
          : <button type="button" disabled={saving || !form.brand.trim() || !form.next_action.trim() || !form.due.iso || duplicate} onClick={onSave} style={{ ...ui.button, minWidth: 150, padding: '9px 13px', background: '#D97706', borderColor: '#D97706', color: '#fff', opacity: saving || !form.brand.trim() || !form.next_action.trim() || !form.due.iso || duplicate ? .5 : 1 }}>{saving ? 'Creating…' : 'Create deal & follow-up'}</button>}
      </footer>
    </section>
  </>, document.body);
}

function DateChooser({ value, onChange, timezone, options, suggestions = [] }) {
  const selectedValue = value?.iso ? wallClockValue(value.iso, timezone) : '';
  function choose(option) {
    const next = option.hours ? new Date(Date.now() + option.hours * 3600000) : option.business ? addBusinessDays(option.days, new Date(), timezone) : addDaysAtWorkTime(option.days, new Date(), timezone, option.hour || 10);
    onChange(next.toISOString(), option.label);
  }
  return <div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(option => <button type="button" key={option.label} onClick={() => choose(option)} style={{ ...ui.button, background: option.label === value?.choice ? '#FEF3C7' : '#fff', borderColor: option.label === value?.choice ? '#F59E0B' : '#D1D5DB' }}>{option.label}</button>)}
    </div>
    {!!suggestions.length && <div style={{ marginTop: 9 }}><div style={{ ...ui.label, marginBottom: 5 }}>Available 15-minute gaps</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{suggestions.map(date => <button type="button" key={date.toISOString()} onClick={() => onChange(date.toISOString(), 'Suggested gap')} style={{ ...ui.button, color: '#047857', borderColor: '#6EE7B7' }}>{new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(date)}</button>)}</div></div>}
    <label style={{ ...ui.label, display: 'block', marginTop: 9 }}>Selected date and time ({timezone})
      <input type="datetime-local" value={selectedValue} onChange={event => { const date = parseWallClock(event.target.value, timezone); onChange(date?.toISOString() || '', 'Custom'); }} style={ui.input} />
    </label>
    <div style={{ marginTop: 5, color: value?.iso ? '#047857' : '#B91C1C', fontSize: 12, fontWeight: 650 }}>{value?.iso ? new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value.iso)) : 'Select a valid date and time.'}</div>
  </div>;
}

function initialForm(booking, interests, timezone) {
  const first = interests?.[0] || {};
  return { brand: first.brand || '', developer_name: first.developer_name || '', developer_email: first.developer_email || '', developer_phone: first.developer_phone || '', units: '', estimated_deal_value: '', stage: 'cq_received', next_action: 'Confirm submission plan with candidate', contact_target: 'candidate', submitted: false, introduced: false, due: { iso: addBusinessDays(2, new Date(), timezone).toISOString(), choice: '2 business days' }, request_key: freshKey() };
}

export function EnterDealDeskButton({ booking, lead, interests = [], onCreated, timezone = DEFAULT_DEAL_TIMEZONE }) {
  const [open, setOpen] = useState(false); const [activeBrands, setActiveBrands] = useState([]); const [loadingBrands, setLoadingBrands] = useState(true);
  const [form, setForm] = useState(() => initialForm(booking, interests, timezone)); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const candidateKey = `${booking.id || ''}:${booking.email || ''}`;
  async function loadBrands() { setLoadingBrands(true); const r = await fetch(`/api/dashboard/deal-desk?email=${encodeURIComponent(booking.email)}`); const d = await r.json(); if (!r.ok) throw new Error(d.error); setActiveBrands((d.deals || []).map(x => x.brand.toLowerCase())); setLoadingBrands(false); }
  useEffect(() => { setOpen(false); setError(''); setForm(initialForm(booking, interests, timezone)); loadBrands().catch(e => { setLoadingBrands(false); setError(e.message || 'Could not check Deal Desk status.'); }); }, [candidateKey, timezone]);
  useEffect(() => { if (!form.brand && interests[0]?.brand) setForm(initialForm(booking, interests, timezone)); }, [interests]);
  const duplicate = !!form.brand && activeBrands.includes(form.brand.trim().toLowerCase());
  async function save() {
    if (saving || duplicate || !form.due.iso) return; setSaving(true); setError('');
    try {
      const r = await fetch('/api/dashboard/deal-desk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, note: form.next_action, due_at: form.due.iso, lead_id: lead?.id, email: booking.email, phone: booking.phone || lead?.phone, first_name: booking.first_name, last_name: booking.last_name, assigned_to_email: booking.assigned_to_email, assigned_rep_email: booking.assigned_rep_email, assigned_user_id: booking.assigned_user_id, slot_start: booking.slot_start }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not create deal.');
      await loadBrands(); onCreated?.(d.followup); setOpen(false);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  return <div>
    {loadingBrands ? <div style={{ color: '#64748B', fontSize: 12 }}>Checking Deal Desk…</div> : <button onClick={() => { setForm(initialForm(booking, interests, timezone)); setError(''); setOpen(true); }} style={{ ...ui.button, width: '100%', padding: 11, background: '#F59E0B', borderColor: '#D97706', color: '#fff', fontSize: 14 }}>Enter Deal Desk</button>}
    {!loadingBrands && activeBrands.length > 0 && <div style={{ color: '#15803D', fontSize: 12, marginTop: 5 }}>Active: {activeBrands.join(', ')}. You may add a different brand.</div>}
    {!open && error && <div role="alert" style={{ color: '#B91C1C', fontSize: 12, marginTop: 5 }}>{error}</div>}
    {open && <DealEntryModal booking={booking} form={form} setForm={setForm} duplicate={duplicate} error={error} saving={saving} timezone={timezone} onClose={() => setOpen(false)} onSave={save} />}
  </div>;
}

export function DealFollowupRow({ followup, onChanged, onOpen, timezone = DEFAULT_DEAL_TIMEZONE, suggestions = [] }) {
  const [mode, setMode] = useState(null); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [outcome, setOutcome] = useState('connected'); const [note, setNote] = useState(''); const [nextNote, setNextNote] = useState(''); const [nextTarget, setNextTarget] = useState('candidate'); const [closeReason, setCloseReason] = useState('');
  const [nextDue, setNextDue] = useState({ iso: addDaysAtWorkTime(2, new Date(), timezone).toISOString(), choice: '2 days' }); const [requestKey, setRequestKey] = useState(freshKey());
  const due = new Date(followup.due_at); const overdue = due < new Date(); const deal = followup.deal || {}; const target = followup.contact_target === 'developer' ? 'developer' : 'candidate';
  const person = target === 'developer' ? deal.developer_name || 'Developer' : `${deal.first_name || ''} ${deal.last_name || ''}`.trim(); const phone = target === 'developer' ? deal.developer_phone : deal.phone; const email = target === 'developer' ? deal.developer_email : deal.email;
  const overdueText = overdueLabel(due);
  async function patch(body) { if (saving) return; setSaving(true); setError(''); try { const r = await fetch('/api/dashboard/deal-desk', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ followup_id: followup.id, request_key: requestKey, ...body }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not save.'); await onChanged?.(); setMode(null); setRequestKey(freshKey()); } catch (e) { setError(e.message); } finally { setSaving(false); } }
  return <>
    <tr onClick={() => onOpen?.(deal.id)} style={{ background: overdue ? '#FEF2F2' : '#FFFBEB', borderLeft: `4px solid ${overdue ? '#DC2626' : '#F59E0B'}`, cursor: 'pointer' }}>
      <td style={{ padding: 12, whiteSpace: 'nowrap' }}><strong>{new Intl.DateTimeFormat('en-US',{timeZone:timezone,hour:'numeric',minute:'2-digit'}).format(due)}</strong>{overdue && <div style={{ color:'#DC2626',fontSize:10,fontWeight:800 }}>{overdueText}</div>}</td>
      <td style={{ padding: 12 }}><div style={{ color: overdue ? '#B91C1C' : '#B45309', fontSize:10,fontWeight:800,letterSpacing:'.06em' }}>DEAL FOLLOW-UP · {target.toUpperCase()}</div><strong>{person}</strong><div style={{fontSize:12,color:'#64748B'}}>{deal.brand}</div></td>
      <td style={{padding:12,textTransform:'capitalize',fontSize:11}}>{(deal.stage || 'submitted').replaceAll('_',' ')}</td>
      <td colSpan={4} style={{padding:12,fontSize:12,color:'#475569'}}>{followup.note || 'Franchise check-in'}{deal.last_touch_at && <div style={{fontSize:10,color:'#94A3B8'}}>Last touch {new Intl.DateTimeFormat('en-US',{timeZone:timezone,dateStyle:'medium'}).format(new Date(deal.last_touch_at))}</div>}</td>
      <td style={{padding:12,fontSize:12}}>{followup.assigned_to_email?.split('@')[0]}</td><td style={{padding:12,color:overdue?'#DC2626':'#B45309',fontWeight:700}}>Pending</td>
      <td onClick={e => e.stopPropagation()} style={{padding:12}}><div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{phone && <a href={`tel:${phone}`} style={ui.button}>Call</a>}{email && <a href={`mailto:${email}`} style={ui.button}>Email</a>}{phone && <a href={`sms:${phone}`} style={ui.button}>Text</a>}<button onClick={() => setMode('done')} style={{...ui.button,background:'#15803D',color:'#fff'}}>Done</button><button onClick={() => setMode('snooze')} style={ui.button}>Snooze</button></div></td>
    </tr>
    {mode && <Modal title={mode === 'done' ? 'Complete follow-up' : 'Snooze follow-up'} onClose={() => setMode(null)}>{mode === 'done' ? <div style={{display:'grid',gap:12}}>
      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>{[['Connected','connected'],['Left voicemail','left_voicemail'],['Texted','texted'],['Waiting on developer','waiting_on_developer'],['Validation scheduled','validation_scheduled'],['Discovery Day scheduled','discovery_day_scheduled'],['Decision pending','decision_pending'],['Other','other']].map(([label,value])=><button key={value} onClick={()=>setOutcome(value)} style={{...ui.button,background:outcome===value?'#FEF3C7':'#fff',borderColor:outcome===value?'#F59E0B':'#D1D5DB'}}>{label}</button>)}</div>
      <label style={ui.label}>What happened? (optional)<textarea value={note} onChange={e=>setNote(e.target.value)} style={ui.input}/></label>
      <label style={ui.label}>What should I do next? *<input value={nextNote} onChange={e=>setNextNote(e.target.value)} placeholder="e.g. Ask how the validation call went" style={ui.input}/></label>
      <label style={ui.label}>Who should I contact?<select value={nextTarget} onChange={e=>setNextTarget(e.target.value)} style={ui.input}><option value="candidate">Candidate</option><option value="developer">Developer</option></select></label>
      <DateChooser timezone={timezone} value={nextDue} onChange={(iso,choice)=>setNextDue({iso,choice})} suggestions={suggestions} options={[1,2,3,5,7].map(days=>({label:days===1?'Tomorrow':`${days} days`,days}))}/>
      <button disabled={saving || !nextNote.trim() || !nextDue.iso} onClick={()=>patch({action:'complete',outcome,note,next_note:nextNote,next_due_at:nextDue.iso,next_contact_target:nextTarget})} style={{...ui.button,background:'#15803D',color:'#fff',opacity:saving||!nextNote.trim()||!nextDue.iso?.5:1}}>{saving?'Saving…':'Save & schedule next'}</button>
      <label style={ui.label}>Optional reason for Won / Lost / Pause<input value={closeReason} onChange={e=>setCloseReason(e.target.value)} style={ui.input}/></label>
      <div style={{display:'flex',gap:6}}>{['won','lost','paused'].map(status=><button key={status} disabled={saving} onClick={()=>patch({action:'lifecycle',deal_id:deal.id,status,reason:closeReason})} style={{...ui.button,textTransform:'capitalize',color:status==='won'?'#15803D':status==='lost'?'#B91C1C':'#B45309'}}>{status}</button>)}</div>
    </div> : <div style={{display:'grid',gap:12}}><DateChooser timezone={timezone} value={nextDue} onChange={(iso,choice)=>setNextDue({iso,choice})} suggestions={suggestions} options={[{label:'Later today',hours:2},{label:'Tomorrow',days:1},{label:'2 days',days:2},{label:'3 days',days:3},{label:'Next week',days:7}]}/><button disabled={saving||!nextDue.iso} onClick={()=>patch({action:'snooze',due_at:nextDue.iso})} style={ui.button}>{saving?'Saving…':'Snooze'}</button></div>}{error&&<div role="alert" style={{color:'#B91C1C',marginTop:10}}>{error}</div>}</Modal>}
  </>;
}

export function InactiveDealRow({ deal, onOpen }) {
  const closed = ['won','lost'].includes(deal.status);
  return <tr onClick={() => onOpen?.(deal.id)} style={{ background: deal.status === 'paused' ? '#FFFBEB' : '#F8FAFC', cursor: 'pointer' }}>
    <td style={{padding:12,color:'#64748B'}}>—</td><td style={{padding:12}}><strong>{deal.first_name} {deal.last_name}</strong><div style={{fontSize:12,color:'#64748B'}}>{deal.brand}</div></td>
    <td style={{padding:12,textTransform:'capitalize',fontSize:12}}>{deal.stage?.replaceAll('_',' ')}</td><td colSpan={5} style={{padding:12,fontSize:12,color:'#64748B'}}>{deal.close_reason || (closed ? `Deal ${deal.status}` : 'Paused — open to resume')}</td>
    <td style={{padding:12,textTransform:'capitalize',fontWeight:700,color:deal.status==='won'?'#15803D':deal.status==='lost'?'#B91C1C':'#B45309'}}>{deal.status}</td><td style={{padding:12}}><button style={ui.button}>Open</button></td>
  </tr>;
}

export function DealDetailDrawer({ dealId, onClose, onChanged, timezone = DEFAULT_DEAL_TIMEZONE }) {
  const [deal, setDeal] = useState(null); const [history, setHistory] = useState([]); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [reason, setReason] = useState(''); const [resumeDue, setResumeDue] = useState({ iso: addDaysAtWorkTime(1,new Date(),timezone).toISOString(), choice:'Tomorrow' });
  async function load() { setLoading(true); const r=await fetch(`/api/dashboard/deal-desk?deal_id=${encodeURIComponent(dealId)}`); const d=await r.json(); if(!r.ok) throw new Error(d.error); setDeal(d.deal); setHistory(d.history||[]); setLoading(false); }
  useEffect(()=>{ load().catch(e=>{setError(e.message);setLoading(false);}); },[dealId]);
  async function save(action) { if(saving)return;setSaving(true);setError('');try{const r=await fetch('/api/dashboard/deal-desk',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(action)});const d=await r.json();if(!r.ok)throw new Error(d.error);await load();await onChanged?.();}catch(e){setError(e.message);}finally{setSaving(false);}}
  const pending=history.find(f=>f.status==='pending');
  return <><div onClick={onClose} style={{position:'fixed',inset:0,zIndex:150,background:'rgba(15,23,42,.3)'}}/><aside aria-label="Deal details" style={{position:'fixed',zIndex:151,right:0,top:0,bottom:0,width:'min(94vw,520px)',background:'#fff',boxShadow:'-8px 0 30px rgba(0,0,0,.16)',overflowY:'auto',padding:20}}><div style={{display:'flex',justifyContent:'space-between'}}><strong style={{fontSize:19}}>Deal details</strong><button onClick={onClose} style={{...ui.button,border:0}}>✕</button></div>{loading?<p>Loading…</p>:error&&!deal?<p role="alert" style={{color:'#B91C1C'}}>{error}</p>:deal&&<div style={{display:'grid',gap:14,marginTop:16}}>
    <div><strong>{deal.first_name} {deal.last_name}</strong><div style={{fontSize:13,color:'#64748B'}}>{deal.phone||'No phone'} · {deal.email}</div></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10}}>{[['Brand','brand'],['Developer name','developer_name'],['Developer email','developer_email'],['Developer phone','developer_phone'],['Units / territories','units'],['Estimated commission','estimated_deal_value']].map(([label,key])=><label key={key} style={ui.label}>{label}<input type={key==='estimated_deal_value'?'number':'text'} value={deal[key]??''} onChange={e=>setDeal(d=>({...d,[key]:e.target.value}))} style={ui.input}/></label>)}<label style={ui.label}>Stage<select value={deal.stage} disabled={deal.status!=='active'} onChange={e=>setDeal(d=>({...d,stage:e.target.value}))} style={ui.input}>{['cq_received','submitted','brand_contact','education','validation','discovery_day','decision',...(deal.stage==='closed'?['closed']:[])].map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select></label><div style={{fontSize:13}}>Status<br/><strong style={{textTransform:'capitalize'}}>{deal.status}</strong></div></div>
    <div style={{padding:10,background:'#F8FAFC',borderRadius:8,fontSize:12}}><strong>Milestones</strong><div>CQ received: {deal.cq_received_at ? new Intl.DateTimeFormat('en-US',{timeZone:timezone,dateStyle:'medium'}).format(new Date(deal.cq_received_at)) : 'Not recorded'}</div><label><input type="checkbox" checked={!!deal.submitted_at} disabled={!!deal.submitted_at} onChange={e=>setDeal(d=>({...d,submitted:e.target.checked}))}/> Submitted to brand {deal.submitted_at ? `· ${new Intl.DateTimeFormat('en-US',{timeZone:timezone,dateStyle:'medium'}).format(new Date(deal.submitted_at))}` : ''}</label><br/><label><input type="checkbox" checked={!!deal.introduction_at} disabled={!!deal.introduction_at} onChange={e=>setDeal(d=>({...d,introduced:e.target.checked}))}/> Introduced to developer {deal.introduction_at ? `· ${new Intl.DateTimeFormat('en-US',{timeZone:timezone,dateStyle:'medium'}).format(new Date(deal.introduction_at))}` : ''}</label></div>
    <button onClick={()=>save({action:'edit',deal_id:deal.id,...deal})} disabled={saving} style={{...ui.button,background:'#2563EB',color:'#fff'}}>Save deal details</button>
    <FccDealEvidence key={`${deal.id}-${deal.status}`} dealId={deal.id} onChanged={onChanged}/>
    {pending&&<div style={{padding:10,background:'#FFFBEB',borderRadius:8,fontSize:13}}><strong>Next action:</strong> {pending.note}<br/>{new Intl.DateTimeFormat('en-US',{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(pending.due_at))}</div>}
    {deal.status==='active'?<div><label style={ui.label}>Optional pause/loss reason<input value={reason} onChange={e=>setReason(e.target.value)} style={ui.input}/></label><div style={{display:'flex',gap:6,marginTop:8}}>{['won','lost','paused'].map(status=><button key={status} disabled={saving} onClick={()=>save({action:'lifecycle',deal_id:deal.id,status,reason,request_key:freshKey()})} style={{...ui.button,color:status==='won'?'#15803D':status==='lost'?'#B91C1C':'#B45309',textTransform:'capitalize'}}>{status}</button>)}</div></div>:deal.status==='paused'&&<div><DateChooser timezone={timezone} value={resumeDue} onChange={(iso,choice)=>setResumeDue({iso,choice})} options={[{label:'Tomorrow',days:1},{label:'2 days',days:2},{label:'3 days',days:3}]}/><button disabled={saving||!resumeDue.iso} onClick={()=>save({action:'lifecycle',deal_id:deal.id,status:'active',due_at:resumeDue.iso,request_key:freshKey()})} style={{...ui.button,background:'#15803D',color:'#fff',marginTop:8}}>Resume deal</button></div>}
    {error&&<div role="alert" style={{color:'#B91C1C'}}>{error}</div>}
    <div><strong>Follow-up history</strong>{history.map(item=><div key={item.id} style={{padding:'10px 0',borderBottom:'1px solid #E2E8F0',fontSize:12}}><div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><strong style={{textTransform:'capitalize'}}>{item.status} · {(item.contact_target||'candidate')}</strong><span>{new Intl.DateTimeFormat('en-US',{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(item.due_at))}</span></div><div>Action: {item.note||'—'}</div>{item.outcome&&<div style={{color:'#64748B'}}>Outcome: {item.outcome.replaceAll('_',' ')}{item.outcome_note?` — ${item.outcome_note}`:''}</div>}</div>)}</div>
  </div>}</aside></>;
}
