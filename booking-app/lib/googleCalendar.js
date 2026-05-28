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

// ─── Free/busy query ──────────────────────────────────────────────────────────

/**
 * Returns Google Calendar freebusy data for all active team members on a given date.
 *
 * @param {Array}  members   - team_members rows (must have google_access_token + google_refresh_token)
 * @param {string} dateStr   - "YYYY-MM-DD"
 * @param {string} timezone  - IANA timezone string, e.g. "America/Chicago"
 * @returns {Array}          - flat array of { start, end } busy intervals (ISO strings)
 */
export async function getBusyTimes(members, dateStr, timezone) {
  if (!members.length) return [];

  // Use the first member's token for the API call; freebusy accepts multiple calendar IDs
  const auth = makeOAuthClient({
    access_token: members[0].google_access_token,
    refresh_token: members[0].google_refresh_token,
  });

  const calendar = google.calendar({ version: 'v3', auth });

  // Build start/end in UTC from the local date
  const timeMin = new Date(`${dateStr}T00:00:00`).toISOString();
  const timeMax = new Date(`${dateStr}T23:59:59`).toISOString();

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: timezone,
      items: members.map(m => ({ id: m.calendar_id || m.email })),
    },
  });

  // Flatten all calendars' busy arrays into one list
  const allBusy = [];
  const cals = response.data.calendars || {};
  Object.values(cals).forEach(cal => {
    if (cal.busy) allBusy.push(...cal.busy);
  });

  return allBusy; // [{ start: ISO, end: ISO }, ...]
}

// ─── Slot generation ──────────────────────────────────────────────────────────

/**
 * Generates available time slots for a day, excluding busy windows + buffer.
 *
 * @param {object} settings - { workStart, workEnd, meetingDuration, bufferMinutes }
 * @param {Array}  busyTimes - [{ start, end }] from getBusyTimes
 * @param {string} dateStr  - "YYYY-MM-DD"
 * @returns {Array}         - [{ h, m, label }]
 */
export function generateSlots(settings, busyTimes, dateStr) {
  const { workStart, workEnd, meetingDuration, bufferMinutes } = settings;
  const stepMinutes = 15;
  const slots = [];

  for (let h = workStart; h < workEnd; h++) {
    for (let m = 0; m < 60; m += stepMinutes) {
      const slotStartMs = Date.parse(`${dateStr}T${pad(h)}:${pad(m)}:00`);
      const slotEndMs   = slotStartMs + meetingDuration * 60_000;

      // Clip to work hours
      const workEndMs = Date.parse(`${dateStr}T${pad(workEnd)}:00:00`);
      if (slotEndMs > workEndMs) continue;

      // Check against all busy intervals (with trailing buffer)
      const blocked = busyTimes.some(busy => {
        const busyStart = Date.parse(busy.start);
        const busyEnd   = Date.parse(busy.end) + bufferMinutes * 60_000;
        return slotStartMs < busyEnd && slotEndMs > busyStart;
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
 *
 * @param {object} member  - team_members row with OAuth tokens
 * @param {object} booking - { firstName, lastName, email, phone, date, h, m }
 * @param {object} settings - { meetingDuration, meetingTitle, timezone }
 * @returns {{ eventId: string, meetLink: string|null }}
 */
export async function createCalendarEvent(member, booking, settings) {
  const auth = makeOAuthClient({
    access_token: member.google_access_token,
    refresh_token: member.google_refresh_token,
  });

  const calendar = google.calendar({ version: 'v3', auth });

  const startMs  = Date.parse(`${booking.date}T${pad(booking.h)}:${pad(booking.m)}:00`);
  const endMs    = startMs + settings.meetingDuration * 60_000;
  const startISO = new Date(startMs).toISOString();
  const endISO   = new Date(endMs).toISOString();

  const event = await calendar.events.insert({
    calendarId: member.calendar_id || 'primary',
    conferenceDataVersion: 1,
    sendUpdates: 'all',
    requestBody: {
      summary: settings.meetingTitle,
      description: `Booked via booking page.\n\nLead: ${booking.firstName} ${booking.lastName}\nPhone: ${booking.phone || 'N/A'}`,
      start: { dateTime: startISO, timeZone: settings.timezone },
      end:   { dateTime: endISO,   timeZone: settings.timezone },
      attendees: [
        { email: booking.email, displayName: `${booking.firstName} ${booking.lastName}` },
        { email: member.email,  displayName: member.name, organizer: true },
      ],
      conferenceData: {
        createRequest: {
          requestId: `booking-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    },
  });

  const meetLink =
    event.data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null;

  return { eventId: event.data.id, meetLink };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(2, '0');
}
