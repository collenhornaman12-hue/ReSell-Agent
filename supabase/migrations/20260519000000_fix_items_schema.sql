-- Fix identification_confidence type (NUMERIC → TEXT)
ALTER TABLE items
  ALTER COLUMN identification_confidence TYPE TEXT
  USING identification_confidence::TEXT;

ALTER TABLE items
  ADD CONSTRAINT items_identification_confidence_check
  CHECK (identification_confidence IN ('High','Medium','Low'));

-- Fix price_confidence type (NUMERIC → TEXT)
ALTER TABLE items
  ALTER COLUMN price_confidence TYPE TEXT
  USING price_confidence::TEXT;

ALTER TABLE items
  ADD CONSTRAINT items_price_confidence_check
  CHECK (price_confidence IN ('High','Medium','Low'));

-- Add missing columns
ALTER TABLE items ADD COLUMN IF NOT EXISTS model_number TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS condition_notes TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_complete BOOLEAN DEFAULT true;
ALTER TABLE items ADD COLUMN IF NOT EXISTS keywords TEXT[];
ALTER TABLE items ADD COLUMN IF NOT EXISTS date_added TIMESTAMPTZ DEFAULT now();
ALTER TABLE items ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS ebay_search_query TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS price_override_reason TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS price_drop_count INTEGER DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS last_price_drop_date TIMESTAMPTZ;
ALTER TABLE items ADD COLUMN IF NOT EXISTS ebay_listing_id TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS description_short TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS description_long TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS sale_price NUMERIC;
ALTER TABLE items ADD COLUMN IF NOT EXISTS buyer_handle TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS buyer_platform TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS shipping_label_url TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS date_listed TIMESTAMPTZ;
ALTER TABLE items ADD COLUMN IF NOT EXISTS date_sold TIMESTAMPTZ;

-- Fix status CHECK to match full lifecycle
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_status_check;
ALTER TABLE items ADD CONSTRAINT items_status_check
  CHECK (status IN (
    'PendingReview','ReadyToList','Listed',
    'SoldPendingApproval','Sold','Archived'
  ));

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_items_batch_id ON items(batch_id);
CREATE INDEX IF NOT EXISTS idx_items_created_by_date
  ON items(created_by, date_added DESC);
