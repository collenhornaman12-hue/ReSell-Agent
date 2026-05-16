# Vision Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare Worker at `workers/vision/` that receives upload batches, calls Claude Sonnet 4.6 with URL-based image blocks for item identification, and writes structured records to the Supabase `items` table.

**Architecture:** The frontend `useCloudinaryUpload` hook sends a trigger payload (`batch_id` + items with Cloudinary photo URLs) to `POST /api/vision/trigger` on the Worker. The Worker returns `{ status: "queued" }` immediately and runs `processItems` via `ctx.waitUntil` — sequentially calling Claude for each item then inserting results into Supabase. A `GET /api/vision/status` endpoint lets the frontend poll progress by filtering recent Supabase rows by batch_id in the photo URLs. A new `useBatchPolling` hook polls every 5 seconds and stops when all items reach `PendingReview` status.

**Tech Stack:** Cloudflare Workers, `@anthropic-ai/sdk` (URL-based image blocks, model `claude-sonnet-4-6`), `@supabase/supabase-js` (service role key, bypasses RLS), Vite dev proxy (`/api` → `http://localhost:8787`), vitest for condition-map unit tests.

---

## File Map

**Created:**
- `workers/vision/package.json` — Worker npm project
- `workers/vision/tsconfig.json` — TypeScript config (no DOM lib, bundler resolution)
- `workers/vision/wrangler.toml` — Worker config with nodejs_compat flag
- `workers/vision/.dev.vars` — Local secrets (gitignored, never committed)
- `workers/vision/src/types.ts` — Shared interfaces: Env, TriggerPayload, VisionExtracted, ItemInsert, StatusItem
- `workers/vision/src/condition-map.ts` — 5.1A eBay condition mapping (pure functions)
- `workers/vision/src/condition-map.test.ts` — Unit tests for condition mapping
- `workers/vision/src/vision.ts` — Claude API call + JSON extraction + field validation
- `workers/vision/src/supabase.ts` — Supabase client factory, insertItem, fetchItemsByBatch
- `workers/vision/src/index.ts` — Worker entry: trigger + status endpoints
- `src/hooks/useBatchPolling.ts` — React hook polling `/api/vision/status` every 5s

**Modified:**
- `src/hooks/useCloudinaryUpload.ts` — uploadItem returns `UploadedPhoto[]`; triggerVisionPipeline includes items array
- `src/components/upload/MobileUpload.tsx` — session names `session_N` (was `Item N`); integrates useBatchPolling
- `vite.config.ts` — add `/api` proxy to wrangler dev port 8787

---

### Task 0: Update useCloudinaryUpload.ts — send items payload

**Files:**
- Modify: `src/hooks/useCloudinaryUpload.ts`

- [ ] **Step 1: Update `triggerVisionPipeline` to accept items array**

Replace the existing `triggerVisionPipeline` function (currently lines 67–77):

