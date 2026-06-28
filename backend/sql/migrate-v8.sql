-- Migration v8: business_model for rubric-based website scoring

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS business_model TEXT NOT NULL DEFAULT 'ecommerce_store';

UPDATE businesses
SET business_model = 'ecommerce_store'
WHERE business_model IS NULL OR business_model = '';

CREATE INDEX IF NOT EXISTS idx_businesses_business_model ON businesses (business_model);
