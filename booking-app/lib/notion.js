/**
 * Notion task sync — turns a Granola call_logs record into task rows in the
 * "Daily Tasks Tracker" database (one row per Steve action item).
 *
 * Source of truth is Supabase `call_logs` (already deduped by granola_note_id).
 * This module dedupes at the Notion layer too, keyed on
 * (Granola Doc ID + Description), so re-runs / updated notes never duplicate rows.
 *
 * Required env vars:
 *   NOTION_API_KEY       — Notion internal integration secret (ntn_…),
 *                          with the tasks database shared to the integration
 *   NOTION_TASKS_DB_ID   — the Daily Tasks Tracker database id
 */

const NOTION_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// ─── Classification (deterministic v1) ──────────────────────────────────────

/** Map an action-item string to one of the Notion "Category" options. */
export function categorize(item) {
  const t = (item || '').toLowerCase();
  if (/questionnaire|candidate qualif|\bcq\b|qualif/.test(t)) return 'CQ / Candidate Qualification';
  if (/fdd|disclosure|presentation|\bdocs?\b/.test(t)) return 'FDD / Docs';
  if (/territory/.test(t)) return 'Territory Check';
  if (/fund|financ|loan|capital|lender/.test(t)) return 'Funding / Finance';
  if (/brand (info|overview)|send.*brand/.test(t)) return 'Brand Info';
  if (/follow.?up|schedule|book|call|zoom|recap|email|send/.test(t)) return 'Prospect Follow-Up';
  return 'Needs Review';
}

/** Interest level (1–10) → Notion "Priority" option. */
export function priorityFromInterest(n) {
  if (n >= 8) return 'High';
  if (n >= 5) return 'Medium';
  return 'Low';
}

// ─── Notion API ─────────────────────────────────────────────────────────────

async function notion(path, opts = {}) {
  const res = await fetch(`${NOTION_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

/** True if a task row already exists for this (docId + description). */
async function taskExists(dbId, docId, description) {
  const data = await notion(`/databases/${dbId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'Granola Doc ID', rich_text: { equals: docId } },
          { property: 'Description', rich_text: { equals: description } },
        ],
      },
      page_size: 1,
    }),
  });
  return data.results.length > 0;
}

async function createTask(dbId, cl, item) {
  const properties = {
    'Client Name':         { title: [{ text: { content: cl.client_name || cl.prospect_name || 'Unknown' } }] },
    'Description':         { rich_text: [{ text: { content: item } }] },
    'Status':             { status: { name: 'Not started' } },
    'Priority':           { select: { name: priorityFromInterest(cl.interest_level) } },
    'Category':           { select: { name: categorize(item) } },
    'Franchise / Project': { rich_text: [{ text: { content: cl.franchise || '' } }] },
    'Source':             { select: { name: 'Granola' } },
    'Source Note URL':    cl.granola_note_url ? { url: cl.granola_note_url } : { url: null },
    'GHL Contact ID':     { rich_text: [{ text: { content: cl.ghl_contact_id || '' } }] },
    'Granola Doc ID':     { rich_text: [{ text: { content: cl.granola_note_id || '' } }] },
  };
  // Only set a Due date if the extraction produced one.
  if (cl.follow_up_date) {
    properties['Due date'] = { date: { start: cl.follow_up_date } };
  }
  const page = await notion('/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { database_id: dbId }, properties }),
  });
  return page.url;
}

/**
 * Upsert one Notion task row per Steve action item for a call.
 *
 * @param {object} cl  call_logs-shaped record. Uses:
 *   granola_note_id, granola_note_url, ghl_contact_id, interest_level,
 *   franchise, follow_up_date, action_items_steve[], and for the row title
 *   client_name (full GHL contact name) falling back to prospect_name
 *   (the name used on the call).
 * @returns {{created:number, skipped:number, urls:string[]}}
 */
export async function upsertCallTasks(cl) {
  const dbId = process.env.NOTION_TASKS_DB_ID;
  if (!process.env.NOTION_API_KEY || !dbId) {
    // Not configured — no-op so the rest of the sync is unaffected.
    return { created: 0, skipped: 0, urls: [], disabled: true };
  }
  const items = Array.isArray(cl.action_items_steve) ? cl.action_items_steve : [];
  let created = 0, skipped = 0;
  const urls = [];
  for (const item of items) {
    if (!item || !item.trim()) continue;
    if (await taskExists(dbId, cl.granola_note_id, item)) {
      skipped++;
      continue;
    }
    urls.push(await createTask(dbId, cl, item));
    created++;
  }
  return { created, skipped, urls };
}
