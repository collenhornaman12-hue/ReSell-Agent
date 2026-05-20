import { cn } from '@/lib/utils'
import { formatPrice, formatRelativeTime } from '@/lib/format'
import { Item } from '@/hooks/useInventory'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
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
          {showActions && <TableHead className="w-36">Actions</TableHead>}
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
