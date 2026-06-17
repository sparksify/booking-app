/**
 * GET /api/mobile/meetings
 * Uses the same auth pattern as /api/dashboard/bookings — no session tokens needed.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";

const GHL_API     = "https://services.leadconnectorhq.com";
const CAL_API     = "https://api.calendly.com";
const CAL_USER    = process.env.CALENDLY_USER_URI || "https://api.calendly.com/users/c59a21b9-aa46-45a7-8e8a-3e2faa614742";
const CAL_TOKEN   = process.env.CALENDLY_API_KEY  || process.env.CALENDLY_TOKEN;
const GHL_CAL_1   = process.env.GHL_CALENDAR_ID   || "Zd3fg5KnNbH5FEIHhq8R";
const GHL_CAL_2   = process.env.GHL_CALENDAR_ID_2 || "h35V7plFqYf6DyY4zsdV";

const COLORS = ["#2563eb","#7c3aed","#059669","#dc2626","#ea580c","#0891b2","#65a30d","#d97706"];
function avatarColor(str = "") {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
}

// ─── CALENDLY ─────────────────────────────────────────────────────────────────

async function fetchCalendly(startTime, endTime) {
  if (!CAL_TOKEN) { console.log("[mobile/meetings] no CALENDLY_API_KEY"); return []; }
  try {
    const params = new URLSearchParams({
      user: CAL_USER,
      min_start_time: startTime,
      max_start_time: endTime,
      count: "100",
      status: "active",
    });
    const res = await fetch(`${CAL_API}/scheduled_events?${params}`, {
      headers: { Authorization: `Bearer ${CAL_TOKEN}` },
    });
    if (!res.ok) { console.log("[mobile/meetings/calendly] failed:", res.status); return []; }
    const data = await res.json();
    const events = data.collection || [];
    console.log(`[mobile/meetings/calendly] ${events.length} events`);

    // Fetch invitees for each event to get contact info
    const enriched = await Promise.all(events.map(async (ev) => {
      try {
        const uuid = ev.uri?.split("/").pop();
        const ir = await fetch(`${CAL_API}/scheduled_events/${uuid}/invitees?count=1`, {
          headers: { Authorization: `Bearer ${CAL_TOKEN}` },
        });
        const id = await ir.json();
        const inv = id.collection?.[0] || {};
        return {
          id: `calendly_${uuid}`,
          source: "Calendly",
          name: inv.name || ev.name || "Unknown",
          email: inv.email || "",
          phone: "",
          type: ev.name || "",
          startTime: ev.start_time,
          endTime: ev.end_time,
          status: "Scheduled",
          ghlContactId: null,
          liquid: null, score: null, brand: null,
          joinUrl: ev.location?.join_url || null,
        };
      } catch {
        return null;
      }
    }));
    return enriched.filter(Boolean);
  } catch (err) {
    console.error("[mobile/meetings/calendly]", err.message);
    return [];
  }
}

// ─── GHL ──────────────────────────────────────────────────────────────────────

async function fetchGHL(startTime, endTime) {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey) { console.log("[mobile/meetings/ghl] no GHL_API_KEY"); return []; }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Version: "2021-07-28",
    "Content-Type": "application/json",
  };

  const startMs = new Date(startTime).getTime();
  const endMs   = new Date(endTime).getTime();

  const results = await Promise.all([GHL_CAL_1, GHL_CAL_2].map(async (calId) => {
    try {
      const params = new URLSearchParams({
        locationId,
        calendarId: calId,
        startTime: startMs,
        endTime: endMs,
      });
      const res = await fetch(`${GHL_API}/calendars/events?${params}`, { headers });
      if (!res.ok) { console.log(`[mobile/meetings/ghl] cal ${calId} failed:`, res.status); return []; }
      const data = await res.json();
      const events = data.events || data.appointments || [];
      console.log(`[mobile/meetings/ghl] cal ${calId}: ${events.length} events`);
      return events;
    } catch (err) {
      console.error(`[mobile/meetings/ghl] cal ${calId}:`, err.message);
      return [];
    }
  }));

  const allEvents = results.flat();

  // Enrich with contact details
  const enriched = await Promise.all(allEvents.map(async (ev) => {
    let contact = ev.contact || {};
    if (ev.contactId && !contact.email) {
      try {
        const cr = await fetch(`${GHL_API}/contacts/${ev.contactId}`, { headers });
        if (cr.ok) {
          const cd = await cr.json();
          contact = cd.contact || cd;
        }
      } catch { /* use what we have */ }
    }

    const cf = contact.customFields || contact.customField || [];
    const getField = (...keys) => {
      for (const key of keys) {
        const f = cf.find(f => f.id === key || f.key === key || f.fieldKey === key ||
          f.id?.includes(key) || f.key?.includes(key));
        if (f?.value) return f.value;
      }
      return null;
    };

    const name = `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || ev.title || "Unknown";
    return {
      id: `ghl_${ev.id}`,
      source: "GoHighLevel",
      name,
      email: contact.email || "",
      phone: contact.phone || "",
      type: ev.title || ev.calendarTitle || "",
      startTime: ev.startTime,
      endTime: ev.endTime,
      status: ev.appointmentStatus === "confirmed" ? "Confirmed"
            : ev.appointmentStatus === "showed"    ? "Showed"
            : ev.appointmentStatus === "noshow"    ? "No Show"
            : "Scheduled",
      ghlContactId: ev.contactId || null,
      liquid: getField("liquid_capital", process.env.GHL_FIELD_LIQUID_CAPITAL),
      score:  parseInt(getField("score", process.env.GHL_FIELD_SCORE) || "0", 10) || null,
      brand:  getField("franchise_name", process.env.GHL_FIELD_FRANCHISE_NAME),
      joinUrl: null,
    };
  }));

  return enriched;
}

// ─── DEDUP ────────────────────────────────────────────────────────────────────

function dedup(meetings) {
  const seen = new Map();
  return meetings.filter(m => {
    const key = `${(m.email || "").toLowerCase()}_${new Date(m.startTime).toISOString().slice(0,16)}`;
    if (seen.has(key)) {
      const ex = seen.get(key);
      if (m.ghlContactId && !ex.ghlContactId) seen.set(key, { ...ex, ...m, source: ex.source });
      return false;
    }
    seen.set(key, m);
    return true;
  });
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { range = "2weeks" } = req.query;

  const now = new Date();
  const past = new Date(now); past.setDate(past.getDate() - 1);
  const future = new Date(now);
  const days = { today: 1, tomorrow: 2, "2weeks": 14 }[range] || 14;
  future.setDate(future.getDate() + days);

  const [calendly, ghl] = await Promise.allSettled([
    fetchCalendly(past.toISOString(), future.toISOString()),
    fetchGHL(past.toISOString(), future.toISOString()),
  ]);

  const calMeetings = calendly.status === "fulfilled" ? calendly.value : [];
  const ghlMeetings = ghl.status       === "fulfilled" ? ghl.value       : [];

  console.log(`[mobile/meetings] raw: calendly=${calMeetings.length} ghl=${ghlMeetings.length}`);

  let meetings = dedup([...calMeetings, ...ghlMeetings]);

  meetings = meetings.map(m => ({
    ...m,
    initials: m.name?.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase() || "??",
    avatarColor: avatarColor(m.email || m.name || m.id),
  }));

  meetings.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  const nowMs = Date.now();
  const nextUp = meetings.find(m => new Date(m.startTime) > nowMs);
  if (nextUp) nextUp.isNextUp = true;

  meetings.forEach(m => {
    const s = new Date(m.startTime).getTime();
    const e = new Date(m.endTime || m.startTime).getTime() + 3_600_000;
    if (nowMs >= s && nowMs <= e) m.isLive = true;
  });

  console.log(`[mobile/meetings] returning ${meetings.length} total`);

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  return res.status(200).json({ meetings, count: meetings.length, generatedAt: new Date().toISOString() });
}
