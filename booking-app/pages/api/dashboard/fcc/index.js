import { context, resultData, publicError, productionOnly, dryRun, unseal, gmailClient, getMessage, catalog, receiptRows, ingest, record } from '@/lib/fccServer';
import { validEmail, normalize, sourceLink, checkAvailability, inDateFilter, matchBrand } from '@/lib/fcc.mjs';

const SAFE_BOX='owner_email,mailbox_email,enabled,activation_at,timezone,check_hour,synced_through,last_error,updated_at';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const future=value=>{const d=new Date(value);return Number.isFinite(+d) && +d>Date.now() && +d<Date.now()+366*86400000 ? d.toISOString() : null;};

export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  try {
    const {db,owner,perms}=await context(req,res);
    if(req.method==='GET') {
      const box=resultData(await db.from('fcc_mailboxes').select(SAFE_BOX).eq('owner_email',owner).maybeSingle());
      const cats=await catalog(db,owner);
      let query=db.from('fcc_submissions').select(`*,deal:deals!inner(id,first_name,last_name,email,brand,status,stage,assigned_to_email,developer_name,developer_email,developer_phone),mailbox:fcc_mailboxes(${SAFE_BOX})`).order('due_at');
      if(!perms.meetings_view_all) query=query.eq('owner_email',owner).eq('deal.assigned_to_email',owner);
      if(req.query.deal_id) {
        if(!UUID.test(req.query.deal_id)) throw publicError('Invalid deal.');
        query=query.eq('deal_id',req.query.deal_id);
      } else query=query.eq('status','pending').eq('deal.status','active');
      const rows=resultData(await query);
      const visible=rows.filter(s=>s.owner_email===s.deal.assigned_to_email && (req.query.deal_id || inDateFilter(s.due_at,req.query.filter || 'today',s.mailbox?.timezone || 'America/Chicago')))
        .map(s=>({...s,source_link:sourceLink(s.mailbox.mailbox_email,s.source_message_id),check_label:s.status==='acknowledged'?'Acknowledgment received':s.acknowledgment_needs_review?'Possible acknowledgment needs review':s.check_error?'Acknowledgment check unavailable':checkAvailability(s,s.mailbox),can_edit:s.owner_email===owner}));
      let evidence=[];
      if(req.query.deal_id && visible.length) evidence=resultData(await db.from('fcc_evidence').select('*').in('submission_id',visible.map(s=>s.id)).order('occurred_at',{ascending:false}));
      const review=resultData(await db.from('fcc_submissions').select('id,candidate_name,candidate_email,brand_label,review_reason,source_message_id,submitted_at').eq('owner_email',owner).eq('status','review').order('created_at',{ascending:false}));
      return res.json({box,brands:cats.brands,rules:cats.rules,rows:visible,evidence,review,production:!process.env.VERCEL_ENV || process.env.VERCEL_ENV==='production',scheduler_ready:!!process.env.CRON_SECRET});
    }
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
    productionOnly();
    const b=req.body || {};
    const box=resultData(await db.from('fcc_mailboxes').select('*').eq('owner_email',owner).maybeSingle());
    if(!box) throw publicError('Connect the FCC receipt mailbox first.');
    if(b.action==='configure') {
      if(typeof b.timezone!=='string' || !b.timezone.trim() || b.timezone.length>64) throw publicError('Choose a valid timezone.');
      try {new Intl.DateTimeFormat('en-US',{timeZone:b.timezone}).format();} catch {throw publicError('Choose a valid timezone.');}
      if(!Number.isInteger(b.check_hour) || b.check_hour<0 || b.check_hour>23) throw publicError('Choose an hour between 0 and 23.');
      resultData(await db.from('fcc_mailboxes').update({timezone:b.timezone,check_hour:b.check_hour}).eq('owner_email',owner));
    } else if(b.action==='disconnect') {
      // Erase Kanso's Gmail token, preserving receipt/action history. Revoking the
      // shared Google OAuth grant could also disconnect the existing calendar.
      resultData(await db.from('fcc_mailboxes').update({tokens_encrypted:'',enabled:false,last_error:'Mailbox disconnected. Reconnect to check acknowledgments.'}).eq('owner_email',owner));
    } else if(b.action==='activate' || b.action==='pause') {
      if(b.action==='activate' && !process.env.CRON_SECRET) throw publicError('The server scheduler needs CRON_SECRET before activation.',503);
      if(b.action==='activate' && !box.tokens_encrypted) throw publicError('Reconnect Gmail before activating.');
      const now=new Date().toISOString();
      resultData(await db.from('fcc_mailboxes').update(b.action==='activate'?{enabled:true,activation_at:box.activation_at || now,synced_through:box.enabled?box.synced_through:now,page_token:null,scan_until:null,last_error:null}:{enabled:false}).eq('owner_email',owner));
    } else if(b.action==='rule') {
      const brand=resultData(await db.from('brands').select('id').eq('id',b.brand_id).eq('active',true).maybeSingle());
      if(!brand) throw publicError('Select an existing active brand.');
      const split=value=>[...new Set(String(value || '').split(',').map(normalize).filter(Boolean))];
      const aliases=split(b.aliases), emails=split(b.verified_emails), domains=split(b.verified_domains);
      if([...aliases,...emails,...domains].some(v=>v.length>150) || [...aliases,...emails,...domains].length>30 || emails.some(e=>!validEmail(e)) || domains.some(d=>!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(d) || ['gmail.com','outlook.com','yahoo.com','hotmail.com','thefranchiseconsultingcompany.com'].includes(d))) throw publicError('Use valid brand-specific domains and email addresses. Do not verify a public or consultant-wide email domain.');
      resultData(await db.from('fcc_brand_rules').upsert({owner_email:owner,brand_id:brand.id,aliases,verified_emails:emails,verified_domains:domains},{onConflict:'owner_email,brand_id'}));
    } else if(b.action==='preview') {
      const days=Number(b.days);
      if(![7,30].includes(days)) throw publicError('Preview is limited to 7 or 30 days.');
      return res.json(await dryRun(db,box,days));
    } else if(b.action==='import') {
      let token;try{token=unseal(b.token);}catch{throw publicError('Preview expired. Run the preview again.');}
      if(token.owner!==owner || token.mailbox!==box.mailbox_email || token.expires<Date.now() || !Array.isArray(b.ids) || !b.ids.length || b.ids.length>25 || b.ids.some(id=>!token.ids.includes(id))) throw publicError('Preview expired or selection invalid.');
      const gmail=await gmailClient(box), cats=await catalog(db,owner);
      for(const id of new Set(b.ids)) for(const row of receiptRows(await getMessage(gmail,id),box,cats)) await ingest(db,box,row);
    } else if(b.action==='review') {
      if(!UUID.test(b.id || '')) throw publicError('Invalid submission.');
      const s=resultData(await db.from('fcc_submissions').select('*').eq('owner_email',owner).eq('id',b.id).eq('status','review').maybeSingle());
      if(!s) throw publicError('Review item not found.',404);
      const cats=await catalog(db,owner), brand=cats.brands.find(x=>x.id===b.brand_id);
      if(!brand || b.confirmed!==true) throw publicError('Select the canonical brand and confirm the source receipt.');
      const mapped=matchBrand(brand.name,cats.brands,cats.rules);
      const aliases=[...new Set([...(mapped.aliases || []),normalize(s.brand_label)])];
      await ingest(db,box,{...s,email:s.candidate_email,name:s.candidate_name,phone:s.candidate_phone,brand:s.brand_label,message_id:s.source_message_id,thread_id:s.source_thread_id,canonical:brand,aliases,review_reason:null},s.id);
    } else if(b.action==='reminder') {
      if(!UUID.test(b.id || '') || !UUID.test(b.request_key || '')) throw publicError('Invalid reminder request.');
      if(!['acknowledged','outreach_planned','contact_reported','candidate_confirmed','attempt','snooze','dismissed','reopen'].includes(b.outcome)) throw publicError('Choose a valid outcome.');
      const next=['attempt','snooze','reopen'].includes(b.outcome)?future(b.due_at):null;
      if(['attempt','snooze','reopen'].includes(b.outcome) && !next) throw publicError('Choose a future reminder date within one year.');
      if(['reopen','dismissed'].includes(b.outcome) && !String(b.note || '').trim()) throw publicError('Add a reason for this correction.');
      await record(db,owner,b.id,b.outcome,{key:`manual:${b.request_key}`,next,excerpt:String(b.note || '').slice(0,500),manual:true});
    } else throw publicError('Unknown FCC action.');
    res.json({ok:true});
  } catch(error) {res.status(error.status || 503).json({error:error.status?error.message:'FCC reminders are unavailable. Check the connection and try again.'});}
}
