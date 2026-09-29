export const GREEN_TEAM_CAMPAIGN_ID = '120247835569440452';

// Verified in FCC2 on 2026-09-16. IDs keep attribution stable after renames.
// These are ad source labels, never the candidate's residence or territory.
export const GREEN_TEAM_ADSETS = [
  {
    "id": "120247946513260452",
    "name": "Broad - Copy",
    "area": null
  },
  {
    "id": "120247920010460452",
    "name": "Pensacola & Panama City Beach  FL - Entrepreneurship (business & finance) - Copy",
    "area": "Pensacola & Panama City Beach, FL"
  },
  {
    "id": "120247877373450452",
    "name": "Jacksonville FL - Entrepreneurship (business & finance)",
    "area": "Jacksonville, FL"
  },
  {
    "id": "120247877173670452",
    "name": "RENO - Entrepreneurship (business & finance)",
    "area": "Reno, NV"
  },
  {
    "id": "120247877173660452",
    "name": "Broad - Copy",
    "area": null
  },
  {
    "id": "120247877173650452",
    "name": "Construction/Fleet MGMT. - Copy",
    "area": null
  },
  {
    "id": "120247875011160452",
    "name": "Lookalike (US, 1%) - Speed2Lead Contacts Jan 2026.csv - Copy",
    "area": null
  },
  {
    "id": "120247875011150452",
    "name": "Lookalike (US, 1%) - Franchisee Email List.csv - Copy",
    "area": null
  },
  {
    "id": "120247842302260452",
    "name": "Lookalike (US, 1%) - Speed2Lead Contacts Jan 2026.csv",
    "area": null
  },
  {
    "id": "120247842302240452",
    "name": "Entrepreneurship (business & finance)",
    "area": null
  },
  {
    "id": "120247842302230452",
    "name": "Broad",
    "area": null
  },
  {
    "id": "120247835569500452",
    "name": "Construction/Fleet MGMT.",
    "area": null
  },
  {
    "id": "120247920063020452",
    "name": "Tallahassee  FL - Entrepreneurship (business & finance) - Copy 2",
    "area": "Tallahassee, FL"
  },
  {
    "id": "120247875011170452",
    "name": "Entrepreneurship (business & finance) - Copy",
    "area": null
  },
  {
    "id": "120247842302250452",
    "name": "Lookalike (US, 1%) - Franchisee Email List.csv",
    "area": null
  }
];

export function rawLeadFields(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function facebookAttribution(input = {}) {
  const raw = rawLeadFields(input.raw_fields);
  const result = {};
  for (const field of ['ad_id', 'adset_id', 'campaign_id', 'ad_name', 'adset_name', 'campaign_name']) {
    const aliases = [`fb_${field}`, field];
    if (field.startsWith('adset_')) aliases.push(`fb_ad_set_${field.slice(6)}`, `ad_set_${field.slice(6)}`);
    for (const source of [input, raw]) {
      for (const key of aliases) {
        const value = source[key];
        if (typeof value !== 'string' && !(typeof value === 'number' && Number.isSafeInteger(value))) continue;
        let text = String(value).trim();
        // Pabbly's parameter editor can preserve the quotes used to force a
        // numeric-looking ID to remain text. Accept either transport form.
        if (field.endsWith('_id') && /^"\d+"$/.test(text)) text = text.slice(1, -1);
        if (!text || text.includes('{{') || (field.endsWith('_id') && !/^\d+$/.test(text))) continue;
        result[`fb_${field}`] = text;
        break;
      }
      if (result[`fb_${field}`]) break;
    }
  }
  return result;
}

export function facebookAttributionColumns(input) {
  const metadata = facebookAttribution(input);
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => key.endsWith('_id')));
}

export function resolveFacebookSource({ lead, booking } = {}) {
  if (!lead || (booking?.email && lead.email && booking.email.toLowerCase() !== lead.email.toLowerCase())) return null;
  const metadata = facebookAttribution(lead);
  const adsetId = metadata.fb_adset_id || null;
  const campaignId = metadata.fb_campaign_id || null;
  // A conflicting explicit campaign must never acquire a Green Team city label.
  const known = (!campaignId || campaignId === GREEN_TEAM_CAMPAIGN_ID)
    ? GREEN_TEAM_ADSETS.find(item => item.id === adsetId) : null;
  const isGreenTeam = Boolean(known || campaignId === GREEN_TEAM_CAMPAIGN_ID);
  const adsetName = metadata.fb_adset_name || known?.name || null;
  // Name-only matching is scoped to the verified campaign and exact known titles.
  const named = isGreenTeam && !known && adsetName
    ? GREEN_TEAM_ADSETS.find(item => item.name.toLowerCase() === adsetName.toLowerCase()) : null;
  if (!Object.keys(metadata).length && !lead.fb_lead_id && !lead.fb_form_id) return null;
  return {
    adsetId, adsetName, adName: metadata.fb_ad_name || null,
    campaignId: campaignId || (known ? GREEN_TEAM_CAMPAIGN_ID : null),
    campaignName: metadata.fb_campaign_name || (isGreenTeam ? 'Green Team' : null),
    area: known?.area || named?.area || null,
    isGreenTeam,
  };
}
