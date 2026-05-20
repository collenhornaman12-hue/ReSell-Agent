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
          {reviewItems.length} item{reviewItems.length !== 1 ? 's' : ''} need
          {reviewItems.length === 1 ? 's' : ''} attention
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
