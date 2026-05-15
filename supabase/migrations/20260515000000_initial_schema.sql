-- ⚠️ EXECUTION ORDER: bundles table must be created BEFORE items table (foreign key dependency)

-- Bundles Table (created first to allow items.bundle_id FK reference)
CREATE TABLE IF NOT EXISTS bundles (
  bundle_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_name            TEXT NOT NULL,
  item_ids               UUID[],
  bundle_price_ebay      DECIMAL(10,2),
  bundle_price_fb        DECIMAL(10,2),
  bundle_description_short TEXT,
  bundle_description_long  TEXT,
  status                 TEXT CHECK (status IN ('PendingReview','ReadyToList','Listed','SoldPendingApproval','Sold','Archived')) DEFAULT 'PendingReview',
  ebay_listing_id        TEXT,
  fb_listing_id          TEXT,
  rationale              TEXT,
  price_drop_count       INTEGER DEFAULT 0,
  last_price_drop_date   TIMESTAMPTZ,
  shipping_label_url     TEXT,
  sale_price             DECIMAL(10,2),
  date_created           TIMESTAMPTZ DEFAULT NOW(),
  date_listed            TIMESTAMPTZ,
  date_sold              TIMESTAMPTZ
);

-- Items Table
CREATE TABLE IF NOT EXISTS items (
  item_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photos                 TEXT[],
  item_name              TEXT NOT NULL,
  brand                  TEXT,
  model_number           TEXT,
  category               TEXT CHECK (category IN ('Toys & Hobbies','Sports Memorabilia','Collectibles','Entertainment Memorabilia','Books & Media','Other')),
  subcategory            TEXT,
  condition_raw          TEXT CHECK (condition_raw IN ('Mint','VeryGood','Good','Fair','Poor')),
  condition_ebay         TEXT,
  condition_notes        TEXT,
  is_complete            BOOLEAN DEFAULT true,
  keywords               TEXT[],
  identification_confidence TEXT CHECK (identification_confidence IN ('High','Medium','Low')),
  description_short      TEXT,
  description_long       TEXT,
  ebay_search_query      TEXT,
  ebay_comps_count       INTEGER DEFAULT 0,
  ebay_comp_price_median DECIMAL(10,2),
  ebay_comp_price_range  TEXT,
  ebay_price             DECIMAL(10,2),
  fb_price               DECIMAL(10,2),
  list_price_final       DECIMAL(10,2),
  price_confidence       TEXT CHECK (price_confidence IN ('High','Medium','Low')),
  price_override_reason  TEXT,
  listing_mode           TEXT CHECK (listing_mode IN ('Individual','Bundle')),
  bundle_id              UUID REFERENCES bundles(bundle_id),
  status                 TEXT CHECK (status IN ('PendingReview','ReadyToList','Listed','SoldPendingApproval','Sold','Archived')) DEFAULT 'PendingReview',
  ebay_listing_id        TEXT,
  fb_listing_id          TEXT,
  price_drop_count       INTEGER DEFAULT 0,
  last_price_drop_date   TIMESTAMPTZ,
  weight_oz              DECIMAL(10,2),
  dimensions_lxwxh_in    TEXT,
  buyer_platform         TEXT CHECK (buyer_platform IN ('eBay','Facebook')),
  buyer_handle           TEXT,
  sale_price             DECIMAL(10,2),
  shipping_carrier       TEXT,
  tracking_number        TEXT,
  shipping_label_url     TEXT,
  date_added             TIMESTAMPTZ DEFAULT NOW(),
  date_listed            TIMESTAMPTZ,
  date_sold              TIMESTAMPTZ,
  created_by             TEXT
);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
  message_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_ref_id         UUID NOT NULL,
  listing_ref_type       TEXT CHECK (listing_ref_type IN ('Item','Bundle')),
  platform               TEXT CHECK (platform IN ('eBay','Facebook')) DEFAULT 'eBay',
  direction              TEXT CHECK (direction IN ('Inbound','Outbound')),
  buyer_handle           TEXT,
  message_content        TEXT,
  agent_response         TEXT,
  requires_human         BOOLEAN DEFAULT false,
  resolved               BOOLEAN DEFAULT false,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  notification_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                   TEXT CHECK (type IN ('SaleReview','LowOffer','BuyerQuestion','ShipReminder','PriceReview','ListingError','PriceDropScheduled')),
  listing_ref_id         UUID NOT NULL,
  listing_ref_type       TEXT CHECK (listing_ref_type IN ('Item','Bundle')),
  message                TEXT,
  action_required        TEXT,
  status                 TEXT CHECK (status IN ('Pending','Approved','Rejected','Dismissed')) DEFAULT 'Pending',
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  resolved_at            TIMESTAMPTZ
);

-- Push Subscriptions Table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  subscription_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  endpoint               TEXT NOT NULL UNIQUE,
  p256dh_key             TEXT NOT NULL,
  auth_key               TEXT NOT NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  last_used              TIMESTAMPTZ
);

-- RLS Policies
ALTER TABLE bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users" ON bundles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON push_subscriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);
