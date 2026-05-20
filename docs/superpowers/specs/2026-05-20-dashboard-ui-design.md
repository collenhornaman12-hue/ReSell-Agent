# Dashboard UI — Operator Dashboard Design

**Date:** 2026-05-20
**Prompt:** 6 — Replace upload-only view with full operator dashboard

---

## Overview

Replace the current single-page upload UI with a multi-route operator dashboard. The upload page moves to `/upload`. Two new views — Inventory and Review Queue — replace the default landing page. A persistent nav bar and metrics strip span all routes.

---

## Routing

Install `react-router-dom`. Routes defined in `src/App.tsx`:

| Path | Component | Notes |
|---|---|---|
| `/` | Redirect | → `/inventory` |
| `/inventory` | `InventoryView` | Default landing |
| `/review` | `ReviewQueue` | PendingReview queue |
| `/upload` | `UploadPage` | Existing component, unchanged |

`BrowserRouter` wraps the app in `src/main.tsx`.

---

## Layout Shell

`App.tsx` renders a persistent shell:

```
┌─────────────────────────────────────────────────────┐
│  NavBar: ResellAgent  [Inventory] [Review] [Upload]  │
├─────────────────────────────────────────────────────┤
│  MetricsStrip (5 cards, reads from useInventory)    │
├─────────────────────────────────────────────────────┤
│  <Outlet /> — route-specific content                │
└─────────────────────────────────────────────────────┘
```

MetricsStrip is rendered above every route. NavBar highlights the active link via `NavLink` from react-router-dom.

---

## Dark Theme

`index.html` gets `class="dark"` on `<html>`. The existing CSS vars for `.dark` in `src/index.css` are already correct.

---

## Dependencies

### Install
- `react-router-dom` — routing
- `@radix-ui/react-dialog` — powers the Sheet/Drawer component

### Already installed
- `class-variance-authority`, `tailwind-merge`, `@radix-ui/react-slot`
- `@supabase/supabase-js`

---

## New shadcn-style UI Components

Follow the existing pattern in `src/components/ui/` (forwardRef, cn(), cva()).

| File | Purpose |
|---|---|
| `src/components/ui/table.tsx` | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` primitives |
| `src/components/ui/sheet.tsx` | Right-side sliding drawer built on `@radix-ui/react-dialog` |
| `src/components/ui/select.tsx` | Native `<select>` wrapper for filter dropdowns |

---

## Data Layer

### `src/hooks/useInventory.ts`

Single source of truth for all item data. Used by MetricsStrip, InventoryView, and ReviewQueue.

**Supabase query:** `SELECT * FROM items ORDER BY date_added DESC`

**Exposed interface:**
```ts
interface UseInventoryReturn {
  items: Item[]
  metrics: {
    total: number
    listedValue: number       // sum of list_price_final WHERE status = 'Listed'
    pendingReview: number     // see formula below
    listed: number
    sold: number
  }
  loading: boolean
  error: string | null
  updateItemStatus: (item_id: string, newStatus: ItemStatus) => Promise<void>
  refresh: () => Promise<void>
}
```

**Metrics computed client-side** from the fetched `items` array (avoids extra DB round-trips).

**pendingReview formula:**
```ts
item.status === 'PendingReview' ||
(item.status === 'ReadyToList' && (item.list_price_final > 50 || item.price_confidence === 'Low'))
```

**Polling:** `setInterval(refresh, 30_000)` started on mount, cleared on unmount.

**`updateItemStatus`:** Issues a Supabase `update` then calls `refresh()`.

### Supabase RLS Migration

The schema only has `TO authenticated` policies. The anon key (used from the frontend) cannot read items without a new policy.

File: `supabase/migrations/20260520000000_allow_anon_read.sql`

```sql
CREATE POLICY "Allow anon read on items"
  ON items FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon update on items"
  ON items FOR UPDATE TO anon USING (true) WITH CHECK (true);
