# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

AI-powered resale automation: photos go in, eBay listings come out. Built on Claude Vision, Supabase, Cloudflare Workers, and the eBay API.

## Commands

### Frontend (root)
```bash
npm run dev          # Vite dev server (localhost:5173)
npm run build        # tsc + vite build
npm run setup-db     # Seed Supabase with sample data (reads .env)
```

### Workers (run from each worker directory)
```bash
cd workers/vision  && npm run dev     # port 8787
cd workers/pricing && npm run dev     # port 8788
# Future listing worker               # port 8789
cd workers/vision  && npm test        # vitest run
cd workers/pricing && npm test
# Run a single test file:
cd workers/vision && npx vitest run src/condition-map.test.ts
# Deploy a worker:
cd workers/vision && npm run deploy
```

## Architecture

### Data flow
```
Upload UI (Cloudinary)
  → POST /api/vision/trigger   (workers/vision, port 8787)
    → Claude Vision extracts item metadata
    → Supabase: items row inserted, status = PendingReview

  → POST /api/pricing/trigger  (workers/pricing, port 8788)
    → Claude web_search fetches eBay sold comps
    → Pricing formula applied (condition × completeness × .99 rounding)
    → Listing copy generated (title, description_short, description_long)
    → Bundle evaluation runs (rules below)
    → Supabase: items updated, status = ReadyToList (or Archived if < $4.99)

  → (Future) POST /api/listing/trigger (workers/listing, port 8789)
    → eBay Inventory/Offer API creates live listings
    → Supabase: items updated, status = Listed
```

### Item status lifecycle
`PendingReview` → `ReadyToList` → `Listed` → `SoldPendingApproval` → `Sold` (or `Archived` at any stage)

### Bundle rules (pricing worker)
- **Rule 1**: 3+ items share same `brand` AND `subcategory` → themed lot at 0.85× summed price
- **Rule 2**: 2+ items with `list_price_final ≤ $10` share `brand` OR `subcategory` → low-value lot
- Conflict resolution: item assigned to group with highest summed value
- Unbundled items → `listing_mode = Individual`

### Repo layout
```
/                      React frontend (Vite + Tailwind + Radix UI)
src/
  App.tsx              Router: /upload, /inventory, /review
  context/             InventoryContext wraps useInventory hook
  hooks/
    useInventory.ts    Supabase client, polling every 30s, updateItemStatus
    useCloudinaryUpload.ts  Batch upload → vision trigger pipeline
  components/
    upload/            BatchUpload, MobileUpload, UploadProgress, UploadPage
    dashboard/         NavBar, MetricsStrip, InventoryView, ItemsTable,
                       ItemDrawer, ReviewQueue

workers/
  vision/              Cloudflare Worker — Claude vision extraction
    src/vision.ts      extractItem() — Claude images API call
    src/condition-map.ts  condition_raw → eBay condition string (category-aware)
  pricing/             Cloudflare Worker — comp search + listing copy + bundles
    src/pricing.ts     priceItem(), generateBundleDescription(), roundToNearest99()

supabase/
  migrations/          SQL DDL — apply via Supabase SQL Editor
```

### Database schema (Supabase)
Primary tables: `items` (PK: `item_id` UUID), `bundles` (PK: `bundle_id` UUID), `messages`.

**`bundles` must be created/seeded before `items`** — items has a FK `bundle_id → bundles(bundle_id)`.

`category` CHECK constraint values: `Toys & Hobbies`, `Sports Memorabilia`, `Collectibles`, `Entertainment Memorabilia`, `Books & Media`, `Other`.

`condition_raw` CHECK values: `Mint`, `VeryGood`, `Good`, `Fair`, `Poor`.

### Environment variables
**Frontend** (`.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`

**Workers** (`workers/<name>/.dev.vars`): `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The listing worker will additionally need `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_REDIRECT_URI`, `EBAY_USER_REFRESH_TOKEN`, `EBAY_ENVIRONMENT`, the three business policy IDs (`EBAY_FULFILLMENT_POLICY_ID`, `EBAY_PAYMENT_POLICY_ID`, `EBAY_RETURN_POLICY_ID`), and `EBAY_MERCHANT_LOCATION_KEY`.

**setup-db script** reads `.env` directly — needs `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

The anon key is used in the frontend (`useInventory`); the service role key is used only in workers and `scripts/setup-db.mjs`.

### Vite proxy (all workers behind `/api/*`)
```
/api/vision  → localhost:8787
/api/pricing → localhost:8788
/api/listing → localhost:8789
```

### AI model
Both workers hardcode `MODEL = 'claude-sonnet-4-6'`. The pricing worker uses `web_search_20250305` (server-side Anthropic tool) for eBay comp research and has an intentional `sleep(15000)` between comp search and listing generation to avoid rate limits.

### Key conventions
- `batch_id` is a `crypto.randomUUID()` generated client-side in `useCloudinaryUpload` — it groups all items from one upload session and is passed through to both workers.
- Cloudinary public IDs follow the pattern `resell-agent/<batchId>/<itemName>/<index>`.
- eBay listing titles must be ≤ 80 chars. Banned words in all AI-generated copy: `rare`, `vintage`, `look`, `must see`.
- `roundToNearest99()` uses 0.30 as midpoint: `12.40 → 12.99`, `12.20 → 11.99`.
