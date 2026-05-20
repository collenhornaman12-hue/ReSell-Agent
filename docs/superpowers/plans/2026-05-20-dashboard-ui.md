# Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-page upload UI with a full operator dashboard: routing, metrics strip, inventory table, review queue, and item detail drawer — all reading live from Supabase.

**Architecture:** React Router wraps three routes (`/inventory`, `/review`, `/upload`). A single `useInventory` hook owned by `InventoryContext` fetches and polls Supabase every 30s; all views subscribe via `useInventoryContext()` to avoid duplicate requests. The upload page moves unchanged to `/upload`.

**Tech Stack:** React 19, react-router-dom, @radix-ui/react-dialog (Sheet), @supabase/supabase-js, Tailwind CSS, shadcn-style component primitives

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `supabase/migrations/20260520000000_allow_anon_read.sql` | RLS: allow anon SELECT + UPDATE on items |
| Create | `src/lib/format.ts` | `formatRelativeTime`, `formatPrice` utilities |
| Create | `src/components/ui/table.tsx` | shadcn Table, TableHeader, TableBody, TableRow, TableHead, TableCell |
| Create | `src/components/ui/sheet.tsx` | Right-side drawer built on @radix-ui/react-dialog |
| Create | `src/components/ui/select.tsx` | Native `<select>` wrapper with label |
| Create | `src/hooks/useInventory.ts` | Supabase fetch + 30s poll + updateItemStatus |
| Create | `src/context/InventoryContext.tsx` | Single useInventory instance shared via context |
| Create | `src/components/dashboard/NavBar.tsx` | Top nav with 3 NavLink items, active highlighting |
| Create | `src/components/dashboard/MetricsStrip.tsx` | 5 metric cards from useInventoryContext |
| Create | `src/components/dashboard/ItemsTable.tsx` | Reusable table, optional inline Approve/Reject |
| Create | `src/components/dashboard/ItemDrawer.tsx` | Right-side Sheet: photos, fields, action buttons |
| Create | `src/components/dashboard/InventoryView.tsx` | /inventory: filter dropdowns + ItemsTable + ItemDrawer |
| Create | `src/components/dashboard/ReviewQueue.tsx` | /review: pre-filtered queue + ItemsTable + ItemDrawer |
| Modify | `src/App.tsx` | BrowserRouter + InventoryProvider + Routes |
| Modify | `index.html` | Add `class="dark"` to `<html>` |

---

## Task 1: Install Dependencies + Dark Theme

**Files:**
- Modify: `index.html`
- Install: `react-router-dom`, `@radix-ui/react-dialog`

- [ ] **Step 1: Install missing packages**

Run from the project root (the directory containing `package.json`, not `workers/`):
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent
npm install react-router-dom @radix-ui/react-dialog
```
Expected: packages added to `node_modules`, `package.json` updated.

- [ ] **Step 2: Enable dark theme globally**

Open `index.html`. The current `<html>` tag is:
```html
<html lang="en">
```
Change it to:
```html
<html lang="en" class="dark">
```

- [ ] **Step 3: Verify TypeScript build still passes**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent && npm run build 2>&1 | tail -5
```
Expected: `✓ built in` with no errors.

- [ ] **Step 4: Commit**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent
git add index.html package.json package-lock.json
git commit -m "feat: install react-router-dom + radix-dialog, enable dark theme"
```

---

## Task 2: Supabase RLS Migration

**Files:**
- Create: `supabase/migrations/20260520000000_allow_anon_read.sql`

The current schema only allows `authenticated` role. The frontend uses the anon key, so reads/updates will fail silently. This migration adds anon policies.

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/20260520000000_allow_anon_read.sql`:
```sql
-- Allow anon key (frontend) to read and update items
CREATE POLICY "Allow anon read on items"
  ON items FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon update on items"
  ON items FOR UPDATE TO anon USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Apply the migration**

Run via the Supabase dashboard SQL editor, or if the Supabase CLI is available:
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent
npx supabase db push 2>&1 || echo "Apply manually via Supabase dashboard SQL editor"
```