```ts
async function triggerVisionPipeline(
  batchId: string,
  items: Array<{ item_name_seed: string; photo_urls: string[] }>
): Promise<void> {
  const res = await fetch('/api/vision/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch_id: batchId, items }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Vision trigger failed (${res.status}): ${text}`)
  }
}
```

- [ ] **Step 2: Change `uploadItem` return type from `Promise<void>` to `Promise<UploadedPhoto[]>`**

Replace the entire `uploadItem` `useCallback` (currently lines 95–183) with:

```ts
const uploadItem = useCallback(
  async (
    batchId: string,
    itemName: string,
    files: File[]
  ): Promise<UploadedPhoto[]> => {
    const itemKey = `${batchId}/${itemName}`

    setBatch((prev) =>
      prev
        ? {
            ...prev,
            items: {
              ...prev.items,
              [itemKey]: {
                itemName,
                totalFiles: files.length,
                uploadedCount: 0,
                failedCount: 0,
                status: 'uploading',
                photos: [],
              },
            },
          }
        : prev
    )

    const photos: UploadedPhoto[] = []
    let failedCount = 0

    for (let i = 0; i < files.length; i++) {
      if (abortRef.current) break
      const file = files[i]
      const publicId = `resell-agent/${batchId}/${itemName}/${i}`
      try {
        const photo = await uploadFile(file, publicId)
        photos.push(photo)
        setBatch((prev) =>
          prev
            ? {
                ...prev,
                items: {
                  ...prev.items,
                  [itemKey]: {
                    ...prev.items[itemKey],
                    uploadedCount: photos.length,
                    photos: [...photos],
                  },
                },
              }
            : prev
        )
      } catch {
        failedCount++
        setBatch((prev) =>
          prev
            ? {
                ...prev,
                items: {
                  ...prev.items,
                  [itemKey]: {
                    ...prev.items[itemKey],
                    failedCount,
                  },
                },
              }
            : prev
        )
      }
    }

    setBatch((prev) =>
      prev
        ? {
            ...prev,
            items: {
              ...prev.items,
              [itemKey]: {
                ...prev.items[itemKey],
                status: failedCount === files.length ? 'error' : 'done',
                error: failedCount > 0 ? `${failedCount} file(s) failed` : undefined,
              },
            },
          }
        : prev
    )

    return photos
  },
  []
)
```

- [ ] **Step 3: Update `uploadBatch` to accumulate photo URLs and pass them to trigger**

Replace the entire `uploadBatch` `useCallback` (currently lines 185–220) with:

```ts
const uploadBatch = useCallback(
  async (items: Array<{ name: string; files: File[] }>): Promise<void> => {
    const batchId = initBatch()

    setBatch((prev) => (prev ? { ...prev, overallStatus: 'uploading' } : prev))

    const triggerItems: Array<{ item_name_seed: string; photo_urls: string[] }> = []

    for (const item of items) {
      if (abortRef.current) break
      const photos = await uploadItem(batchId, item.name, item.files)
      if (photos.length > 0) {
        triggerItems.push({
          item_name_seed: item.name,
          photo_urls: photos.map((p) => p.secureUrl),
        })
      }
    }

    setBatch((prev) => {
      if (!prev) return prev
      const allFailed = Object.values(prev.items).every((i) => i.status === 'error')
      return { ...prev, overallStatus: allFailed ? 'error' : 'done' }
    })

    setBatch((prev) => (prev ? { ...prev, triggerStatus: 'pending' } : prev))
    try {
      await triggerVisionPipeline(batchId, triggerItems)
      setBatch((prev) => (prev ? { ...prev, triggerStatus: 'success' } : prev))
    } catch (err) {
      setBatch((prev) =>
        prev
          ? {
              ...prev,
              triggerStatus: 'error',
              triggerError: err instanceof Error ? err.message : 'Unknown error',
            }
          : prev
      )
    }
  },
  [initBatch, uploadItem]
)
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd /home/collen/ReSell-Agent && npx tsc --noEmit
```
Expected: no errors in `src/hooks/useCloudinaryUpload.ts`

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCloudinaryUpload.ts
git commit -m "feat: uploadItem returns photos array; trigger includes items payload"
```

---

### Task 1: Fix Mode B session naming in MobileUpload.tsx

**Files:**
- Modify: `src/components/upload/MobileUpload.tsx:31`

- [ ] **Step 1: Change session name from `Item N` to `session_N`**

In `src/components/upload/MobileUpload.tsx` at line 31, replace:

```ts
const name = `Item ${sessionCounterRef.current++}`
```

with:

```ts
const name = `session_${sessionCounterRef.current++}`
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/upload/MobileUpload.tsx
git commit -m "fix: rename Mode B sessions to session_N for vision item_name_seed"
```

---

### Task 2: Add /api proxy to vite.config.ts

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add server proxy block**

Replace the full contents of `vite.config.ts` with:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
```

- [ ] **Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "feat: proxy /api to wrangler dev on port 8787"
```

---

### Task 3: Worker scaffold

**Files:**
- Create: `workers/vision/package.json`
- Create: `workers/vision/tsconfig.json`
- Create: `workers/vision/wrangler.toml`
- Create: `workers/vision/.dev.vars` (local secrets — never commit)

- [ ] **Step 1: Create `workers/vision/package.json`**

```json
{
  "name": "resell-agent-vision-worker",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.55.0",
    "@supabase/supabase-js": "^2.0.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0",
    "wrangler": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `workers/vision/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `workers/vision/wrangler.toml`**

```toml
name = "resell-agent-vision"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
```

- [ ] **Step 4: Create `workers/vision/.dev.vars`** (do NOT commit — fill in real values)

