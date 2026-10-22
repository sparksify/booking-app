const HIT_FINDERS = new Set([
  'anymail_person', 'fullenrich', 'fullenrich_personal', 'prospeo',
  'website_email',
]);

const FINDER_LABELS = {
  anymail_person: 'Anymail Finder',
  fullenrich: 'FullEnrich',
  fullenrich_personal: 'FullEnrich personal',
  prospeo: 'Prospeo',
  website_email: 'Website',
  perplexity_name: 'Perplexity name',
  serpapi_press: 'Press search',
  scout_search_filings: 'Filings / LinkedIn',
  serpapi_maps_place: 'Maps place',
  serpapi: 'SerpAPI',
  serpapi_maps: 'Google Maps',
  millionverifier: 'MillionVerifier',
  reoon: 'Reoon',
  zerobounce: 'ZeroBounce',
  anthropic_icebreaker: 'Icebreaker draft',
};

export function finderLabel(source) {
  return FINDER_LABELS[source] || source || '—';
}

export function pipelineStats(rows) {
  const list = rows || [];
  const byStatus = {};
  const byStage = {};
  const byFinder = {};
  const bump = (finder, field, amount = 1) => {
    if (!finder) return;
    byFinder[finder] = byFinder[finder] || { finder, label: finderLabel(finder), calls: 0, hits: 0, credits: 0 };
    byFinder[finder][field] += amount;
  };
  for (const row of list) {
    byStatus[row.status || 'Pending'] = (byStatus[row.status || 'Pending'] || 0) + 1;
    byStage[row.stage || 'pending'] = (byStage[row.stage || 'pending'] || 0) + 1;
    for (const call of row.calls || []) {
      bump(call.finder, 'calls');
      bump(call.finder, 'credits', Number(call.credits) || 0);
    }
    if (row.inbox_type === 'personal' && row.verification === 'ok' && row.email_source) bump(row.email_source, 'hits');
  }
  const founder = list.filter(row => row.inbox_type === 'personal' && row.verification === 'ok');
  const flagged = list.flatMap(row => row.flagged_emails || []);
  return {
    total: list.length,
    by_status: byStatus,
    by_stage: byStage,
    funnel: {
      leads: list.length,
      filtered_out: list.filter(row => row.stage === 'filter' && row.hold_reason === 'franchise').length,
      owners_found: list.filter(row => row.owner_name).length,
      enriching: list.filter(row => row.status === 'Enriching' || row.status === 'Pending').length,
      founder_emails: founder.length,
      role_inboxes: flagged.filter(item => item.reason === 'role' || item.reason === 'freemail').length,
      catch_all: flagged.filter(item => item.reason === 'catch_all').length,
      no_match: list.filter(row => row.status === 'No Match').length,
      needs_founder: list.filter(row => row.status === 'Needs Founder').length,
      errors: list.filter(row => row.status === 'Error').length,
      drafts: list.filter(row => row.icebreaker?.email1?.body).length,
    },
    finders: Object.values(byFinder).map(finder => ({
      ...finder,
      hit_rate: HIT_FINDERS.has(finder.finder) && finder.calls ? Math.round((finder.hits / finder.calls) * 100) : null,
    })).sort((a, b) => b.hits - a.hits || b.calls - a.calls),
    credits: list.reduce((total, row) => total + (Number(row.credits) || 0), 0),
    finder_credits: list.reduce((total, row) => total + (row.calls || []).filter(call => call.stage === 'email').reduce((sum, call) => sum + (Number(call.credits) || 0), 0), 0),
    name_credits: list.reduce((total, row) => total + (row.calls || []).filter(call => call.stage === 'name').reduce((sum, call) => sum + (Number(call.credits) || 0), 0), 0),
    founder_verified: founder.length,
    personal_hit_rate: list.length ? Math.round((founder.length / list.length) * 100) : 0,
  };
}

function csvCell(value) {
  if (value == null) return '';
  let text = String(value).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function leadsToCsv(rows) {
  const header = [
    'record_id', 'business_name', 'city', 'domain', 'website', 'owner_first', 'owner_last', 'owner_role',
    'owner_confidence', 'owner_sources', 'owner_phone', 'owner_phone_source', 'business_phone',
    'email', 'inbox_type', 'finder', 'verification', 'flagged_emails', 'status', 'stage', 'source',
    'credits', 'lookup_date', 'icebreaker_subject', 'icebreaker_body', 'followup_subject', 'followup_body',
  ];
  const lines = [header.join(',')];
  for (const row of rows || []) {
    lines.push([
      row.external_id,
      row.business_name,
      row.city,
      row.domain,
      row.website,
      row.owner_first,
      row.owner_last,
      row.owner_role,
      row.owner_confidence,
      (row.owner_sources || []).join('|'),
      row.owner_phone,
      row.owner_phone_source,
      row.business_phone,
      row.email,
      row.inbox_type,
      finderLabel(row.email_source),
      row.verification,
      (row.flagged_emails || []).map(item => `${item.email} (${item.reason})`).join(' | '),
      row.status,
      row.stage,
      row.source,
      row.credits ?? 0,
      row.lookup_at || row.updated_at || '',
      row.icebreaker?.email1?.subject,
      row.icebreaker?.email1?.body,
      row.icebreaker?.email2?.subject,
      row.icebreaker?.email2?.body,
    ].map(csvCell).join(','));
  }
  return lines.join('\n');
}