If the CLI is not linked: open the Supabase dashboard → SQL Editor → paste and run the two `CREATE POLICY` statements.

- [ ] **Step 3: Commit**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent
git add supabase/migrations/20260520000000_allow_anon_read.sql
git commit -m "feat: add anon read/update RLS policies on items"
```

---

## Task 3: Format Utilities

**Files:**
- Create: `src/lib/format.ts`

- [ ] **Step 1: Create the file**

Create `src/lib/format.ts`:
```ts
export function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function formatPrice(price: number | null | undefined): string {
  if (price == null) return '—'
  return `$${price.toFixed(2)}`
}
```

- [ ] **Step 2: Verify build**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent && npm run build 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 3: Commit**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent
git add src/lib/format.ts
git commit -m "feat: add formatRelativeTime and formatPrice utilities"
```

---

## Task 4: UI Primitives — Table, Sheet, Select

**Files:**
- Create: `src/components/ui/table.tsx`
- Create: `src/components/ui/sheet.tsx`
- Create: `src/components/ui/select.tsx`

- [ ] **Step 1: Create `src/components/ui/table.tsx`**

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
)
Table.displayName = 'Table'

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
  )
)
TableHeader.displayName = 'TableHeader'

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  )
)
TableBody.displayName = 'TableBody'

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-border transition-colors hover:bg-muted/50 cursor-pointer',
        className
      )}
      {...props}
    />
  )
)
TableRow.displayName = 'TableRow'

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-11 px-4 text-left align-middle text-xs font-medium text-muted-foreground uppercase tracking-wide',
        className
      )}
      {...props}
    />
  )
)
TableHead.displayName = 'TableHead'

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('px-4 py-3 align-middle', className)} {...props} />
  )
)
TableCell.displayName = 'TableCell'

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }
```

- [ ] **Step 2: Create `src/components/ui/sheet.tsx`**

```tsx
import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetPortal = DialogPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-black/60', className)}
    {...props}
  />
))
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-y-0 right-0 z-50 flex flex-col h-full w-full max-w-2xl bg-card border-l border-border shadow-xl',
        className
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = DialogPrimitive.Content.displayName

const SheetTitle = DialogPrimitive.Title
const SheetDescription = DialogPrimitive.Description

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetDescription,
}
```

- [ ] **Step 3: Create `src/components/ui/select.tsx`**

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, children, ...props }, ref) => (
    <div className="flex items-center gap-2">
      {label && (
        <label className="text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">
          {label}
        </label>
      )}
      <select
        ref={ref}
        className={cn(
          'flex h-8 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          className
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  )
)
Select.displayName = 'Select'

export { Select }
```

- [ ] **Step 4: Verify build**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent && npm run build 2>&1 | tail -5
```
Expected: no TypeScript errors.

- [ ] **Step 5: Commit**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent
git add src/components/ui/table.tsx src/components/ui/sheet.tsx src/components/ui/select.tsx
git commit -m "feat: add Table, Sheet, and Select UI primitives"
```

---

## Task 5: useInventory Hook + InventoryContext

**Files:**
- Create: `src/hooks/useInventory.ts`
- Create: `src/context/InventoryContext.tsx`