```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
SUPABASE_URL=your_supabase_project_url_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

- [ ] **Step 5: Ensure `.gitignore` covers `.dev.vars`**

Check the root `.gitignore`. If it does not already ignore `.dev.vars` files, add this line:

```
workers/**/.dev.vars
```

- [ ] **Step 6: Install Worker dependencies**

```bash
cd workers/vision && npm install
```
Expected: `node_modules/` created, no errors

- [ ] **Step 7: Commit scaffold (without .dev.vars)**

```bash
cd /home/collen/ReSell-Agent
git add workers/vision/package.json workers/vision/tsconfig.json workers/vision/wrangler.toml .gitignore
git commit -m "feat: scaffold vision Worker project structure"
```

---

### Task 4: Worker types — `workers/vision/src/types.ts`

**Files:**
- Create: `workers/vision/src/types.ts`

- [ ] **Step 1: Write types**

Create `workers/vision/src/types.ts`:

```ts
export interface Env {
  ANTHROPIC_API_KEY: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

export interface TriggerItem {
  item_name_seed: string
  photo_urls: string[]
}

export interface TriggerPayload {
  batch_id: string
  items: TriggerItem[]
}

export interface VisionExtracted {
  item_name: string
  brand: string | null
  model_number: string | null
  category: string
  subcategory: string | null
  condition_raw: string
  condition_ebay: string
  condition_notes: string | null
  is_complete: boolean
  keywords: string[]
  identification_confidence: string
}

export interface ItemInsert {
  photos: string[]
  item_name: string
  brand: string | null
  model_number: string | null
  category: string
  subcategory: string | null
  condition_raw: string
  condition_ebay: string
  condition_notes: string | null
  is_complete: boolean
  keywords: string[]
  identification_confidence: string
  status: 'PendingReview'
  created_by: 'system'
  ebay_price: null
  ebay_comps_count: number
  ebay_comp_price_median: null
  ebay_comp_price_range: null
  fb_price: null
  list_price_final: null
  price_confidence: null
  bundle_id: null
  listing_mode: null
}

export interface StatusItem {
  item_id: string
  item_name: string
  identification_confidence: 'High' | 'Medium' | 'Low' | null
  status: string
  photos: string[]
}
```

- [ ] **Step 2: Commit**

```bash
git add workers/vision/src/types.ts
git commit -m "feat: add vision Worker type definitions"
```

---

### Task 5: Condition mapping — `workers/vision/src/condition-map.ts` (TDD)

**Files:**
- Create: `workers/vision/src/condition-map.test.ts`
- Create: `workers/vision/src/condition-map.ts`

Implements the section 5.1A three-column condition taxonomy. Category groups:
- **CT** (Collectibles/Toys): `Toys & Hobbies`, `Collectibles`, `Entertainment Memorabilia`, `Other`, unknown
- **SM** (Sports Memorabilia): `Sports Memorabilia`
- **BM** (Books/Media): `Books & Media`

- [ ] **Step 1: Write the failing tests**

Create `workers/vision/src/condition-map.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getCategoryGroup, mapConditionEbay } from './condition-map'

describe('getCategoryGroup', () => {
  it('maps Toys & Hobbies to CT', () => {
    expect(getCategoryGroup('Toys & Hobbies')).toBe('CT')
  })
  it('maps Collectibles to CT', () => {
    expect(getCategoryGroup('Collectibles')).toBe('CT')
  })
  it('maps Entertainment Memorabilia to CT', () => {
    expect(getCategoryGroup('Entertainment Memorabilia')).toBe('CT')
  })
  it('maps Other to CT', () => {
    expect(getCategoryGroup('Other')).toBe('CT')
  })
  it('unknown category defaults to CT', () => {
    expect(getCategoryGroup('Furniture')).toBe('CT')
  })
  it('maps Sports Memorabilia to SM', () => {
    expect(getCategoryGroup('Sports Memorabilia')).toBe('SM')
  })
  it('maps Books & Media to BM', () => {
    expect(getCategoryGroup('Books & Media')).toBe('BM')
  })
})

