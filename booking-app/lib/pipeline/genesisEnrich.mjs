import { parseOwnerNames, personParts } from './ownerNames.mjs';
import { domainsAlign, emailMatchesOwner, inboxKind, isConfirmedOwner } from './ownerGate.mjs';

export function sumCredits(calls) {
  return (calls || []).reduce((total, call) => total + (Number(call.credits) || 0), 0);
}

function asEmail(found, calls) {
  if (!found) return null;
  if (typeof found === 'string') return found.includes('@') ? found : null;
  if (Array.isArray(found.calls)) calls.push(...found.calls);
  return typeof found.email === 'string' && found.email.includes('@') ? found.email : null;
}

function pack(biz, fields, tried, calls, flagged) {
  const email = fields.email || null;
  return {
    ...biz,
    email,
    email_owner: fields.owner || null,
    email_source: fields.source || (email ? null : 'not_found'),
    inbox_type: fields.inbox_type || null,
    verification: fields.verification || null,
    verification_detail: fields.verdict
      ? { primary: fields.verdict.primary ?? fields.verification, backup: fields.verdict.backup ?? null, backup_source: fields.verdict.backupSource ?? null }
      : {},
    loadable: !!fields.loadable,
    hold_reason: fields.holdReason || null,
    enriched: fields.inbox_type === 'personal' && fields.verification === 'ok' && !!email,
    enrichment_stages_tried: tried,
    enrichment_calls: calls,
    flagged_emails: flagged,
    credits: sumCredits(calls),
    skipped_finders: !!fields.skipped_finders,
  };
}

/**
 * Email order after a confirmed owner:
 * website addresses (a founder email only when they match the owner, verify, and are not role/freemail/catch-all),
 * then Anymail Finder, FullEnrich, and Prospeo when a key is configured.
 * No web search runs in this stage. Unconfirmed owners spend no finder credits.
 */
function peopleFor(biz) {
  const people = parseOwnerNames(biz?.owner_name || '').map(personParts).filter(Boolean);
  if (biz?.owner_first && biz?.owner_last) {
    const primary = personParts(`${biz.owner_first} ${biz.owner_last}`);
    if (primary && !people.some(person => person.full.toLowerCase() === primary.full.toLowerCase())) people.unshift(primary);
  }
  return people;
}

export async function enrichLead(biz, deps) {
  const people = peopleFor(biz);
  const person = people[0] || null;
  const confirmed = isConfirmedOwner(biz) && people.length > 0;
  const tried = [];
  const calls = [];
  const flagged = [];

  function flag(email, reason, source) {
    const normalized = String(email || '').toLowerCase().trim();
    if (!normalized) return;
    flagged.push({ email: normalized, reason, source });
    tried.push(`${source}:flagged:${reason}:${normalized}`);
  }

  async function consider(email, owner, source, { requireOwnerMatch = false } = {}) {
    if (!email || !String(email).includes('@')) return null;
    const normalized = String(email).toLowerCase().trim();
    const shape = inboxKind(normalized);
    if (shape === 'role' || shape === 'freemail') {
      flag(normalized, shape, source);
      return null;
    }
    const matched = requireOwnerMatch ? people.find(candidate => emailMatchesOwner(normalized, candidate)) : person;
    if (requireOwnerMatch && !matched) {
      flag(normalized, 'role', source);
      return null;
    }
    tried.push(`${source}:verify:${normalized}`);
    const verdict = await deps.verifyEmail(normalized);
    if (Array.isArray(verdict?.calls)) calls.push(...verdict.calls);
    const result = verdict?.result || verdict;
    if (result === 'catch_all') {
      flag(normalized, 'catch_all', source);
      return null;
    }
    if (result !== 'ok') {
      flag(normalized, result || 'reject', source);
      return null;
    }
    if (!domainsAlign(normalized, biz.domain)) flag(normalized, 'domain_mismatch', source);
    return pack(biz, {
      email: normalized, owner: requireOwnerMatch ? matched.full : owner, source, inbox_type: 'personal', verification: 'ok', loadable: true, verdict,
    }, tried, calls, flagged);
  }

  const websiteEmails = biz.website_emails || (biz.website_email ? [biz.website_email] : []);
  if (!confirmed) {
    for (const websiteEmail of websiteEmails) flag(websiteEmail, 'unconfirmed_owner', 'website_email');
    tried.push('finders:skipped_needs_founder');
    return pack(biz, { source: 'not_found', skipped_finders: true, holdReason: 'needs_founder' }, tried, calls, flagged);
  }

  for (const websiteEmail of websiteEmails) {
    tried.push(`website_email:${websiteEmail}`);
    const hit = await consider(websiteEmail, person.full, 'website_email', { requireOwnerMatch: true });
    if (hit) return hit;
  }

  if (!biz.domain) {
    tried.push('finders:skipped_no_domain');
    return pack(biz, { source: 'not_found', skipped_finders: true, holdReason: 'no_domain' }, tried, calls, flagged);
  }

  if (deps.anymailPerson) {
    for (const name of people) {
      tried.push(`anymail_person:${name.full}`);
      const found = await deps.anymailPerson(name, biz.domain, biz);
      const hit = await consider(asEmail(found, calls), name.full, 'anymail_person');
      if (hit) return hit;
    }
  }

  const startedAt = Date.now();
  const budgetMs = deps.budgetMs ?? 250000;
  if (deps.fullEnrich && (budgetMs - (Date.now() - startedAt)) > 20000) {
    for (const name of people) {
      tried.push(`fullenrich:${name.full}`);
      const found = await deps.fullEnrich(name, biz.domain, biz) || {};
      if (Array.isArray(found.calls)) calls.push(...found.calls);
      const work = await consider(found.work, name.full, 'fullenrich');
      if (work) return work;
      const personal = await consider(found.personal, name.full, 'fullenrich_personal');
      if (personal) return personal;
    }
  } else if (deps.fullEnrich) {
    tried.push('fullenrich:skipped_budget');
  }

  if (deps.prospeo) {
    for (const name of people) {
      tried.push(`prospeo:${name.full}`);
      const found = await deps.prospeo(name, biz);
      const hit = await consider(asEmail(found, calls), name.full, 'prospeo');
      if (hit) return hit;
    }
  }

  return pack(biz, { source: 'not_found', holdReason: 'no_personal_email' }, tried, calls, flagged);
}

export { personParts };
