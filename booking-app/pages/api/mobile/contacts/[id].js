/**
 * pages/api/mobile/contacts/[id].js
 * Full contact detail — pulls ALL GHL fields and maps them for the PWA
 */

const GHL_BASE = "https://services.leadconnectorhq.com";
const LOC = process.env.GHL_LOCATION_ID;
const KEY = process.env.GHL_API_KEY;

// Avatar color pool
const COLORS = ["#2563eb","#7c3aed","#059669","#dc2626","#ea580c","#0891b2","#65a30d","#d97706"];
function avatarColor(str = "") {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
}

// Format dollar amounts
function formatMoney(val) {
  if (!val) return null;
  const n = parseFloat(String(val).replace(/[^0-9.]/g, ""));
  if (isNaN(n)) return String(val);
  if (n >= 1000000) return `$${(n/1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${Math.round(n/1000)}k`;
  return `$${n}`;
}

// Pull value from GHL customFields array by field key/name fragments
function getField(customFields = [], ...keys) {
  for (const key of keys) {
    const f = customFields.find(f =>
      f.id?.toLowerCase().includes(key.toLowerCase()) ||
      f.key?.toLowerCase().includes(key.toLowerCase()) ||
      f.name?.toLowerCase().includes(key.toLowerCase()) ||
      f.fieldKey?.toLowerCase().includes(key.toLowerCase())
    );
    if (f && f.value) return f.value;
  }
  return null;
}

async function ghlGet(path) {
  const res = await fetch(`${GHL_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${KEY}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`GHL ${res.status}: ${path}`);
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing contact id" });

  try {
    // ── 1. Fetch contact ──
    const contactData = await ghlGet(`/contacts/${id}`);
    const c = contactData.contact || contactData;

    // ── 2. Fetch appointments (last + next meeting) ──
    let lastMeeting = null;
    let nextMeeting = null;
    try {
      const apptRes = await ghlGet(
        `/contacts/${id}/appointments?locationId=${LOC}`
      );
      const appts = (apptRes.appointments || apptRes.events || [])
        .filter(a => a.startTime)
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
      const now = new Date();
      const past = appts.filter(a => new Date(a.startTime) < now);
      const future = appts.filter(a => new Date(a.startTime) >= now);
      lastMeeting = past.length ? past[past.length - 1] : null;
      nextMeeting = future.length ? future[0] : null;
    } catch (_) { /* appointments optional */ }

    // ── 3. Map all custom fields ──
    const cf = c.customFields || c.customField || [];

    const liquid = formatMoney(
      getField(cf, "liquid", "liquid_capital", "liquidcapital", "cash", "investable") ||
      c.liquid_capital || c.liquidCapital
    );
    const franchise = getField(cf, "franchise_name", "franchise", "brand", "franchiseName") ||
      c.franchise_name;
    const franchiseInvestment = formatMoney(
      getField(cf, "franchise_investment", "investment", "franchiseInvestment")
    );
    const franchiseSummary = getField(cf, "franchise_summary", "summary", "franchiseSummary");
    const franchiseHook = getField(cf, "franchise_hook", "hook", "franchiseHook");
    const territory = getField(cf, "territory", "zip", "location", "state", "city");
    const ownedBusiness = getField(cf, "owned_business", "ownedbusiness", "current_business", "business_owner", "owns_business", "employer");
    const score = parseInt(
      getField(cf, "score", "lead_score", "leadscore") ||
      c.score || c.leadScore || "0", 10
    ) || null;
    const netWorth = formatMoney(getField(cf, "net_worth", "networth", "net worth"));
    const timeframe = getField(cf, "timeframe", "time_frame", "timeline");
    const notes = getField(cf, "notes", "internal_notes") || c.notes;
    const source = getField(cf, "source", "lead_source") || c.source || c.attributionSource?.medium;

    // ── 4. Determine source label ──
    let sourceLabel = "GoHighLevel";
    const src = (source || "").toLowerCase();
    if (src.includes("calendly")) sourceLabel = "Calendly";
    else if (src.includes("facebook") || src.includes("fb") || src.includes("meta")) sourceLabel = "Facebook";
    else if (src.includes("google")) sourceLabel = "Google";

    // ── 5. Assigned consultant ──
    let assignedTo = "Steve Sparks";
    if (c.assignedTo === process.env.GHL_USER_ID_JOHN || c.assignedTo === "kzKxqpO9YJXGCbBj9k02") {
      assignedTo = "John Doty";
    }

    // ── 6. Build initials + avatar ──
    const fullName = `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || "Unknown";
    const initials = fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

    // ── 7. Return unified contact object ──
    return res.status(200).json({
      contact: {
        id: c.id,
        name: fullName,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        initials,
        avatarColor: avatarColor(c.id || fullName),

        // Lead intel
        score: isNaN(score) ? null : score,
        liquid,
        netWorth,
        timeframe,
        territory,
        ownedBusiness,
        franchise,
        franchiseInvestment,
        franchiseSummary,
        franchiseHook,

        // Source / assignment
        source: sourceLabel,
        assignedTo,
        brand: franchise,

        // Tags — GHL returns these as array
        tags: Array.isArray(c.tags) ? c.tags : [],

        // Stage / pipeline
        stage: c.opportunityStage || c.stage || null,

        // Meetings
        lastMeeting: lastMeeting ? {
          startTime: lastMeeting.startTime,
          title: lastMeeting.title || lastMeeting.calendarTitle,
          status: lastMeeting.appointmentStatus,
        } : null,
        nextMeeting: nextMeeting ? {
          startTime: nextMeeting.startTime,
          title: nextMeeting.title || nextMeeting.calendarTitle,
          status: nextMeeting.appointmentStatus,
        } : null,

        // Notes
        notes,

        // Raw custom fields for debugging
        _customFields: cf,
      },
    });
  } catch (err) {
    console.error("[mobile/contacts/[id]]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