- [ ] **Step 1: Create `src/hooks/useInventory.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
)

export type ItemStatus =
  | 'PendingReview'
  | 'ReadyToList'
  | 'Listed'
  | 'SoldPendingApproval'
  | 'Sold'
  | 'Archived'

export interface Item {
  item_id: string
  photos: string[] | null
  item_name: string
  brand: string | null
  model_number: string | null
  category: string | null
  subcategory: string | null
  condition_raw: 'Mint' | 'VeryGood' | 'Good' | 'Fair' | 'Poor' | null
  condition_ebay: string | null
  condition_notes: string | null
  is_complete: boolean | null
  keywords: string[] | null
  identification_confidence: 'High' | 'Medium' | 'Low' | null
  description_short: string | null
  description_long: string | null
  ebay_search_query: string | null
  ebay_comps_count: number | null
  ebay_comp_price_median: number | null
  ebay_comp_price_range: string | null
  ebay_price: number | null
  fb_price: number | null
  list_price_final: number | null
  price_confidence: 'High' | 'Medium' | 'Low' | null
  price_override_reason: string | null
  listing_mode: 'Individual' | 'Bundle' | null
  bundle_id: string | null
  status: ItemStatus
  ebay_listing_id: string | null
  fb_listing_id: string | null
  price_drop_count: number | null
  last_price_drop_date: string | null
  weight_oz: number | null
  dimensions_lxwxh_in: string | null
  buyer_platform: 'eBay' | 'Facebook' | null
  buyer_handle: string | null
  sale_price: number | null
  shipping_carrier: string | null
  tracking_number: string | null
  shipping_label_url: string | null
  date_added: string | null
  date_listed: string | null
  date_sold: string | null
  created_by: string | null
  batch_id: string | null
}

export interface Metrics {
  total: number
  listedValue: number
  pendingReview: number
  listed: number
  sold: number
}

export interface UseInventoryReturn {
  items: Item[]
  metrics: Metrics
  loading: boolean
  error: string | null
  updateItemStatus: (item_id: string, newStatus: ItemStatus) => Promise<void>
  refresh: () => Promise<void>
}

function computeMetrics(items: Item[]): Metrics {
  return {
    total: items.length,
    listedValue: items
      .filter((i) => i.status === 'Listed')
      .reduce((sum, i) => sum + (i.list_price_final ?? 0), 0),
    pendingReview: items.filter(
      (i) =>
        i.status === 'PendingReview' ||
        (i.status === 'ReadyToList' &&
          ((i.list_price_final ?? 0) > 50 || i.price_confidence === 'Low'))
    ).length,
    listed: items.filter((i) => i.status === 'Listed').length,
    sold: items.filter((i) => i.status === 'Sold').length,
  }
}

export function useInventory(): UseInventoryReturn {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('items')
      .select('*')
      .order('date_added', { ascending: false })
    if (err) {
      setError(err.message)
    } else {
      setItems((data as Item[]) ?? [])
      setError(null)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void refresh().finally(() => setLoading(false))

    intervalRef.current = setInterval(() => {
      void refresh()
    }, 30_000)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [refresh])

  const updateItemStatus = useCallback(
    async (item_id: string, newStatus: ItemStatus) => {
      const { error: err } = await supabase
        .from('items')
        .update({ status: newStatus })
        .eq('item_id', item_id)
      if (err) throw new Error(err.message)
      await refresh()
    },
    [refresh]
  )

  return {
    items,
    metrics: computeMetrics(items),
    loading,
    error,
    updateItemStatus,
    refresh,
  }
}
```

- [ ] **Step 2: Create `src/context/InventoryContext.tsx`**

```tsx
import React, { createContext, useContext } from 'react'
import { useInventory, UseInventoryReturn } from '@/hooks/useInventory'

const InventoryContext = createContext<UseInventoryReturn | null>(null)

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const value = useInventory()
  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>
}

export function useInventoryContext(): UseInventoryReturn {
  const ctx = useContext(InventoryContext)
  if (!ctx) throw new Error('useInventoryContext must be used within InventoryProvider')
  return ctx
}
```

- [ ] **Step 3: Verify build**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent && npm run build 2>&1 | tail -5
```
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent
git add src/hooks/useInventory.ts src/context/InventoryContext.tsx
git commit -m "feat: add useInventory hook and InventoryContext"
```

---

## Task 6: NavBar + App.tsx Routing

**Files:**
- Create: `src/components/dashboard/NavBar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/dashboard/NavBar.tsx`**

