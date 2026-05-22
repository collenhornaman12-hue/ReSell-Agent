import { useMemo, useState } from 'react'
import { useInventoryContext } from '@/context/InventoryContext'
import { Item } from '@/hooks/useInventory'
import { ItemsTable } from './ItemsTable'
import { ItemDrawer } from './ItemDrawer'
import { Button } from '@/components/ui/button'

export function ArchivedView() {
  const { items, loading, updateItemStatus, deleteItem } = useInventoryContext()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)

  const archived = useMemo(() => items.filter((i) => i.status === 'Archived'), [items])

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(allSelected: boolean) {
    setSelectedIds(allSelected ? new Set(archived.map((i) => i.item_id)) : new Set())
  }

  async function restoreSelected() {
    await Promise.all([...selectedIds].map((id) => updateItemStatus(id, 'PendingReview')))
    setSelectedIds(new Set())
  }

  async function deleteSelected() {
    await Promise.all([...selectedIds].map((id) => deleteItem(id)))
    setSelectedIds(new Set())
  }

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold">Archived</h2>
          <p className="text-sm text-muted-foreground">
            {archived.length} item{archived.length !== 1 ? 's' : ''}
          </p>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void restoreSelected()}>
              Restore Selected ({selectedIds.size})
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void deleteSelected()}>
              Delete Selected ({selectedIds.size})
            </Button>
          </div>
        )}
      </div>

      <ItemsTable
        items={archived}
        loading={loading}
        onRowClick={setSelectedItem}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        showActions
        onRestore={(id) => void updateItemStatus(id, 'PendingReview')}
        onDelete={(id) => void deleteItem(id)}
      />

      <ItemDrawer
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        updateItemStatus={updateItemStatus}
      />
    </div>
  )
}
