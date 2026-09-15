// Server only. Never import into a React component.
import crypto from 'crypto';
import { google } from 'googleapis';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { getSupabaseAdmin } from './supabase';
import { getPermissions } from './role';
import { normalize, parseReceipt, matchBrand, acknowledgment, nextCheck, authoredText } from './fcc.mjs';

export const READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const resultData = result => { if (result.error) throw new Error('FCC database operation failed'); return result.data; };
export function publicError(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function productionOnly() {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') throw publicError('Mailbox connections and ingestion are disabled on previews. Use production.', 403);
}
export async function context(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) throw publicError('Sign in to Kanso first.', 401);
  const owner = normalize(session.user.email);
  const db = getSupabaseAdmin();
  const member = resultData(await db.from('team_members').select('email').eq('email', owner).eq('active', true).maybeSingle());
  const perms = await getPermissions(owner);
  if (!member || !perms.page_meetings) throw publicError('Meetings access is required.', 403);
  if (!['GET','HEAD'].includes(req.method)) {
    const origin = req.headers.origin;
    const configured = new URL(process.env.NEXTAUTH_URL).origin;
    if (origin !== configured || !String(req.headers['content-type'] || '').startsWith('application/json')) throw publicError('Invalid request origin.', 403);
  }
  return { db, owner, perms };
}
function key() {
  if (!process.env.NEXTAUTH_SECRET) throw new Error('Encryption is not configured');
  return crypto.createHash('sha256').update(`kanso-fcc-v1:${process.env.NEXTAUTH_SECRET}`).digest();
}
export function seal(value) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}
export function unseal(value) {
  const bytes = Buffer.from(value, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), bytes.subarray(0,12));
  decipher.setAuthTag(bytes.subarray(12,28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
}
export function oauthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET,
    `${new URL(process.env.NEXTAUTH_URL).origin}/api/dashboard/fcc/callback`);
}
export async function gmailClient(box) {
  const auth = oauthClient();
  auth.setCredentials(unseal(box.tokens_encrypted));
  // Refresh tokens are retained; new access tokens need not be stored.
  return google.gmail({ version:'v1', auth });
}
export function decodeMessage(data) {
  const headers = data.payload?.headers || [];
  const values = name => headers.filter(h => h.name.toLowerCase() === name.toLowerCase()).map(h => h.value);
  const from = normalize((values('From')[0] || '').match(/<([^>]+)>/)?.[1] || values('From')[0]);
  const domain = from.split('@')[1] || '';
  // Use Google's first authentication result, never an arbitrary injected
  // downstream header. Require aligned domain boundaries (not lookalikes).
  const auth = values('Authentication-Results').find(v => /^mx\.google\.com;/i.test(v)) || '';
  const aligned = auth.split(';').some(section => {
    const token = /dkim=pass\b/i.test(section) ? section.match(/header\.(?:i|d)=([^\s;]+)/i)?.[1]
      : /spf=pass\b/i.test(section) ? section.match(/smtp\.mailfrom=([^\s;]+)/i)?.[1] : null;
    const signedDomain = normalize(token?.replace(/[<>"']/g,'').split('@').at(-1));
    return !!signedDomain && (signedDomain === domain || signedDomain.endsWith(`.${domain}`));
  });
  const bodies = { text:[], html:[] };
  function walk(part) {
    if (part.filename) return; // Never fetch attachments.
    if (part.body?.data && ['text/plain','text/html'].includes(part.mimeType)) bodies[part.mimeType === 'text/html' ? 'html' : 'text'].push(Buffer.from(part.body.data,'base64url').toString('utf8'));
    (part.parts || []).forEach(walk);
  }
  walk(data.payload || {});
  return { id:data.id, threadId:data.threadId, receivedAt:new Date(Number(data.internalDate)).toISOString(), from,
    authenticatedSender:!!domain && aligned, sent:(data.labelIds || []).includes('SENT'),
    automatic:values('Auto-Submitted').some(v => normalize(v) !== 'no') || values('Precedence').some(v => /bulk|junk|list/i.test(v)) || values('Content-Type').some(v => /report-type=delivery-status/i.test(v)),
    text:bodies.text.join('\n'), html:bodies.html.join('\n') };
}
export async function getMessage(gmail, id) {
  if (!/^[a-f0-9]{8,32}$/i.test(id || '')) throw publicError('Invalid source message.');
  return decodeMessage((await gmail.users.messages.get({ userId:'me', id, format:'full' })).data);
}
export async function catalog(db, owner) {
  const [brands, rules] = await Promise.all([
    db.from('brands').select('id,name,active').eq('active',true),
    db.from('fcc_brand_rules').select('*').eq('owner_email',owner),
  ]);
  return { brands:resultData(brands), rules:resultData(rules) };
}
export function receiptRows(message, box, cats) {
  const receipt = parseReceipt(message, box.mailbox_email);
  if (!receipt) return [];
  return receipt.brands.map(brand => {
    const match = matchBrand(brand,cats.brands,cats.rules);
    // Copies with identical structured content are conservatively deduplicated.
    // Explicit submission ID/date distinguishes a genuine resubmission.
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify([receipt.email,normalize(match.brand?.name || brand),receipt.consultant,receipt.name,receipt.phone,receipt.territories,receipt.receipt_identity])).digest('hex');
    return { ...receipt, brand, message_id:message.id, thread_id:message.threadId, fingerprint,
      due_at:nextCheck(receipt.submitted_at,box.timezone,box.check_hour),
      canonical:match.brand || null, aliases:match.aliases || [], review_reason:receipt.review_reason || match.review || null };
  });
}
export async function ingest(db, box, row, reviewId = null) {
  return resultData(await db.rpc('fcc_ingest', {p_owner:box.owner_email,p_receipt:row,p_brand:row.canonical?.id || null,p_aliases:row.aliases,p_review:row.review_reason,p_review_id:reviewId}));
}
export async function record(db, owner, id, action, { key: eventKey, at = new Date().toISOString(), next = null, excerpt = '', message = null, manual = false } = {}) {
  return resultData(await db.rpc('fcc_record_action',{p_owner:owner,p_id:id,p_key:eventKey,p_action:action,p_at:at,p_next:next,p_excerpt:excerpt,p_message:message,p_manual:manual}));
}
const epoch = date => Math.floor(new Date(date).getTime()/1000);
const asQuery = value => `"${String(value).replace(/["\\\r\n]/g,' ')}"`;

export async function dryRun(db, box, days) {
  const gmail = await gmailClient(box), cats = await catalog(db,box.owner_email);
  const since = new Date(Date.now()-days*86400000).toISOString();
  const listed = (await gmail.users.messages.list({userId:'me',q:`after:${epoch(since)} "FCC Lead Registration"`,maxResults:25})).data;
  const rows = [];
  for (const item of listed.messages || []) rows.push(...receiptRows(await getMessage(gmail,item.id),box,cats));
  const token = seal({ owner:box.owner_email, mailbox:box.mailbox_email, ids:rows.map(r=>r.message_id), expires:Date.now()+15*60000 });
  return { rows:rows.map(({email,name,brand,message_id,submitted_at,canonical,review_reason})=>({email,name,brand,message_id,submitted_at,canonical,review_reason})), token, truncated:!!listed.nextPageToken };
}

// Bounded background work; never called by the Meetings GET route.
export async function syncMailbox(db, initialBox) {
  const owner = initialBox.owner_email, lease = crypto.randomUUID(), started = new Date().toISOString();
  const locked = resultData(await db.from('fcc_mailboxes').update({lease_id:lease,lease_until:new Date(Date.now()+180000).toISOString()})
    .eq('owner_email',owner).eq('enabled',true).or(`lease_until.is.null,lease_until.lt.${started}`).select('*').maybeSingle());
  if (!locked) return { skipped:true };
  const box = locked;
  try {
    const gmail = await gmailClient(box), cats = await catalog(db,owner);
    const until = box.scan_until || started;
    const since = box.synced_through || box.activation_at;
    const listed = (await gmail.users.messages.list({userId:'me',q:`after:${epoch(since)-120} before:${epoch(until)+1} "FCC Lead Registration"`,maxResults:20,pageToken:box.page_token || undefined})).data;
    for (const item of listed.messages || []) {
      const message = await getMessage(gmail,item.id);
      if (new Date(message.receivedAt)<new Date(box.activation_at)) continue;
      for (const row of receiptRows(message,box,cats)) await ingest(db,box,row);
    }
    resultData(await db.from('fcc_mailboxes').update({page_token:listed.nextPageToken || null,scan_until:listed.nextPageToken ? until : null,synced_through:listed.nextPageToken ? box.synced_through : until})
      .eq('owner_email',owner).eq('lease_id',lease));
    // Oldest unchecked first, so a large queue catches up across ticks.
    const subs = resultData(await db.from('fcc_submissions').select('*,deal:deals!inner(status,assigned_to_email,developer_email)')
      .eq('owner_email',owner).eq('deal.status','active').eq('deal.assigned_to_email',owner).in('status',['pending','acknowledged'])
      .order('checked_through',{ascending:true,nullsFirst:true}).limit(10));
    for (const s of subs) {
      if (Date.now()-new Date(started).getTime()>85000) break;
      try {
        const rule = cats.rules.find(r=>r.brand_id===s.brand_id) || {};
        const emails = [...new Set([...(rule.verified_emails || []),s.deal?.developer_email].filter(Boolean).map(normalize))];
        const domains = rule.verified_domains || [];
        if (!emails.length && !domains.length) {
          resultData(await db.from('fcc_submissions').update({check_error:'Add a verified developer email or brand contact before checking.'}).eq('id',s.id).eq('owner_email',owner));
          continue;
        }
        const cutoff = s.check_until || started;
        const checkedSince = s.checked_through || s.submitted_at;
        const senders = [...emails,...domains.map(d=>`@${d}`)].map(e=>`from:${asQuery(e)}`).join(' ');
        const messages = (await gmail.users.messages.list({userId:'me',q:`after:${epoch(checkedSince)-120} before:${epoch(cutoff)+1} -in:sent {${senders}}`,maxResults:30,pageToken:s.check_page_token || undefined})).data;
        // Scope ambiguity checks to this owner in SQL, including resolved events.
        const siblings = resultData(await db.from('fcc_submissions').select('id,brand_id,candidate_email,source_thread_id').eq('owner_email',owner).not('deal_id','is',null));
        for (const item of messages.messages || []) {
          const message = await getMessage(gmail,item.id);
          if (new Date(message.receivedAt)<new Date(s.submitted_at)) continue;
          let detected = acknowledgment(message,s,{...rule,verified_emails:emails,brand_name:cats.brands.find(b=>b.id===s.brand_id)?.name,other_brand_names:cats.brands.filter(b=>b.id!==s.brand_id).map(b=>b.name)},{ownEmails:[owner,box.mailbox_email],threadUnique:siblings.filter(x=>x.source_thread_id===s.source_thread_id).length===1});
          if (!detected) continue;
          const sameCandidateBrands = [...new Set(siblings.filter(x=>x.candidate_email===s.candidate_email).map(x=>x.brand_id))];
          // Shared developer or multiple brand submissions: require authored brand
          // evidence as well. Never let a full name alone acknowledge every brand.
          if (sameCandidateBrands.length>1 && !normalize(authoredText(message)).includes(normalize(cats.brands.find(b=>b.id===s.brand_id)?.name))) detected = {...detected,classification:'needs_review'};
          await record(db,owner,s.id,detected.classification,{key:`gmail:${message.id}`,at:message.receivedAt,excerpt:detected.excerpt,message:message.id});
        }
        resultData(await db.from('fcc_submissions').update({check_page_token:messages.nextPageToken || null,check_until:messages.nextPageToken ? cutoff : null,
          checked_through:messages.nextPageToken ? s.checked_through : cutoff,check_error:messages.nextPageToken ? 'Catching up with mailbox messages.' : null}).eq('id',s.id).eq('owner_email',owner));
      } catch {
        resultData(await db.from('fcc_submissions').update({check_error:'Acknowledgment check unavailable. Reconnect Gmail if this persists.',check_page_token:null,check_until:null}).eq('id',s.id).eq('owner_email',owner));
      }
    }
    resultData(await db.from('fcc_mailboxes').update({last_error:listed.nextPageToken ? 'Catching up with FCC receipts.' : null,updated_at:started}).eq('owner_email',owner).eq('lease_id',lease));
    return { ok:true };
  } catch {
    resultData(await db.from('fcc_mailboxes').update({last_error:'Mailbox sync unavailable. Reconnect Gmail and check access.',updated_at:started,page_token:null,scan_until:null}).eq('owner_email',owner).eq('lease_id',lease));
    return { ok:false };
  } finally {
    resultData(await db.from('fcc_mailboxes').update({lease_id:null,lease_until:null}).eq('owner_email',owner).eq('lease_id',lease));
  }
}