```tsx
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

const links = [
  { to: '/inventory', label: 'Inventory' },
  { to: '/review', label: 'Review' },
  { to: '/upload', label: 'Upload' },
]

export function NavBar() {
  return (
    <header className="border-b border-border bg-card px-6 py-3 flex items-center gap-6 sticky top-0 z-40">
      <span className="text-sm font-semibold text-foreground">ResellAgent</span>
      <nav className="flex items-center gap-1">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'px-3 py-1.5 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
```

- [ ] **Step 2: Rewrite `src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { InventoryProvider } from '@/context/InventoryContext'
import { NavBar } from '@/components/dashboard/NavBar'
import { MetricsStrip } from '@/components/dashboard/MetricsStrip'
import { InventoryView } from '@/components/dashboard/InventoryView'
import { ReviewQueue } from '@/components/dashboard/ReviewQueue'
import { UploadPage } from '@/components/upload/UploadPage'

export default function App() {
  return (
    <BrowserRouter>
      <InventoryProvider>
        <div className="min-h-screen bg-background flex flex-col">
          <NavBar />
          <MetricsStrip />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Navigate to="/inventory" replace />} />
              <Route path="/inventory" element={<InventoryView />} />
              <Route path="/review" element={<ReviewQueue />} />
              <Route path="/upload" element={<UploadPage />} />
            </Routes>
          </main>
        </div>
      </InventoryProvider>
    </BrowserRouter>
  )
}
```

Note: `MetricsStrip`, `InventoryView`, and `ReviewQueue` don't exist yet — the build will fail until Task 7. That's expected.

- [ ] **Step 3: Commit**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent
git add src/components/dashboard/NavBar.tsx src/App.tsx
git commit -m "feat: add NavBar and react-router-dom routing shell"
```

---

## Task 7: MetricsStrip

**Files:**
- Create: `src/components/dashboard/MetricsStrip.tsx`

- [ ] **Step 1: Create `src/components/dashboard/MetricsStrip.tsx`**

```tsx
import { useInventoryContext } from '@/context/InventoryContext'
import { formatPrice } from '@/lib/format'

interface MetricCardProps {
  label: string
  value: string | number
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="flex-1 min-w-0 bg-card border border-border rounded-lg px-4 py-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1 truncate">{value}</p>
    </div>
  )
}

