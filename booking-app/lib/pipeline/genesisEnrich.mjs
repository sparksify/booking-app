import { parseOwnerNames, personParts } from './ownerNames.mjs';
import { domainsAlign, emailMatchesBusiness, emailMatchesOwner, inboxKind, isConfirmedOwner } from './ownerGate.mjs';

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
 * website addresses, then Anymail Finder, FullEnrich, and Prospeo when a key is configured.
 * A verified founder inbox on a business domain wins immediately.
 * Otherwise a founder-matching catch-all is kept ahead of founder freemail
 * (a freemail that matches the owner, or a non-role website freemail that carries the business name).
 * Role inboxes are never contacts. Accepted freemail and catch-all stay unloadable
 * so they are not counted as verified business-founder emails.
 * No web search runs in this stage. Unconfirmed owners spend no finder credits.
 */

export function leadStatusForContact(confirmed, enriched) {
  if (!confirmed) return 'Needs Founder';
  if (enriched?.inbox_type === 'personal' && enriched?.verification === 'ok' && enriched?.email) return 'Enriched';
  if (enriched?.inbox_type === 'freemail' && enriched?.verification === 'ok' && enriched?.email) return 'Accepted Freemail';
  if (enriched?.inbox_type === 'catch_all' && enriched?.verification === 'catch_all' && enriched?.email) return 'Accepted Catch-all';
  return 'No Match';
}

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
  let fallback = null;

  function flag(email, reason, source) {
    const normalized = String(email || '').toLowerCase().trim();
    if (!normalized) return;
    if (fallback && fallback.email === normalized && (reason === 'freemail' || reason === 'catch_all')) return;
    flagged.push({ email: normalized, reason, source });
    tried.push(`${source}:flagged:${reason}:${normalized}`);
  }

  function founderMatch(email, ownerName) {
    const queried = people.find(candidate => candidate.full.toLowerCase() === String(ownerName || '').toLowerCase());
    if (queried && emailMatchesOwner(email, queried)) return queried;
    return people.find(candidate => emailMatchesOwner(email, candidate)) || null;
  }

  function freemailOwner(email, ownerName, source) {
    const matched = founderMatch(email, ownerName);
    if (matched) return matched;
    if (source === 'website_email' && emailMatchesBusiness(email, biz.business_name)) return person;
    return null;
  }

  function fallbackRank(candidate) {
    if (candidate.inbox_type === 'catch_all' && domainsAlign(candidate.email, biz.domain)) return 2;
    if (candidate.inbox_type === 'catch_all') return 1;
    return 0;
  }

  function rememberFallback(candidate) {
    if (fallback && fallback.email === candidate.email) return;
    if (!fallback || fallbackRank(candidate) > fallbackRank(fallback)) {
      const previous = fallback;
      fallback = candidate;
      if (previous) flag(previous.email, previous.inbox_type, previous.source);
      return;
    }
    flag(candidate.email, candidate.inbox_type, candidate.source);
  }

  function discardFallback() {
    if (!fallback) return;
    const previous = fallback;
    fallback = null;
    flag(previous.email, previous.inbox_type, previous.source);
  }

  function finish(holdReason, extra = {}) {
    if (!fallback) return pack(biz, { source: 'not_found', holdReason, ...extra }, tried, calls, flagged);
    return pack(biz, {
      ...extra,
      email: fallback.email,
      owner: fallback.owner,
      source: fallback.source,
      inbox_type: fallback.inbox_type,
      verification: fallback.verification,
      loadable: false,
      holdReason: null,
      verdict: fallback.verdict,
    }, tried, calls, flagged);
  }

  async function consider(email, owner, source, { requireOwnerMatch = false } = {}) {
    if (!email || !String(email).includes('@')) return null;
    const normalized = String(email).toLowerCase().trim();
    const shape = inboxKind(normalized);
    if (shape === 'role') {
      flag(normalized, 'role', source);
      return null;
    }
    if (shape === 'freemail') {
      const matched = freemailOwner(normalized, owner, source);
      if (!matched) {
        flag(normalized, 'freemail', source);
        return null;
      }
      tried.push(`${source}:verify:${normalized}`);
      const verdict = await deps.verifyEmail(normalized);
      if (Array.isArray(verdict?.calls)) calls.push(...verdict.calls);
      const result = verdict?.result || verdict;
      if (result !== 'ok') {
        flag(normalized, result || 'reject', source);
        return null;
      }
      rememberFallback({
        email: normalized, owner: matched.full, source, inbox_type: 'freemail', verification: 'ok', verdict,
      });
      return null;
    }
    const matched = founderMatch(normalized, owner);
    if (requireOwnerMatch && !matched) {
      flag(normalized, 'role', source);
      return null;
    }
    tried.push(`${source}:verify:${normalized}`);
    const verdict = await deps.verifyEmail(normalized);
    if (Array.isArray(verdict?.calls)) calls.push(...verdict.calls);
    const result = verdict?.result || verdict;
    if (result === 'catch_all') {
      if (matched) {
        rememberFallback({
          email: normalized, owner: matched.full, source, inbox_type: 'catch_all', verification: 'catch_all', verdict,
        });
      } else flag(normalized, 'catch_all', source);
      return null;
    }
    if (result !== 'ok') {
      flag(normalized, result || 'reject', source);
      return null;
    }
    if (!domainsAlign(normalized, biz.domain)) flag(normalized, 'domain_mismatch', source);
    discardFallback();
    return pack(biz, {
      email: normalized, owner: matched ? matched.full : owner, source, inbox_type: 'personal', verification: 'ok', loadable: true, verdict,
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
    return finish('no_domain', { skipped_finders: true });
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

  return finish('no_personal_email');
}

export { personParts };
