import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

const GHL_API     = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

const GHL_PIPELINE_ID  = 'tOlnnAijaReLJ30AZaSL';
const GHL_STAGE_BOOKED = '34c03355-1c6a-4532-b2e5-f080f4263807';

/**
 * GET /api/dashboard/test-ghl
 * Runs a step-by-step GHL connectivity check and returns a diagnostic report.
 * Protected — requires dashboard session.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  const report = {
    env: {
      GHL_API_KEY:     apiKey     ? `set (${apiKey.slice(0, 6)}…)`     : 'MISSING',
      GHL_LOCATION_ID: locationId ? `set (${locationId.slice(0, 6)}…)` : 'MISSING',
    },
    steps: [],
  };

  if (!apiKey || !locationId) {
    report.verdict = 'FAIL — env vars missing';
    return res.json(report);
  }

  // Step 1: Check location
  try {
    const r = await fetch(`${GHL_API}/locations/${locationId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION },
    });
    const body = await r.json();
    report.steps.push({
      step: 'Get location',
      status: r.status,
      ok: r.ok,
      name: body?.location?.name ?? body?.message ?? null,
    });
    if (!r.ok) {
      report.verdict = 'FAIL — location lookup failed (check GHL_API_KEY and GHL_LOCATION_ID)';
      return res.json(report);
    }
  } catch (e) {
    report.steps.push({ step: 'Get location', error: e.message });
    report.verdict = 'FAIL — network error';
    return res.json(report);
  }

  // Step 2: Create a test contact
  let testContactId = null;
  try {
    const body = JSON.stringify({
      locationId,
      firstName: 'BookingOS',
      lastName:  'TestContact',
      email:     `test-ghl-diag-${Date.now()}@bookingos.internal`,
      tags:      ['booking-app-test'],
      source:    'BookingOS-Diagnostics',
    });
    const r = await fetch(`${GHL_API}/contacts/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION, 'Content-Type': 'application/json' },
      body,
    });
    const data = await r.json();
    testContactId = data?.contact?.id ?? null;
    report.steps.push({
      step: 'Create test contact',
      status: r.status,
      ok: r.ok,
      contactId: testContactId,
      message: data?.message ?? null,
    });
    if (!r.ok || !testContactId) {
      report.verdict = 'FAIL — contact creation failed';
      return res.json(report);
    }
  } catch (e) {
    report.steps.push({ step: 'Create test contact', error: e.message });
    report.verdict = 'FAIL — network error';
    return res.json(report);
  }

  // Step 3: Create opportunity in the Appointment Scheduling pipeline
  let testOppId = null;
  try {
    const body = JSON.stringify({
      locationId,
      contactId: testContactId,
      name:      'BookingOS Diagnostic Opportunity',
      pipelineId: GHL_PIPELINE_ID,
      stageId:    GHL_STAGE_BOOKED,
      status:     'open',
    });
    const r = await fetch(`${GHL_API}/opportunities/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION, 'Content-Type': 'application/json' },
      body,
    });
    const data = await r.json();
    testOppId = data?.opportunity?.id ?? null;
    report.steps.push({
      step: 'Create opportunity',
      status: r.status,
      ok: r.ok,
      opportunityId: testOppId,
      pipelineId: GHL_PIPELINE_ID,
      stageId: GHL_STAGE_BOOKED,
      message: data?.message ?? null,
      rawResponse: r.ok ? undefined : data,
    });
  } catch (e) {
    report.steps.push({ step: 'Create opportunity', error: e.message });
  }

  // Step 4: Clean up test contact
  if (testContactId) {
    try {
      await fetch(`${GHL_API}/contacts/${testContactId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION },
      });
      report.steps.push({ step: 'Cleanup test contact', ok: true });
    } catch {
      report.steps.push({ step: 'Cleanup test contact', ok: false });
    }
  }

  const oppStep = report.steps.find(s => s.step === 'Create opportunity');
  report.verdict = (oppStep?.ok && testOppId)
    ? 'PASS — GHL connection works. Check your real bookings — opportunity creation is functional.'
    : 'FAIL — opportunity creation failed. See rawResponse above for GHL error details.';

  return res.json(report);
}