export function MetricsStrip() {
  const { metrics, loading } = useInventoryContext()
  const ph = '…'

  return (
    <div className="flex gap-3 px-6 py-4 border-b border-border overflow-x-auto">
      <MetricCard label="Total Items" value={loading ? ph : metrics.total} />
      <MetricCard label="Listed Value" value={loading ? ph : formatPrice(metrics.listedValue)} />
      <MetricCard label="Pending Review" value={loading ? ph : metrics.pendingReview} />
      <MetricCard label="Listed" value={loading ? ph : metrics.listed} />
      <MetricCard label="Sold" value={loading ? ph : metrics.sold} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent
git add src/components/dashboard/MetricsStrip.tsx
git commit -m "feat: add MetricsStrip component"
```

---

## Task 8: ItemsTable

**Files:**
- Create: `src/components/dashboard/ItemsTable.tsx`

- [ ] **Step 1: Create `src/components/dashboard/ItemsTable.tsx`**

```tsx
import { cn } from '@/lib/utils'
import { formatPrice, formatRelativeTime } from '@/lib/format'
import { Item, ItemStatus } from '@/hooks/useInventory'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'

interface ItemsTableProps {
  items: Item[]
  onRowClick: (item: Item) => void
  showActions?: boolean
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  loading?: boolean
}

const CONFIDENCE_CLASS: Record<string, string> = {
  High: 'bg-green-500/20 text-green-400 border-green-500/30',
  Medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Low: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const STATUS_CLASS: Record<string, string> = {
  PendingReview: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  ReadyToList: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Listed: 'bg-green-500/20 text-green-400 border-green-500/30',
  SoldPendingApproval: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Sold: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Archived: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

function ColorBadge({ value, map }: { value: string | null; map: Record<string, string> }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        map[value] ?? 'bg-muted text-muted-foreground border-muted'
      )}
    >
      {value}
    </span>
  )
}

export function ItemsTable({
  items,
  onRowClick,
  showActions = false,
  onApprove,
  onReject,
  loading = false,
}: ItemsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        Loading…
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        No items found
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent cursor-default">
          <TableHead className="w-16">Photo</TableHead>
          <TableHead>Item Name</TableHead>
          <TableHead>Brand</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Condition</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Confidence</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Date Added</TableHead>
          {showActions && <TableHead className="w-32">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.item_id} onClick={() => onRowClick(item)}>
            <TableCell>
              {item.photos?.[0] ? (
                <img
                  src={item.photos[0]}
                  alt=""
                  className="h-12 w-12 rounded object-cover"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="h-12 w-12 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">
                  —
                </div>
              )}
            </TableCell>
            <TableCell className="font-medium max-w-[200px] truncate">{item.item_name}</TableCell>
            <TableCell className="text-muted-foreground">{item.brand ?? '—'}</TableCell>
            <TableCell className="text-muted-foreground">{item.category ?? '—'}</TableCell>
            <TableCell className="text-muted-foreground">{item.condition_ebay ?? '—'}</TableCell>
            <TableCell>{formatPrice(item.list_price_final)}</TableCell>
            <TableCell>
              <ColorBadge value={item.price_confidence} map={CONFIDENCE_CLASS} />
            </TableCell>
            <TableCell>
              <ColorBadge value={item.status} map={STATUS_CLASS} />
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {formatRelativeTime(item.date_added)}
            </TableCell>
            {showActions && (
              <TableCell onClick={(e) => e.stopPropagation()}>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onApprove?.(item.item_id)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    onClick={() => onReject?.(item.item_id)}
                  >
                    Reject
                  </Button>
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 2: Commit**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent
git add src/components/dashboard/ItemsTable.tsx
git commit -m "feat: add ItemsTable with confidence/status badges and optional actions column"
```

---

## Task 9: ItemDrawer

**Files:**
- Create: `src/components/dashboard/ItemDrawer.tsx`

- [ ] **Step 1: Create `src/components/dashboard/ItemDrawer.tsx`**

```tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import { Sheet, SheetContent, SheetClose } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Item, ItemStatus } from '@/hooks/useInventory'
import { formatPrice } from '@/lib/format'

interface ItemDrawerProps {
  item: Item | null
  onClose: () => void
  updateItemStatus: (item_id: string, newStatus: ItemStatus) => Promise<void>
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-foreground break-words">{value ?? '—'}</p>
    </div>
  )
}

export function ItemDrawer({ item, onClose, updateItemStatus }: ItemDrawerProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  return (
    <>
      <Sheet open={item !== null} onOpenChange={(open) => { if (!open) onClose() }}>
        <SheetContent>
          {item && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
                <h2 className="text-base font-semibold truncate pr-4">{item.item_name}</h2>
                <SheetClose asChild>
                  <Button variant="ghost" size="icon" className="flex-shrink-0">
                    <X className="h-4 w-4" />
                  </Button>
                </SheetClose>
              </div>

              {/* Photos */}
              {item.photos && item.photos.length > 0 && (
                <div className="flex gap-2 px-6 py-3 overflow-x-auto border-b border-border flex-shrink-0">
                  {item.photos.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt=""
                      className="h-20 w-20 flex-shrink-0 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setLightboxSrc(src)}
                    />
                  ))}
                </div>
              )}

              {/* Fields — scrollable */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <FieldRow label="Item ID" value={item.item_id} />
                  <FieldRow label="Status" value={item.status} />
                  <FieldRow label="Brand" value={item.brand} />
                  <FieldRow label="Model" value={item.model_number} />
                  <FieldRow label="Category" value={item.category} />
                  <FieldRow label="Subcategory" value={item.subcategory} />
                  <FieldRow label="Condition (eBay)" value={item.condition_ebay} />
                  <FieldRow label="Condition (Raw)" value={item.condition_raw} />
                  <FieldRow label="Condition Notes" value={item.condition_notes} />
                  <FieldRow label="Complete?" value={item.is_complete === null ? '—' : item.is_complete ? 'Yes' : 'No'} />
                  <FieldRow label="List Price" value={formatPrice(item.list_price_final)} />
                  <FieldRow label="eBay Price" value={formatPrice(item.ebay_price)} />
                  <FieldRow label="FB Price" value={formatPrice(item.fb_price)} />
                  <FieldRow label="Sale Price" value={formatPrice(item.sale_price)} />
                  <FieldRow label="Price Confidence" value={item.price_confidence} />
                  <FieldRow label="ID Confidence" value={item.identification_confidence} />
                  <FieldRow label="eBay Comps" value={item.ebay_comps_count} />
                  <FieldRow label="eBay Comp Range" value={item.ebay_comp_price_range} />
                  <FieldRow label="Listing Mode" value={item.listing_mode} />
                  <FieldRow label="eBay Listing ID" value={item.ebay_listing_id} />
                  <FieldRow label="Buyer Platform" value={item.buyer_platform} />
                  <FieldRow label="Buyer Handle" value={item.buyer_handle} />
                  <FieldRow label="Tracking #" value={item.tracking_number} />
                  <FieldRow label="Batch ID" value={item.batch_id} />
                  <FieldRow
                    label="Description (Short)"
                    value={item.description_short}
                  />
                </div>
                {item.description_long && (
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Description (Long)</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{item.description_long}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-6 py-4 border-t border-border flex-shrink-0">
                {item.status === 'ReadyToList' && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => console.log('TODO: Prompt 7 — publish to eBay', item.item_id)}
                    >
                      Publish to eBay
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void updateItemStatus(item.item_id, 'Archived').then(onClose)}
                    >
                      Archive
                    </Button>
                  </div>
                )}
                {item.status === 'Listed' && item.ebay_listing_id && (
                  <a
                    href={`https://www.ebay.com/itm/${item.ebay_listing_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline underline-offset-2"
                  >
                    View on eBay: {item.ebay_listing_id}
                  </a>
                )}
                {item.status === 'Sold' && (
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">Sale price:</span> {formatPrice(item.sale_price)}</p>
                    <p><span className="text-muted-foreground">Buyer:</span> {item.buyer_handle ?? '—'}</p>
                    <p><span className="text-muted-foreground">Tracking:</span> {item.tracking_number ?? '—'}</p>
                  </div>
                )}
                {!['ReadyToList', 'Listed', 'Sold'].includes(item.status) && (
                  <p className="text-xs text-muted-foreground">No actions available for status: {item.status}</p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 cursor-pointer"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt=""
            className="max-h-[90vh] max-w-[90vw] object-contain rounded"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-1 hover:bg-black/80"
            onClick={() => setLightboxSrc(null)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Commit**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent
git add src/components/dashboard/ItemDrawer.tsx
git commit -m "feat: add ItemDrawer with photo strip, lightbox, and status-based actions"
```

---

## Task 10: InventoryView

**Files:**
- Create: `src/components/dashboard/InventoryView.tsx`

- [ ] **Step 1: Create `src/components/dashboard/InventoryView.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { useInventoryContext } from '@/context/InventoryContext'
import { Item } from '@/hooks/useInventory'
import { ItemsTable } from './ItemsTable'
import { ItemDrawer } from './ItemDrawer'
import { Select } from '@/components/ui/select'

const STATUS_OPTIONS = ['All', 'PendingReview', 'ReadyToList', 'Listed', 'Sold', 'Archived']
const CATEGORY_OPTIONS = [
  'All',
  'Toys & Hobbies',
  'Sports Memorabilia',
  'Collectibles',
  'Entertainment Memorabilia',
  'Books & Media',
]
const CONFIDENCE_OPTIONS = ['All', 'High', 'Medium', 'Low']

export function InventoryView() {
  const { items, loading, updateItemStatus } = useInventoryContext()
  const [statusFilter, setStatusFilter] = useState('All')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [confidenceFilter, setConfidenceFilter] = useState('All')
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (statusFilter !== 'All' && i.status !== statusFilter) return false
        if (categoryFilter !== 'All' && i.category !== categoryFilter) return false
        if (confidenceFilter !== 'All' && i.price_confidence !== confidenceFilter) return false
        return true
      }),
    [items, statusFilter, categoryFilter, confidenceFilter]
  )

  return (
    <div className="px-6 py-4">
      <div className="flex flex-wrap gap-4 mb-4 items-center">
        <Select
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>

        <Select
          label="Category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>

        <Select
          label="Confidence"
          value={confidenceFilter}
          onChange={(e) => setConfidenceFilter(e.target.value)}
        >
          {CONFIDENCE_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <ItemsTable
        items={filtered}
        loading={loading}
        onRowClick={setSelectedItem}
      />

      <ItemDrawer
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        updateItemStatus={updateItemStatus}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent
git add src/components/dashboard/InventoryView.tsx
git commit -m "feat: add InventoryView with filter dropdowns and item drawer"
```

---

## Task 11: ReviewQueue

**Files:**
- Create: `src/components/dashboard/ReviewQueue.tsx`

- [ ] **Step 1: Create `src/components/dashboard/ReviewQueue.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { useInventoryContext } from '@/context/InventoryContext'
import { Item } from '@/hooks/useInventory'
import { ItemsTable } from './ItemsTable'
import { ItemDrawer } from './ItemDrawer'

export function ReviewQueue() {
  const { items, loading, updateItemStatus } = useInventoryContext()
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)

  const reviewItems = useMemo(
    () =>
      items.filter(
        (i) =>
          i.status === 'PendingReview' ||
          (i.status === 'ReadyToList' &&
            ((i.list_price_final ?? 0) > 50 || i.price_confidence === 'Low'))
      ),
    [items]
  )

  return (
    <div className="px-6 py-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold">Pending Review</h2>
        <p className="text-sm text-muted-foreground">
          {reviewItems.length} item{reviewItems.length !== 1 ? 's' : ''} need{reviewItems.length === 1 ? 's' : ''} attention
        </p>
      </div>

      <ItemsTable
        items={reviewItems}
        loading={loading}
        onRowClick={setSelectedItem}
        showActions
        onApprove={(id) => void updateItemStatus(id, 'ReadyToList')}
        onReject={(id) => void updateItemStatus(id, 'Archived')}
      />

      <ItemDrawer
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        updateItemStatus={updateItemStatus}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent
git add src/components/dashboard/ReviewQueue.tsx
git commit -m "feat: add ReviewQueue with inline approve/reject actions"
```

---

## Task 12: Final Build Verification

- [ ] **Step 1: Full TypeScript build**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent && npm run build 2>&1
```
Expected: `✓ built in X.Xs` with zero TypeScript errors. If errors appear, fix them before proceeding.

- [ ] **Step 2: Start dev server**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent && npm run dev
```
Expected: server starts on `http://localhost:5173` (or similar port).

- [ ] **Step 3: Verify routes in browser**

Open `http://localhost:5173` — should redirect to `/inventory`.
Check:
- NavBar visible with 3 links; active link highlighted
- MetricsStrip shows 5 cards (loading `…` then real data)
- Inventory table loads (or "No items found" if DB empty)
- `/review` route shows the review queue
- `/upload` route shows the existing upload page unchanged
- Clicking a table row opens the Item Drawer

- [ ] **Step 4: Verify zero console errors**

Open browser DevTools → Console tab. There should be no red errors.
The only acceptable output is `TODO: Prompt 7` when Publish to eBay is clicked.

- [ ] **Step 5: Final commit**
```bash
cd //wsl.localhost/Ubuntu/home/collen/ReSell-Agent && git status
```
If any uncommitted changes remain, stage and commit them:
```bash
git add -A && git commit -m "feat: complete dashboard UI (Prompt 6)"
```
