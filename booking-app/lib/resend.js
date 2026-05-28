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
