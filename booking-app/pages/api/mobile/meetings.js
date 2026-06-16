/**
 * GET /api/mobile/meetings
 *
 * Merges meetings from all 3 sources:
 *   - Calendly (already live in /api/dashboard/bookings)
 *   - Google Calendar
 *   - GoHighLevel calendar
 *
 * Returns a single normalized array sorted by startTime ASC.
 * Query params:
 *   ?range=today|tomorrow|2weeks  (default: 2weeks)
 *   ?rep=ssparks|jdoty|all        (default: all)
 */

import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";

// ─── NORMALIZERS ─────────────────────────────────────────────────────────────

function normalizeCalendly(event) {
  const invitee = event.event_memberships?.[0] || {};
  const name = invitee.user_name || event.name || "Unknown";
  return {
    id: `calendly_${event.uri?.split("/").pop()}`,
    source: "Calendly",
    name,
    email: invitee.user_email || "",
    phone: "",
    type: event.name || "",
    startTime: event.start_time,
    endTime: event.end_time,
    status: event.status === "active" ? "Scheduled" : "Cancelled",
    rep: event.event_memberships?.find(m => m.user)?.user || "ssparks",
    ghlContactId: event.invitees_counter?.active > 0 ? null : null, // populated via GHL lookup
    liquid: null,
    score: null,
    brand: null,
    confirmed: "No Response",
    joinUrl: event.location?.join_url || null,
  };
}

function normalizeGCal(event) {
  const attendees = event.attendees || [];
  const client = attendees.find(a => !a.organizer && !a.self) || {};
  return {
    id: `gcal_${event.id}`,
    source: "Google Calendar",
    name: client.displayName || client.email?.split("@")[0] || "Unknown",
    email: client.email || "",
    phone: "",
    type: event.summary || "",
    startTime: event.start?.dateTime || event.start?.date,
    endTime: event.end?.dateTime || event.end?.date,
    status: event.status === "confirmed" ? "Confirmed" : "Scheduled",
    rep: "ssparks",
    ghlContactId: null,
    liquid: null,
    score: null,
    brand: null,
    confirmed: "No Response",
    joinUrl: event.hangoutLink || event.location || null,
  };
}

function normalizeGHL(appointment) {
  return {
    id: `ghl_${appointment.id}`,
    source: "GoHighLevel",
    name: `${appointment.contact?.firstName || ""} ${appointment.contact?.lastName || ""}`.trim() || "Unknown",
    email: appointment.contact?.email || "",
    phone: appointment.contact?.phone || "",
    type: appointment.title || appointment.calendarName || "",
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    status: appointment.appointmentStatus === "confirmed" ? "Confirmed" : "Scheduled",
    rep: appointment.assignedUserId === process.env.GHL_USER_ID_STEVE ? "ssparks" : "jdoty",
    ghlContactId: appointment.contactId || null,
    liquid: appointment.contact?.customField?.find(f => f.id === "liquid_capital")?.value || null,
    score: appointment.contact?.customField?.find(f => f.id === "score")?.value || null,
    brand: appointment.contact?.customField?.find(f => f.id === "franchise_name")?.value || null,
    confirmed: appointment.appointmentStatus === "confirmed" ? "Confirmed" : "No Response",
    joinUrl: null,
  };
}

// ─── FETCHERS ─────────────────────────────────────────────────────────────────

async function fetchCalendlyMeetings(token, startTime, endTime) {
  try {
    // Get user URI first
    const meRes = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const me = await meRes.json();
    const userUri = me.resource?.uri;
    if (!userUri) return [];

    const params = new URLSearchParams({
      user: userUri,
      min_start_time: startTime,
      max_start_time: endTime,
      count: "100",
      status: "active",
    });

    const res = await fetch(`https://api.calendly.com/scheduled_events?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return (data.collection || []).map(normalizeCalendly);
  } catch (err) {
    console.error("[meetings/calendly] error:", err.message);
    return [];
  }
}

async function fetchGCalMeetings(accessToken, startTime, endTime) {
  try {
    const params = new URLSearchParams({
      timeMin: startTime,
      timeMax: endTime,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "100",
    });

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    return (data.items || [])
      .filter(e => e.status !== "cancelled" && e.summary) // skip declined/empty
      .map(normalizeGCal);
  } catch (err) {
    console.error("[meetings/gcal] error:", err.message);
    return [];
  }
}

async function fetchGHLMeetings(startTime, endTime) {
  try {
    const params = new URLSearchParams({
      locationId: process.env.GHL_LOCATION_ID,
      startTime: new Date(startTime).getTime(),
      endTime: new Date(endTime).getTime(),
    });

    const res = await fetch(
      `https://services.leadconnectorhq.com/calendars/events?${params}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GHL_API_KEY}`,
          Version: "2021-04-15",
        },
      }
    );
    const data = await res.json();
    return (data.events || []).map(normalizeGHL);
  } catch (err) {
    console.error("[meetings/ghl] error:", err.message);
    return [];
  }
}

// ─── DEDUP ────────────────────────────────────────────────────────────────────
// Calendly events often also appear in GCal — dedup by matching time + email

function dedup(meetings) {
  const seen = new Map();
  return meetings.filter(m => {
    const key = `${m.email}_${m.startTime}`;
    if (seen.has(key)) {
      // Keep GHL version if it has more data (ghlContactId, score, liquid)
      const existing = seen.get(key);
      if (m.ghlContactId && !existing.ghlContactId) {
        seen.set(key, { ...existing, ...m, source: existing.source }); // merge but keep original source label
      }
      return false;
    }
    seen.set(key, m);
    return true;
  });
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Auth check - reuse existing session
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { range = "2weeks", rep = "all" } = req.query;

  // Build time window
  const now = new Date();
  const startTime = now.toISOString();
  const endMap = { today: 1, tomorrow: 2, "2weeks": 14 };
  const days = endMap[range] || 14;
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  const endTime = end.toISOString();

  // Fetch all 3 sources in parallel
  const [calendly, gcal, ghl] = await Promise.allSettled([
    fetchCalendlyMeetings(session.calendlyToken, startTime, endTime),
    fetchGCalMeetings(session.accessToken, startTime, endTime),
    fetchGHLMeetings(startTime, endTime),
  ]);

  const all = [
    ...(calendly.status === "fulfilled" ? calendly.value : []),
    ...(gcal.status === "fulfilled" ? gcal.value : []),
    ...(ghl.status === "fulfilled" ? ghl.value : []),
  ];

  // Dedup, filter by rep, sort by time
  let meetings = dedup(all);

  if (rep !== "all") {
    meetings = meetings.filter(m => m.rep === rep);
  }

  meetings.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  // Tag the next upcoming
  const nowMs = Date.now();
  const nextUp = meetings.find(m => new Date(m.startTime) > nowMs);
  if (nextUp) nextUp.isNextUp = true;

  // Tag live (started but not ended)
  meetings.forEach(m => {
    const start = new Date(m.startTime).getTime();
    const end = new Date(m.endTime).getTime();
    if (nowMs >= start && nowMs <= end) m.isLive = true;
  });

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  return res.status(200).json({ meetings, count: meetings.length, generatedAt: new Date().toISOString() });
}
