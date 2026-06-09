import { Resend } from 'resend';

let _resend = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

/**
 * Sends a booking confirmation email to the lead.
 */
export async function sendConfirmationEmail({
  to,
  firstName,
  dateLabel,   // e.g. "Thu, May 28"
  timeLabel,   // e.g. "10:00 AM"
  meetLink,
  hostName,
  duration,
}) {
  const resend = getResend();

  if (!process.env.RESEND_API_KEY) return;
  await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to,
    subject: `Confirmed: Your ${duration}-min call on ${dateLabel} at ${timeLabel}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,system-ui,sans-serif">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;
              border:1px solid #e5e7eb;padding:40px 36px">

    <div style="width:56px;height:56px;background:#16a34a;border-radius:50%;
                display:flex;align-items:center;justify-content:center;margin-bottom:24px">
      <span style="color:#fff;font-size:26px;line-height:1">✓</span>
    </div>

    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 8px">
      You're confirmed, ${firstName}!
    </h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 28px">
      Your call has been booked. Here's a summary:
    </p>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;
                padding:20px 22px;margin-bottom:28px">
      <p style="margin:0 0 10px;font-size:15px;color:#111827">
        📅 <strong>${dateLabel}</strong>
      </p>
      <p style="margin:0 0 10px;font-size:15px;color:#111827">
        🕐 <strong>${timeLabel}</strong> · ${duration} min
      </p>
      ${meetLink
        ? `<p style="margin:0;font-size:15px;color:#111827">
             📹 <a href="${meetLink}" style="color:#1d4ed8;font-weight:500">Join video call</a>
           </p>`
        : `<p style="margin:0;font-size:15px;color:#111827">
             📹 Video link will be in your calendar invite
           </p>`
      }
    </div>

    <p style="font-size:13px;color:#9ca3af;margin:0">
      Looking forward to speaking with you!<br/>
      <strong style="color:#6b7280">${hostName}</strong>
    </p>
  </div>
</body>
</html>
    `.trim(),
  });
}

// ─── Internal notifications (to the team, not the lead) ───────────────────────

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function notifyShell({ tag, tagColor, heading, rows, ctaUrl, ctaLabel }) {
  const rowsHtml = rows
    .filter(r => r && r.value)
    .map(r => `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#6b7280;width:140px;vertical-align:top">${esc(r.label)}</td>
        <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600">${esc(r.value)}</td>
      </tr>`).join('');
  return `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f5f7;font-family:Inter,system-ui,sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:14px;border:1px solid #e5e7eb;padding:28px 30px">
    <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#fff;background:${tagColor};border-radius:20px;padding:4px 11px;margin-bottom:14px">${esc(tag)}</span>
    <h1 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 18px">${esc(heading)}</h1>
    <table style="width:100%;border-collapse:collapse;margin-bottom:${ctaUrl ? '22px' : '0'}">${rowsHtml}</table>
    ${ctaUrl ? `<a href="${ctaUrl}" style="display:inline-block;background:#2563eb;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;padding:11px 20px">${esc(ctaLabel || 'Open dashboard')}</a>` : ''}
  </div>
</body></html>`.trim();
}

async function sendNotification({ to, subject, html }) {
  const recipients = (Array.isArray(to) ? to : [to])
    .map(s => (s || '').trim()).filter(Boolean);
  if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL || !recipients.length) return;
  const resend = getResend();
  await resend.emails.send({ from: process.env.FROM_EMAIL, to: recipients, subject, html });
}

const DASH_URL = (process.env.NEXTAUTH_URL || 'https://www.bookkanso.co').replace(/\/$/, '');

/** Notify the team that a new Facebook lead came in (pre-booking). */
export async function sendLeadAlert({ to, firstName, lastName, email, phone, investmentLevel, source }) {
  const name = `${firstName || ''} ${lastName || ''}`.trim() || 'New lead';
  await sendNotification({
    to,
    subject: `New lead: ${name}`,
    html: notifyShell({
      tag: 'New Lead', tagColor: '#7c3aed',
      heading: `${name} just came in`,
      rows: [
        { label: 'Name', value: name },
        { label: 'Email', value: email },
        { label: 'Phone', value: phone },
        { label: 'Liquid capital', value: investmentLevel },
        { label: 'Source', value: source },
      ],
      ctaUrl: `${DASH_URL}/dashboard/leads`, ctaLabel: 'View leads',
    }),
  });
}

/** Notify the team that a new appointment was booked. */
export async function sendBookingAlert({ to, firstName, lastName, email, phone, investmentLevel, dateLabel, timeLabel, repName }) {
  const name = `${firstName || ''} ${lastName || ''}`.trim() || 'New booking';
  await sendNotification({
    to,
    subject: `New booking: ${name} — ${dateLabel} at ${timeLabel}`,
    html: notifyShell({
      tag: 'New Booking', tagColor: '#16a34a',
      heading: `${name} booked a call`,
      rows: [
        { label: 'When', value: `${dateLabel} at ${timeLabel}` },
        { label: 'Rep', value: repName },
        { label: 'Email', value: email },
        { label: 'Phone', value: phone },
        { label: 'Liquid capital', value: investmentLevel },
      ],
      ctaUrl: `${DASH_URL}/dashboard/bookings`, ctaLabel: 'View meetings',
    }),
  });
}
