import { cleanPhone, judgeCandidates } from './ownerGate.mjs';

function confirmed(candidates) {
  const judgment = judgeCandidates(candidates);
  return judgment.owner_confidence === 'medium' || judgment.owner_confidence === 'high';
}

/**
 * Cheapest name source first. Stops once two independent sources agree.
 * Supplied names are not evidence. Search is not used to find email addresses.
 */
export async function identifyOwner(biz, deps) {
  const candidates = [];
  const calls = [];
  let websiteEmails = [];
  let websiteExcerpt = biz.website_excerpt || null;
  let signal = biz.signal || null;
  let businessPhone = cleanPhone(biz.phone);

  async function run(finder, fn) {
    if (!fn || confirmed(candidates)) return;
    try {
      const result = await fn(biz) || {};
      if (Array.isArray(result.calls)) calls.push(...result.calls);
      if (Array.isArray(result.emails)) websiteEmails = websiteEmails.concat(result.emails);
      if (result.excerpt && !websiteExcerpt) websiteExcerpt = result.excerpt;
      if (result.signal && !signal) signal = result.signal;
      if (result.business_phone) businessPhone = cleanPhone(result.business_phone) || businessPhone;
      for (const candidate of result.candidates || []) {
        if (candidate?.name && candidate.category) candidates.push(candidate);
      }
    } catch (error) {
      calls.push({ finder, stage: 'name', credits: 0, error: error.message });
    }
  }

  await run('site', deps.readSite);
  await run('maps', deps.mapsPlace);
  await run('press', deps.press);
  await run('filings_linkedin', deps.filings);
  await run('perplexity', deps.perplexity);

  const judgment = judgeCandidates(candidates);
  const emails = [...new Set(websiteEmails.map(email => String(email).toLowerCase()))];
  return {
    ...biz,
    ...judgment,
    owner_source: judgment.owner_sources?.[0] || 'not_found',
    signal,
    website_excerpt: websiteExcerpt,
    website_emails: emails,
    website_email: emails[0] || null,
    business_phone: businessPhone,
    phone: biz.phone || (businessPhone ? businessPhone : null),
    discover_calls: calls.map(call => ({ stage: 'name', ...call })),
    name_candidates: candidates,
  };
}
