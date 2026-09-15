import { DEFAULT_DEAL_TIMEZONE, overdueLabel } from '@/lib/dealDesk';
export function CompactFollowupRow({ name, brand, dueAt, timezone = DEFAULT_DEAL_TIMEZONE, kind, onOpen }) {
  const overdue = overdueLabel(dueAt);
  return <tr><td colSpan={10} style={{padding:0,borderBottom:'1px solid #E2E8F0'}}>
    <button onClick={onOpen} aria-label={`Open ${name} · ${kind}`} style={{display:'flex',alignItems:'center',gap:12,width:'100%',boxSizing:'border-box',padding:'14px 16px',border:0,background:'#fff',color:'#334155',textAlign:'left',cursor:'pointer',fontFamily:'inherit'}}>
      <span aria-hidden="true" style={{width:7,height:7,borderRadius:'50%',background:'#D4A659',flexShrink:0}} />
      <span style={{flex:1,minWidth:0}}><strong style={{fontSize:13}}>{name}</strong><span style={{display:'block',fontSize:12,color:'#64748B',marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{brand} · {kind}</span></span>
      <span style={{textAlign:'right',fontSize:11,color:'#64748B',flexShrink:0}}>{new Intl.DateTimeFormat('en-US',{timeZone:timezone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(dueAt))}{overdue && <span style={{display:'block',marginTop:4,color:'#92400E',fontSize:10}}>{overdue.toLowerCase()}</span>}</span>
      <span aria-hidden="true" style={{color:'#94A3B8'}}>›</span>
    </button>
  </td></tr>;
}
