/**
 * GET /api/mobile/contacts
 *   ?q=search term        full-text search across name/email/phone
 *   ?limit=20             default 20, max 50
 *   ?pipeline=all|active  default all
 *
 * GET /api/mobile/contacts/[id]
 *   Returns single contact detail with last meeting merged in
 *
 * All data proxied through Kanso → GHL. No direct GHL calls from PWA.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_HEADERS = {
  Authorization: `Bearer ${process.env.GHL_API_KEY}`,
  Version: "2021-04-15",
  "Content-Type": "application/json",
};

// ─── NORMALIZE GHL CONTACT ────────────────────────────────────────────────────

function normalizeContact(c) {
  const custom = (c.customFields || []).reduce((acc, f) => {
    acc[f.id] = f.value;
    return acc;
  }, {});

  // Build initials from name
  const parts = [c.firstName, c.lastName].filter(Boolean);
  const initials = parts.map(p => p[0]).join("").toUpperCase().slice(0, 2) || "??";

  // Avatar color based on first letter (consistent per contact)
  const colors = ["#2563eb","#7c3aed","#16a34a","#ea580c","#0891b2","#e11d48","#854d0e"];
  const avatarColor = colors[(c.firstName?.charCodeAt(0) || 65) % colors.length];

  return {
    id: c.id,
    name: `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.email || "Unknown",
    firstName: c.firstName || "",
    lastName: c.lastName || "",
    email: c.email || "",
    phone: c.phone || "",
    initials,
    avatarColor,

    // Pipeline
    stage: c.contactStage?.name || null,
    pipelineId: c.contactStage?.pipelineId || null,
    tags: c.tags || [],

    // Custom fields (mapped to your GHL field IDs)
    brand: custom[process.env.GHL_FIELD_FRANCHISE_NAME] || null,
    liquid: custom[process.env.GHL_FIELD_LIQUID_CAPITAL] || null,
    score: custom[process.env.GHL_FIELD_SCORE] ? Number(custom[process.env.GHL_FIELD_SCORE]) : null,
    franchiseSummary: custom[process.env.GHL_FIELD_FRANCHISE_SUMMARY] || null,

    // Source
    source: c.source || null,
    assignedTo: c.assignedTo || null,

    // Meta
    createdAt: c.dateAdded,
    lastActivity: c.lastActivity,
    dnd: c.dnd || false,
  };
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { q = "", limit = "20", pipeline = "all" } = req.query;
  const safeLimit = Math.min(parseInt(limit) || 20, 50);

  try {
    const params = new URLSearchParams({
      locationId: process.env.GHL_LOCATION_ID,
      limit: safeLimit,
    });

    if (q) params.set("query", q);

    // Active pipeline filter — only contacts with a stage
    if (pipeline === "active") {
      params.set("smartListId", process.env.GHL_ACTIVE_SMART_LIST_ID || "");
    }

    const ghlRes = await fetch(`${GHL_BASE}/contacts/?${params}`, {
      headers: GHL_HEADERS,
    });

    if (!ghlRes.ok) {
      const err = await ghlRes.text();
      console.error("[contacts] GHL error:", err);
      return res.status(502).json({ error: "GHL request failed", detail: err });
    }

    const data = await ghlRes.json();
    const contacts = (data.contacts || []).map(normalizeContact);

    return res.status(200).json({
      contacts,
      count: contacts.length,
      total: data.meta?.total || contacts.length,
    });
  } catch (err) {
    console.error("[contacts] error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
