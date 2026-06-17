/**
 * GET /api/mobile/meetings
 * Merges Calendly + GCal + GHL meetings.
 * Falls back gracefully if tokens are missing.
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
    ghlContactId: null,
    liquid: null, score: null, brand: null,
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
    name: client.displayName || client.email?.split("@")[0] || event.summary || "Unknown",
    email: client.email || "",
    phone: "",
    type: event.summary || "",
    startTime: event.start?.dateTime || event.start?.date,
    endTime: event.end?.dateTime || event.end?.date,
    status: "Scheduled",
    rep: "ssparks",
    ghlContactId: null,
    liquid: null, score: null, brand: null,
    confirmed: "No Response",
    joinUrl: event.hangoutLink || null,
  };
}

function normalizeGHL(appointment) {
  const cf = appointment.contact?.customField || appointment.contact?.customFields || [];
  const getField = (id) => cf.find(f => f.id === id || f.key === id || f.fieldKey === id)?.value || null;
  return {
    id: `ghl_${appointment.id}`,
    source: "GoHighLevel",
    name: `${appointment.contact?.firstName || ""} ${appointment.contact?.lastName || ""}`.trim() || appointment.title || "Unknown",
    email: appointment.contact?.email || "",
    phone: appointment.contact?.phone || "",
    type: appointment.title || appointment.calendarName || "",
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    status: appointment.appointmentStatus === "confirmed" ? "Confirmed"
           : appointment.appointmentStatus === "showed"    ? "Showed"
           : appointment.appointmentStatus === "noshow"    ? "No Show"
           : "Scheduled",
    rep: appointment.assignedUserId === process.env.GHL_USER_ID_STEVE ? "ssparks" : "jdoty",
    ghlContactId: appointment.contactId || null,
    liquid: getField("liquid_capital") || getField(process.env.GHL_FIELD_LIQUID_CAPITAL),
    score: parseInt(getField("score") || getField(process.env.GHL_FIELD_SCORE) || "0", 10) || null,
    brand: getField("franchise_name") || getField(process.env.GHL_FIELD_FRANCHISE_NAME),
    confirmed: appointment.appointmentStatus === "confirmed" ? "Confirmed" : "No Response",
    joinUrl: null,
    avatarColor: null,
    initials: null,
  };
}

// ─── FETCHERS ─────────────────────────────────────────────────────────────────

async function fetchCalendlyMeetings(token, startTime, endTime) {
  if (!token) { console.log("[meetings/calendly] no token — skipping"); return []; }
  try {
    const meRes = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) { console.log("[meetings/calendly] /users/me failed:", meRes.status); return []; }
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
    if (!res.ok) { console.log("[meetings/calendly] events failed:", res.status); return []; }
    const data = await res.json();
    console.log(`[meetings/calendly] fetched ${data.collection?.length || 0} events`);
    return (data.collection || []).map(normalizeCalendly);
  } catch (err) {
    console.error("[meetings/calendly]", err.message);
    return [];
  }
}

async function fetchGCalMeetings(accessToken, startTime, endTime) {
  if (!accessToken) { console.log("[meetings/gcal] no token — skipping"); return []; }
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
    if (!res.ok) { console.log("[meetings/gcal] failed:", res.status); return []; }
    const data = await res.json();
    const events = (data.items || []).filter(e => e.status !== "cancelled" && e.summary);
    console.log(`[meetings/gcal] fetched ${events.length} events`);
    return events.map(normalizeGCal);
  } catch (err) {
    console.error("[meetings/gcal]", err.message);
    return [];
  }
}

async function fetchGHLMeetings(startTime, endTime) {
  if (!process.env.GHL_API_KEY) { console.log("[meetings/ghl] no API key"); return []; }
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
    if (!res.ok) { console.log("[meetings/ghl] failed:", res.status, await res.text()); return []; }
    const data = await res.json();
    const events = data.events || data.appointments || [];
    console.log(`[meetings/ghl] fetched ${events.length} events`);
    return events.map(normalizeGHL);
  } catch (err) {
    console.error("[meetings/ghl]", err.message);
    return [];
  }
}

// ─── AVATAR COLORS ────────────────────────────────────────────────────────────

const COLORS = ["#2563eb","#7c3aed","#059669","#dc2626","#ea580c","#0891b2","#65a30d","#d97706"];
function avatarColor(str = "") {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
}

// ─── DEDUP ────────────────────────────────────────────────────────────────────

function dedup(meetings) {
  const seen = new Map();
  return meetings.filter(m => {
    const key = `${m.email?.toLowerCase()}_${new Date(m.startTime).toISOString().slice(0,16)}`;
    if (seen.has(key)) {
      const existing = seen.get(key);
      if (m.ghlContactId && !existing.ghlContactId) {
        seen.set(key, { ...existing, ...m, source: existing.source });
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

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  console.log("[meetings] session keys:", Object.keys(session));
  console.log("[meetings] has calendlyToken:", !!session.calendlyToken);
  console.log("[meetings] has accessToken:", !!session.accessToken);

  const { range = "2weeks", rep = "all" } = req.query;

  const now = new Date();
  // Include past 30 days so we get historical meetings too
  const pastDate = new Date(now);
  pastDate.setDate(pastDate.getDate() - 30);
  const startTime = pastDate.toISOString();

  const endMap = { today: 1, tomorrow: 2, "2weeks": 14, "30days": 30 };
  const days = endMap[range] || 14;
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  const endTime = end.toISOString();

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

  console.log(`[meetings] raw counts — calendly:${calendly.status === "fulfilled" ? calendly.value.length : "err"} gcal:${gcal.status === "fulfilled" ? gcal.value.length : "err"} ghl:${ghl.status === "fulfilled" ? ghl.value.length : "err"}`);

  let meetings = dedup(all);

  if (rep !== "all") {
    meetings = meetings.filter(m => m.rep === rep);
  }

  // Only return meetings within the requested range (from now for future, or last 30 days for past)
  const rangeStart = new Date(now);
  rangeStart.setDate(rangeStart.getDate() - 1); // include yesterday
  meetings = meetings.filter(m => {
    const t = new Date(m.startTime);
    return t >= rangeStart && t <= end;
  });

  meetings.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  // Add avatar data
  meetings = meetings.map(m => ({
    ...m,
    initials: m.initials || m.name?.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase() || "??",
    avatarColor: m.avatarColor || avatarColor(m.email || m.name || m.id),
  }));

  const nowMs = Date.now();
  const nextUp = meetings.find(m => new Date(m.startTime) > nowMs);
  if (nextUp) nextUp.isNextUp = true;

  meetings.forEach(m => {
    const s = new Date(m.startTime).getTime();
    const e = new Date(m.endTime || m.startTime).getTime() + 3600000; // default 1hr
    if (nowMs >= s && nowMs <= e) m.isLive = true;
  });

  console.log(`[meetings] returning ${meetings.length} meetings`);

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  return res.status(200).json({ meetings, count: meetings.length, generatedAt: new Date().toISOString() });
}
