import { google } from 'googleapis';

// ─── OAuth client ─────────────────────────────────────────────────────────────

function makeOAuthClient(tokens) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
  );
  if (tokens) client.setCredentials(tokens);
  return client;
}

// ─── Timezone helpers ─────────────────────────────────────────────────────────

/**
 * Returns the UTC offset in minutes for a given date in a timezone.
 * e.g. America/Chicago in CDT returns -300 (UTC-5)
 */
function getOffsetMinutes(dateStr, timezone) {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const str = probe.toLocaleString('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' });
  const match = str.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return 0;
  const sign  = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const mins  = parseInt(match[3] || '0', 10);
  return sign * (hours * 60 + mins);
}

/**
 * Converts a local date + hour + minute in a timezone to UTC milliseconds.
 * offsetMins is the UTC offset in minutes (e.g. -300 for UTC-5).
 */
function localToUTCMs(dateStr, h, m, offsetMins) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, h, m, 0) - offsetMins * 60_000;
}

// ─── Free/busy query ──────────────────────────────────────────────────────────

/**
 * Returns Google Calendar freebusy data for all active team members on a given date.
 * Queries the correct UTC range for the local date in the given timezone.
 */
export async function getBusyTimes(members, dateStr, timezone) {
  if (!members.length) return [];

  const offsetMins = getOffsetMinutes(dateStr, timezone);
  const timeMin = new Date(localToUTCMs(dateStr,  0,  0, offsetMins)).toISOString();
  const timeMax = new Date(localToUTCMs(dateStr, 23, 59, offsetMins)).toISOString();

  const allBusy = [];

  // Query each member's calendar with their own auth token.
  // Using a shared token with 'primary' only checks one person's calendar —
  // members on different Google domains must each be queried independently.
  for (const member of members) {
    try {
      const auth = makeOAuthClient({
        access_token:  member.google_access_token,
        refresh_token: member.google_refresh_token,
      });
      const calendar = google.calendar({ version: 'v3', auth });

      // Each member authenticates with their own token, so 'primary' correctly
      // refers to that member's primary calendar — no ambiguity.
      const calendarId = member.calendar_id || 'primary';

      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin,
          timeMax,
          timeZone: timezone,
          items: [{ id: calendarId }],
        },
      });

      const cals = response.data.calendars || {};
      Object.values(cals).forEach(cal => {
        if (cal.busy) allBusy.push(...cal.busy);
      });
    } catch (err) {
      console.error(`[getBusyTimes] error querying ${member.email}:`, err.message);
    }
  }

  return allBusy; // [{ start: ISO, end: ISO }, ...]
}

// ─── Slot generation ──────────────────────────────────────────────────────────

/**
 * Generates available time slots for a day, excluding busy windows + buffer.
 * All comparisons are done in UTC to avoid timezone offset bugs.
 */
export function generateSlots(settings, busyTimes, dateStr) {
  const { workStart, workEnd, meetingDuration, bufferMinutes, timezone } = settings;
  const stepMinutes = 15;
  const slots = [];

  const offsetMins = getOffsetMinutes(dateStr, timezone || 'America/Chicago');

  // Pre-parse busy intervals to UTC ms
  const busyParsed = busyTimes.map(b => ({
    start: Date.parse(b.start),
    end:   Date.parse(b.end),
  }));

  const workEndMs = localToUTCMs(dateStr, workEnd, 0, offsetMins);

  for (let h = workStart; h < workEnd; h++) {
    for (let m = 0; m < 60; m += stepMinutes) {
      const slotStartMs = localToUTCMs(dateStr, h, m, offsetMins);
      const slotEndMs   = slotStartMs + meetingDuration * 60_000;

      // Clip to work hours
      if (slotEndMs > workEndMs) continue;

      // Check against all busy intervals (with trailing buffer)
      const blocked = busyParsed.some(busy => {
        const busyEnd = busy.end + bufferMinutes * 60_000;
        return slotStartMs < busyEnd && slotEndMs > busy.start;
      });

      if (!blocked) {
        const p  = h >= 12 ? 'PM' : 'AM';
        const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
        slots.push({ h, m, label: `${dh}:${pad(m)} ${p}` });
      }
    }
  }

  return slots;
}

