import { useState, useEffect, useRef } from 'react';

// ─── Extracted from pages/dashboard/bookings.js for reuse (Meetings + CQ Recovery) ───

const STATUS_META = {
  scheduled:        { label: 'Scheduled',      color: '#2563EB', bg: '#EFF6FF', dot: '#2563EB' },
  showed:           { label: 'Showed',         color: '#059669', bg: '#D1FAE5', dot: '#059669' },
  'no-show':        { label: 'No Show',        color: '#DC2626', bg: '#FEE2E2', dot: '#DC2626' },
  closed:           { label: 'Closed Won',     color: '#7C3AED', bg: '#EDE9FE', dot: '#7C3AED' },
  'not-interested': { label: 'Not Interested', color: '#64748B', bg: '#F1F5F9', dot: '#94A3B8' },
  'not-a-fit':      { label: 'Not a Good Fit', color: '#9A3412', bg: '#FFF7ED', dot: '#C2410C' },
};

// ─── Lead score (commitment stack) ────────────────────────────────────────────
function computeLeadScore({ liquidRaw, confStatus, status, cqSent, cqReceived, emailOpened }) {
  let score = 10;
  const reasons = [];
  const num = parseFloat(String(liquidRaw || '').replace(/[^0-9.]/g, '')) || 0;
  const liquidHigh = num >= 500000 || /\$?\b(500|750)\s?k|million|\$?1\s?m|1,000,000/i.test(String(liquidRaw || ''));

  if (liquidHigh)        { score += 30; reasons.push({ t: `Liquid capital ${liquidRaw || '$500k+'}`, good: true }); }
  else if (num >= 250000){ score += 22; reasons.push({ t: `Liquid capital ${liquidRaw}`, good: true }); }
  else if (num >= 100000){ score += 14; reasons.push({ t: `Liquid capital ${liquidRaw}`, good: true }); }
  else if (liquidRaw)    { score += 6;  reasons.push({ t: `Liquid capital ${liquidRaw}`, good: true }); }

  if (confStatus === 'confirmed')      { score += 20; reasons.push({ t: 'Confirmed appointment by text', good: true }); }
  else if (confStatus === 'uncertain') { score += 6;  reasons.push({ t: 'Tentative reply on confirmation', good: true }); }
  else if (confStatus === 'declined')  { score -= 15; reasons.push({ t: 'Declined / cancelled by text', good: false }); }

  if (status === 'showed')        { score += 20; reasons.push({ t: 'Showed for the meeting', good: true }); }
  else if (status === 'no-show')  { score -= 20; reasons.push({ t: 'No-showed the appointment', good: false }); }

  if (cqReceived)   { score += 15; reasons.push({ t: 'Returned the CQ', good: true }); }
  else if (cqSent)  { score += 8;  reasons.push({ t: 'CQ sent', good: true }); }

  if (emailOpened)  { score += 6;  reasons.push({ t: 'Opened the CQ email', good: true }); }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

function scoreTier(score) {
  if (score >= 70) return { label: 'Hot',  color: '#15803D', bg: '#DCFCE7', border: '#BBF7D0' };
  if (score >= 45) return { label: 'Warm', color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' };
  return { label: 'Cool', color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0' };
}

const DEMO = [
  { id: 'd1', first_name: 'Marcus',   last_name: 'Thompson', email: 'marcus.t@email.com',     phone: '(512) 555-0192', slot_start: (() => { const d = new Date(); d.setHours(9,  0); return d.toISOString(); })(), status: 'scheduled', investment_level: '$100k–$200k', assigned_to_email: 'steve@sparksify.com', meet_link: 'https://meet.google.com/abc-defg-hij', _source_display: 'Calendly',      event_name: 'Franchise Intro Call' },
  { id: 'd2', first_name: 'Jennifer', last_name: 'Caldwell',  email: 'jcaldwell@gmail.com',    phone: '(214) 555-0847', slot_start: (() => { const d = new Date(); d.setHours(10,30); return d.toISOString(); })(), status: 'showed',    investment_level: '$50k–$100k',  assigned_to_email: 'steve@sparksify.com', meet_link: null,                                                 _source_display: 'Calendly',      event_name: 'Franchise Intro Call' },
  { id: 'd3', first_name: 'Robert',   last_name: 'Kim',       email: 'rob.kim@outlook.com',    phone: '(713) 555-0334', slot_start: (() => { const d = new Date(); d.setHours(11,45); return d.toISOString(); })(), status: 'no-show',  investment_level: '$200k+',      assigned_to_email: 'steve@sparksify.com', meet_link: null,                                                 _source_display: 'GoHighLevel',   event_name: 'Franchise Intro Call' },
  { id: 'd4', first_name: 'Angela',   last_name: 'Rivera',    email: 'angela.r@company.com',   phone: '(469) 555-0561', slot_start: (() => { const d = new Date(); d.setHours(13, 0); return d.toISOString(); })(), status: 'closed',   investment_level: '$100k–$200k', assigned_to_email: 'steve@sparksify.com', meet_link: 'https://meet.google.com/xyz-uvwx-rst', _source_display: 'KANSO', event_name: 'Franchise Discovery Call' },
  { id: 'd5', first_name: 'David',    last_name: 'Nguyen',    email: 'dnguyen@email.com',      phone: '(281) 555-0729', slot_start: (() => { const d = new Date(); d.setHours(14,30); return d.toISOString(); })(), status: 'scheduled', investment_level: '$50k–$100k',  assigned_to_email: 'steve@sparksify.com', meet_link: 'https://meet.google.com/lmn-opqr-stu', _source_display: 'GoHighLevel',   event_name: 'Franchise Intro Call' },
];


function getField(raw, ...keys) {
  if (!raw) return null;
  for (const key of keys) {
    const slug = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = Object.entries(raw).find(([k]) => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(slug));
    if (found) return found[1];
  }
  return null;
}


function SourceBadge({ source }) {
  const styles = {
    Calendly:      { color: '#6D28D9', background: '#F5F3FF', border: '1px solid #DDD6FE' },
    GoHighLevel:   { color: '#047857', background: '#ECFDF5', border: '1px solid #A7F3D0' },
    KANSO: { color: '#1D4ED8', background: '#DBEAFE', border: '1px solid #BFDBFE' },
  };
  const src = source || 'KANSO';
  const st = styles[src] || { color: '#374151', background: '#F3F4F6', border: '1px solid #E5E7EB' };
  return (
    <span style={{ ...st, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block' }}>
      {src}
    </span>
  );
}

function PIc({ name, size = 16 }) {
  const a = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', style: { display: 'block' } };
  switch (name) {
    case 'mail':      return <svg {...a}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>;
    case 'phone':     return <svg {...a}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
    case 'chat':      return <svg {...a}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>;
    case 'external':  return <svg {...a}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>;
    case 'calendar':  return <svg {...a}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case 'user':      return <svg {...a}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case 'dollar':    return <svg {...a}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>;
    case 'briefcase': return <svg {...a}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
    case 'pin':       return <svg {...a}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
    case 'send':      return <svg {...a}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
    case 'check':     return <svg {...a}><polyline points="20 6 9 17 4 12"/></svg>;
    case 'ban':       return <svg {...a}><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>;
    case 'userx':     return <svg {...a}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>;
    default: return null;
  }
}

const GHL_LOCATION = 'tsIW5P8nYSjx55tuMI43';

function CRMPanel({ booking, lead, loading, open, isDemo, brandPitches = {}, confirmation, initialNotes = '', onClose, onStatusChange, onCQSent, recovery = null }) {
  const [notes,         setNotes]         = useState('');
  const [interests,     setInterests]     = useState([]);
  const [selectedIdx,   setSelectedIdx]   = useState(null);
  const [brandEditMode, setBrandEditMode] = useState(false);
  const [brandSaving,   setBrandSaving]   = useState(false);
  const [brandSaved,    setBrandSaved]    = useState(false);
  const [notesSaving,   setNotesSaving]   = useState(false);
  const [notesSaved,    setNotesSaved]    = useState(false);
  const [showEmail,     setShowEmail]     = useState(false);
  const [email,         setEmail]         = useState({ to: '', subject: '', body: '' });
  const [emailSent,     setEmailSent]     = useState(false);
  const [cqSent,        setCqSent]        = useState(!!booking?.cq_sent_at);
  const [cqSentAt,      setCqSentAt]      = useState(booking?.cq_sent_at || null);
  const [cqReceived,    setCqReceived]    = useState(!!booking?.cq_received_at);
  const [cqReceivedAt,  setCqReceivedAt]  = useState(booking?.cq_received_at || null);
  const [cqRecvSaving,  setCqRecvSaving]  = useState(false);
  const [pitchOpen,     setPitchOpen]     = useState(false);
  const [pitchBrandIdx, setPitchBrandIdx] = useState(0);
  const [panelTab,      setPanelTab]      = useState('info');
  const [timeline,      setTimeline]      = useState([]);
  const [tlLoading,     setTlLoading]     = useState(false);
  const [imMessages,    setImMessages]    = useState([]);
  const [imLoading,     setImLoading]     = useState(false);
  const [imText,        setImText]        = useState('');
  const [imSending,     setImSending]     = useState(false);
  const imBottomRef = useRef(null);
  const [convMessages, setConvMessages] = useState([]);
  const [convLoading,  setConvLoading]  = useState(false);
  const convBottomRef = useRef(null);
  const [ghlContact,        setGhlContact]        = useState(null);
  const [ghlContactLoading, setGhlContactLoading] = useState(false);
  const [ghlTags,        setGhlTags]        = useState([]);
  const [ghlTagsLoading, setGhlTagsLoading] = useState(false);
  const [newTagInput,    setNewTagInput]    = useState('');
  const [showTagInput,   setShowTagInput]   = useState(false);
  const [tagSaving,      setTagSaving]      = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [fuDate,       setFuDate]       = useState('');
  const [fuNote,       setFuNote]       = useState('');
  const [fuTemp,       setFuTemp]       = useState(3);
  const [fuSaving,     setFuSaving]     = useState(false);
  const [fuSaved,      setFuSaved]      = useState(false);
  const panelRef = useRef(null);
  const notesRef = useRef(null);
  function focusNotes() {
    setPanelTab('info');
    setTimeout(() => {
      notesRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      notesRef.current?.focus();
    }, 80);
  }

  useEffect(() => {
    if (lead) {
      const fi = lead.franchise_interests || [];
      setInterests(fi);
      setSelectedIdx(fi.length > 0 ? 0 : null);
    }
  }, [lead]);

  // Notes are keyed by contact email (not the lead row), so load them from the
  // value resolved server-side rather than from lead.notes.
  useEffect(() => { setNotes(initialNotes || ''); }, [initialNotes, booking?.id]);

  useEffect(() => {
    setCqSent(!!booking?.cq_sent_at);
    setCqSentAt(booking?.cq_sent_at || null);
    setCqReceived(!!booking?.cq_received_at);
    setCqReceivedAt(booking?.cq_received_at || null);
    setGhlTags([]); setNewTagInput(''); setShowTagInput(false); setTagSaving(false);
    setShowFollowUp(false); setFuDate(''); setFuNote(''); setFuTemp(3); setFuSaved(false);
    if (!booking?.email || isDemo) {
      if (isDemo) setGhlTags(['hot-lead', 'franchise-ready']);
      setGhlContact(null); return;
    }
    const ghlId = booking?.ghl_contact_id;
    const source = booking?._source_display;
    function applyContact(c) {
      setGhlContact(c); setGhlContactLoading(false);
      if (c?.tags?.length > 0) setGhlTags(c.tags);
      else {
        setGhlTagsLoading(true);
        fetch(`/api/dashboard/contact-tags?email=${encodeURIComponent(booking.email)}`)
          .then(r => r.json()).then(d => { setGhlTags(d.tags || []); setGhlTagsLoading(false); })
          .catch(() => setGhlTagsLoading(false));
      }
    }
    if (ghlId) {
      setGhlContactLoading(true);
      fetch(`/api/dashboard/ghl-contact-detail?contactId=${ghlId}`)
        .then(r => r.json()).then(d => applyContact(d.contact || null))
        .catch(() => { setGhlContact(null); setGhlContactLoading(false); });
    } else if (source === 'Calendly' && booking.email) {
      setGhlContactLoading(true);
      fetch(`/api/dashboard/ghl-contact-detail?email=${encodeURIComponent(booking.email)}`)
        .then(r => r.json()).then(d => applyContact(d.contact || null))
        .catch(() => { setGhlContact(null); setGhlContactLoading(false); });
    } else {
      setGhlContact(null); setGhlTagsLoading(true);
      fetch(`/api/dashboard/contact-tags?email=${encodeURIComponent(booking.email)}`)
        .then(r => r.json()).then(d => { setGhlTags(d.tags || []); setGhlTagsLoading(false); })
        .catch(() => setGhlTagsLoading(false));
    }
  }, [booking?.id]);

  useEffect(() => {
    if (!open) {
      setShowEmail(false); setEmailSent(false); setPitchOpen(false); setBrandEditMode(false);
      setPanelTab('info'); setTimeline([]); setShowFollowUp(false); setFuSaved(false);
      setNewTagInput(''); setShowTagInput(false); setGhlContact(null); setGhlContactLoading(false);
      setImMessages([]); setImText(''); setImSending(false);
      setConvMessages([]); setConvLoading(false);
    }
  }, [open]);

  function loadConversation() {
    const cid = booking?.ghl_contact_id || ghlContact?.id || '';
    const qs = cid ? `contactId=${encodeURIComponent(cid)}` : (booking?.email ? `email=${encodeURIComponent(booking.email)}` : '');
    if (!qs) return;
    setConvLoading(true);
    fetch(`/api/dashboard/ghl-conversation?${qs}`)
      .then(r => r.json())
      .then(d => { setConvMessages(d.messages || []); setConvLoading(false); setTimeout(() => convBottomRef.current?.scrollIntoView(), 50); })
      .catch(() => setConvLoading(false));
  }
  function openConversation() {
    setPanelTab('conversation');
    if (convMessages.length === 0 && !convLoading) loadConversation();
  }

  function openImessage() {
    setPanelTab('imessage');
    if (imMessages.length > 0 || imLoading) return;
    const phone = booking?.phone || lead?.phone || ghlContact?.phone || '';
    if (!phone) return;
    setImLoading(true);
    fetch(`/api/dashboard/imessage-history?address=${encodeURIComponent(phone)}`)
      .then(r => r.json())
      .then(d => { setImMessages(d.messages || []); setImLoading(false); setTimeout(() => imBottomRef.current?.scrollIntoView(), 50); })
      .catch(() => setImLoading(false));
  }

  async function sendImessage() {
    const phone = booking?.phone || lead?.phone || ghlContact?.phone || '';
    if (!phone || !imText.trim() || imSending) return;
    setImSending(true);
    const text = imText.trim();
    setImText('');
    // Optimistic add
    setImMessages(prev => [...prev, { guid: `tmp_${Date.now()}`, text, isFromMe: true, dateCreated: Date.now() }]);
    setTimeout(() => imBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
    await fetch('/api/dashboard/send-imessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: phone, message: text, booking_id: booking?.id }),
    }).catch(console.error);
    setImSending(false);
  }

  function openTimeline() {
    setPanelTab('timeline');
    if (timeline.length > 0 || tlLoading) return;
    setTlLoading(true);
    fetch(`/api/lead-events?email=${encodeURIComponent(booking.email)}`)
      .then(r => r.json()).then(d => { setTimeline(d.events || []); setTlLoading(false); })
      .catch(() => setTlLoading(false));
  }

  const selectedFI = selectedIdx !== null ? interests[selectedIdx] : null;
  function updateInterest(idx, field, value) {
    setInterests(prev => prev.map((fi, i) => i === idx ? { ...fi, [field]: value } : fi));
    if (field === 'developer_email' && idx === selectedIdx) setEmail(em => ({ ...em, to: value }));
  }
  function addBrand() {
    const newFI = { id: `fi_${Date.now()}`, brand: '', developer_name: '', developer_phone: '', developer_email: '' };
    setInterests(prev => [...prev, newFI]); setSelectedIdx(interests.length);
  }
  function removeBrand(idx) {
    const updated = interests.filter((_, i) => i !== idx);
    setInterests(updated);
    setSelectedIdx(updated.length === 0 ? null : Math.min(idx, updated.length - 1));
    saveInterestsToAPI(updated);
  }
  async function saveInterestsToAPI(data) {
    if (!lead || isDemo) return;
    await fetch('/api/dashboard/update-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lead.id, franchise_interests: data }) }).catch(console.error);
  }
  async function saveBrand() {
    setBrandSaving(true); await saveInterestsToAPI(interests); setBrandSaving(false);
    setBrandSaved(true); setTimeout(() => setBrandSaved(false), 2000);
  }
  async function saveNotes() {
    if (isDemo) { setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000); return; }
    if (!booking?.email) return;
    setNotesSaving(true);
    // Keyed by email so notes persist even when there's no lead row.
    await fetch('/api/dashboard/save-note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: booking.email, notes }) }).catch(console.error);
    setNotesSaving(false); setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000);
  }
  function sendEmail() { setEmailSent(true); setTimeout(() => { setEmailSent(false); setShowEmail(false); }, 2500); }
  async function sendCQ() {
    const now = new Date().toISOString();
    if (isDemo) { setCqSent(true); setCqSentAt(now); onCQSent?.(now); return; }
    setCqSent(true);
    setCqSentAt(now);
    onCQSent?.(now); // bubble up so the meetings list + CQ Sent KPI update immediately
    await fetch('/api/dashboard/send-cq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: booking.id, email: booking.email, assigned_user_id: booking.assigned_user_id || null, slot_start: booking.slot_start }) }).catch(console.error);
  }
  async function markCQReceived() {
    const now = new Date().toISOString();
    if (isDemo) { setCqReceived(true); setCqReceivedAt(now); return; }
    setCqRecvSaving(true);
    const res = await fetch('/api/dashboard/mark-cq-received', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: booking.id, email: booking.email, slot_start: booking.slot_start }) }).catch(console.error);
    const data = res ? await res.json().catch(() => ({})) : {};
    setCqReceived(true);
    setCqReceivedAt(data.cq_received_at || now);
    setCqRecvSaving(false);
  }
  async function addTag(tag) {
    const clean = tag.trim(); if (!clean || ghlTags.includes(clean)) return;
    setTagSaving(true); setGhlTags(prev => [...prev, clean]); setNewTagInput('');
    if (!isDemo) await fetch('/api/dashboard/contact-tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: booking.email, tags: [clean] }) }).catch(console.error);
    setTagSaving(false);
  }
  async function removeTag(tag) {
    setGhlTags(prev => prev.filter(t => t !== tag));
    if (!isDemo) await fetch('/api/dashboard/contact-tags', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: booking.email, tags: [tag] }) }).catch(console.error);
  }
  async function saveFollowUp() {
    setFuSaving(true);
    if (!isDemo) await fetch('/api/dashboard/schedule-followup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: booking.id, email: booking.email, follow_up_date: fuDate, note: fuNote || null, temperature: fuTemp }) }).catch(console.error);
    setFuSaving(false); setFuSaved(true); setTimeout(() => { setFuSaved(false); setShowFollowUp(false); }, 2200);
  }

  const raw = lead?.raw_fields ? (typeof lead.raw_fields === 'string' ? JSON.parse(lead.raw_fields) : lead.raw_fields) : {};
  const cf = ghlContact?.custom_fields || {};
  const liquidCapital = getField(raw, 'liquid_capital', 'liquid capital') || cf['Liquid Cash'] || cf['Cash Available'] || null;
  const ownedBusiness = getField(raw, 'owned_business', 'owned or managed', 'managed a business', 'business before') || cf['Owned Business'] || null;
  const territory = (() => {
    const city = lead?.location_city || ghlContact?.city;
    const state = lead?.location_state || ghlContact?.state;
    const zip = lead?.location_zip || ghlContact?.zip;
    const areaCode = lead?.location_area_code || ghlContact?.area_code;
    const locRaw = lead?.location_raw;
    const fbRaw = getField(raw, 'territory', 'area_of_interest', 'interested_area') || cf['Areas of Interest'] || cf['Territory Interest'];
    if (city || state) { const primary = [city, state].filter(Boolean).join(', '); const sub = zip || (areaCode ? `Area code ${areaCode}` : null); return { primary, sub }; }
    const fallback = locRaw || fbRaw; return fallback ? { primary: fallback, sub: null } : null;
  })();

  const meta = STATUS_META[booking.status] || STATUS_META.scheduled;
  const initials = `${booking.first_name?.[0] || ''}${booking.last_name?.[0] || ''}`.toUpperCase();
  const slot = booking.slot_start ? new Date(booking.slot_start) : null;
  const slotLabel = slot ? slot.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';
  const pitchBrands = interests.filter(fi => fi.brand && brandPitches[fi.brand]);
  const pitchFI = pitchBrands[pitchBrandIdx] || pitchBrands[0];
  const pitchText = pitchFI ? brandPitches[pitchFI.brand] : null;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.2)', zIndex: 100, opacity: open ? 1 : 0, transition: 'opacity .25s', pointerEvents: open ? 'auto' : 'none' }} />
      <div ref={panelRef} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,.10)', zIndex: 101, display: 'flex', flexDirection: 'column', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .25s cubic-bezier(.4,0,.2,1)', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" }}>
        <style>{`.crmRow:last-child{border-bottom:none !important;margin-bottom:0 !important;padding-bottom:0 !important}`}</style>

        {/* Header */}
        {(() => {
          const hdrPhone = booking.phone || lead?.phone || ghlContact?.phone || '';
          const hdrCid = booking.ghl_contact_id || ghlContact?.id || '';
          return (
        <div style={p.panelHdr}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ ...p.avatar, width: 60, height: 60, fontSize: 21 }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...p.clientName, fontSize: 18 }}>{booking.first_name} {booking.last_name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 14px', marginTop: 5, fontSize: 12.5, color: '#64748B' }}>
                {booking.email && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, maxWidth: '100%' }}>
                    <span style={{ color: '#94A3B8', flexShrink: 0, display: 'inline-flex' }}><PIc name="mail" size={14} /></span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{booking.email}</span>
                  </span>
                )}
                {hdrPhone && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: '#94A3B8', display: 'inline-flex' }}><PIc name="phone" size={14} /></span>{hdrPhone}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                <SourceBadge source={booking._source_display || 'KANSO'} />
                {booking.event_name && (
                  <span title={booking.event_name} style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#475569', background: '#F1F5F9', border: '1px solid #E2E8F0', whiteSpace: 'nowrap', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }}>{booking.event_name}</span>
                )}
                <span style={{ ...p.statusBadge, color: meta.color, background: meta.bg }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.dot, display: 'inline-block' }} />
                  {meta.label}
                </span>
                {(() => {
                  if (!confirmation || confirmation.loading) return null;
                  const CONF = {
                    confirmed:   { label: '✓ Confirmed', color: '#15803D', bg: '#DCFCE7', border: '#BBF7D0' },
                    declined:    { label: '✗ Declined',  color: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
                    uncertain:   { label: '? Maybe',     color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' },
                  };
                  const c = CONF[confirmation.status];
                  if (!c) return null;
                  return (
                    <span title={confirmation.note || 'SMS confirmation status'} style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: c.color, background: c.bg, border: `1px solid ${c.border}`, whiteSpace: 'nowrap', cursor: confirmation.note ? 'help' : 'default' }}>
                      {c.label}
                    </span>
                  );
                })()}
              </div>
            </div>
            <button onClick={onClose} style={p.closeBtn}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <a href={hdrPhone ? `tel:${hdrPhone}` : undefined} style={{ ...p.hdrBtn, ...(hdrPhone ? {} : { opacity: 0.45, pointerEvents: 'none' }) }}>
              <PIc name="phone" size={15} /> Call
            </a>
            <a href={`mailto:${booking.email}`} style={p.hdrBtn}>
              <PIc name="mail" size={15} /> Email
            </a>
            <button onClick={openImessage} style={{ ...p.hdrBtn, cursor: 'pointer' }}>
              <PIc name="chat" size={15} /> iMessage
            </button>
            <a
              href={hdrCid ? `https://app.gohighlevel.com/v2/location/${GHL_LOCATION}/contacts/detail/${hdrCid}` : undefined}
              target="_blank" rel="noreferrer"
              style={{ ...p.hdrBtn, ...(hdrCid ? {} : { opacity: 0.45, pointerEvents: 'none' }) }}
            >
              <PIc name="external" size={15} /> Open
            </a>
          </div>
        </div>
          );
        })()}

        {/* Tab bar */}
        <div style={p.tabBar}>
          <button style={{ ...p.panelTab, ...(panelTab === 'info'         ? p.panelTabActive : {}) }} onClick={() => setPanelTab('info')}>Info</button>
          <button style={{ ...p.panelTab, ...(panelTab === 'conversation' ? p.panelTabActive : {}) }} onClick={openConversation}>Conversation</button>
          <button style={{ ...p.panelTab, ...(panelTab === 'timeline'     ? p.panelTabActive : {}) }} onClick={openTimeline}>Timeline</button>
        </div>

        {/* Body */}
        <div style={p.scrollBody}>
          {panelTab === 'conversation' ? (
            <ConversationView messages={convMessages} loading={convLoading} onRefresh={loadConversation} bottomRef={convBottomRef} />
          ) : panelTab === 'imessage' ? (
            <ImessagePanel
              messages={imMessages}
              loading={imLoading}
              text={imText}
              sending={imSending}
              phone={booking?.phone || lead?.phone || ghlContact?.phone || ''}
              onTextChange={setImText}
              onSend={sendImessage}
              bottomRef={imBottomRef}
            />
          ) : panelTab === 'timeline' ? (
            <TimelineView events={timeline} loading={tlLoading} bookingSource={booking.booking_source} />
          ) : loading ? (
            <div style={p.loadingMsg}>Loading…</div>
          ) : (
            <>
              {/* Lead Score */}
              {(() => {
                const emailOpened = (ghlTags || []).some(t => String(t).toLowerCase().includes('emailopen'));
                const { score, reasons } = computeLeadScore({ liquidRaw: liquidCapital, confStatus: confirmation?.status, status: booking.status, cqSent, cqReceived, emailOpened });
                const tier = scoreTier(score);
                return (
                  <div style={p.card}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <div style={{ flexShrink: 0, width: 60, textAlign: 'center' }}>
                        <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, color: tier.color }}>{score}</div>
                        <span style={{ display: 'inline-block', marginTop: 6, padding: '1px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: tier.color, background: tier.bg, border: `1px solid ${tier.border}` }}>{tier.label}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={p.sectionTitle}>Lead Score</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {reasons.length === 0 ? <span style={{ fontSize: 12, color: '#9CA3AF' }}>No signals yet</span> :
                            reasons.map((r, i) => (
                              <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, color: r.good ? '#334155' : '#B91C1C', background: r.good ? '#F1F5F9' : '#FEF2F2', border: `1px solid ${r.good ? '#E2E8F0' : '#FECACA'}` }}>
                                {r.good ? '+ ' : '− '}{String(r.t).replace(/_/g, ' ')}
                              </span>
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* CQ Recovery (only on the CQ Recovery page) */}
              {recovery && (
                <div style={p.card}>
                  <div style={p.sectionTitle}>CQ Recovery</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    {recovery.bucketLabel && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 11px', borderRadius: 20, color: recovery.tierColor || '#C2410C', background: (recovery.tierColor || '#C2410C') + '18', border: `1px solid ${(recovery.tierColor || '#C2410C')}33` }}>{recovery.bucketLabel}</span>
                    )}
                    {recovery.dealValue && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>Est. deal value</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#15803D' }}>{recovery.dealValue}</div>
                      </div>
                    )}
                  </div>
                  {(recovery.score != null) && (
                    <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 10 }}>
                      Recovery priority: <b style={{ color: recovery.tierColor || '#0F172A' }}>{recovery.score}{recovery.tierLabel ? ` · ${recovery.tierLabel}` : ''}</b>
                    </div>
                  )}
                  {recovery.signals?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: recovery.nextStep ? 12 : 0 }}>
                      {recovery.signals.map((sig, i) => (
                        <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, color: '#334155', background: '#F1F5F9', border: '1px solid #E2E8F0' }}>{sig}</span>
                      ))}
                    </div>
                  )}
                  {recovery.nextStep && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 10, background: recovery.nextStep.bg || '#F8FAFC' }}>
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#94A3B8' }}>Recommended next step</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: recovery.nextStep.color || '#0F172A' }}>{recovery.nextStep.label}</div>
                        {recovery.nextStep.sub && <div style={{ fontSize: 11, color: '#64748B' }}>{recovery.nextStep.sub}</div>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Contact / Booking Details */}
              <PanelSection title="Contact / Booking Details">
                {(() => { const phone = booking.phone || lead?.phone || ghlContact?.phone || ''; return <Row label="Phone" icon="phone"><a href={`tel:${phone}`} style={phone ? p.link : undefined}>{phone || '—'}</a></Row>; })()}
                <Row label="Email" icon="mail"><a href={`mailto:${booking.email}`} style={p.link}>{booking.email}</a></Row>
                <Row label="Scheduled" icon="calendar"><span style={p.val}>{slotLabel}</span></Row>
                <Row label="Consultant" icon="user"><span style={p.val}>{booking.assigned_to_email || ghlContact?.owner_name || '—'}</span></Row>
                {liquidCapital && <Row label="Liquid Cap." icon="dollar"><span style={p.val}>{String(liquidCapital).replace(/_/g, ' ')}</span></Row>}
                {ownedBusiness && <Row label="Owned Biz" icon="briefcase"><span style={p.val}>{String(ownedBusiness).replace(/_/g, ' ')}</span></Row>}
                {territory && <Row label="Territory" icon="pin"><span style={p.val}>{territory.primary}{territory.sub && <span style={{ color: '#9CA3AF', fontSize: 11, marginLeft: 6 }}>{territory.sub}</span>}</span></Row>}
                {booking.meet_link && <Row label="Meet Link" icon="external"><a href={booking.meet_link} target="_blank" rel="noreferrer" style={p.link}>Join call →</a></Row>}

                {(cqSentAt || cqReceivedAt) && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #F0F0F0', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {cqSentAt && (
                      <div style={{ fontSize: 11, color: '#64748B' }}>
                        <span style={{ fontWeight: 600, color: '#7C3AED' }}>CQ Sent:</span>{' '}
                        {new Date(cqSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' · '}
                        {new Date(cqSentAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    )}
                    {cqReceivedAt && (
                      <div style={{ fontSize: 11, color: '#64748B' }}>
                        <span style={{ fontWeight: 600, color: '#15803D' }}>CQ Received:</span>{' '}
                        {new Date(cqReceivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' · '}
                        {new Date(cqReceivedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        {cqSentAt && (
                          <span style={{ marginLeft: 6, color: '#94A3B8' }}>
                            ({Math.round((new Date(cqReceivedAt) - new Date(cqSentAt)) / 3600000 * 10) / 10}h turnaround)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </PanelSection>

              {/* GHL Tags */}
              <PanelSection title="GHL Tags">
                {ghlTagsLoading ? <div style={{ fontSize: 12, color: '#9CA3AF' }}>Loading tags…</div> : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {ghlTags.map(tag => (
                      <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: '#EEF2FF', border: '1px solid #C7D2FE', color: '#3730A3', borderRadius: 20, padding: '2px 6px 2px 10px', fontSize: 11, fontWeight: 500 }}>
                        {tag}
                        <button onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', color: '#818CF8', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px', fontFamily: 'inherit' }}>×</button>
                      </span>
                    ))}
                    {!showTagInput && <button onClick={() => setShowTagInput(true)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1.5px dashed #CBD5E1', background: 'transparent', color: '#9CA3AF', cursor: 'pointer', fontSize: 16, lineHeight: '1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', padding: 0 }} title="Add tag">+</button>}
                    {showTagInput && (
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center', width: '100%', marginTop: 4 }}>
                        <input autoFocus style={{ ...p.input, flex: 1, padding: '4px 8px', fontSize: 12 }} placeholder="Tag name…" value={newTagInput} onChange={e => setNewTagInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && newTagInput.trim()) { addTag(newTagInput); setShowTagInput(false); setNewTagInput(''); } if (e.key === 'Escape') { setNewTagInput(''); setShowTagInput(false); } }} />
                        <button onClick={() => { if (newTagInput.trim()) { addTag(newTagInput); setNewTagInput(''); } setShowTagInput(false); }} disabled={tagSaving} style={{ ...p.editBtn, fontSize: 11, padding: '4px 10px' }}>{tagSaving ? '…' : 'Add'}</button>
                        <button onClick={() => { setNewTagInput(''); setShowTagInput(false); }} style={{ ...p.cancelEditBtn, fontSize: 11, padding: '4px 8px' }}>✕</button>
                      </div>
                    )}
                  </div>
                )}
              </PanelSection>

              {/* Notes */}
              <PanelSection title="Notes" bg="#FFFEF5">
                <textarea ref={notesRef} style={{ ...p.notesArea, background: '#FFFDF0' }} rows={5} value={notes} placeholder="Add notes about this client…" onChange={e => setNotes(e.target.value)} />
                <div style={{ marginTop: 10 }}>
                  <button onClick={saveNotes} disabled={notesSaving} style={{ ...p.actionBtn, background: notesSaved ? '#2CA01C' : '#0077C5' }}>{notesSaving ? 'Saving…' : notesSaved ? '✓ Saved' : 'Save Notes'}</button>
                </div>
              </PanelSection>

              {/* Quick Actions */}
              <div style={p.card}>
                <div style={p.sectionTitle}>Quick Actions</div>
                {booking.status === 'scheduled' && (
                  <div style={p.qaGrid}>
                    <button style={{ ...p.qaBtn, background: '#2563EB', color: '#fff', border: 'none' }} onClick={() => onStatusChange('showed')}>
                      <PIc name="check" size={16} /> Mark Showed
                    </button>
                    <button style={{ ...p.qaBtn, background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB' }} onClick={() => onStatusChange('no-show')}>
                      <PIc name="ban" size={16} /> No-Show
                    </button>
                    <button style={{ ...p.qaBtn, background: '#fff', color: cqSent ? '#16A34A' : '#2563EB', border: `1px solid ${cqSent ? '#BBF7D0' : '#C7D9FF'}`, cursor: cqSent ? 'default' : 'pointer' }} onClick={sendCQ} disabled={cqSent}>
                      {cqSent ? <><PIc name="check" size={16} /> CQ Sent</> : <><PIc name="send" size={16} /> Send CQ</>}
                    </button>
                    <button style={{ ...p.qaBtn, background: '#fff', color: '#EA580C', border: '1px solid #FED7AA' }} onClick={() => onStatusChange('not-a-fit')}>
                      <PIc name="userx" size={16} /> Not a Good Fit
                    </button>
                  </div>
                )}
                {booking.status === 'showed' && (
                  <div style={p.qaGrid}>
                    {cqReceived ? (
                      <div style={{ ...p.qaBtn, ...p.qaSpan, background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0', cursor: 'default' }}><PIc name="check" size={16} /> CQ Received</div>
                    ) : (
                      <button style={{ ...p.qaBtn, ...p.qaSpan, background: cqSent ? '#16A34A' : '#2563EB', color: '#fff', border: 'none', cursor: cqSent ? 'default' : 'pointer', opacity: cqSent ? 0.95 : 1 }} onClick={sendCQ} disabled={cqSent}>
                        {cqSent ? <><PIc name="check" size={16} /> CQ Sent</> : <><PIc name="send" size={16} /> Send CQ</>}
                      </button>
                    )}
                    {cqSent && !cqReceived && (
                      <button style={{ ...p.qaBtn, ...p.qaSpan, background: '#fff', color: '#374151', border: '1px solid #E5E7EB' }} onClick={markCQReceived} disabled={cqRecvSaving}>
                        {cqRecvSaving ? 'Saving…' : 'Mark CQ Received'}
                      </button>
                    )}
                    <button style={{ ...p.qaBtn, background: '#fff', color: '#374151', border: '1px solid #E5E7EB' }} onClick={() => setShowFollowUp(true)}>
                      <PIc name="calendar" size={16} /> Follow-up
                    </button>
                    <button style={{ ...p.qaBtn, background: '#fff', color: '#DC2626', border: '1px solid #FECACA' }} onClick={() => onStatusChange('not-interested')}>
                      <PIc name="ban" size={16} /> Not Interested
                    </button>
                    <button style={{ ...p.qaBtn, ...p.qaSpan, background: '#fff', color: '#EA580C', border: '1px solid #FED7AA' }} onClick={() => onStatusChange('not-a-fit')}>
                      <PIc name="userx" size={16} /> Not a Good Fit
                    </button>
                  </div>
                )}
                {(booking.status === 'no-show' || booking.status === 'closed' || booking.status === 'not-interested' || booking.status === 'not-a-fit') && (
                  <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '8px 0' }}>
                    {booking.status === 'closed' ? 'Deal closed' : booking.status === 'not-interested' ? 'Marked not interested' : booking.status === 'not-a-fit' ? 'Marked not a good fit' : 'No further actions'}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showFollowUp && <FollowUpModal booking={booking} fuDate={fuDate} setFuDate={setFuDate} fuNote={fuNote} setFuNote={setFuNote} fuTemp={fuTemp} setFuTemp={setFuTemp} fuSaving={fuSaving} fuSaved={fuSaved} onSave={saveFollowUp} onClose={() => setShowFollowUp(false)} />}

      {pitchOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setPitchOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 6, width: '100%', maxWidth: 520, boxShadow: '0 8px 40px rgba(0,0,0,.2)', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #EBEBEB' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1A2B3C' }}>Phone Pitch</div>
                {pitchBrands.length > 1 && <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>{pitchBrands.map((fi, i) => <button key={fi.id} onClick={() => setPitchBrandIdx(i)} style={i === pitchBrandIdx ? p.brandChipActive : p.brandChip}>{fi.brand}</button>)}</div>}
                {pitchFI && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{pitchFI.brand}</div>}
              </div>
              <button onClick={() => setPitchOpen(false)} style={p.closeBtn}>✕</button>
            </div>
            <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              {pitchText ? <div style={{ fontSize: 14, color: '#1A2B3C', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{pitchText}</div>
                : <div style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', padding: '20px 0' }}>No pitch configured.<br /><a href="/dashboard" style={{ color: '#0077C5', textDecoration: 'none' }}>Set up pitches in Settings →</a></div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Follow-up Modal ──────────────────────────────────────────────────────────
const TEMP_LABELS = ['', 'Cold', 'Cool', 'Warm', 'Hot', 'On Fire'];
const TEMP_COLORS = ['', '#60A5FA', '#22D3EE', '#F59E0B', '#F97316', '#EF4444'];
const TEMP_BG     = ['', '#EFF6FF', '#ECFEFF', '#FFFBEB', '#FFF7ED', '#FEF2F2'];

function FollowUpModal({ booking, fuDate, setFuDate, fuNote, setFuNote, fuTemp, setFuTemp, fuSaving, fuSaved, onSave, onClose }) {
  const today = new Date().toISOString().split('T')[0];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 8, width: '100%', maxWidth: 440, boxShadow: '0 12px 48px rgba(0,0,0,.22)', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif", overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #EBEBEB' }}>
          <div><div style={{ fontSize: 15, fontWeight: 700, color: '#1A2B3C' }}>Schedule Follow-up</div><div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{booking.first_name} {booking.last_name} · {booking.email}</div></div>
          <button onClick={onClose} style={p.closeBtn}>✕</button>
        </div>
        <div style={{ padding: '20px 24px 24px' }}>
          {fuSaved ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 40 }}>✓</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#15803D', marginTop: 10 }}>Follow-up scheduled!</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>Added to your queue for {fuDate}</div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 18 }}><label style={p.editLabel}>Follow-up Date</label><input type="date" min={today} style={{ ...p.input, marginTop: 5, fontSize: 14 }} value={fuDate} onChange={e => setFuDate(e.target.value)} /></div>
              <div style={{ marginBottom: 18 }}>
                <label style={p.editLabel}>Likelihood to Engage</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
                  {[1,2,3,4,5].map(n => <button key={n} onClick={() => setFuTemp(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 30, lineHeight: 1, padding: '0 2px', color: fuTemp >= n ? TEMP_COLORS[fuTemp] : '#D1D5DB', transition: 'color .12s, transform .1s', transform: fuTemp === n ? 'scale(1.2)' : 'scale(1)' }}>★</button>)}
                </div>
                <div style={{ marginTop: 6, textAlign: 'center', fontSize: 12, fontWeight: 700, color: TEMP_COLORS[fuTemp], background: TEMP_BG[fuTemp], borderRadius: 20, padding: '3px 12px', display: 'inline-block', margin: '6px auto 0', width: '100%' }}>{TEMP_LABELS[fuTemp]}</div>
              </div>
              <div style={{ marginBottom: 22 }}><label style={p.editLabel}>Why follow up?</label><textarea style={{ ...p.notesArea, marginTop: 5, fontSize: 13 }} rows={3} placeholder="e.g. Wants to revisit after talking to spouse." value={fuNote} onChange={e => setFuNote(e.target.value)} /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onSave} disabled={!fuDate || fuSaving} style={{ ...p.actionBtn, flex: 1, background: !fuDate ? '#9CA3AF' : '#0077C5', cursor: !fuDate ? 'not-allowed' : 'pointer' }}>{fuSaving ? 'Scheduling…' : 'Schedule Follow-up'}</button>
                <button onClick={onClose} style={p.cancelBtn}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Panel helpers ────────────────────────────────────────────────────────────
function PanelSection({ title, bg, children }) {
  return (
    <div style={{ ...p.section, ...(bg ? { background: bg } : {}) }}>
      <div style={p.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}
function Row({ label, icon, children }) {
  return (
    <div className="crmRow" style={p.row}>
      {label && (
        <span style={p.rowLabel}>
          {icon && <span style={{ color: '#9AA4B2', display: 'inline-flex', flexShrink: 0 }}><PIc name={icon} size={15} /></span>}
          <span>{label}</span>
        </span>
      )}
      <span style={p.rowVal}>{children}</span>
    </div>
  );
}
function EditRow({ label, children }) {
  return <div style={{ marginBottom: 10 }}><label style={p.editLabel}>{label}</label>{children}</div>;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────
const EVENT_META = {
  lead_submitted:            { label: 'Lead Submitted',            color: '#9CA3AF' },
  ghl_contact_created:       { label: 'CRM Contact Created',       color: '#9CA3AF' },
  closebot_engaged:          { label: 'CloseBot Engaged',          color: '#7C3AED' },
  booking_page_viewed:       { label: 'Booking Page Viewed',       color: '#3B82F6' },
  recommended_slot_shown:    { label: 'Recommended Slot Shown',    color: '#3B82F6' },
  recommended_slot_accepted: { label: 'Slot Recommendation Taken', color: '#16A34A' },
  recommended_slot_rejected: { label: 'Slot Recommendation Skipped', color: '#D97706' },
  slot_selected:             { label: 'Slot Selected',             color: '#3B82F6' },
  appointment_booked:        { label: 'Appointment Booked',        color: '#16A34A' },
  confirmation_email_sent:   { label: 'Confirmation Email Sent',   color: '#9CA3AF' },
  calendar_add_clicked:      { label: 'Calendar Add Clicked',      color: '#3B82F6' },
  cq_email_sent:             { label: 'CQ Sent',                   color: '#7C3AED' },
  cq_received:               { label: 'CQ Received',               color: '#15803D' },
  appointment_showed:        { label: 'Showed Up',                 color: '#16A34A' },
  appointment_no_show:       { label: 'No Show',                   color: '#DC2626' },
  opportunity_closed:        { label: 'Deal Closed',               color: '#7C3AED' },
};
const SOURCE_LABELS = { direct: 'Direct', facebook_lead: 'Facebook Lead', closebot: 'CloseBot', sms: 'SMS', email: 'Email', retargeting: 'Retargeting', calendly: 'Calendly', gohighlevel: 'GoHighLevel' };

// ─── HighLevel Conversation View ───────────────────────────────────────────────
function ConversationView({ messages, loading, onRefresh, bottomRef }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>HighLevel Conversation</div>
        <button onClick={onRefresh} style={{ fontSize: 12, fontWeight: 600, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFD3FF', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>↻ Refresh</button>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: '24px 0' }}>Loading conversation…</div>
      ) : messages.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: '24px 0' }}>No HighLevel conversation found for this contact.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map((m, i) => {
            const out = m.direction === 'outbound';
            return (
              <div key={m.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: out ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '82%', padding: '9px 12px', borderRadius: 14, fontSize: 13, lineHeight: 1.45,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  background: out ? '#2563EB' : '#fff', color: out ? '#fff' : '#0F172A',
                  border: out ? 'none' : '1px solid #E5E8EC',
                  borderBottomRightRadius: out ? 4 : 14, borderBottomLeftRadius: out ? 14 : 4,
                }}>
                  {m.body}
                </div>
                <div style={{ fontSize: 10.5, color: '#94A3B8', margin: '3px 4px 0' }}>
                  {m.type}{m.date ? ` · ${new Date(m.date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

// ─── iMessage Panel ───────────────────────────────────────────────────────────

function ImessagePanel({ messages, loading, text, sending, phone, onTextChange, onSend, bottomRef }) {
  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  if (!phone) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
        No phone number on record for this lead.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 300 }}>
      {/* Phone label */}
      <div style={{ padding: '8px 16px 4px', fontSize: 11, color: '#9CA3AF', borderBottom: '1px solid #F3F4F6' }}>
        iMessage · {phone}
      </div>

      {/* Message thread */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading && (
          <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: 20 }}>Loading…</div>
        )}
        {!loading && messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: 20 }}>
            No messages yet. Send one below.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.guid || i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.isFromMe ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '76%',
              padding: '8px 12px',
              borderRadius: m.isFromMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: m.isFromMe ? '#0057FF' : '#F0F0F0',
              color: m.isFromMe ? '#fff' : '#111827',
              fontSize: 13,
              lineHeight: 1.45,
              wordBreak: 'break-word',
            }}>
              {m.text}
            </div>
            <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2, marginLeft: 2, marginRight: 2 }}>
              {fmtTime(m.dateCreated)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={text}
          onChange={e => onTextChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder="iMessage…"
          rows={1}
          style={{
            flex: 1, resize: 'none', border: '1px solid #E2E8F0', borderRadius: 18,
            padding: '7px 12px', fontSize: 13, fontFamily: 'inherit',
            outline: 'none', lineHeight: 1.4, maxHeight: 80, overflowY: 'auto',
          }}
        />
        <button
          onClick={onSend}
          disabled={!text.trim() || sending}
          style={{
            width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: text.trim() ? 'pointer' : 'default',
            background: text.trim() ? '#0057FF' : '#E2E8F0', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <svg width="14" height="14" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function TimelineView({ events, loading, bookingSource }) {
  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Loading timeline…</div>;
  return (
    <div style={{ padding: '16px 20px' }}>
      {bookingSource && <div style={{ marginBottom: 18 }}><div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 6, letterSpacing: '.4px', fontWeight: 600 }}>BOOKING SOURCE</div><div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: '#F0F4FF', border: '1px solid #C7D7F8', fontSize: 13, fontWeight: 600, color: '#1D4ED8' }}>{SOURCE_LABELS[bookingSource] || bookingSource}</div></div>}
      {events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9CA3AF', fontSize: 13 }}>No events recorded yet.<br /><span style={{ fontSize: 12 }}>Events appear as the lead interacts with your system.</span></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {events.map((ev, i) => {
            const meta = EVENT_META[ev.event_type] || { label: ev.event_type.replace(/_/g, ' '), color: '#9CA3AF' };
            const ts = new Date(ev.created_at);
            const isLast = i === events.length - 1;
            const detail = ev.event_data?.slot ? new Date(ev.event_data.slot).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ev.event_data?.source ? ev.event_data.source.replace(/_/g, ' ') : ev.event_data?.note || null;
            return (
              <div key={ev.id} style={{ display: 'flex', gap: 14 }}>
                <div style={{ width: 16, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                  {!isLast && <div style={{ width: 1, flex: 1, background: '#E5E7EB', marginTop: 4 }} />}
                </div>
                <div style={{ flex: 1, paddingBottom: isLast ? 4 : 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', lineHeight: 1.3 }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                    {ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    {detail && <span style={{ marginLeft: 6, color: '#6B7280' }}>· {detail}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QBBtn({ variant, onClick, children, disabled }) {
  const [hover, setHover] = useState(false);
  const vs = {
    success:  { color: '#1A7E24', bg: '#E3F4E5', hoverBg: '#C3E6C5', border: '#A8D5AA' },
    warning:  { color: '#92400E', bg: '#FEF3C7', hoverBg: '#FDE68A', border: '#FCD34D' },
    danger:   { color: '#C23934', bg: '#FDECEA', hoverBg: '#FFCDD2', border: '#EF9A9A' },
    primary:  { color: '#0077C5', bg: '#E0EFF9', hoverBg: '#B3D4EE', border: '#90CAF9' },
    cq:       { color: '#5C35A8', bg: '#EEE9FA', hoverBg: '#DDD5F7', border: '#C5B8F0' },
    pitch:    { color: '#1A7E24', bg: '#E3F4E5', hoverBg: '#C3E6C5', border: '#A8D5AA' },
    followup: { color: '#374151', bg: '#F3F4F6', hoverBg: '#E5E7EB', border: '#D1D5DB' },
  }[variant];
  return <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 3, border: `1px solid ${vs.border}`, color: vs.color, background: hover ? vs.hoverBg : vs.bg, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background .15s', whiteSpace: 'nowrap', opacity: disabled ? 0.5 : 1 }}>{children}</button>;
}

// ─── Page styles ──────────────────────────────────────────────────────────────
const s = {
  page: { display: 'flex', height: '100vh', overflow: 'hidden', background: '#F4F5F7', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },

  // White sidebar
  sidebar:          { width: 210, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' },
  sideLogoWrap:     { padding: '20px 16px 16px', borderBottom: '1px solid #E2E8F0' },
  sideLogoRow:      { display: 'flex', alignItems: 'center', gap: 9 },
  sideLogoIcon:     { width: 30, height: 30, borderRadius: 8, background: '#0057FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 },
  sideLogoText:     { fontWeight: 700, fontSize: 14, color: '#0F172A', letterSpacing: '-0.2px' },
  sideNav:          { flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' },
  sideNavItem:      { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 7, fontSize: 13, fontWeight: 500, color: '#475569', textDecoration: 'none', transition: 'all .15s' },
  sideNavItemActive:{ background: '#EFF6FF', color: '#0057FF', fontWeight: 600 },
  sideBottom:       { borderTop: '1px solid #E2E8F0', padding: '8px 8px 16px' },
  sideHelpRow:      { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, cursor: 'pointer' },
  sideUserRow:      { display: 'flex', alignItems: 'center', gap: 9, padding: '10px 10px', borderRadius: 7, cursor: 'pointer', marginTop: 2 },
  sideUserAvatar:   { width: 30, height: 30, borderRadius: '50%', background: '#0057FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },

  // Main
  main:      { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  topBar:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', flexShrink: 0, gap: 16 },
  topTitle:  { fontSize: 20, fontWeight: 700, color: '#0F172A' },
  topDate:   { fontSize: 13, color: '#64748B', fontWeight: 400, cursor: 'default' },
  topNavArrow:{ background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B', fontSize: 14, fontFamily: 'inherit', padding: 0 },
  topActions:{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  searchInput:{ padding: '8px 12px 8px 32px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, color: '#0F172A', background: '#FAFBFD', fontFamily: 'inherit', outline: 'none', width: 260 },
  topBtn:    { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6, border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#475569', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' },
  topBtnPrimary:{ padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', background: '#0057FF', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  body:      { flex: 1, padding: '20px 24px', overflowY: 'auto' },
  headerArea:  { flexShrink: 0, padding: '20px 24px 12px', borderBottom: '1px solid #EDEFF2', background: '#F4F5F7' },
  tableScroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 24px 24px' },
  demoBanner:{ background: '#FFFBF0', border: '1px solid #F5A623', borderLeft: '4px solid #F5A623', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#7D4E00', marginBottom: 16 },

  // Stats — one connected row
  statsCard:     { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, display: 'flex', marginBottom: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.04)' },
  statCell:      { flex: 1, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 },
  statIconCircle:{ width: 42, height: 42, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statNum:       { fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1, marginBottom: 3 },
  statLabel:     { fontSize: 12, color: '#6B7280', fontWeight: 500 },

  // Next Up
  nextUp:         { background: '#F0F7FF', border: '1px solid #BFDBFE', borderLeft: '4px solid #2563EB', borderRadius: 10, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20 },
  nextUpTimeCol:  { flexShrink: 0, minWidth: 110 },
  nextUpLabel:    { fontSize: 10, fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 4 },
  nextUpTime:     { fontSize: 36, fontWeight: 800, color: '#111827', lineHeight: 1 },
  nextUpAMPM:     { fontSize: 18, fontWeight: 500 },
  nextUpIn:       { fontSize: 13, color: '#2563EB', fontWeight: 600, marginTop: 4 },
  nextUpDivider:  { width: 1, height: 54, background: '#BFDBFE', flexShrink: 0 },
  nextUpAvatar:   { width: 46, height: 46, borderRadius: '50%', background: '#2563EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 },
  nextUpInfo:     { flex: 1, minWidth: 0 },
  nextUpName:     { fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 2 },
  nextUpSub:      { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  nextUpRep:      { fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center' },
  nextUpActions:  { display: 'flex', gap: 8, flexShrink: 0 },
  nextUpBtnOutline:{ padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: '1.5px solid #2563EB', background: '#fff', color: '#2563EB', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  nextUpBtnFill:   { padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  // Filters
  filterBar:         { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  filterPillActive:  { padding: '7px 16px', borderRadius: 6, background: '#2563EB', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' },
  filterPillOutline: { padding: '7px 16px', borderRadius: 6, background: '#fff', color: '#374151', border: '1px solid #E5E7EB', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  filterPillBadge:   { background: 'rgba(255,255,255,.3)', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 },
  filterSelect:      { appearance: 'none', WebkitAppearance: 'none', padding: '7px 28px 7px 12px', border: '1px solid #E5E7EB', borderRadius: 6, background: '#fff', fontSize: 13, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' },
  filterMoreBtn:     { padding: '7px 12px', background: 'none', border: 'none', fontSize: 13, color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  // Table
  tableCard:  { background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.04)' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:         { textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#9CA3AF', fontSize: 11, letterSpacing: '.4px', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB', textTransform: 'uppercase' },
  tr:         { borderBottom: '1px solid #F3F4F6', transition: 'background .1s' },
  td:         { padding: '14px 14px', verticalAlign: 'middle' },
  tableEmpty: { textAlign: 'center', padding: 56, color: '#9CA3AF', fontSize: 14 },
  iconBtn:    { width: 30, height: 30, borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'background .12s, border-color .12s' },
};

// ─── Panel styles ─────────────────────────────────────────────────────────────
const p = {
  panelHdr:      { display: 'flex', flexDirection: 'column', padding: '22px 20px 18px', borderBottom: '1px solid #EBEBEB', flexShrink: 0, background: '#fff' },
  avatar:        { width: 54, height: 54, borderRadius: '50%', background: '#2563EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 700, flexShrink: 0 },
  clientName:    { fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 2, letterSpacing: '-0.2px' },
  statusBadge:   { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  closeBtn:      { background: 'none', border: 'none', fontSize: 18, color: '#9CA3AF', cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1, flexShrink: 0 },

  tabBar:        { display: 'flex', borderBottom: '1px solid #EBEBEB', flexShrink: 0, background: '#FAFAFA' },
  panelTab:      { flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 500, color: '#6B7280', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' },
  panelTabActive:{ color: '#2563EB', borderBottom: '2px solid #2563EB', fontWeight: 600 },

  scrollBody:    { flex: 1, overflowY: 'auto', padding: '16px 16px 28px', background: '#F4F5F7' },
  loadingMsg:    { textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 14 },

  // Quick actions section
  quickActions:  { background: '#fff', border: '1px solid #EAECEF', borderRadius: 14, padding: '16px 18px', marginBottom: 14 },

  section:       { background: '#fff', border: '1px solid #EAECEF', borderRadius: 14, padding: '16px 18px', marginBottom: 14 },
  sectionTitle:  { fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 14 },

  // Quick action buttons
  qaGrid:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  qaSpan:        { gridColumn: '1 / -1' },
  qaBtn:         { width: '100%', padding: '12px 10px', fontSize: 13, fontWeight: 600, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, boxSizing: 'border-box' },
  hdrBtn:        { flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 6px', fontSize: 12.5, fontWeight: 600, color: '#334155', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' },
  card:          { background: '#fff', border: '1px solid #EAECEF', borderRadius: 14, padding: '16px 18px', marginBottom: 14 },

  editBtn:       { fontSize: 12, fontWeight: 500, color: '#0077C5', background: 'transparent', border: '1px solid #B3D4EE', borderRadius: 3, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit' },
  saveEditBtn:   { fontSize: 12, fontWeight: 600, color: '#fff', border: 'none', borderRadius: 3, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' },
  cancelEditBtn: { fontSize: 12, fontWeight: 400, color: '#4A5568', background: '#F5F6F7', border: '1px solid #C8CDD2', borderRadius: 3, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' },

  fieldGroupLabel:{ fontSize: 10, fontWeight: 700, color: '#B0B8C4', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 },
  row:           { display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 11, marginBottom: 11, fontSize: 14, borderBottom: '1px solid #F1F3F5' },
  rowLabel:      { display: 'inline-flex', alignItems: 'center', gap: 8, color: '#6B7280', width: 112, flexShrink: 0, fontSize: 13, whiteSpace: 'nowrap' },
  rowVal:        { color: '#1A2B3C', flex: 1, minWidth: 0, fontWeight: 500 },
  link:          { color: '#2563EB', textDecoration: 'none', fontSize: 14 },
  val:           { fontSize: 13, color: '#1A2B3C' },
  input:         { width: '100%', padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' },
  editLabel:     { display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 },

  emailToggleBtn:{ marginTop: 12, padding: '7px 14px', background: '#F5F6F7', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#0077C5', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  emailBox:      { marginTop: 12, background: '#F8F9FA', border: '1px solid #D8DCE0', borderRadius: 4, padding: '14px 14px 12px' },
  emailHeader:   { fontSize: 12, fontWeight: 700, color: '#1A2B3C', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.4px' },
  emailField:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  emailLabel:    { fontSize: 11, color: '#6B7280', width: 44, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', flexShrink: 0 },
  emailInput:    { flex: 1, padding: '6px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none' },
  emailBody:     { width: '100%', padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' },
  actionBtn:     { padding: '8px 18px', color: '#fff', border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .2s' },
  cancelBtn:     { padding: '8px 14px', background: '#fff', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#4A5568', cursor: 'pointer', fontFamily: 'inherit' },
  notesArea:     { width: '100%', padding: '8px 10px', border: '1px solid #C8CDD2', borderRadius: 3, fontSize: 13, color: '#1A2B3C', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 },
  brandChip:     { padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 20, border: '1px solid #C8CDD2', background: '#F5F6F7', color: '#4A5568', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  brandChipActive:{ padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 20, border: '1px solid #2563EB', background: '#2563EB', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  brandChipX:    { padding: '2px 6px', fontSize: 14, lineHeight: 1, background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontFamily: 'inherit', marginLeft: -2 },
  addBrandBtn:   { padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 20, border: '1px dashed #C8CDD2', background: 'transparent', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' },
  brandCard:     { background: '#F8F9FA', border: '1px solid #E5E7EB', borderRadius: 4, padding: '14px 14px 12px', marginBottom: 12 },
};

export { CRMPanel, computeLeadScore, scoreTier, SourceBadge, STATUS_META };
