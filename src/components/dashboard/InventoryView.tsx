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
      </div>

      <ItemsTable items={filtered} loading={loading} onRowClick={setSelectedItem} />

      <ItemDrawer
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        updateItemStatus={updateItemStatus}
      />
    </div>
  )
}