// ─── Event creation ───────────────────────────────────────────────────────────

/**
 * Creates a Google Calendar event with a Meet link and invites the lead.
 */
export async function createCalendarEvent(member, booking, settings) {
  const auth = makeOAuthClient({
    access_token:  member.google_access_token,
    refresh_token: member.google_refresh_token,
  });

  const calendar = google.calendar({ version: 'v3', auth });

  // Build local datetime strings — Google interprets these using the timeZone field
  const startDT   = `${booking.date}T${pad(booking.h)}:${pad(booking.m)}:00`;
  const totalMins = booking.h * 60 + booking.m + settings.meetingDuration;
  const endDT     = `${booking.date}T${pad(Math.floor(totalMins / 60))}:${pad(totalMins % 60)}:00`;

  // Build description from template or fall back to a sensible default
  const description = buildEventDescription(settings, booking);

  // Build reminder overrides
  const reminderMins = settings.eventReminderMins ?? 15;
  const reminders = {
    useDefault: false,
    overrides: [
      { method: 'email',  minutes: reminderMins },
      { method: 'popup',  minutes: 10 },
    ],
  };

  const requestBody = {
    summary:  settings.meetingTitle,
    description,
    start: { dateTime: startDT, timeZone: settings.timezone },
    end:   { dateTime: endDT,   timeZone: settings.timezone },
    attendees: [
      { email: booking.email, displayName: `${booking.firstName} ${booking.lastName}` },
      { email: member.email,  displayName: member.name, organizer: true },
    ],
    reminders,
    conferenceData: {
      createRequest: {
        requestId: `booking-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };

  // Optional fields
  if (settings.eventLocation) requestBody.location = settings.eventLocation;
  if (settings.eventColor)    requestBody.colorId  = String(settings.eventColor);

  const event = await calendar.events.insert({
    calendarId: member.calendar_id || 'primary',
    conferenceDataVersion: 1,
    sendUpdates: 'all',
    requestBody,
  });

  const meetLink =
    event.data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null;

  return { eventId: event.data.id, meetLink };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Builds the Google Calendar event description.
 * If settings.eventDescription is set, substitutes template variables.
 * Otherwise falls back to a sensible default with all lead info.
 *
 * Available variables: {name} {first_name} {last_name} {phone} {email}
 *                      {date} {time} {investment_level} {meeting_title}
 */
function buildEventDescription(settings, booking) {
  const template = settings.eventDescription;

  // Build a local datetime string for display (server runs in UTC so use explicit parts)
  const dateStr = (() => {
    const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    // booking.date is 'YYYY-MM-DD'; booking.h/m are local hours
    const [y, mo, d] = booking.date.split('-').map(Number);
    const probe = new Date(y, mo - 1, d);
    return `${days[probe.getDay()]}, ${months[mo - 1]} ${d}, ${y}`;
  })();

  const timeStr = (() => {
    const p  = booking.h >= 12 ? 'PM' : 'AM';
    const dh = booking.h > 12 ? booking.h - 12 : booking.h === 0 ? 12 : booking.h;
    return `${dh}:${pad(booking.m)} ${p}`;
  })();

  const vars = {
    '{name}':             `${booking.firstName || ''} ${booking.lastName || ''}`.trim(),
    '{first_name}':       booking.firstName       || '',
    '{last_name}':        booking.lastName        || '',
    '{phone}':            booking.phone           || 'N/A',
    '{email}':            booking.email           || 'N/A',
    '{date}':             dateStr,
    '{time}':             timeStr,
    '{investment_level}': booking.investmentLevel || 'Not specified',
    '{meeting_title}':    settings.meetingTitle   || '',
  };

  if (!template) {
    return (
      `${vars['{name}']} booked a ${settings.meetingTitle || 'call'}.\n\n` +
      `Phone: ${vars['{phone}']}\n` +
      `Email: ${vars['{email}']}\n` +
      `Investment Level: ${vars['{investment_level}']}\n\n` +
      `Booked via FranchiseBook.`
    );
  }

  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), v),
    template
  );
}
