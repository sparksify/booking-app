export function intakeError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function normalizeIntake(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw intakeError('Send one business as a JSON object.');
  const str = (key, max = 250) => {
    if (body[key] == null) return null;
    if (typeof body[key] !== 'string' || body[key].length > max) throw intakeError(`${key} must be text, at most ${max} characters.`);
    return body[key].trim() || null;
  };
  const business_name = str('business_name');
  if (!business_name) throw intakeError('business_name is required.');
  if (body.is_franchise === true) throw intakeError('Genesis intake is for independent businesses that are not already franchises.');
  const email = str('email', 254)?.toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw intakeError('Supply a valid email address or omit email to run discovery.');
  let website = str('website', 2000) || str('url', 2000);
  let domain = null;
  if (website) {
    try {
      const u = new URL(website.includes('://') ? website : `https://${website}`);
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port || !u.hostname.includes('.')) throw new Error();
      domain = u.hostname.toLowerCase().replace(/^www\./, '');
      website = u.href;
    } catch { throw intakeError('website must be a public HTTP or HTTPS business URL.'); }
  }
  const owner_name = str('owner_name');
  const phone = str('phone', 80);
  const city = str('city');
  if (!email && !website && !owner_name && !phone && !city) throw intakeError('Include email, website, owner_name, phone, or city to identify the business.');
  const research_notes = str('research_notes', 12000);
  const franchise_information = str('franchise_information', 12000);
  return { business_name, owner_name, email, phone, website, domain, city,
    industry: str('industry'), research_notes, franchise_information,
    signal: str('signal', 4000) || franchise_information || research_notes,
    source: 'grok', is_franchise: false,
  };
}

export const firstStage = lead => lead.email ? 'verify' : 'discover';

export function verifiedResult(lead, verification) {
  return { ...lead, email_owner: lead.owner_name, email_source: 'grok', verification,
    enriched: !!lead.email, loadable: verification === 'ok',
    hold_reason: verification === 'ok' ? null : verification === 'catch_all' ? 'catch_all' : verification === 'reject' ? 'invalid_email' : 'verification_unavailable',
    enrichment_stages_tried: ['supplied_email_verification'],
  };
}

export function finalStatus(result) {
  if (!result.email) return 'no_email';
  if (result.verification === 'ok' || result.verification === 'skipped_verified_source') return 'ready_for_review';
  return result.verification === 'catch_all' ? 'held_catch_all' : result.verification === 'reject' ? 'held_invalid_email' : 'held_unverified';
}
