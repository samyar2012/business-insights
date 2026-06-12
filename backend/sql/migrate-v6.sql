CREATE TABLE IF NOT EXISTS business_research_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  search_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  website_scan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted_signals_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  score_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_research_profiles_business
  ON business_research_profiles (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_research_profiles_user
  ON business_research_profiles (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS research_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  provider TEXT NOT NULL,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_events_cache
  ON research_events (user_id, business_id, query, provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_events_user_day
  ON research_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS website_scan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_scan_events_business
  ON website_scan_events (business_id, created_at DESC);
