import { addBusinessDays, wallClockValue } from './dealDesk.mjs';

export const normalize = value => String(value || '').trim().toLowerCase();
export const validEmail = value => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value || '');
export const sourceLink = (mailbox, id) => `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(mailbox)}#all/${encodeURIComponent(id)}`;
export function plainText(html) {
  return String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(br|\/p|\/div|\/tr|\/td|\/th|\/li)\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/gi, x => ({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"}[x.toLowerCase()]))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}
export function authoredText(message) {
  const body = message.html ? plainText(message.html.replace(/<(?:blockquote)\b[\s\S]*$/i, '').replace(/<div\b[^>]*class=["'][^"']*gmail_quote[\s\S]*$/i, '')) : message.text || '';
  return body.split(/\n\s*(?:On [^\n]{0,300}wrote:|From:|[-_]{3,}|Begin forwarded message:|>)/i)[0].trim();
}
export function parseReceipt(message, mailbox) {
  const text = plainText(message.html || message.text);
  if (!/FCC Lead Registration\s*[-–]\s*New/i.test(text)) return null;
  // No subject rule. Every known label, including excluded sensitive fields,
  // terminates the preceding value so private fields cannot leak into a task.
  const labels = /(?:^|\n)\s*(Franchise Brand\s*\d+|Consultant['’]s Name|Consultant E-mail|Consultant Number|Lead Name|Territory\s*\/\s*City Requested|Lead Net Worth|Lead Address|Lead E-mail|Lead Phone Number|Lead Narrative|Attach Files Here|Submission Date|Submission ID)\s*:?\s*(?:\n|(?=\S))/gi;
  const markers = [...text.matchAll(labels)];
  const fields = {};
  markers.forEach((m, i) => { fields[normalize(m[1]).replace('’', "'")] = text.slice(m.index + m[0].length, markers[i + 1]?.index ?? text.length).trim(); });
  const email = normalize(fields['lead e-mail']);
  const consultant = normalize(fields['consultant e-mail']);
  const name = (fields['lead name'] || '').replace(/\s+/g, ' ').slice(0, 160);
  if (!validEmail(email) || !name || !validEmail(consultant)) return null;
  const brands = [...new Set(Object.entries(fields).filter(([k]) => /^franchise brand\s*\d+$/.test(k)).map(([, v]) => v.trim().slice(0,150)).filter(Boolean))];
  if (!brands.length) return null;
  const explicit = fields['submission date'];
  const reliableDate = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/.test(explicit || '') && Number.isFinite(Date.parse(explicit));
  const submittedAt = reliableDate ? new Date(explicit).toISOString() : new Date(message.receivedAt).toISOString();
  const trusted = normalize(message.from) === 'noreply@jotform.com' && message.authenticatedSender === true;
  return { email, consultant, name, brands, phone:(fields['lead phone number'] || '').slice(0,60), territories:(fields['territory / city requested'] || '').slice(0,200),
    submitted_at:submittedAt, timestamp_source:reliableDate ? 'receipt' : 'email_received',
    receipt_identity:fields['submission id']?.slice(0,100) || (reliableDate ? submittedAt : ''),
    review_reason: consultant !== normalize(mailbox) ? 'Receipt consultant does not match the connected mailbox' : !trusted ? 'Forwarded or unauthenticated receipt: confirm source before importing' : null };
}
export function matchBrand(label, brands, rules = []) {
  const found = brands.filter(b => b.active !== false && [b.name, ...(rules.find(r => r.brand_id === b.id)?.aliases || [])].some(a => normalize(a) === normalize(label)));
  return found.length === 1 ? { brand: found[0], aliases:[found[0].name, ...(rules.find(r => r.brand_id === found[0].id)?.aliases || [])].map(normalize) } : { review: found.length ? 'Ambiguous brand alias' : 'Unknown brand; select a canonical brand' };
}
export function acknowledgment(message, submission, rules, { ownEmails = [], threadUnique = false } = {}) {
  const sender = normalize(message.from);
  if (message.sent || ownEmails.map(normalize).includes(sender) || message.automatic || !message.authenticatedSender) return null;
  const text = authoredText(message).slice(0,10000);
  if (!text || /out of (?:the )?office|automatic reply|auto.?reply|delivery (?:status|failure)|undeliverable/i.test(text)) return null;
  const known = (rules.verified_emails || []).map(normalize).includes(sender) || (rules.verified_domains || []).map(normalize).includes(sender.split('@')[1]);
  if (!known) return null;
  const lc = normalize(text);
  if ((rules.other_brand_names || []).some(name => name.length>3 && lc.includes(normalize(name))) && (!rules.brand_name || !lc.includes(normalize(rules.brand_name)))) return null;
  const fullName = normalize(submission.candidate_name);
  const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const containsName = name => !!name && new RegExp(`(^|[^a-z0-9])${escaped(name)}(?![a-z0-9])`,'i').test(lc);
  const textEmails = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) || [];
  const strongCandidate = textEmails.some(e=>normalize(e)===normalize(submission.candidate_email)) || (fullName.includes(' ') && containsName(fullName));
  const terseThread = threadUnique && message.threadId === submission.source_thread_id && /^(thanks[,!. ]*)?(received|got it|thank you)[.!\s]*$/i.test(text);
  const wrongCandidate = textEmails.some(e => ![submission.candidate_email,sender,...ownEmails].map(normalize).includes(normalize(e)));
  const positive = /\breceived\b|\bregistration\b.{0,30}\bthank|\b(?:we(?:'|’)ll|will|plan to) (?:call|contact|reach out)\b|\b(?:spoke with|contacted|talked to)\b/i.test(text);
  if (!positive && !terseThread) return null;
  if (!strongCandidate && !terseThread && message.threadId!==submission.source_thread_id && !containsName(fullName.split(' ')[0])) return null;
  if (/\b(?:not|never|haven't|haven’t|didn't|didn’t|haven't yet)\b.{0,25}\b(?:received|contacted|spoke|talked)|\b(?:cannot|can't|can’t)\b|\?/i.test(text)) return { classification:'needs_review', excerpt:text.slice(0,500) };
  if (wrongCandidate) return null;
  if (!strongCandidate && !terseThread) return { classification:'needs_review', excerpt:text.slice(0,500) };
  return { classification:/\b(?:spoke with|contacted|talked to)\b/i.test(text) ? 'contact_reported' : /\b(?:we(?:'|’)ll|will|plan to) (?:call|contact|reach out)\b/i.test(text) ? 'outreach_planned' : 'acknowledged', excerpt:text.slice(0,500) };
}
export function nextCheck(receivedAt, timezone = 'America/Chicago', hour = 9) {
  return addBusinessDays(1, new Date(receivedAt), timezone, hour).toISOString();
}
export function checkAvailability(submission, mailbox, now = new Date()) {
  if (submission.status === 'acknowledged') return 'Acknowledgment received';
  if (mailbox?.enabled && !mailbox.last_error && new Date(submission.due_at) > now) return 'Acknowledgment check scheduled';
  if (!mailbox?.enabled || mailbox.last_error || !submission.checked_through || new Date(submission.checked_through) < new Date(submission.due_at) || now - new Date(submission.checked_through) > 30 * 60000) return 'Acknowledgment check unavailable';
  return 'No brand acknowledgment found';
}
export function inDateFilter(dueAt, filter, timezone, now = new Date()) {
  if (filter === 'all') return true;
  const day = wallClockValue(dueAt, timezone).slice(0,10);
  const today = wallClockValue(now, timezone).slice(0,10);
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (filter === 'week' ? 13 : filter === 'tomorrow' ? 1 : 0));
  const end = date.toISOString().slice(0,10);
  return day <= end && (filter === 'today' || day >= (filter === 'tomorrow' ? end : today));
}