describe('mapConditionEbay', () => {
  it('Mint + CT + complete → New', () => {
    expect(mapConditionEbay('Mint', 'Collectibles', true)).toBe('New')
  })
  it('Mint + CT + incomplete → Like New', () => {
    expect(mapConditionEbay('Mint', 'Collectibles', false)).toBe('Like New')
  })
  it('Mint + Toys & Hobbies + complete → New', () => {
    expect(mapConditionEbay('Mint', 'Toys & Hobbies', true)).toBe('New')
  })
  it('Mint + Entertainment Memorabilia + complete → New (CT group)', () => {
    expect(mapConditionEbay('Mint', 'Entertainment Memorabilia', true)).toBe('New')
  })
  it('Mint + SM + complete → Mint', () => {
    expect(mapConditionEbay('Mint', 'Sports Memorabilia', true)).toBe('Mint')
  })
  it('Mint + SM + incomplete → Mint (SM ignores completeness)', () => {
    expect(mapConditionEbay('Mint', 'Sports Memorabilia', false)).toBe('Mint')
  })
  it('Mint + BM + complete → Brand New', () => {
    expect(mapConditionEbay('Mint', 'Books & Media', true)).toBe('Brand New')
  })
  it('Mint + BM + incomplete → Like New', () => {
    expect(mapConditionEbay('Mint', 'Books & Media', false)).toBe('Like New')
  })
  it('VeryGood + CT → Very Good', () => {
    expect(mapConditionEbay('VeryGood', 'Toys & Hobbies', true)).toBe('Very Good')
  })
  it('VeryGood + SM → Near Mint', () => {
    expect(mapConditionEbay('VeryGood', 'Sports Memorabilia', true)).toBe('Near Mint')
  })
  it('VeryGood + BM → Very Good', () => {
    expect(mapConditionEbay('VeryGood', 'Books & Media', true)).toBe('Very Good')
  })
  it('Good + CT → Good', () => {
    expect(mapConditionEbay('Good', 'Collectibles', true)).toBe('Good')
  })
  it('Good + SM → Excellent', () => {
    expect(mapConditionEbay('Good', 'Sports Memorabilia', true)).toBe('Excellent')
  })
  it('Good + BM → Good', () => {
    expect(mapConditionEbay('Good', 'Books & Media', true)).toBe('Good')
  })
  it('Fair + CT → Acceptable', () => {
    expect(mapConditionEbay('Fair', 'Collectibles', true)).toBe('Acceptable')
  })
  it('Fair + SM → Very Good', () => {
    expect(mapConditionEbay('Fair', 'Sports Memorabilia', true)).toBe('Very Good')
  })
  it('Fair + BM → Acceptable', () => {
    expect(mapConditionEbay('Fair', 'Books & Media', true)).toBe('Acceptable')
  })
  it('Poor + CT → For parts or not working', () => {
    expect(mapConditionEbay('Poor', 'Collectibles', true)).toBe('For parts or not working')
  })
  it('Poor + SM → Good', () => {
    expect(mapConditionEbay('Poor', 'Sports Memorabilia', true)).toBe('Good')
  })
  it('Poor + BM → Poor', () => {
    expect(mapConditionEbay('Poor', 'Books & Media', true)).toBe('Poor')
  })
  it('unknown condition_raw defaults to Good row for CT', () => {
    expect(mapConditionEbay('Unknown', 'Collectibles', true)).toBe('Good')
  })
})
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd workers/vision && npm test
```
Expected: FAIL — `Cannot find module './condition-map'`

- [ ] **Step 3: Write implementation**

Create `workers/vision/src/condition-map.ts`:

```ts
type CategoryGroup = 'CT' | 'SM' | 'BM'

export function getCategoryGroup(category: string): CategoryGroup {
  if (category === 'Sports Memorabilia') return 'SM'
  if (category === 'Books & Media') return 'BM'
  return 'CT'
}

type ConditionValue = string | ((isComplete: boolean) => string)

const EBAY_CONDITIONS: Record<string, Record<CategoryGroup, ConditionValue>> = {
  Mint: {
    CT: (isComplete: boolean) => (isComplete ? 'New' : 'Like New'),
    SM: (_isComplete: boolean) => 'Mint',
    BM: (isComplete: boolean) => (isComplete ? 'Brand New' : 'Like New'),
  },
  VeryGood: { CT: 'Very Good',               SM: 'Near Mint', BM: 'Very Good'  },
  Good:     { CT: 'Good',                    SM: 'Excellent', BM: 'Good'       },
  Fair:     { CT: 'Acceptable',              SM: 'Very Good', BM: 'Acceptable' },
  Poor:     { CT: 'For parts or not working',SM: 'Good',      BM: 'Poor'       },
}