```

Update is needed so `updateItemStatus` can write status changes from the dashboard.

---

## Metrics Strip

File: `src/components/dashboard/MetricsStrip.tsx`

Five cards in a horizontal row, full-width:

| Label | Value |
|---|---|
| Total Items | `metrics.total` |
| Listed Value | `$${metrics.listedValue.toFixed(2)}` |
| Pending Review | `metrics.pendingReview` |
| Listed | `metrics.listed` |
| Sold | `metrics.sold` |

Shows a loading skeleton while `loading === true`.

---

## NavBar

File: `src/components/dashboard/NavBar.tsx`

- Logo text "ResellAgent" on left
- Three `NavLink` elements: Inventory, Review, Upload
- Active link gets a highlighted style (brighter text + bottom border or background pill)

---

## Inventory View (`/inventory`)

File: `src/components/dashboard/InventoryView.tsx`

### Filters (above table)

Three dropdowns using the `Select` component:
- **Status:** All | PendingReview | ReadyToList | Listed | Sold | Archived
- **Category:** All | Toys & Hobbies | Sports Memorabilia | Collectibles | Entertainment Memorabilia | Books & Media
- **Confidence:** All | High | Medium | Low

Filters are applied client-side to the `items` array from `useInventory()`.

### Table columns

| Column | Source | Notes |
|---|---|---|
| Photo | `photos[0]` | 48×48 `<img>` with `object-cover` |
| Item Name | `item_name` | |
| Brand | `brand` | |
| Category | `category` | |
| Condition | `condition_ebay` | |
| Price | `list_price_final` | Formatted `$X.XX`, em-dash if null |
| Confidence | `price_confidence` | Badge: High=green, Medium=yellow, Low=red |
| Status | `status` | Badge with color per status |
| Date Added | `date_added` | Relative time ("2 hours ago") |

Row click opens `ItemDrawer`.

---

## Item Drawer

File: `src/components/dashboard/ItemDrawer.tsx`

Built on `Sheet` (right-side, ~640px wide on desktop).

### Content

1. **Header:** Item name + close button
2. **Photo strip:** Horizontal scroll of thumbnails; clicking a photo opens a full-size lightbox (simple `<dialog>` overlay)
3. **Detail fields:** Two-column grid of all item fields (label + value pairs)
4. **Action buttons** based on `status`:
   - `ReadyToList` → **Publish to eBay** (`console.log('TODO: Prompt 7')`) + **Archive** (`updateItemStatus(id, 'Archived')`)
   - `Listed` → eBay listing ID shown as link `https://ebay.com/itm/{id}`
   - `Sold` → Display `sale_price`, `buyer_handle`, `tracking_number`
   - Others → no buttons

---

## Review Queue (`/review`)

File: `src/components/dashboard/ReviewQueue.tsx`

### Filter

Client-side from full `items` array:
```ts
item.status === 'PendingReview' ||
(item.status === 'ReadyToList' && (item.list_price_final > 50 || item.price_confidence === 'Low'))
```

### Table

Same `ItemsTable` component as InventoryView, with an additional **Actions** column containing:
- **Approve** button → `updateItemStatus(id, 'ReadyToList')`
- **Reject** button → `updateItemStatus(id, 'Archived')`

Row click still opens ItemDrawer.

### Empty state

"No items pending review" message when the filtered list is empty.

---

## Shared Table Component

File: `src/components/dashboard/ItemsTable.tsx`

Props:
```ts
interface ItemsTableProps {
  items: Item[]
  onRowClick: (item: Item) => void
  showActions?: boolean    // true in ReviewQueue
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  loading?: boolean
}
```

---

## File Change Summary

### New files
```
src/hooks/useInventory.ts
src/components/ui/table.tsx
src/components/ui/sheet.tsx
src/components/ui/select.tsx
src/components/dashboard/NavBar.tsx
src/components/dashboard/MetricsStrip.tsx
src/components/dashboard/ItemsTable.tsx
src/components/dashboard/ItemDrawer.tsx
src/components/dashboard/InventoryView.tsx
src/components/dashboard/ReviewQueue.tsx
supabase/migrations/20260520000000_allow_anon_read.sql
```

### Modified files
```
src/App.tsx         — react-router-dom routes
index.html          — add class="dark" to <html>
```

### Unchanged
```
src/main.tsx
src/components/upload/*   (all three files)
src/hooks/useBatchPolling.ts
src/hooks/useCloudinaryUpload.ts
workers/*
```

---

## Constraints

- No eBay API calls. "Publish to eBay" button is `console.log` only.
- Vision Worker and Pricing Worker are not modified.
- Frontend only.
