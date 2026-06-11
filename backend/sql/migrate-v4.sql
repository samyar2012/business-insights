CREATE TABLE IF NOT EXISTS action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  scan_id UUID REFERENCES business_scans(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  source TEXT DEFAULT 'scan',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT action_items_status_check CHECK (status IN ('todo', 'in_progress', 'done')),
  CONSTRAINT action_items_priority_check CHECK (priority IN ('low', 'medium', 'high'))
);

CREATE INDEX IF NOT EXISTS idx_action_items_user_id ON action_items (user_id);
CREATE INDEX IF NOT EXISTS idx_action_items_scan_id ON action_items (scan_id);
CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items (user_id, status);
