import { useEffect, useRef, useState } from 'react';
import { DealFollowupRow, DealDetailDrawer } from '../../components/DealDesk';
import { FccReminderRow } from '../../components/FccReminders';

// Browser-only synthetic harness. No request is allowed to reach a real API.
export default function FollowupPreview(){
  const [ready,setReady]=useState(false),[open,setOpen]=useState(null),[fail,setFail]=useState(false);
  const [deal]=useState({id:'synthetic-deal',first_name:'Alex',last_name:'Example',brand:'Example Brand',stage:'submitted',status:'active',email:'candidate@example.test',phone:'5550100',developer_name:'Taylor Developer',developer_email:'developer@example.test'});
  const [task,setTask]=useState({id:'synthetic-task',status:'pending',contact_target:'candidate',note:'Ask how the brand conversation went',due_at:'2026-01-01T15:00:00Z'});
  const [fcc,setFcc]=useState({id:'synthetic-fcc',deal_id:deal.id,candidate_name:'Alex Example',brand_label:deal.brand,submitted_at:'2026-01-01T12:00:00Z',due_at:'2026-01-01T15:00:00Z',status:'pending',check_label:'No brand acknowledgment found',can_edit:true,source_link:'#synthetic-receipt',mailbox:{timezone:'America/Chicago'},deal});
  const [history,setHistory]=useState([]);
  const snapshot=useRef({deal,task,fcc,history});snapshot.current={deal,task,fcc,history};
  useEffect(()=>{
    const original=window.fetch;
    window.fetch=async(url,options={})=>{
      if(String(url).includes('/api/auth/'))return {ok:true,json:async()=>({})};
      const body=options.body?JSON.parse(options.body):null;
      if(fail)return {ok:false,json:async()=>({error:'Synthetic service unavailable. Try again.'})};
      if(String(url).startsWith('/api/dashboard/deal-desk')){
        if(body){
          if(body.action==='complete'){snapshot.current.history=[...history,{...task,status:'completed',outcome:body.outcome,outcome_note:body.note}];snapshot.current.task={...task,id:'next-task',note:body.next_note,due_at:body.next_due_at};setHistory(snapshot.current.history);setTask(snapshot.current.task);}
          if(body.action==='snooze'){snapshot.current.task={...task,due_at:body.due_at};setTask(snapshot.current.task);}
          return {ok:true,json:async()=>({})};
        }
        return {ok:true,json:async()=>({deal,history:[...snapshot.current.history,snapshot.current.task]})};
      }
      if(String(url).startsWith('/api/dashboard/fcc')){
        if(body){snapshot.current.fcc={...fcc,due_at:body.due_at||fcc.due_at,status:body.outcome==='acknowledged'?'acknowledged':'pending'};setFcc(snapshot.current.fcc);return {ok:true,json:async()=>({})};}
        return {ok:true,json:async()=>({rows:[snapshot.current.fcc],evidence:[]})};
      }
      throw new Error('Synthetic preview blocked an unexpected request');
    };
    setReady(true);return()=>{window.fetch=original;};
  },[deal,task,fcc,history,fail]);
  return <main style={{fontFamily:'system-ui',padding:20,color:'#334155',maxWidth:1000,margin:'auto'}}>
    <h2>Follow-ups · synthetic UI test</h2><p style={{fontSize:13,color:'#64748B'}}>2 reminders · details open in the sidebar</p>
    <label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/> Simulate API failure</label>
    {ready && <table style={{width:'100%',marginTop:16,border:'1px solid #E2E8F0',borderRadius:10,borderSpacing:0}}><tbody><DealFollowupRow followup={{...task,deal}} onOpen={()=>setOpen('followup')}/><FccReminderRow row={fcc} onOpen={()=>setOpen('developer')}/></tbody></table>}
    {open && <DealDetailDrawer key={open} dealId={deal.id} initialTab={open} onClose={()=>setOpen(null)} onChanged={()=>{}}/>}
    <p style={{fontSize:12}}>Synthetic saves only. Reopen the drawer to verify refreshed mock data.</p>
  </main>;
}
