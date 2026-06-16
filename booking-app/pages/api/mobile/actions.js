/**
 * POST /api/mobile/actions
 *
 * Body: {
 *   contactId: string       (GHL contact ID)
 *   action: "booking_link" | "workflow" | "short_link" | "note" | "stage"
 *   payload: {
 *     // booking_link: { workflowId?: string }
 *     // workflow:     { workflowId: string }
 *     // short_link:   { brand: string }
 *     // note:         { body: string }
 *     // stage:        { stageName: string, pipelineId: string, stageId: string }
 *   }
 * }
 *
 * All actions are:
 *   1. Validated
 *   2. Logged to Supabase actions_log BEFORE firing
 *   3. Fired to GHL
 *   4. Result updated in Supabase
 */

import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";
import { createClient } from "@supabase/supabase-js";

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_HEADERS = {
  Authorization: `Bearer ${process.env.GHL_API_KEY}`,
  Version: "2021-04-15",
  "Content-Type": "application/json",
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── ACTION HANDLERS ──────────────────────────────────────────────────────────

async function handleBookingLink({ contactId, payload }) {
  // Trigger a GHL workflow that sends the booking link SMS
  const workflowId = payload.workflowId || process.env.GHL_WORKFLOW_BOOKING_LINK;
  const res = await fetch(
    `${GHL_BASE}/contacts/${contactId}/workflow/${workflowId}`,
    { method: "POST", headers: GHL_HEADERS, body: JSON.stringify({}) }
  );
  if (!res.ok) throw new Error(`GHL workflow trigger failed: ${res.status}`);
  return { sent: true, workflowId };
}

async function handleWorkflow({ contactId, payload }) {
  if (!payload.workflowId) throw new Error("workflowId required");
  const res = await fetch(
    `${GHL_BASE}/contacts/${contactId}/workflow/${payload.workflowId}`,
    { method: "POST", headers: GHL_HEADERS, body: JSON.stringify({}) }
  );
  if (!res.ok) throw new Error(`GHL workflow trigger failed: ${res.status}`);
  return { sent: true, workflowId: payload.workflowId };
}

async function handleShortLink({ contactId, payload }) {
  // Look up the short link for this brand from your Supabase redirects table
  const brand = payload.brand || "default";
  const { data, error } = await supabase
    .from("redirects")
    .select("short_url, destination_url")
    .eq("brand_key", brand)
    .single();

  if (error || !data) {
    // Fall back to halloway.co/go/{brand}
    return { shortUrl: `https://halloway.co/go/${brand}`, brand };
  }
  return { shortUrl: data.short_url, destinationUrl: data.destination_url, brand };
}

async function handleNote({ contactId, payload }) {
  if (!payload.body?.trim()) throw new Error("Note body required");
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
    method: "POST",
    headers: GHL_HEADERS,
    body: JSON.stringify({
      body: payload.body,
      userId: process.env.GHL_USER_ID_STEVE,
    }),
  });
  if (!res.ok) throw new Error(`GHL note creation failed: ${res.status}`);
  const data = await res.json();
  return { noteId: data.note?.id, body: payload.body };
}

async function handleStage({ contactId, payload }) {
  if (!payload.stageId || !payload.pipelineId) throw new Error("stageId and pipelineId required");
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    method: "PUT",
    headers: GHL_HEADERS,
    body: JSON.stringify({
      stageId: payload.stageId,
      pipelineId: payload.pipelineId,
    }),
  });
  if (!res.ok) throw new Error(`GHL stage update failed: ${res.status}`);
  return { stageId: payload.stageId, stageName: payload.stageName };
}

const ACTION_HANDLERS = {
  booking_link: handleBookingLink,
  workflow: handleWorkflow,
  short_link: handleShortLink,
  note: handleNote,
  stage: handleStage,
};

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { contactId, action, payload = {} } = req.body;

  if (!contactId) return res.status(400).json({ error: "contactId required" });
  if (!action || !ACTION_HANDLERS[action]) {
    return res.status(400).json({
      error: `Invalid action. Must be one of: ${Object.keys(ACTION_HANDLERS).join(", ")}`,
    });
  }

  // 1. Log intent to Supabase BEFORE firing
  const { data: logRow, error: logErr } = await supabase
    .from("actions_log")
    .insert({
      contact_id_ghl: contactId,
      action_type: action,
      payload,
      fired_by: session.user?.email || "unknown",
      fired_at: new Date().toISOString(),
      success: null, // pending
      response_body: null,
    })
    .select()
    .single();

  if (logErr) {
    console.error("[actions] supabase log error:", logErr.message);
    // Don't block the action — log failure is non-fatal
  }

  const logId = logRow?.id;

  // 2. Fire the action
  let result, success, responseBody;
  try {
    result = await ACTION_HANDLERS[action]({ contactId, payload });
    success = true;
    responseBody = result;
  } catch (err) {
    console.error(`[actions/${action}] error:`, err.message);
    success = false;
    responseBody = { error: err.message };
  }

  // 3. Update Supabase log with result
  if (logId) {
    await supabase
      .from("actions_log")
      .update({
        success,
        response_body: responseBody,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", logId);
  }

  if (!success) {
    return res.status(502).json({
      error: "Action failed",
      detail: responseBody?.error,
      logId,
    });
  }

  return res.status(200).json({
    success: true,
    action,
    contactId,
    result: responseBody,
    logId,
    timestamp: new Date().toISOString(),
  });
}
