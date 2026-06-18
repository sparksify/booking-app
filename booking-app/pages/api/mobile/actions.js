import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";
import { createClient } from "@supabase/supabase-js";

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_HEADERS = { Authorization: `Bearer ${process.env.GHL_API_KEY}`, Version: "2021-07-28", "Content-Type": "application/json" };
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function triggerWorkflow(contactId, workflowId) {
  if (!workflowId) throw new Error("No workflowId");
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}/workflow/${workflowId}`, { method: "POST", headers: GHL_HEADERS, body: JSON.stringify({}) });
  if (!res.ok) throw new Error(`GHL workflow failed: ${res.status}`);
  return { workflowId };
}
async function addTag(contactId, tag) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, { method: "POST", headers: GHL_HEADERS, body: JSON.stringify({ tags: [tag] }) });
  if (!res.ok) throw new Error(`GHL tag failed: ${res.status}`);
  return { tag };
}
async function updateAppt(contactId, status) {
  const r = await fetch(`${GHL_BASE}/contacts/${contactId}/appointments`, { headers: GHL_HEADERS });
  if (!r.ok) throw new Error(`fetch appts failed: ${r.status}`);
  const d = await r.json();
  const appts = (d.appointments || d.events || []).sort((a,b) => new Date(b.startTime)-new Date(a.startTime));
  if (!appts[0]) throw new Error("No appointments found");
  const u = await fetch(`${GHL_BASE}/calendars/events/appointments/${appts[0].id}`, { method: "PUT", headers: GHL_HEADERS, body: JSON.stringify({ appointmentStatus: status }) });
  if (!u.ok) throw new Error(`appt update failed: ${u.status}`);
  return { appointmentId: appts[0].id, status };
}

const HANDLERS = {
  showed:             async ({contactId}) => { const r = await updateAppt(contactId,"showed"); await addTag(contactId,"showed").catch(()=>{}); return r; },
  no_show:            async ({contactId}) => { const r = await updateAppt(contactId,"noshow"); await addTag(contactId,"no-show").catch(()=>{}); return r; },
  reschedule_needed:  async ({contactId}) => addTag(contactId,"reschedule-needed"),
  rescheduled:        async ({contactId}) => addTag(contactId,"rescheduled"),
  not_a_fit:          async ({contactId}) => addTag(contactId,"not-a-fit"),
  not_interested:     async ({contactId}) => addTag(contactId,"not-interested"),
  undo_disposition:   async ({contactId}) => { await Promise.allSettled(["showed","no-show","not-a-fit","not-interested","reschedule-needed","rescheduled"].map(t => fetch(`${GHL_BASE}/contacts/${contactId}/tags/${encodeURIComponent(t)}`,{method:"DELETE",headers:GHL_HEADERS}))); return {status:"cleared"}; },
  send_cq:            async ({contactId,payload}) => { const wf = payload.workflowId||process.env.GHL_WORKFLOW_SEND_CQ; return wf ? triggerWorkflow(contactId,wf) : addTag(contactId,"cq-requested"); },
  cq_received:        async ({contactId}) => addTag(contactId,"cq-received"),
  schedule_followup:  async ({contactId,payload}) => { await addTag(contactId,"follow-up-needed"); const wf=payload.workflowId||process.env.GHL_WORKFLOW_FOLLOWUP; if(wf) await triggerWorkflow(contactId,wf).catch(()=>{}); return {status:"follow-up-needed"}; },
  note:               async ({contactId,payload}) => { if(!payload.body?.trim()) throw new Error("Note body required"); const r=await fetch(`${GHL_BASE}/contacts/${contactId}/notes`,{method:"POST",headers:GHL_HEADERS,body:JSON.stringify({body:payload.body,userId:process.env.GHL_USER_ID_STEVE})}); if(!r.ok) throw new Error(`note failed: ${r.status}`); return {saved:true}; },
  sms:                async ({contactId,payload}) => { if(!payload.body?.trim()) throw new Error("body required"); const cr=await fetch(`${GHL_BASE}/conversations/search?contactId=${contactId}&locationId=${process.env.GHL_LOCATION_ID}`,{headers:GHL_HEADERS}); const cd=await cr.json(); const convId=cd.conversations?.[0]?.id; if(!convId) throw new Error("No conversation"); const r=await fetch(`${GHL_BASE}/conversations/messages`,{method:"POST",headers:GHL_HEADERS,body:JSON.stringify({type:"SMS",conversationId:convId,contactId,body:payload.body})}); if(!r.ok) throw new Error(`sms failed: ${r.status}`); return {sent:true}; },
  booking_link:       async ({contactId,payload}) => triggerWorkflow(contactId, payload.workflowId||process.env.GHL_WORKFLOW_BOOKING_LINK),
  workflow:           async ({contactId,payload}) => { if(!payload.workflowId) throw new Error("workflowId required"); return triggerWorkflow(contactId,payload.workflowId); },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });
  const { contactId, action, payload = {} } = req.body;
  if (!contactId) return res.status(400).json({ error: "contactId required" });
  if (!action || !HANDLERS[action]) return res.status(400).json({ error: `Invalid action "${action}". Valid: ${Object.keys(HANDLERS).join(", ")}` });
  console.log(`[mobile/actions] ${action} for ${contactId}`);
  let logId;
  try { const {data:r} = await supabase.from("actions_log").insert({contact_id_ghl:contactId,action_type:action,payload,fired_by:session.user?.email||"unknown",fired_at:new Date().toISOString(),success:null}).select().single(); logId=r?.id; } catch(e) { console.error("[actions] log:",e.message); }
  let result, success, responseBody;
  try { result = await HANDLERS[action]({contactId,payload}); success=true; responseBody=result; console.log(`[actions] ${action} OK`); }
  catch(err) { console.error(`[actions/${action}]:`,err.message); success=false; responseBody={error:err.message}; }
  if (logId) await supabase.from("actions_log").update({success,response_body:responseBody,resolved_at:new Date().toISOString()}).eq("id",logId).catch(()=>{});
  if (!success) return res.status(502).json({ error:"Action failed", detail:responseBody?.error, logId });
  return res.status(200).json({ success:true, action, contactId, result:responseBody, logId });
}
