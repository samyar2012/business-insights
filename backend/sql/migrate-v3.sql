CREATE TABLE IF NOT EXISTS business_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  store_url TEXT,
  social_url TEXT,
  competitor_url TEXT,
  notes TEXT,
  overall_score INTEGER NOT NULL,
  store_score INTEGER NOT NULL,
  trust_score INTEGER NOT NULL,
  content_score INTEGER NOT NULL,
  competitor_score INTEGER NOT NULL,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_scans_user_id ON business_scans (user_id);
CREATE INDEX IF NOT EXISTS idx_business_scans_business_id ON business_scans (business_id);
CREATE INDEX IF NOT EXISTS idx_business_scans_created_at ON business_scans (created_at DESC);
