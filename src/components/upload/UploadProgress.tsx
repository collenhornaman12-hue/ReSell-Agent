import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { ItemUploadState } from '@/hooks/useCloudinaryUpload'

interface ItemProgressProps {
  item: ItemUploadState
}

export function ItemProgress({ item }: ItemProgressProps) {
  const pct = item.totalFiles === 0 ? 0 : Math.round((item.uploadedCount / item.totalFiles) * 100)

  const variant =
    item.status === 'error'
      ? 'destructive'
      : item.status === 'done'
      ? 'default'
      : 'secondary'

  const label =
    item.status === 'done'
      ? 'Done'
      : item.status === 'error'
      ? 'Error'
      : item.status === 'uploading'
      ? `${item.uploadedCount}/${item.totalFiles}`
      : 'Pending'

  return (
    <Card className="mb-2">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium truncate max-w-[60%]">{item.itemName}</span>
          <Badge variant={variant}>{label}</Badge>
        </div>
        <Progress value={pct} className="h-2" />
        {item.error && <p className="text-xs text-destructive mt-1">{item.error}</p>}
        {item.photos.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {item.photos.slice(0, 8).map((p) => (
              <img
                key={p.publicId}
                src={p.thumbnailUrl}
                alt=""
                className="w-10 h-10 object-cover rounded"
              />
            ))}
            {item.photos.length > 8 && (
              <span className="text-xs text-muted-foreground self-center">+{item.photos.length - 8}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface OverallProgressProps {
  percent: number
  triggerStatus: 'idle' | 'pending' | 'success' | 'error'
  triggerError?: string
  itemCount: number
  doneCount: number
}

export function OverallProgress({ percent, triggerStatus, triggerError, itemCount, doneCount }: OverallProgressProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">Overall Progress</span>
        <span className="text-sm text-muted-foreground">{doneCount}/{itemCount} items · {percent}%</span>
      </div>
      <Progress value={percent} className="h-3" />
      {triggerStatus === 'pending' && (
        <p className="text-xs text-muted-foreground mt-2">Triggering vision pipeline...</p>
      )}
      {triggerStatus === 'success' && (
        <p className="text-xs text-green-600 dark:text-green-400 mt-2">Vision pipeline triggered successfully.</p>
      )}
      {triggerStatus === 'error' && (
        <p className="text-xs text-destructive mt-2">Pipeline trigger failed: {triggerError}</p>
      )}
    </div>
  )
}
