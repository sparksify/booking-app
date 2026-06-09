/**
 * Permission registry — the single source of truth for granular member
 * capabilities. Admins implicitly have every permission; members get
 * MEMBER_DEFAULTS merged with any per-member overrides stored on
 * team_members.permissions (jsonb).
 *
 * Shared by the server (enforcement) and the Settings UI (capability matrix),
 * so labels and keys never drift.
 */

export const PERMISSION_GROUPS = [
  {
    group: 'Pages',
    items: [
      { key: 'page_dashboard',   label: 'Dashboard',   desc: 'Analytics & executive summary' },
      { key: 'page_leads',       label: 'Leads' },
      { key: 'page_prospecting', label: 'Prospecting' },
      { key: 'page_meetings',    label: 'Meetings' },
      { key: 'page_cq',          label: 'CQ Recovery' },
      { key: 'page_nurture',     label: 'Nurture' },
      { key: 'page_settings',    label: 'Settings' },
    ],
  },
  {
    group: 'Data access',
    items: [
      { key: 'meetings_view_all', label: 'See all reps’ meetings',     desc: 'Off = only their own assigned meetings' },
      { key: 'cq_view_all',       label: 'See all reps’ CQ recovery',   desc: 'Off = only their own assigned leads' },
    ],
  },
  {
    group: 'Settings sections',
    items: [
      { key: 'settings_personal_calendar', label: 'Personal calendar',        desc: 'Create/edit their own booking page' },
      { key: 'settings_brand_calendars',   label: 'Brand calendars',          desc: 'Facebook-lead brand booking pages + routing' },
      { key: 'settings_availability',      label: 'Availability settings',    desc: 'Shared work hours, timezone, meeting length' },
      { key: 'settings_brand_pitches',     label: 'Brand pitches',            desc: 'Phone pitch scripts per brand' },
      { key: 'settings_branding',          label: 'Platform logo / branding', desc: 'Upload the main app logo' },
      { key: 'settings_workflows',         label: 'Workflow automations',     desc: 'GHL workflow mappings' },
      { key: 'settings_analytics_display', label: 'Analytics display toggles' },
      { key: 'settings_recent_bookings',   label: 'Recent bookings table' },
      { key: 'settings_team_members',      label: 'Team members' },
      { key: 'settings_imessage',          label: 'iMessage (BlueBubbles)' },
      { key: 'settings_permissions',       label: 'Permissions (manage roles & access)' },
    ],
  },
  {
    group: 'Actions',
    items: [
      { key: 'transfer_appointments', label: 'Transfer appointments to other reps' },
    ],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key));

/** Default capabilities granted to a Member (before per-member overrides). */
export const MEMBER_DEFAULTS = {
  page_dashboard:             true,
  page_leads:                 true,
  page_prospecting:           true,
  page_meetings:              true,
  page_cq:                    true,
  page_nurture:               true,
  page_settings:              true,
  meetings_view_all:          false,
  cq_view_all:                false,
  settings_personal_calendar: true,
  settings_brand_calendars:   false,
  settings_availability:      true,
  settings_brand_pitches:     true,
  settings_branding:          false,
  settings_workflows:         true,
  settings_analytics_display: false,
  settings_recent_bookings:   false,
  settings_team_members:      false,
  settings_imessage:          false,
  settings_permissions:       false,
  transfer_appointments:      true,
};

/**
 * Resolve the effective permission object for a user.
 * Admin → every key true. Member → defaults merged with stored overrides.
 */
export function resolvePermissions(role, stored) {
  if (role === 'admin') {
    const all = {};
    for (const k of ALL_PERMISSION_KEYS) all[k] = true;
    return all;
  }
  const out = { ...MEMBER_DEFAULTS };
  if (stored && typeof stored === 'object') {
    for (const k of ALL_PERMISSION_KEYS) {
      if (typeof stored[k] === 'boolean') out[k] = stored[k];
    }
  }
  return out;
}
