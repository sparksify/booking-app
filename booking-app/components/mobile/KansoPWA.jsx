/**
 * components/mobile/KansoPWA.jsx
 * Kanso Mobile PWA - wired to /api/mobile/* routes
 * Drop into: components/mobile/KansoPWA.jsx
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  bgPage: "#f8fafc", bgCard: "#ffffff", bgInput: "#f1f5f9",
  border: "#e2e8f0", borderMed: "#cbd5e1",
  textPrimary: "#0f172a", textSecondary: "#64748b", textMuted: "#94a3b8", textLink: "#2563eb",
  blue: "#2563eb", blueSoft: "#eff6ff", blueLight: "#bfdbfe",
  bgNextUp: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)",
  calendly: { bg: "#f3f0ff", text: "#7c3aed", border: "#ddd6fe" },
  ghl: { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
  gcal: { bg: "#fef9c3", text: "#854d0e", border: "#fde68a" },
  status: {
    Scheduled:  { bg: "#eff6ff", text: "#2563eb", dot: "#2563eb" },
    Confirmed:  { bg: "#f0fdf4", text: "#16a34a", dot: "#16a34a" },
    "No Show":  { bg: "#fff1f2", text: "#e11d48", dot: "#e11d48" },
    Showed:     { bg: "#f0fdf4", text: "#16a34a", dot: "#16a34a" },
    Cancelled:  { bg: "#fef2f2", text: "#dc2626", dot: "#dc2626" },
  },
};

function scoreStyle(s) {
  if (s >= 50) return { bg: "#fef9c3", text: "#854d0e", border: "#fde68a" };
  if (s >= 20) return { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" };
  return { bg: "#f1f5f9", text: "#64748b", border: "#e2e8f0" };
}

// ─── API HOOKS ────────────────────────────────────────────────────────────────

function useMeetings(range = "2weeks") {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mobile/meetings?range=${range}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setData(json.meetings || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);
  return { meetings: data, loading, error, refresh: load };
}

function useContacts(query) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/mobile/contacts?q=${encodeURIComponent(query)}&limit=30`, { credentials: "include" });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        setData(json.contacts || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, query ? 350 : 0);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  return { contacts: data, loading, error };
}

async function fireAction(contactId, action, payload = {}) {
  const res = await fetch("/api/mobile/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ contactId, action, payload }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail || json.error || "Action failed");
  return json;
}

// ─── SHARED UI ────────────────────────────────────────────────────────────────

function Avatar({ initials = "?", color = "#2563eb", size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color + "22", border: `2px solid ${color}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: size * 0.36, color, flexShrink: 0,
    }}>{initials}</div>
  );
}

function SourceChip({ source }) {
  const s = source === "Calendly" ? T.calendly : source === "Google Calendar" ? T.gcal : T.ghl;
  const label = source === "GoHighLevel" ? "GoHighLevel" : source === "Google Calendar" ? "GCal" : source;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.text, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function StatusPill({ status }) {
  const s = T.status[status] || T.status["Scheduled"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: s.bg, color: s.text }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

function ScoreBadge({ score }) {
  if (score == null) return null;
  const s = scoreStyle(score);
  return (
    <span style={{ width: 30, height: 30, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", background: s.bg, color: s.text, border: `1px solid ${s.border}`, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
      {score}
    </span>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", border: `3px solid ${T.blueLight}`, borderTopColor: T.blue, animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: T.textPrimary, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: T.textMuted }}>{subtitle}</div>
    </div>
  );
}

// ─── NEXT UP CARD ─────────────────────────────────────────────────────────────

function NextUpCard({ meeting }) {
  const [marking, setMarking] = useState(false);
  const [marked, setMarked] = useState(false);

  const time = new Date(meeting.startTime);
  const timeStr = time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const [h, ampm] = timeStr.split(" ");

  const handleMarkShowed = async () => {
    if (!meeting.ghlContactId) return;
    setMarking(true);
    try {
      await fireAction(meeting.ghlContactId, "stage", { stageName: "Showed", stageId: process.env.NEXT_PUBLIC_GHL_STAGE_SHOWED });
      setMarked(true);
    } catch (e) {
      alert("Could not update stage: " + e.message);
    } finally {
      setMarking(false);
    }
  };

  return (
    <div style={{ background: T.bgNextUp, border: `1.5px solid ${T.blueLight}`, borderRadius: 16, padding: "16px 18px", boxShadow: "0 2px 8px rgba(37,99,235,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: T.blue, textTransform: "uppercase", letterSpacing: "0.1em" }}>Next Up</span>
        <SourceChip source={meeting.source} />
        {meeting.score != null && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, ...scoreStyle(meeting.score), border: `1px solid ${scoreStyle(meeting.score).border}` }}>
            Score {meeting.score}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 32, color: T.textPrimary, lineHeight: 1 }}>
            {h}<span style={{ fontSize: 14, fontWeight: 600, color: T.textSecondary, marginLeft: 4 }}>{ampm}</span>
          </div>
          <div style={{ fontSize: 12, color: T.blue, fontWeight: 600, marginTop: 4 }}>
            {meeting.date || new Date(meeting.startTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Avatar initials={meeting.initials || meeting.name?.split(" ").map(n => n[0]).join("").slice(0,2)} color={meeting.avatarColor || T.blue} size={34} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: T.textPrimary }}>{meeting.name}</div>
              <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{meeting.type}</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <a href={meeting.joinUrl || "#"} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${T.blue}`, background: "white", color: T.blue, fontWeight: 700, fontSize: 13, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
          Open Details
        </a>
        <button onClick={handleMarkShowed} disabled={marking || marked} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: marked ? "#16a34a" : T.blue, color: "white", fontWeight: 700, fontSize: 13, cursor: marking ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: marking ? 0.7 : 1 }}>
          {marked ? "✓ Marked" : marking ? "Saving..." : "✓ Mark Showed"}
        </button>
      </div>
    </div>
  );
}

// ─── MEETING ROW ──────────────────────────────────────────────────────────────

function MeetingRow({ meeting, isNowDivider, onClick }) {
  const time = new Date(meeting.startTime);
  const timeStr = time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const dateStr = time.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const initials = meeting.initials || meeting.name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "??";

  return (
    <>
      {isNowDivider && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0" }}>
          <div style={{ flex: 1, height: 1, background: T.border }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: "#e11d48", letterSpacing: "0.12em" }}>NOW</span>
          <div style={{ flex: 1, height: 1, background: T.border }} />
        </div>
      )}
      <div onClick={onClick} style={{ background: T.bgCard, borderRadius: 12, padding: "13px 15px", border: `1px solid ${T.border}`, marginBottom: 8, cursor: "pointer", boxShadow: meeting.isLive ? "0 0 0 1.5px #16a34a33" : "0 1px 2px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ minWidth: 68, flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.textPrimary }}>{timeStr}</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>{dateStr}</div>
            {meeting.isLive && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 10, fontWeight: 700, color: "#16a34a", background: "#f0fdf4", padding: "2px 7px", borderRadius: 20, border: "1px solid #bbf7d0" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#16a34a" }} /> Live
              </span>
            )}
          </div>
          <Avatar initials={initials} color={meeting.avatarColor || T.blue} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.textLink }}>{meeting.name}</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meeting.email}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
              <SourceChip source={meeting.source} />
              <StatusPill status={meeting.status} />
            </div>
          </div>
          {meeting.score != null && <ScoreBadge score={meeting.score} />}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11, color: T.textSecondary, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{meeting.type}</div>
          {meeting.liquid && <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, flexShrink: 0 }}>{meeting.liquid}</div>}
        </div>
      </div>
    </>
  );
}

// ─── CONTACT DETAIL ───────────────────────────────────────────────────────────

function ContactDetail({ contact, onBack }) {
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [firing, setFiring] = useState(null);
  const [done, setDone] = useState({});
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(true);

  useEffect(() => {
    fetch(`/api/mobile/contacts/${contact.id}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setDetail(d.contact))
      .catch(() => setDetail(contact))
      .finally(() => setLoadingDetail(false));
  }, [contact.id]);

  const c = detail || contact;

  const fire = async (action, payload = {}) => {
    if (!c.id) return;
    setFiring(action);
    try {
      await fireAction(c.id, action, payload);
      setDone(prev => ({ ...prev, [action]: true }));
      setTimeout(() => setDone(prev => ({ ...prev, [action]: false })), 3000);
    } catch (e) {
      alert(e.message);
    } finally {
      setFiring(null);
    }
  };

  const saveNote = () => {
    if (!note.trim()) return;
    fire("note", { body: note }).then(() => { setNote(""); setShowNote(false); });
  };

  const ACTIONS = [
    { id: "booking_link", label: "Send Booking Link", icon: "📅", color: T.blue },
    { id: "workflow", label: "Trigger Workflow", icon: "⚡", color: "#7c3aed" },
    { id: "short_link", label: "Copy Short Link", icon: "🔗", color: "#0891b2", onClick: async () => {
      const res = await fireAction(c.id, "short_link", { brand: c.brand });
      if (res.result?.shortUrl) {
        await navigator.clipboard.writeText(res.result.shortUrl).catch(() => {});
        alert(`Copied: ${res.result.shortUrl}`);
      }
    }},
    { id: "stage", label: "Update Stage", icon: "🔄", color: "#ea580c" },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", background: T.bgPage }}>
      <div style={{ background: T.bgCard, borderBottom: `1px solid ${T.border}`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 10, paddingTop: "calc(14px + env(safe-area-inset-top))" }}>
        <button onClick={onBack} style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 10px", cursor: "pointer", display: "flex", color: T.textSecondary }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ fontWeight: 800, fontSize: 17, color: T.textPrimary }}>Contact Details</span>
      </div>

      {loadingDetail ? <Spinner /> : (
        <>
          <div style={{ background: T.bgCard, padding: "24px 20px 20px", textAlign: "center", borderBottom: `1px solid ${T.border}` }}>
            <Avatar initials={c.initials} color={c.avatarColor || T.blue} size={64} />
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 20, color: T.textPrimary }}>{c.name}</div>
              <div style={{ fontSize: 13, color: T.textMuted, marginTop: 3 }}>{c.email}</div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
              {c.source && <SourceChip source={c.source} />}
              {c.tags?.[0] && <StatusPill status={c.tags[0]} />}
              {c.score != null && <ScoreBadge score={c.score} />}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <a href={`tel:${c.phone}`} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${T.border}`, background: T.bgCard, color: "#16a34a", fontWeight: 700, fontSize: 13, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.62 4.9 2 2 0 0 1 3.59 2.72h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.5a16 16 0 0 0 5.59 5.59l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 18v.97"/></svg>
                Call
              </a>
              <a href={`mailto:${c.email}`} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${T.border}`, background: T.bgCard, color: T.blue, fontWeight: 700, fontSize: 13, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Email
              </a>
            </div>
          </div>

          <div style={{ padding: "16px 16px 0" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Details</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Brand", value: c.brand || "—" },
                { label: "Stage", value: c.stage || "—" },
                { label: "Liquid Capital", value: c.liquid || "—" },
                { label: "Meetings", value: c.totalMeetings != null ? `${c.totalMeetings} total` : "—" },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{label}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: T.textPrimary }}>{value}</div>
                </div>
              ))}
            </div>

            {c.nextMeeting && (
              <div style={{ background: T.blueSoft, border: `1px solid ${T.blueLight}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.blue, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Next Meeting</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: T.textPrimary }}>{new Date(c.nextMeeting.startTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>{c.nextMeeting.title}</div>
              </div>
            )}
          </div>

          <div style={{ padding: "0 16px 8px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Quick Actions</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              {ACTIONS.map(a => (
                <button key={a.id} onClick={() => a.onClick ? a.onClick() : fire(a.id)} disabled={firing === a.id} style={{ background: done[a.id] ? a.color + "15" : T.bgCard, border: `1.5px solid ${done[a.id] ? a.color : T.border}`, borderRadius: 12, padding: "13px 10px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, cursor: firing === a.id ? "wait" : "pointer", opacity: firing === a.id ? 0.6 : 1 }}>
                  <span style={{ fontSize: 18 }}>{a.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: done[a.id] ? a.color : T.textPrimary, textAlign: "left", lineHeight: 1.3 }}>
                    {firing === a.id ? "Sending..." : done[a.id] ? "Done ✓" : a.label}
                  </span>
                </button>
              ))}
            </div>

            <button onClick={() => setShowNote(!showNote)} style={{ width: "100%", background: T.bgCard, border: `1.5px solid ${T.border}`, borderRadius: showNote ? "12px 12px 0 0" : 12, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", marginBottom: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, display: "flex", alignItems: "center", gap: 8 }}>📝 Add Note</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2"><polyline points={showNote ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}/></svg>
            </button>
            {showNote && (
              <div style={{ background: T.bgCard, border: `1.5px solid ${T.border}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: "12px 14px", marginBottom: 24 }}>
                <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Type a note..." style={{ width: "100%", boxSizing: "border-box", minHeight: 80, background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: T.textPrimary, outline: "none", fontFamily: "Inter, system-ui, sans-serif", resize: "none" }} />
                <button onClick={saveNote} style={{ marginTop: 8, width: "100%", background: T.blue, color: "white", border: "none", borderRadius: 8, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Save Note to Kanso</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── SCREENS ──────────────────────────────────────────────────────────────────

function HomeScreen({ onNavigate }) {
  const { meetings, loading, error, refresh } = useMeetings("2weeks");
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const now = Date.now();
  const todayStr = new Date().toDateString();
  const todayMeetings = meetings.filter(m => new Date(m.startTime).toDateString() === todayStr);
  const nextUp = meetings.find(m => m.isNextUp);

  if (selectedMeeting) {
    // Build a contact-like object from meeting data to pass to ContactDetail
    const contactFromMeeting = {
      id: selectedMeeting.ghlContactId,
      name: selectedMeeting.name,
      email: selectedMeeting.email,
      phone: selectedMeeting.phone || "",
      initials: selectedMeeting.initials || selectedMeeting.name?.split(" ").map(n => n[0]).join("").slice(0,2),
      avatarColor: selectedMeeting.avatarColor,
      source: selectedMeeting.source,
      brand: selectedMeeting.brand,
      liquid: selectedMeeting.liquid,
      score: selectedMeeting.score,
      stage: selectedMeeting.status,
      tags: [selectedMeeting.status],
    };
    return <ContactDetail contact={contactFromMeeting} onBack={() => setSelectedMeeting(null)} />;
  }
  const stats = {
    booked: meetings.length,
    showed: meetings.filter(m => m.status === "Showed").length,
    noShows: meetings.filter(m => m.status === "No Show").length,
  };
  const showRate = stats.booked ? Math.round((stats.showed / stats.booked) * 100) : 0;

  const StatCard = ({ label, value, iconBg, iconEl }) => (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{iconEl}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.textPrimary, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2, fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 900, fontSize: 24, color: T.textPrimary, letterSpacing: "-0.03em" }}>
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, Steve
        </div>
        <div style={{ fontSize: 13, color: T.textMuted, marginTop: 2 }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <StatCard label="Booked" value={stats.booked} iconBg="#eff6ff" iconEl={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>} />
        <StatCard label="Showed" value={stats.showed} iconBg="#f0fdf4" iconEl={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>} />
        <StatCard label="No-Shows" value={stats.noShows} iconBg="#fff1f2" iconEl={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>} />
        <StatCard label="Show Rate" value={`${showRate}%`} iconBg="#fff7ed" iconEl={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>} />
      </div>

      {loading && <Spinner />}
      {error && <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 12, padding: 16, color: "#e11d48", fontSize: 13, marginBottom: 16 }}>Could not load meetings — {error}</div>}

      {nextUp && <div style={{ marginBottom: 24 }}><NextUpCard meeting={nextUp} /></div>}

      {todayMeetings.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.textPrimary }}>Today's Meetings</div>
            <button onClick={() => onNavigate("meetings")} style={{ background: "none", border: "none", color: T.blue, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>See all</button>
          </div>
          {todayMeetings.slice(0, 3).map((m, i) => (
            <MeetingRow key={m.id} meeting={m} isNowDivider={i > 0 && new Date(m.startTime) > new Date() && new Date(todayMeetings[i-1].startTime) < new Date()} onClick={() => setSelectedMeeting(m)} />
          ))}
        </>
      )}

      {todayMeetings.length === 0 && !loading && (
        <EmptyState icon="📅" title="No meetings today" subtitle="Enjoy the breathing room." />
      )}
    </div>
  );
}

function MeetingsScreen() {
  const [range, setRange] = useState("2weeks");
  const { meetings, loading, error, refresh } = useMeetings(range);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const filters = [{ id: "today", label: "Today" }, { id: "tomorrow", label: "Tomorrow" }, { id: "2weeks", label: "Next 2 Weeks" }];
  const now = Date.now();

  if (selectedMeeting) {
    const contactFromMeeting = {
      id: selectedMeeting.ghlContactId,
      name: selectedMeeting.name,
      email: selectedMeeting.email,
      phone: selectedMeeting.phone || "",
      initials: selectedMeeting.initials || selectedMeeting.name?.split(" ").map(n => n[0]).join("").slice(0,2),
      avatarColor: selectedMeeting.avatarColor,
      source: selectedMeeting.source,
      brand: selectedMeeting.brand,
      liquid: selectedMeeting.liquid,
      score: selectedMeeting.score,
      stage: selectedMeeting.status,
      tags: [selectedMeeting.status],
    };
    return <ContactDetail contact={contactFromMeeting} onBack={() => setSelectedMeeting(null)} />;
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ background: T.bgCard, borderBottom: `1px solid ${T.border}`, padding: "16px 16px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 20, color: T.textPrimary }}>Meetings</div>
          <button onClick={refresh} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", padding: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
          {filters.map(f => (
            <button key={f.id} onClick={() => setRange(f.id)} style={{ padding: "7px 14px", borderRadius: 8, whiteSpace: "nowrap", cursor: "pointer", fontWeight: 700, fontSize: 13, background: range === f.id ? T.blue : T.bgInput, color: range === f.id ? "white" : T.textSecondary, border: `1px solid ${range === f.id ? T.blue : T.border}` }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        {loading && <Spinner />}
        {error && <div style={{ color: "#e11d48", fontSize: 13, padding: 16, textAlign: "center" }}>Error: {error}</div>}
        {!loading && meetings.length === 0 && <EmptyState icon="📭" title="No meetings found" subtitle="Try a different time range." />}
        {meetings.map((m, i) => {
          const prev = meetings[i - 1];
          const isNow = i > 0 && new Date(m.startTime) >= new Date() && prev && new Date(prev.startTime) < new Date();
          return <MeetingRow key={m.id} meeting={m} isNowDivider={isNow} onClick={() => setSelectedMeeting(m)} />;
        })}
      </div>
    </div>
  );
}

function ContactsScreen() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  const { contacts, loading, error } = useContacts(q);

  if (selected) return <ContactDetail contact={selected} onBack={() => setSelected(null)} />;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ background: T.bgCard, borderBottom: `1px solid ${T.border}`, padding: "16px 16px 12px" }}>
        <div style={{ fontWeight: 800, fontSize: 20, color: T.textPrimary, marginBottom: 12 }}>Contacts</div>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.textMuted }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search contacts, email, brand..." style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 38px", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 16, color: T.textPrimary, outline: "none", fontFamily: "Inter, system-ui, sans-serif" }} />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", background: T.bgCard }}>
        {loading && <Spinner />}
        {error && <div style={{ color: "#e11d48", fontSize: 13, padding: 16, textAlign: "center" }}>Error: {error}</div>}
        {!loading && contacts.length === 0 && q && <EmptyState icon="🔍" title="No contacts found" subtitle={`No results for "${q}"`} />}
        {!loading && contacts.length === 0 && !q && <EmptyState icon="👤" title="Search your contacts" subtitle="Type a name, email, or brand above." />}
        {contacts.map(c => (
          <div key={c.id} onClick={() => setSelected(c)} style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 16px", borderBottom: `1px solid ${T.border}`, cursor: "pointer" }}>
            <Avatar initials={c.initials} color={c.avatarColor || T.blue} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: T.textLink }}>{c.name}</div>
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 5, alignItems: "center" }}>
                {c.source && <SourceChip source={c.source} />}
                {c.brand && <span style={{ fontSize: 11, color: T.textMuted }}>{c.brand}</span>}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
              {c.score != null && <ScoreBadge score={c.score} />}
              {c.tags?.[0] && <StatusPill status={c.tags[0]} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────

const NAV = {
  home: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  meetings: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  contacts: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
};

export default function KansoPWA() {
  const [screen, setScreen] = useState("home");

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  return (
    <div style={{ maxWidth: 430, margin: "0 auto", height: "100dvh", display: "flex", flexDirection: "column", background: T.bgPage, fontFamily: "Inter, system-ui, -apple-system, sans-serif", color: T.textPrimary, overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{ background: T.bgCard, borderBottom: `1px solid ${T.border}`, padding: "12px 18px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "calc(12px + env(safe-area-inset-top))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: "white" }}>K</div>
          <span style={{ fontWeight: 800, fontSize: 17, color: T.textPrimary, letterSpacing: "-0.02em" }}>kanso</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 500 }}>ssparks</span>
          <Avatar initials="SS" color={T.blue} size={30} />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {screen === "home" && <HomeScreen onNavigate={setScreen} />}
        {screen === "meetings" && <MeetingsScreen />}
        {screen === "contacts" && <ContactsScreen />}
      </div>

      {/* Tab bar */}
      <div style={{ background: T.bgCard, borderTop: `1px solid ${T.border}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom, 8px)" }}>
        {["home", "meetings", "contacts"].map(tab => {
          const active = screen === tab;
          return (
            <button key={tab} onClick={() => setScreen(tab)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 0 6px", color: active ? T.blue : T.textMuted, position: "relative" }}>
              {active && <span style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 28, height: 2, borderRadius: "0 0 2px 2px", background: T.blue }} />}
              {NAV[tab]}
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, textTransform: "capitalize" }}>{tab}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
