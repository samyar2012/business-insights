-- Migration v9: structured fix-plan metadata on action items

ALTER TABLE action_items
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_action_items_metadata_gin
  ON action_items USING gin (metadata_json);
