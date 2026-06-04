-- Migration 026: Multi-brand routing system
--
-- Each brand is a self-contained silo with its own:
--   - Booking URL (bookkanso.co/[slug])
--   - Booking page content
--   - Calendar event settings
--   - Facebook form IDs → GHL tag rules
--   - Assigned reps
--   - Weighted liquid-capital routing rules
--   - Round-robin counters (persisted so weighting survives restarts)

create table if not exists brands (
  id                  uuid        primary key default gen_random_uuid(),
  slug                text        unique not null,   -- URL key: 'wetfuel', 'gorilla-property'
  name                text        not null,          -- Display: 'WetFuel B2B Franchise'
  active              boolean     not null default true,

  -- ── Booking page content ───────────────────────────────────────────────────
  booking_headline    text,
  booking_subtitle    text,
  booking_description text,
  meeting_title       text        not null default '15-Minute Phone Call',
  meeting_duration    int         not null default 15,

  -- ── Calendar event settings ────────────────────────────────────────────────
  event_description   text,
  event_location      text,
  event_color         int,                           -- Google Calendar color ID (1-11)
  event_reminder_mins int         not null default 15,

  -- ── Facebook form IDs that belong to this brand ───────────────────────────
  -- Array of form ID strings, e.g. ['2100967397128522', '987654321']
  fb_form_ids         text[]      not null default '{}',

  -- ── GHL tags auto-applied when a lead arrives from this brand's forms ──────
  ghl_tags            text[]      not null default '{}',

  -- ── Reps assigned to this brand (rep emails, in fallback round-robin order) ─
  rep_emails          text[]      not null default '{}',

  -- ── Routing rules per liquid capital tier ─────────────────────────────────
  -- Keys: 't25_50' | 't50_75' | 't75_150' | 't150_500' | 't500_plus' | 't_null'
  -- Value: array of { email, weight } objects, OR the string "round_robin"
  -- Example:
  --   {
  --     "t500_plus": [{"email":"steve@sparksify.com","weight":5},{"email":"john@acme.com","weight":1}],
  --     "t150_500":  [{"email":"steve@sparksify.com","weight":6},{"email":"john@acme.com","weight":4}],
  --     "t75_150":   [{"email":"steve@sparksify.com","weight":7},{"email":"john@acme.com","weight":3}],
  --     "t50_75":    [{"email":"steve@sparksify.com","weight":10}],
  --     "t25_50":    [{"email":"steve@sparksify.com","weight":10}],
  --     "t_null":    "round_robin"
  --   }
  routing_rules       jsonb       not null default '{}',

  -- ── Persistent round-robin counters per tier ───────────────────────────────
  -- Incremented atomically on each booking. Reset is automatic (counter % totalWeight).
  -- Example: { "t500_plus": 17, "t150_500": 42, "t_null": 8 }
  routing_counters    jsonb       not null default '{}',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Also add brand_slug to the leads table so we know which brand generated a lead
alter table leads
  add column if not exists brand_slug text default null;

-- Index for fast form-ID lookup (used on every Facebook webhook)
create index if not exists brands_fb_form_ids_gin
  on brands using gin(fb_form_ids);

-- Index for slug lookup (used on every booking page load)
create index if not exists brands_slug_idx
  on brands (slug);
