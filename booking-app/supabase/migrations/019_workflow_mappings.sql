-- 019_workflow_mappings.sql
-- Adds workflow_mappings JSONB column to settings table.
-- Stores per-action, per-rep GHL workflow IDs:
--
-- {
--   "send_cq": {
--     "<ghl_user_id>": "<workflow_id>"
--   },
--   "mark_no_show": {
--     "<ghl_user_id>": "<workflow_id>"
--   }
-- }

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS workflow_mappings JSONB DEFAULT '{}'::jsonb;