export function mapConditionEbay(
  conditionRaw: string,
  category: string,
  isComplete: boolean
): string {
  const group = getCategoryGroup(category)
  const row = EBAY_CONDITIONS[conditionRaw] ?? EBAY_CONDITIONS['Good']
  const value = row[group]
  return typeof value === 'function' ? value(isComplete) : value
}
```

- [ ] **Step 4: Run tests and confirm all pass**

```bash
cd workers/vision && npm test
```
Expected: all 21 tests pass, 0 failures

- [ ] **Step 5: Commit**

```bash
cd /home/collen/ReSell-Agent
git add workers/vision/src/condition-map.ts workers/vision/src/condition-map.test.ts
git commit -m "feat: add 5.1A condition mapping with full test coverage"
```

---

### Task 6: Vision extraction — `workers/vision/src/vision.ts`

**Files:**
- Create: `workers/vision/src/vision.ts`

Calls Claude claude-sonnet-4-6 with URL-based image blocks. Extracts 12 fields. Validates all CHECK-constrained values. Falls back to `identification_confidence='Low'` on any failure.

- [ ] **Step 1: Write vision.ts**

Create `workers/vision/src/vision.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { mapConditionEbay } from './condition-map'
import type { Env, TriggerItem, VisionExtracted } from './types'

const MODEL = 'claude-sonnet-4-6'
const MAX_IMAGES = 20

const VALID_CATEGORIES = [
  'Toys & Hobbies', 'Sports Memorabilia', 'Collectibles',
  'Entertainment Memorabilia', 'Books & Media', 'Other',
] as const

const VALID_CONDITIONS = ['Mint', 'VeryGood', 'Good', 'Fair', 'Poor'] as const
const VALID_CONFIDENCE = ['High', 'Medium', 'Low'] as const

const EXTRACTION_PROMPT = `You are an expert resale inventory analyst. Examine the provided product photos and return ONLY a JSON object with these exact keys — no markdown fences, no explanation, just the JSON:

{
  "item_name": "concise product name including brand and model if visible",
  "brand": "brand name or null",
  "model_number": "model or part number or null",
  "category": "exactly one of: Toys & Hobbies, Sports Memorabilia, Collectibles, Entertainment Memorabilia, Books & Media, Other",
  "subcategory": "specific subcategory or null",
  "condition_raw": "exactly one of: Mint, VeryGood, Good, Fair, Poor",
  "condition_notes": "describe visible defects or damage, or null if none",
  "is_complete": true or false (true if item appears complete with all parts and accessories),
  "keywords": ["3 to 8 search keywords as an array"],
  "identification_confidence": "exactly one of: High, Medium, Low"
}

confidence guide: High = clearly identifiable item; Medium = partially visible or worn; Low = uncertain identity`

function parseJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as Record<string, unknown>
  } catch {
    return null
  }
}

function validateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function fallbackExtraction(itemNameSeed: string): VisionExtracted {
  return {
    item_name: itemNameSeed,
    brand: null,
    model_number: null,
    category: 'Other',
    subcategory: null,
    condition_raw: 'Good',
    condition_ebay: 'Good',
    condition_notes: 'Vision unable to identify',
    is_complete: true,
    keywords: [],
    identification_confidence: 'Low',
  }
}

