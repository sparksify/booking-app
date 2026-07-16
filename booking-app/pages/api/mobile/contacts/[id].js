/**
 * pages/api/mobile/contacts/[id].js
 * Full contact detail — looks up by GHL contact ID, or falls back to email search.
 */

const GHL_BASE = "https://services.leadconnectorhq.com";
const LOC = process.env.GHL_LOCATION_ID;
const KEY = process.env.GHL_API_KEY;

const COLORS = ["#2563eb","#7c3aed","#059669","#dc2626","#ea580c","#0891b2","#65a30d","#d97706"];
function avatarColor(str = "") {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
}

function formatMoney(val) {
  if (!val) return null;
  const n = parseFloat(String(val).replace(/[^0-9.]/g, ""));
  if (isNaN(n)) return String(val);
  if (n >= 1000000) return `$${(n/1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${Math.round(n/1000)}k`;
  return `$${n}`;
}

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

async function findContactByEmail(email) {
  if (!email) return null;
  try {
    const data = await ghlGet(
      `/contacts/?locationId=${LOC}&query=${encodeURIComponent(email)}&limit=1`
    );
    const contacts = data.contacts || data.contact || [];
    return Array.isArray(contacts) ? contacts[0] : contacts;
  } catch (e) {
    console.error("[contacts/id] email search failed:", e.message);
    return null;
  }
}

function buildContactResponse(c) {
  const cf = c.customFields || c.customField || [];

  const liquid = formatMoney(
    getField(cf, "liquid", "liquid_capital", "liquidcapital", "cash", "investable") ||
    c.liquid_capital || c.liquidCapital
  );
  const franchise = getField(cf, "franchise_name", "franchise", "brand", "franchiseName") || c.franchise_name;
  const franchiseInvestment = formatMoney(getField(cf, "franchise_investment", "investment"));
  const franchiseSummary = getField(cf, "franchise_summary", "summary", "franchiseSummary");
  const franchiseHook = getField(cf, "franchise_hook", "hook", "franchiseHook");
  const territory = getField(cf, "territory", "zip", "location", "state", "city");
  const ownedBusiness = getField(cf, "owned_business", "ownedbusiness", "current_business", "business_owner", "owns_business", "employer");
  const score = parseInt(
    getField(cf, "score", "lead_score", "leadscore") || c.score || c.leadScore || "0", 10
  ) || null;
  const netWorth = formatMoney(getField(cf, "net_worth", "networth"));
  const timeframe = getField(cf, "timeframe", "time_frame", "timeline");

  const src = (getField(cf, "source", "lead_source") || c.source || c.attributionSource?.medium || "").toLowerCase();
  let sourceLabel = "GoHighLevel";
  if (src.includes("calendly")) sourceLabel = "Calendly";
  else if (src.includes("facebook") || src.includes("fb") || src.includes("meta")) sourceLabel = "Facebook";
  else if (src.includes("google")) sourceLabel = "Google";

  let assignedTo = "Steve Sparks";
  if (c.assignedTo === process.env.GHL_USER_ID_JOHN || c.assignedTo === "kzKxqpO9YJXGCbBj9k02") {
    assignedTo = "John Doty";
  }

  const fullName = `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || "Unknown";
  const initials = fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  // Tags — GHL returns as array of strings
  const tags = Array.isArray(c.tags) ? c.tags : 
    (c.tags ? [c.tags] : []);

  return {
    id: c.id,
    name: fullName,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    initials,
    avatarColor: avatarColor(c.id || fullName),
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
    source: sourceLabel,
    assignedTo,
    brand: franchise,
    tags,
    stage: c.opportunityStage || c.stage || null,
    lastMeeting: null,
    nextMeeting: null,
    _customFields: cf,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { id } = req.query;
  const { email } = req.query; // fallback for Calendly contacts

  const isValidId = id && id !== "null" && id !== "undefined" && id.length > 5;

  try {
    let c = null;

    if (isValidId) {
      // Primary: fetch by GHL contact ID
      try {
        const data = await ghlGet(`/contacts/${id}`);
        c = data.contact || data;
      } catch (e) {
        console.log(`[contacts/id] ID lookup failed (${id}), trying email fallback`);
      }
    }

    // Fallback: search by email (for Calendly contacts with no GHL ID)
    if (!c && email) {
      console.log(`[contacts/id] searching by email: ${email}`);
      c = await findContactByEmail(email);
    }

    if (!c) {
      return res.status(404).json({ error: "Contact not found" });
    }

    // Try to fetch appointments
    try {
      const apptData = await ghlGet(`/contacts/${c.id}/appointments`);
      const appts = (apptData.appointments || apptData.events || [])
        .filter(a => a.startTime)
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
      const now = new Date();
      const past = appts.filter(a => new Date(a.startTime) < now);
      const future = appts.filter(a => new Date(a.startTime) >= now);
      const contact = buildContactResponse(c);
      contact.lastMeeting = past.length ? { startTime: past[past.length-1].startTime, status: past[past.length-1].appointmentStatus } : null;
      contact.nextMeeting = future.length ? { startTime: future[0].startTime, status: future[0].appointmentStatus } : null;
      return res.status(200).json({ contact });
    } catch (_) {
      return res.status(200).json({ contact: buildContactResponse(c) });
    }

  } catch (err) {
    console.error("[mobile/contacts/[id]]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
