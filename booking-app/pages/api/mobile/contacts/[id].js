/**
 * GET /api/mobile/contacts/[id]
 * Returns full contact detail from GHL + last meeting merged in
 */

import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]";

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_HEADERS = {
  Authorization: `Bearer ${process.env.GHL_API_KEY}`,
  Version: "2021-04-15",
  "Content-Type": "application/json",
};

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing contact id" });

  try {
    // Fetch contact + their appointments in parallel
    const [contactRes, apptRes] = await Promise.all([
      fetch(`${GHL_BASE}/contacts/${id}`, { headers: GHL_HEADERS }),
      fetch(
        `${GHL_BASE}/contacts/${id}/appointments?locationId=${process.env.GHL_LOCATION_ID}`,
        { headers: GHL_HEADERS }
      ),
    ]);

    if (!contactRes.ok) {
      return res.status(contactRes.status).json({ error: "Contact not found" });
    }

    const { contact } = await contactRes.json();
    const apptData = apptRes.ok ? await apptRes.json() : { events: [] };

    // Normalize custom fields
    const custom = (contact.customFields || []).reduce((acc, f) => {
      acc[f.id] = f.value;
      return acc;
    }, {});

    const parts = [contact.firstName, contact.lastName].filter(Boolean);
    const initials = parts.map(p => p[0]).join("").toUpperCase().slice(0, 2) || "??";
    const colors = ["#2563eb","#7c3aed","#16a34a","#ea580c","#0891b2","#e11d48","#854d0e"];
    const avatarColor = colors[(contact.firstName?.charCodeAt(0) || 65) % colors.length];

    // Sort appointments, find last + next
    const appointments = (apptData.events || []).sort(
      (a, b) => new Date(a.startTime) - new Date(b.startTime)
    );
    const now = new Date();
    const pastAppts = appointments.filter(a => new Date(a.startTime) < now);
    const futureAppts = appointments.filter(a => new Date(a.startTime) >= now);

    const lastMeeting = pastAppts[pastAppts.length - 1] || null;
    const nextMeeting = futureAppts[0] || null;

    return res.status(200).json({
      contact: {
        id: contact.id,
        name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim(),
        firstName: contact.firstName || "",
        lastName: contact.lastName || "",
        email: contact.email || "",
        phone: contact.phone || "",
        initials,
        avatarColor,
        stage: contact.contactStage?.name || null,
        tags: contact.tags || [],
        source: contact.source || null,
        assignedTo: contact.assignedTo || null,
        dnd: contact.dnd || false,
        createdAt: contact.dateAdded,

        // Custom fields
        brand: custom[process.env.GHL_FIELD_FRANCHISE_NAME] || null,
        liquid: custom[process.env.GHL_FIELD_LIQUID_CAPITAL] || null,
        score: custom[process.env.GHL_FIELD_SCORE] ? Number(custom[process.env.GHL_FIELD_SCORE]) : null,
        franchiseSummary: custom[process.env.GHL_FIELD_FRANCHISE_SUMMARY] || null,
        franchiseHook: custom[process.env.GHL_FIELD_FRANCHISE_HOOK] || null,

        // Meetings
        lastMeeting: lastMeeting ? {
          id: lastMeeting.id,
          title: lastMeeting.title,
          startTime: lastMeeting.startTime,
          status: lastMeeting.appointmentStatus,
          calendarName: lastMeeting.calendarName,
        } : null,
        nextMeeting: nextMeeting ? {
          id: nextMeeting.id,
          title: nextMeeting.title,
          startTime: nextMeeting.startTime,
          status: nextMeeting.appointmentStatus,
          calendarName: nextMeeting.calendarName,
        } : null,
        totalMeetings: appointments.length,
      },
    });
  } catch (err) {
    console.error("[contacts/[id]] error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
