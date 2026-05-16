import { useState, useCallback, useRef } from 'react'

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`

export type PhotoStatus = 'pending' | 'uploading' | 'done' | 'error'

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
  overallStatus: 'idle' | 'uploading' | 'done' | 'error'
  triggerStatus: 'idle' | 'pending' | 'success' | 'error'
  triggerError?: string
  expectedItemCount: number
}

function makeThumbnailUrl(secureUrl: string): string {
  return secureUrl.replace('/upload/', '/upload/w_120,h_120,c_fill/')
}

async function uploadFile(
  file: File,
  publicId: string
): Promise<UploadedPhoto> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file)
    form.append('upload_preset', UPLOAD_PRESET)
    form.append('public_id', publicId)

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText)
        resolve({
          publicId: data.public_id,
          secureUrl: data.secure_url,
          thumbnailUrl: makeThumbnailUrl(data.secure_url),
        })
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
    xhr.open('POST', UPLOAD_URL)
    xhr.send(form)
  })
}

async function triggerVisionPipeline(
  batchId: string,
  items: Array<{ item_name_seed: string; photo_urls: string[] }>
): Promise<number> {
  const res = await fetch('/api/vision/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch_id: batchId, items }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Vision trigger failed (${res.status}): ${text}`)
  }
  const data = (await res.json()) as { status: string; item_count: number }
  return data.item_count ?? 0
}

export function useCloudinaryUpload() {
  const [batch, setBatch] = useState<BatchState | null>(null)
  const abortRef = useRef(false)

  const initBatch = useCallback((): string => {
    const batchId = crypto.randomUUID()
    setBatch({
      batchId,
      items: {},
      overallStatus: 'idle',
      triggerStatus: 'idle',
      expectedItemCount: 0,
    })
    abortRef.current = false
    return batchId
  }, [])

  const uploadItem = useCallback(
    async (
      batchId: string,
      itemName: string,
      files: File[]
    ): Promise<UploadedPhoto[]> => {
      const itemKey = `${batchId}/${itemName}`

      setBatch((prev) =>
        prev
          ? {
              ...prev,
              items: {
                ...prev.items,
                [itemKey]: {
                  itemName,
                  totalFiles: files.length,
                  uploadedCount: 0,
                  failedCount: 0,
                  status: 'uploading',
                  photos: [],
                },
              },
            }
          : prev
      )

      const photos: UploadedPhoto[] = []
      let failedCount = 0

      for (let i = 0; i < files.length; i++) {
        if (abortRef.current) break
        const file = files[i]
        const publicId = `resell-agent/${batchId}/${itemName}/${i}`
        try {
          const photo = await uploadFile(file, publicId)
          photos.push(photo)
          setBatch((prev) =>
            prev
              ? {
                  ...prev,
                  items: {
                    ...prev.items,
                    [itemKey]: {
                      ...prev.items[itemKey],
                      uploadedCount: photos.length,
                      photos: [...photos],
                    },
                  },
                }
              : prev
          )
        } catch {
          failedCount++
          setBatch((prev) =>
            prev
              ? {
                  ...prev,
                  items: {
                    ...prev.items,
                    [itemKey]: {
                      ...prev.items[itemKey],
                      failedCount,
                    },
                  },
                }
              : prev
          )
        }
      }

      setBatch((prev) =>
        prev
          ? {
              ...prev,
              items: {
                ...prev.items,
                [itemKey]: {
                  ...prev.items[itemKey],
                  status: failedCount === files.length ? 'error' : 'done',
                  error: failedCount > 0 ? `${failedCount} file(s) failed` : undefined,
                },
              },
            }
          : prev
      )

      return photos
    },
    []
  )

  const uploadBatch = useCallback(
    async (items: Array<{ name: string; files: File[] }>): Promise<void> => {
      const batchId = initBatch()

      setBatch((prev) => (prev ? { ...prev, overallStatus: 'uploading' } : prev))

      const triggerItems: Array<{ item_name_seed: string; photo_urls: string[] }> = []

      for (const item of items) {
        if (abortRef.current) break
        const photos = await uploadItem(batchId, item.name, item.files)
        if (photos.length > 0) {
          triggerItems.push({
            item_name_seed: item.name,
            photo_urls: photos.map((p) => p.secureUrl),
          })
        }
      }

      setBatch((prev) => {
        if (!prev) return prev
        const allFailed = Object.values(prev.items).every((i) => i.status === 'error')
        return { ...prev, overallStatus: allFailed ? 'error' : 'done' }
      })

      setBatch((prev) => (prev ? { ...prev, triggerStatus: 'pending' } : prev))
      try {
        const itemCount = await triggerVisionPipeline(batchId, triggerItems)
        setBatch((prev) =>
          prev ? { ...prev, triggerStatus: 'success', expectedItemCount: itemCount } : prev
        )
      } catch (err) {
        setBatch((prev) =>
          prev
            ? {
                ...prev,
                triggerStatus: 'error',
                triggerError: err instanceof Error ? err.message : 'Unknown error',
              }
            : prev
        )
      }
    },
    [initBatch, uploadItem]
  )

  const reset = useCallback(() => {
    abortRef.current = true
    setBatch(null)
  }, [])

  const overallPercent = batch
    ? (() => {
        const items = Object.values(batch.items)
        if (items.length === 0) return 0
        const total = items.reduce((s, i) => s + i.totalFiles, 0)
        const done = items.reduce((s, i) => s + i.uploadedCount, 0)
        return total === 0 ? 0 : Math.round((done / total) * 100)
      })()
    : 0

  return { batch, uploadBatch, uploadItem, initBatch, reset, overallPercent }
}
