import { useState, useCallback, useRef } from 'react'
import {
  batchPercent,
  batchReducer,
  type BatchAction,
  type BatchState,
  type UploadedPhoto,
} from '@/lib/uploadBatch'

// Types live with the pure state machine in src/lib/uploadBatch.ts; re-exported for existing imports.
export type {
  BatchState,
  ItemUploadState,
  PhotoStatus,
  UploadedPhoto,
} from '@/lib/uploadBatch'

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`

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
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Token': import.meta.env.VITE_WORKER_SECRET,
    },
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
  const dispatch = useCallback((action: BatchAction) => {
    setBatch((prev) => batchReducer(prev, action))
  }, [])

  const initBatch = useCallback((): string => {
    const batchId = crypto.randomUUID()
    dispatch({ type: 'init', batchId })
    abortRef.current = false
    return batchId
  }, [dispatch])

  const uploadItem = useCallback(
    async (
      batchId: string,
      itemName: string,
      files: File[]
    ): Promise<UploadedPhoto[]> => {
      const itemKey = `${batchId}/${itemName}`

      dispatch({ type: 'itemStarted', itemKey, itemName, totalFiles: files.length })

      const photos: UploadedPhoto[] = []
      let failedCount = 0

      for (let i = 0; i < files.length; i++) {
        if (abortRef.current) break
        const file = files[i]
        const publicId = `resell-agent/${batchId}/${itemName}/${i}`
        try {
          const photo = await uploadFile(file, publicId)
          photos.push(photo)
          dispatch({ type: 'photoUploaded', itemKey, photos })
        } catch {
          failedCount++
          dispatch({ type: 'photoFailed', itemKey, failedCount })
        }
      }

      dispatch({ type: 'itemFinished', itemKey, failedCount, totalFiles: files.length })

      return photos
    },
    [dispatch]
  )

  const uploadBatch = useCallback(
    async (items: Array<{ name: string; files: File[] }>): Promise<void> => {
      const batchId = initBatch()

      dispatch({ type: 'uploadsStarted' })

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

      dispatch({ type: 'uploadsFinished' })

      dispatch({ type: 'triggerStarted' })
      console.log('[upload] triggerItems:', JSON.stringify(triggerItems, null, 2))
      try {
        const itemCount = await triggerVisionPipeline(batchId, triggerItems)
        dispatch({ type: 'triggerSucceeded', itemCount })
      } catch (err) {
        dispatch({
          type: 'triggerFailed',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    },
    [dispatch, initBatch, uploadItem]
  )

  const reset = useCallback(() => {
    abortRef.current = true
    setBatch(null)
  }, [])

  const overallPercent = batchPercent(batch)

  return { batch, uploadBatch, uploadItem, initBatch, reset, overallPercent }
}
