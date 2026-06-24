-- Migration v7: Website crawler tables

CREATE TABLE IF NOT EXISTS website_crawl_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  start_url TEXT NOT NULL,
  normalized_domain TEXT NOT NULL,
  status TEXT NOT NULL,
  pages_discovered INTEGER NOT NULL DEFAULT 0,
  pages_crawled INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS website_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crawl_run_id UUID NOT NULL REFERENCES website_crawl_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  final_url TEXT,
  canonical_url TEXT,
  page_type TEXT,
  status_code INTEGER,
  title TEXT,
  meta_description TEXT,
  headings_json JSONB DEFAULT '[]'::jsonb,
  extracted_text TEXT,
  extracted_data_json JSONB DEFAULT '{}'::jsonb,
  content_hash TEXT,
  requires_browser BOOLEAN DEFAULT false,
  crawled_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(crawl_run_id, url)
);

CREATE TABLE IF NOT EXISTS business_web_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  crawl_run_id UUID REFERENCES website_crawl_runs(id) ON DELETE SET NULL,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  signals_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  scores_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS website_text_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  embedding JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(page_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_website_crawl_runs_user_id ON website_crawl_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_website_crawl_runs_business_id ON website_crawl_runs(business_id);
CREATE INDEX IF NOT EXISTS idx_website_crawl_runs_normalized_domain ON website_crawl_runs(normalized_domain);
CREATE INDEX IF NOT EXISTS idx_website_crawl_runs_created_at ON website_crawl_runs(created_at);

CREATE INDEX IF NOT EXISTS idx_website_pages_crawl_run_id ON website_pages(crawl_run_id);
CREATE INDEX IF NOT EXISTS idx_website_pages_user_id ON website_pages(user_id);
CREATE INDEX IF NOT EXISTS idx_website_pages_business_id ON website_pages(business_id);

CREATE INDEX IF NOT EXISTS idx_business_web_profiles_user_id ON business_web_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_business_web_profiles_business_id ON business_web_profiles(business_id);
CREATE INDEX IF NOT EXISTS idx_business_web_profiles_crawl_run_id ON business_web_profiles(crawl_run_id);
CREATE INDEX IF NOT EXISTS idx_business_web_profiles_created_at ON business_web_profiles(created_at);

CREATE INDEX IF NOT EXISTS idx_website_text_chunks_user_id ON website_text_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_website_text_chunks_business_id ON website_text_chunks(business_id);
CREATE INDEX IF NOT EXISTS idx_website_text_chunks_page_id ON website_text_chunks(page_id);

CREATE INDEX IF NOT EXISTS idx_website_text_chunks_fts ON website_text_chunks
  USING gin(to_tsvector('english', content));

ALTER TABLE business_research_profiles
  ADD COLUMN IF NOT EXISTS web_profile_json JSONB DEFAULT '{}'::jsonb;
