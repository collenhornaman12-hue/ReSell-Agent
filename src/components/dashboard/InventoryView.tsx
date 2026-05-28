import { useEffect, useMemo, useState } from 'react'
import { useInventoryContext } from '@/context/InventoryContext'
import { Item } from '@/hooks/useInventory'
import { ItemsTable } from './ItemsTable'
import { ItemDrawer } from './ItemDrawer'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

const STATUS_OPTIONS = ['Active', 'All', 'PendingReview', 'ReadyToList', 'Listed', 'Sold']
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
  const { items, loading, updateItemStatus, refresh } = useInventoryContext()
  const [statusFilter, setStatusFilter] = useState('Active')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [confidenceFilter, setConfidenceFilter] = useState('All')
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pricing, setPricing] = useState(false)
  const [pricingProgress, setPricingProgress] = useState<{ current: number; total: number } | null>(null)

  const pendingBatchIds = useMemo(
    () => [
      ...new Set(
        items
          .filter((i) => i.status === 'PendingReview' && i.batch_id)
          .map((i) => i.batch_id as string)
      ),
    ],
    [items]
  )

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (statusFilter === 'Active' && i.status === 'Archived') return false
        if (statusFilter !== 'Active' && statusFilter !== 'All' && i.status !== statusFilter) return false
        if (categoryFilter !== 'All' && i.category !== categoryFilter) return false
        if (confidenceFilter !== 'All' && i.price_confidence !== confidenceFilter) return false
        return true
      }),
    [items, statusFilter, categoryFilter, confidenceFilter]
  )

  useEffect(() => {
    setSelectedIds(new Set())
  }, [statusFilter, categoryFilter, confidenceFilter])

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(allSelected: boolean) {
    setSelectedIds(allSelected ? new Set(filtered.map((i) => i.item_id)) : new Set())
  }

  async function priceAllPending() {
    if (pendingBatchIds.length === 0) return
    setPricing(true)
    for (let i = 0; i < pendingBatchIds.length; i++) {
      setPricingProgress({ current: i + 1, total: pendingBatchIds.length })
      try {
        await fetch('/api/pricing/trigger', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Worker-Token': import.meta.env.VITE_WORKER_SECRET,
          },
          body: JSON.stringify({ batch_id: pendingBatchIds[i] }),
        })
      } catch (e) {
        console.error(`Failed to price batch ${pendingBatchIds[i]}:`, e)
      }
      if (i < pendingBatchIds.length - 1) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    await refresh()
    setPricing(false)
    setPricingProgress(null)
  }

  async function archiveSelected() {
    await Promise.all([...selectedIds].map((id) => updateItemStatus(id, 'Archived')))
    setSelectedIds(new Set())
  }

  return (
    <div className="px-6 py-4">
      <div className="flex flex-wrap gap-4 mb-4 items-center">
        <Select
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        <Select
          label="Category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>

        <Select
          label="Confidence"
          value={confidenceFilter}
          onChange={(e) => setConfidenceFilter(e.target.value)}
        >
          {CONFIDENCE_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
        </span>

        {pendingBatchIds.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={pricing}
            onClick={() => void priceAllPending()}
          >
            {pricingProgress
              ? `Pricing ${pricingProgress.current} of ${pricingProgress.total} batches…`
              : 'Price All Pending'}
          </Button>
        )}

        {selectedIds.size > 0 && (
          <Button size="sm" variant="destructive" onClick={() => void archiveSelected()}>
            Archive Selected ({selectedIds.size})
          </Button>
        )}
      </div>

      <ItemsTable
        items={filtered}
        loading={loading}
        onRowClick={setSelectedItem}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
      />

      <ItemDrawer
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        updateItemStatus={updateItemStatus}
      />
    </div>
  )
}
