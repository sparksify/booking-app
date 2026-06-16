/**
 * GET /api/mobile/conversation?contactId=xxx
 * Fetches GHL conversation messages for a contact
 */

import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";

const GHL_HEADERS = {
  Authorization: `Bearer ${process.env.GHL_API_KEY}`,
  Version: "2021-04-15",
};

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { contactId } = req.query;
  if (!contactId) return res.status(400).json({ error: "contactId required" });

  try {
    // First get the conversation ID for this contact
    const searchRes = await fetch(
      `https://services.leadconnectorhq.com/conversations/search?locationId=${process.env.GHL_LOCATION_ID}&contactId=${contactId}`,
      { headers: GHL_HEADERS }
    );

    if (!searchRes.ok) return res.status(502).json({ error: "GHL conversation search failed" });

    const searchData = await searchRes.json();
    const conversation = searchData.conversations?.[0];

    if (!conversation) return res.status(200).json({ messages: [] });

    // Fetch messages for that conversation
    const msgRes = await fetch(
      `https://services.leadconnectorhq.com/conversations/${conversation.id}/messages`,
      { headers: GHL_HEADERS }
    );

    if (!msgRes.ok) return res.status(502).json({ error: "GHL messages fetch failed" });

    const msgData = await msgRes.json();
    const messages = (msgData.messages?.messages || []).map(m => ({
      id: m.id,
      type: m.messageType || m.type || "SMS",
      direction: m.direction === "inbound" ? "inbound" : "outbound",
      body: m.body || m.message || "",
      dateAdded: m.dateAdded,
    }));

    return res.status(200).json({ messages, conversationId: conversation.id });
  } catch (err) {
    console.error("[conversation] error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
