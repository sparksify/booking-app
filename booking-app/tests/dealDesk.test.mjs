import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addBusinessDays, addDaysAtWorkTime, overdueLabel, parseWallClock, suggestFollowupGaps, wallClockValue } from '../lib/dealDesk.mjs';

const source = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('wall clock conversion survives Chicago DST boundaries', () => {
  for (const value of ['2026-03-08T10:00', '2026-11-01T10:00']) {
    const date = parseWallClock(value, 'America/Chicago');
    assert.ok(date);
    assert.equal(wallClockValue(date, 'America/Chicago'), value);
  }
  assert.equal(parseWallClock('2026-02-31T10:00', 'America/Chicago'), null);
  assert.equal(parseWallClock('2026-03-08T02:30', 'America/Chicago'), null);
  assert.equal(parseWallClock('', 'America/Chicago'), null);
});

test('overdue labels distinguish minutes, hours, and days', () => {
  const now = new Date('2026-09-14T18:00:00Z');
  assert.equal(overdueLabel('2026-09-14T17:43:00Z', now), 'OVERDUE 17 MIN');
  assert.equal(overdueLabel('2026-09-14T15:00:00Z', now), 'OVERDUE 3 HR');
  assert.equal(overdueLabel('2026-09-12T17:00:00Z', now), 'OVERDUE 2 DAYS');
  assert.equal(overdueLabel('2026-09-14T19:00:00Z', now), '');
});

test('business-day defaults skip weekends in configured timezone', () => {
  const friday = parseWallClock('2026-09-18T12:00', 'America/Chicago');
  assert.equal(wallClockValue(addBusinessDays(1, friday, 'America/Chicago'), 'America/Chicago'), '2026-09-21T10:00');
  assert.equal(wallClockValue(addDaysAtWorkTime(1, friday, 'America/Chicago'), 'America/Chicago'), '2026-09-19T10:00');
});

test('gap helper avoids meetings and allocated follow-ups', () => {
  const tz = 'America/Chicago';
  const day = parseWallClock('2026-09-21T08:00', tz);
  const meetings = [{ slot_start: parseWallClock('2026-09-21T09:00', tz), slot_end: parseWallClock('2026-09-21T09:30', tz) }];
  const followups = [{ due_at: parseWallClock('2026-09-21T09:30', tz) }];
  const gaps = suggestFollowupGaps({ day, meetings, followups, workStart: 9, workEnd: 11, timeZone: tz });
  assert.equal(wallClockValue(gaps[0], tz), '2026-09-21T09:45');
  assert.equal(gaps.length, 3);
});

test('resolved Deal Desk sources are conflict-free and browser/server helpers match', () => {
  const files = [
    'components/DealDesk.js',
    'lib/dealDesk.js',
    'lib/dealDesk.mjs',
    'pages/api/dashboard/deal-desk.js',
    'pages/dashboard/bookings.js',
    'supabase/migrations/034_deal_desk_hardening.sql',
    'supabase/migrations/035_deal_desk_workflow.sql',
  ];
  for (const file of files) assert.doesNotMatch(source(file), /^(<<<<<<<|=======|>>>>>>>)/m, file);
  assert.equal(source('lib/dealDesk.js'), source('lib/dealDesk.mjs'));
});

test('entry resets by candidate, carries source-agnostic CQ evidence, and refreshes after creation', () => {
  const component = source('components/DealDesk.js');
  const api = source('pages/api/dashboard/deal-desk.js');
  assert.match(component, /candidateKey/);
  assert.match(component, /setForm\(initialForm\(booking, interests, timezone\)\)/);
  assert.match(component, /slot_start: booking\.slot_start/);
  assert.match(component, /await loadBrands\(\)/);
  assert.match(api, /meeting_status_overrides/);
  assert.match(api, /updated_by.*ctx\.email/);
  assert.match(api, /Candidate record does not match this meeting/);
});

test('database contracts enforce one pending action and retry-safe transactional lifecycle', () => {
  const hardening = source('supabase/migrations/034_deal_desk_hardening.sql');
  const workflow = source('supabase/migrations/035_deal_desk_workflow.sql');
  assert.match(hardening, /deal_followups_one_pending_per_deal_idx/);
  assert.match(hardening, /WHERE status = 'pending'/);
  assert.match(hardening, /FOR UPDATE/);
  assert.match(hardening, /Only paused deals can be resumed/);
  assert.match(hardening, /Only active deals can be won, lost, or paused/);
  assert.match(hardening, /FROM PUBLIC, anon, authenticated/);
  assert.match(workflow, /last_successful_conversation_at=CASE WHEN p_outcome='connected'/);
  assert.match(workflow, /Idempotency key already belongs to another deal/);
});

test('daily feed keeps meetings independent and uses lightweight Deal Desk refreshes', () => {
  const page = source('pages/dashboard/bookings.js');
  assert.match(page, /loadBookings\(\); loadDeals\(\)/);
  assert.match(page, /Scheduled meetings are unaffected/);
  assert.match(page, /onChanged=\{loadDeals\}/);
  assert.match(page, /Paused \/ closed/);
  assert.match(page, /suggestFollowupGaps/);
});
