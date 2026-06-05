-- Migration 027: Add type column to brands table
-- Distinguishes personal calendars (one rep, no FB form) from brand calendars (multi-rep, FB form, routing)

alter table brands
  add column if not exists type text not null default 'brand'
    check (type in ('personal', 'brand'));

-- Personal calendars don't need routing_rules or fb_form_ids,
-- but we keep the same table structure for simplicity.
-- Personal calendars have exactly one rep in rep_emails (themselves).
