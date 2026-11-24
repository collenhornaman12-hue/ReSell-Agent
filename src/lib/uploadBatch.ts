// Pure state machine for one Cloudinary upload batch (useCloudinaryUpload).
// Two parallel sub-states: overallStatus (photo uploads) and triggerStatus (vision trigger).
// See STATE_MACHINES.md -> "Upload batch". Update it when you add a state or action.

export type PhotoStatus = 'pending' | 'uploading' | 'done' | 'error'
export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'
export type TriggerStatus = 'idle' | 'pending' | 'success' | 'error'

export interface UploadedPhoto {
  publicId: string
  secureUrl: string
  thumbnailUrl: string
}

export interface ItemUploadState {
  itemName: string
  totalFiles: number
  uploadedCount: number
  failedCount: number
  status: PhotoStatus
  photos: UploadedPhoto[]
  error?: string
}

export interface BatchState {
  batchId: string
  items: Record<string, ItemUploadState>
  overallStatus: UploadStatus
  triggerStatus: TriggerStatus
  triggerError?: string
  expectedItemCount: number
}

export type BatchAction =
  | { type: 'init'; batchId: string }
  | { type: 'uploadsStarted' }
  | { type: 'itemStarted'; itemKey: string; itemName: string; totalFiles: number }
  | { type: 'photoUploaded'; itemKey: string; photos: UploadedPhoto[] }
  | { type: 'photoFailed'; itemKey: string; failedCount: number }
  | { type: 'itemFinished'; itemKey: string; failedCount: number; totalFiles: number }
  | { type: 'uploadsFinished' }
  | { type: 'triggerStarted' }
  | { type: 'triggerSucceeded'; itemCount: number }
  | { type: 'triggerFailed'; error: string }

function patchItem(prev: BatchState, itemKey: string, patch: Partial<ItemUploadState>): BatchState {
  return {
    ...prev,
    items: { ...prev.items, [itemKey]: { ...prev.items[itemKey], ...patch } },
  }
}

/**
 * A null batch means "reset / nothing in flight": every action except `init` is ignored,
 * so late callbacks from an aborted upload cannot resurrect it.
 */
export function batchReducer(prev: BatchState | null, action: BatchAction): BatchState | null {
  if (action.type === 'init') {
    return {
      batchId: action.batchId,
      items: {},
      overallStatus: 'idle',
      triggerStatus: 'idle',
      expectedItemCount: 0,
    }
  }
  if (!prev) return prev

  switch (action.type) {
    case 'uploadsStarted':
      return { ...prev, overallStatus: 'uploading' }
    case 'itemStarted':
      return {
        ...prev,
        items: {
          ...prev.items,
          [action.itemKey]: {
            itemName: action.itemName,
            totalFiles: action.totalFiles,
            uploadedCount: 0,
            failedCount: 0,
            status: 'uploading',
            photos: [],
          },
        },
      }
    case 'photoUploaded':
      return patchItem(prev, action.itemKey, {
        uploadedCount: action.photos.length,
        photos: [...action.photos],
      })
    case 'photoFailed':
      return patchItem(prev, action.itemKey, { failedCount: action.failedCount })
    case 'itemFinished':
      return patchItem(prev, action.itemKey, {
        status: action.failedCount === action.totalFiles ? 'error' : 'done',
        error: action.failedCount > 0 ? `${action.failedCount} file(s) failed` : undefined,
      })
    case 'uploadsFinished': {
      // Note: a batch with zero items counts as "all failed" (every() on [] is true).
      const allFailed = Object.values(prev.items).every((i) => i.status === 'error')
      return { ...prev, overallStatus: allFailed ? 'error' : 'done' }
    }
    case 'triggerStarted':
      return { ...prev, triggerStatus: 'pending' }
    case 'triggerSucceeded':
      return { ...prev, triggerStatus: 'success', expectedItemCount: action.itemCount }
    case 'triggerFailed':
      return { ...prev, triggerStatus: 'error', triggerError: action.error }
  }
}

/** Uploaded photos / total photos across the batch, as a rounded percent. */
export function batchPercent(batch: BatchState | null): number {
  if (!batch) return 0
  const items = Object.values(batch.items)
  if (items.length === 0) return 0
  const total = items.reduce((s, i) => s + i.totalFiles, 0)
  const done = items.reduce((s, i) => s + i.uploadedCount, 0)
  return total === 0 ? 0 : Math.round((done / total) * 100)
}
