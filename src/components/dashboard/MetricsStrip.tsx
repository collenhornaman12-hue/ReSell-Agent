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
