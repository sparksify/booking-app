import { brandKey, domainOf, uuidOrNull } from './ownerNames.mjs';

const TERRITORY_RE = /\bterritor(?:y|ies)\b[^.<>\n]{0,60}\bavailable\b|\bavailable\b[^.<>\n]{0,60}\bterritor(?:y|ies)\b/i;
const NEGATION_RE = /\b(?:not|no|non|isn['’]t|aren['’]t)\s+(?:a\s+)?franchises?\b/gi;

/** A page is a franchise only when it shows a franchise offering, an FDD, or territory language. */
export function pageFranchiseEvidence(html) {
  if (!html || typeof html !== 'string') return null;
  const stripped = html.replace(NEGATION_RE, ' ');
  const lower = stripped.toLowerCase();
  if (lower.includes('franchise')) return { kind: 'page', confidence: 'high', detail: 'franchise' };
  if (/\bfdd\b/i.test(stripped)) return { kind: 'page', confidence: 'high', detail: 'fdd' };
  if (TERRITORY_RE.test(stripped)) return { kind: 'page', confidence: 'high', detail: 'territory available' };
  return null;
}

export function evidenceInPage(html, quote) {
  const needle = String(quote || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (needle.length < 8) return false;
  const hay = String(html || '').toLowerCase().replace(/\s+/g, ' ');
  return hay.includes(needle);
}

/**
 * Claude may say FRANCHISE only when it quotes offering evidence that is actually on the page.
 * A bare FRANCHISE, or a quote that is not in the HTML, is not a franchise.
 */
export function classifierConfirmsFranchise(html, modelText) {
  const raw = String(modelText || '').trim().replace(/```json|```/gi, '').trim();
  let decision = raw.toUpperCase();
  let evidence = '';
  try {
    const parsed = JSON.parse(raw);
    decision = String(parsed.decision || '').toUpperCase();
    evidence = String(parsed.evidence || '');
  } catch { /* one-word answers have no quote */ }
  if (decision !== 'FRANCHISE') return { franchise: false, evidence: null };
  if (!evidenceInPage(html, evidence) || !pageFranchiseEvidence(evidence)) return { franchise: false, evidence: null };
  return { franchise: true, evidence: evidence.replace(/\s+/g, ' ').trim() };
}

export function franchiseOverrideReason(value) {
  if (value === true) return 'verified non-franchise';
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500);
  return null;
}

/** A logged non-franchise override may rerun a lead that was held as a franchise. */
export function retryDespiteTerminal(existing, incoming) {
  return !!(incoming?.franchise_override && existing?.hold_reason === 'franchise');
}

export function sameFranchise(a, b) {
  if (a?.domain && b?.domain && String(a.domain).toLowerCase() === String(b.domain).toLowerCase()) return true;
  if (a?.brand_key && b?.brand_key && a.brand_key === b.brand_key) return true;
  return false;
}

export function franchiseBrandRow(biz) {
  const domain = biz.domain || domainOf(biz.website || biz.franchise_evidence_url);
  return {
    brand: biz.business_name || biz.brand || null,
    brand_key: biz.brand_key || brandKey(biz.business_name || biz.brand),
    domain,
    city: biz.city || null,
    city_key: String(biz.city || '').toLowerCase().trim(),
    evidence_url: biz.franchise_evidence_url || biz.website || null,
    evidence_kind: biz.franchise_evidence_kind || 'classifier',
    evidence_detail: biz.franchise_evidence_detail || biz.franchise_check || null,
    confidence: biz.franchise_confidence || 'medium',
    source: biz.source || null,
    external_id: biz.external_id || null,
    scout_candidate_id: uuidOrNull(biz.scout_candidate_id),
  };
}