export async function extractItem(
  item: TriggerItem,
  env: Env
): Promise<VisionExtracted> {
  if (item.photo_urls.length === 0) {
    return fallbackExtraction(item.item_name_seed)
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const imageBlocks = item.photo_urls.slice(0, MAX_IMAGES).map((url) => ({
    type: 'image' as const,
    source: { type: 'url' as const, url },
  }))

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const rawText = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    const parsed = parseJson(rawText)

    if (!parsed) return fallbackExtraction(item.item_name_seed)

    const category = validateEnum(parsed.category, VALID_CATEGORIES, 'Other')
    const condition_raw = validateEnum(parsed.condition_raw, VALID_CONDITIONS, 'Good')
    const identification_confidence = validateEnum(
      parsed.identification_confidence,
      VALID_CONFIDENCE,
      'Low'
    )
    const is_complete = typeof parsed.is_complete === 'boolean' ? parsed.is_complete : true
    const condition_ebay = mapConditionEbay(condition_raw, category, is_complete)

    return {
      item_name:
        typeof parsed.item_name === 'string' && parsed.item_name
          ? parsed.item_name
          : item.item_name_seed,
      brand: typeof parsed.brand === 'string' ? parsed.brand : null,
      model_number: typeof parsed.model_number === 'string' ? parsed.model_number : null,
      category,
      subcategory: typeof parsed.subcategory === 'string' ? parsed.subcategory : null,
      condition_raw,
      condition_ebay,
      condition_notes:
        typeof parsed.condition_notes === 'string' ? parsed.condition_notes : null,
      is_complete,
      keywords: Array.isArray(parsed.keywords)
        ? (parsed.keywords as unknown[]).filter((k): k is string => typeof k === 'string')
        : [],
      identification_confidence,
    }
  } catch {
    return fallbackExtraction(item.item_name_seed)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add workers/vision/src/vision.ts
git commit -m "feat: add Claude vision extraction with URL-based image blocks"
```

---

### Task 7: Supabase client — `workers/vision/src/supabase.ts`

**Files:**
- Create: `workers/vision/src/supabase.ts`

Uses service role key (bypasses RLS). `fetchItemsByBatch` filters in JS by batch_id in photo URLs rather than adding a DB column or RPC.

- [ ] **Step 1: Write supabase.ts**

Create `workers/vision/src/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import type { Env, ItemInsert, StatusItem } from './types'

function getSupabase(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

export async function insertItem(item: ItemInsert, env: Env): Promise<void> {
  const supabase = getSupabase(env)
  const { error } = await supabase.from('items').insert(item)
  if (error) throw new Error(`Supabase insert failed: ${error.message}`)
}

export async function fetchItemsByBatch(
  batchId: string,
  env: Env
): Promise<StatusItem[]> {
  const supabase = getSupabase(env)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('items')
    .select('item_id, item_name, identification_confidence, status, photos')
    .eq('created_by', 'system')
    .gte('date_added', since)
    .order('date_added', { ascending: false })
    .limit(200)

  if (error) throw new Error(`Supabase query failed: ${error.message}`)
  if (!data) return []

  return (data as StatusItem[]).filter((item) =>
    Array.isArray(item.photos) && item.photos.some((url) => url.includes(batchId))
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add workers/vision/src/supabase.ts
git commit -m "feat: add Supabase insertItem and fetchItemsByBatch for Worker"
```

---

### Task 8: Worker entry point — `workers/vision/src/index.ts`

**Files:**
- Create: `workers/vision/src/index.ts`

`POST /api/vision/trigger` returns immediately; processing runs in `ctx.waitUntil`. Items are chunked at 50 and processed sequentially. Insert failures log and continue — never drop an item silently without inserting a fallback record.

- [ ] **Step 1: Write index.ts**

Create `workers/vision/src/index.ts`:

```ts
import { extractItem } from './vision'
import { insertItem, fetchItemsByBatch } from './supabase'
import type { Env, TriggerItem, TriggerPayload, ItemInsert } from './types'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

async function processItems(
  batchId: string,
  items: TriggerItem[],
  env: Env
): Promise<void> {
  const CHUNK_SIZE = 50
  for (let offset = 0; offset < items.length; offset += CHUNK_SIZE) {
    const chunk = items.slice(offset, offset + CHUNK_SIZE)
    for (const item of chunk) {
      let extracted
      try {
        extracted = await extractItem(item, env)
      } catch {
        extracted = {
          item_name: item.item_name_seed,
          brand: null,
          model_number: null,
          category: 'Other',
          subcategory: null,
          condition_raw: 'Good',
          condition_ebay: 'Good',
          condition_notes: 'Vision processing failed',
          is_complete: true,
          keywords: [] as string[],
          identification_confidence: 'Low',
        }
      }

      const record: ItemInsert = {
        ...extracted,
        photos: item.photo_urls,
        status: 'PendingReview',
        created_by: 'system',
        ebay_price: null,
        ebay_comps_count: 0,
        ebay_comp_price_median: null,
        ebay_comp_price_range: null,
        fb_price: null,
        list_price_final: null,
        price_confidence: null,
        bundle_id: null,
        listing_mode: null,
      }

      try {
        await insertItem(record, env)
      } catch (err) {
        console.error(`[vision] Failed to insert ${item.item_name_seed}:`, err)
      }
    }
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (request.method === 'POST' && url.pathname === '/api/vision/trigger') {
      let payload: TriggerPayload
      try {
        payload = (await request.json()) as TriggerPayload
      } catch {
        return json({ error: 'Invalid JSON body' }, 400)
      }

      if (!payload.batch_id || !Array.isArray(payload.items)) {
        return json({ error: 'Missing batch_id or items' }, 400)
      }

      const validItems = payload.items.filter(
        (i) =>
          typeof i.item_name_seed === 'string' &&
          Array.isArray(i.photo_urls) &&
          i.photo_urls.length > 0
      )

      ctx.waitUntil(processItems(payload.batch_id, validItems, env))

      return json({ status: 'queued', item_count: validItems.length })
    }

    if (request.method === 'GET' && url.pathname === '/api/vision/status') {
      const batchId = url.searchParams.get('batch_id')
      if (!batchId) return json({ error: 'Missing batch_id' }, 400)

      try {
        const items = await fetchItemsByBatch(batchId, env)
        return json(items)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return json({ error: msg }, 500)
      }
    }

    return json({ error: 'Not found' }, 404)
  },
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd workers/vision && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /home/collen/ReSell-Agent
git add workers/vision/src/index.ts
git commit -m "feat: add Worker trigger + status endpoints with ctx.waitUntil"
```

---

### Task 9: Frontend polling — `src/hooks/useBatchPolling.ts` + MobileUpload integration

**Files:**
- Create: `src/hooks/useBatchPolling.ts`
- Modify: `src/components/upload/MobileUpload.tsx`

Polling activates only when `batch.triggerStatus === 'success'`. Polls every 5 seconds. Clears interval when all returned items have `status === 'PendingReview'`.

- [ ] **Step 1: Write useBatchPolling.ts**

Create `src/hooks/useBatchPolling.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

export interface PollStatusItem {
  item_id: string
  item_name: string
  identification_confidence: 'High' | 'Medium' | 'Low' | null
  status: string
  photos: string[]
}

interface PollState {
  items: PollStatusItem[]
  isDone: boolean
  error: string | null
}

export function useBatchPolling(batchId: string | null) {
  const [state, setState] = useState<PollState>({ items: [], isDone: false, error: null })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/vision/status?batch_id=${encodeURIComponent(id)}`)
      if (!res.ok) throw new Error(`Poll failed: ${res.status}`)
      const items = (await res.json()) as PollStatusItem[]
      const isDone =
        items.length > 0 && items.every((i) => i.status === 'PendingReview')
      setState({ items, isDone, error: null })
      return isDone
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Poll error',
      }))
      return false
    }
  }, [])

  useEffect(() => {
    if (!batchId) {
      setState({ items: [], isDone: false, error: null })
      return
    }

    void poll(batchId)

    intervalRef.current = setInterval(async () => {
      const done = await poll(batchId)
      if (done && intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }, 5000)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [batchId, poll])

  return state
}
```

- [ ] **Step 2: Add import to MobileUpload.tsx**

In `src/components/upload/MobileUpload.tsx`, add after the existing imports (after line 7):

```ts
import { useBatchPolling } from '@/hooks/useBatchPolling'
```

- [ ] **Step 3: Add polling hook call in MobileUpload.tsx**

After line 25 (`const { batch, uploadBatch, overallPercent, reset } = useCloudinaryUpload()`), add:

```ts
const batchId = batch?.triggerStatus === 'success' ? batch.batchId : null
const { items: visionItems, isDone: visionDone } = useBatchPolling(batchId)
```

- [ ] **Step 4: Replace the `if (batch)` progress view block**

Replace the block at lines 83–107 with:

```tsx
if (batch) {
  const itemsMap = batch.items
  const doneCount = Object.values(itemsMap).filter((i) => i.status === 'done').length
  return (
    <div className="space-y-4">
      <OverallProgress
        percent={overallPercent}
        triggerStatus={batch.triggerStatus}
        triggerError={batch.triggerError}
        itemCount={Object.keys(itemsMap).length}
        doneCount={doneCount}
      />
      <div className="max-h-[50vh] overflow-y-auto space-y-2">
        {Object.values(itemsMap).map((item) => (
          <ItemProgress key={item.itemName} item={item} />
        ))}
      </div>
      {visionItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Vision results ({visionDone ? 'complete' : 'processing…'})
          </p>
          {visionItems.map((vi) => (
            <div
              key={vi.item_id}
              className="flex items-center justify-between rounded border p-2 text-sm"
            >
              <span className="font-medium truncate max-w-[60%]">{vi.item_name}</span>
              <span className="text-xs text-muted-foreground">
                {vi.identification_confidence ?? '—'}
              </span>
            </div>
          ))}
        </div>
      )}
      {isDone && (
        <Button variant="outline" onClick={handleReset} className="w-full">
          Start New Session
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd /home/collen/ReSell-Agent && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useBatchPolling.ts src/components/upload/MobileUpload.tsx
git commit -m "feat: add useBatchPolling hook and vision result display in MobileUpload"
```

---

### Task 10: Integration smoke test

**Files:** none — manual verification

- [ ] **Step 1: Fill in `.dev.vars` with real credentials**

Edit `workers/vision/.dev.vars` with actual values:
- `ANTHROPIC_API_KEY`: from console.anthropic.com → API Keys
- `SUPABASE_URL`: from Supabase dashboard → Settings → API → Project URL
- `SUPABASE_SERVICE_ROLE_KEY`: from Supabase dashboard → Settings → API → service_role secret (not anon)

- [ ] **Step 2: Start the Worker**

```bash
cd workers/vision && npm run dev
```
Expected: `Listening on http://0.0.0.0:8787` with no startup errors

- [ ] **Step 3: Smoke test trigger endpoint directly**

In a second terminal:

```bash
curl -s -X POST http://localhost:8787/api/vision/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "batch_id": "smoke-test-001",
    "items": [{
      "item_name_seed": "session_1",
      "photo_urls": ["https://res.cloudinary.com/demo/image/upload/sample.jpg"]
    }]
  }'
```
Expected response: `{"status":"queued","item_count":1}`

- [ ] **Step 4: Wait 20 seconds then poll status**

```bash
curl -s "http://localhost:8787/api/vision/status?batch_id=smoke-test-001"
```
Expected: JSON array with one item. Example shape:
```json
[{"item_id":"...","item_name":"Labrador Retriever","identification_confidence":"High","status":"PendingReview","photos":["https://..."]}]
```

If result is `[]` after 30 seconds: check Worker dev terminal for error logs. Common causes: wrong Supabase URL, service role key has insufficient permissions, RLS not bypassed (verify `created_by = 'system'` filter is in the query).

- [ ] **Step 5: Verify the record in Supabase**

In Supabase dashboard → Table Editor → `items` table, confirm a row with:
- `created_by = system`
- `status = PendingReview`
- `photos` contains the Cloudinary URL
- `identification_confidence` is one of `High`, `Medium`, `Low`
- `condition_raw` is one of `Mint`, `VeryGood`, `Good`, `Fair`, `Poor`
- `condition_ebay` matches the 5.1A mapping for that condition and category

- [ ] **Step 6: Test full UI flow**

In terminal 1 (Worker already running):
```bash
# Worker is already running on :8787
```

In terminal 2:
```bash
cd /home/collen/ReSell-Agent && npm run dev
```

Navigate to the upload page → Mobile tab. Tap "New Item" (creates `session_1`). Add 1–3 photos. Tap "Upload All". Verify:
1. Upload progress bar completes per item
2. Trigger status shows "Vision pipeline triggered" (or equivalent success state in OverallProgress)
3. After ~10–15 seconds, "Vision results (processing…)" section appears below
4. When all results arrive, label changes to "Vision results (complete)"
5. Each result row shows `item_name` and `identification_confidence`

- [ ] **Step 7: Commit any fixes from smoke test**

If you found and fixed any issues during testing:

```bash
git add -p
git commit -m "fix: smoke test corrections"
```
