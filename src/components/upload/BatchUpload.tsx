import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { OverallProgress, ItemProgress } from './UploadProgress'
import { useCloudinaryUpload } from '@/hooks/useCloudinaryUpload'
import { UploadCloud } from 'lucide-react'

const ACCEPTED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
])
const ACCEPTED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic'])
const MAX_FILES = 1200

function isAcceptedImage(f: File): boolean {
  if (ACCEPTED_TYPES.has(f.type)) return true
  const dot = f.name.lastIndexOf('.')
  return dot !== -1 && ACCEPTED_EXTS.has(f.name.slice(dot).toLowerCase())
}

interface FolderItem {
  name: string
  files: File[]
}

// Reads ALL direct children of a directory, handling the ≤100-per-call limit.
async function readImmediateChildren(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    const reader = dir.createReader()
    const all: FileSystemEntry[] = []
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) { resolve(all); return }
        all.push(...batch)
        readBatch()
      })
    }
    readBatch()
  })
}

// Recursively collects all accepted image files from a directory.
async function readAllFiles(dir: FileSystemDirectoryEntry): Promise<File[]> {
  const children = await readImmediateChildren(dir)
  const groups = await Promise.all(
    children.map(async (child): Promise<File[]> => {
      if (child.isFile) {
        return new Promise<File[]>((res) => {
          ;(child as FileSystemFileEntry).file(
            (f) => res(isAcceptedImage(f) ? [f] : []),
            () => res([])
          )
        })
      }
      if (child.isDirectory) return readAllFiles(child as FileSystemDirectoryEntry)
      return []
    })
  )
  return groups.flat()
}

interface ExtractResult {
  items: FolderItem[]
  isFolderOfFolders: boolean
}

async function extractFolderItems(dataTransfer: DataTransfer): Promise<ExtractResult> {
  const dtItems = Array.from(dataTransfer.items)
  const folderMap: Record<string, File[]> = {}

  for (const dtItem of dtItems) {
    const entry = dtItem.webkitGetAsEntry()
    if (!entry) continue

    if (entry.isDirectory) {
      const children = await readImmediateChildren(entry as FileSystemDirectoryEntry)
      const subDirs = children.filter((c) => c.isDirectory) as FileSystemDirectoryEntry[]

      if (subDirs.length > 0) {
        // Folder-of-folders: each immediate subdirectory becomes a separate item.
        const items: FolderItem[] = []
        for (const sub of subDirs) {
          const files = await readAllFiles(sub)
          if (files.length > 0) items.push({ name: sub.name, files })
        }
        return { items, isFolderOfFolders: true }
      }

      // Plain folder with only files — single item.
      const files = await readAllFiles(entry as FileSystemDirectoryEntry)
      if (files.length > 0) folderMap[entry.name] = files
    } else if (entry.isFile) {
      const file = dtItem.getAsFile()
      if (file && isAcceptedImage(file)) {
        folderMap['Untitled Item'] = [...(folderMap['Untitled Item'] ?? []), file]
      }
    }
  }

  return {
    items: Object.entries(folderMap).map(([name, files]) => ({ name, files })),
    isFolderOfFolders: false,
  }
}

function validateItems(items: FolderItem[]): string | null {
  const total = items.reduce((s, i) => s + i.files.length, 0)
  if (total === 0) return 'No valid image files found.'
  if (total > MAX_FILES) return `Too many files (${total}). Max is ${MAX_FILES}.`
  return null
}

// Direct Cloudinary upload used in folder-of-folders mode (each folder has its own batchId).
async function uploadFileDirect(
  file: File,
  batchId: string,
  itemName: string,
  index: number
): Promise<string | null> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string
  const publicId = `resell-agent/${batchId}/${itemName}/${index}`
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file)
    form.append('upload_preset', preset)
    form.append('public_id', publicId)
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve((JSON.parse(xhr.responseText) as { secure_url: string }).secure_url)
      } else {
        resolve(null)
      }
    })
    xhr.addEventListener('error', () => resolve(null))
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`)
    xhr.send(form)
  })
}

export function BatchUpload() {
  const [isDragOver, setIsDragOver] = useState(false)
  const [pendingItems, setPendingItems] = useState<FolderItem[]>([])
  const [isFolderOfFolders, setIsFolderOfFolders] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [folderProgress, setFolderProgress] = useState<{
    current: number
    total: number
    folderName: string
  } | null>(null)
  const [foldersDone, setFoldersDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  const { batch, uploadBatch, overallPercent, reset } = useCloudinaryUpload()

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragOver(false)
    setValidationError(null)
    setFoldersDone(false)
    const { items, isFolderOfFolders: isFoF } = await extractFolderItems(e.dataTransfer)
    const err = validateItems(items)
    if (err) { setValidationError(err); setPendingItems([]); return }
    setIsFolderOfFolders(isFoF)
    setPendingItems(items)
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null)
    setIsFolderOfFolders(false)
    setFoldersDone(false)
    const files = Array.from(e.target.files ?? []).filter(isAcceptedImage)
    if (files.length === 0) { setValidationError('No valid image files selected.'); return }
    if (files.length > MAX_FILES) { setValidationError(`Too many files (${files.length}). Max is ${MAX_FILES}.`); return }
    setPendingItems([{ name: 'Uploaded Photos', files }])
  }, [])

  const handleUpload = useCallback(async () => {
    if (pendingItems.length === 0) return

    if (isFolderOfFolders) {
      setFoldersDone(false)
      for (let i = 0; i < pendingItems.length; i++) {
        const item = pendingItems[i]
        setFolderProgress({ current: i + 1, total: pendingItems.length, folderName: item.name })

        const batchId = crypto.randomUUID()
        const photoUrls: string[] = []
        for (let j = 0; j < item.files.length; j++) {
          const url = await uploadFileDirect(item.files[j], batchId, item.name, j)
          if (url) photoUrls.push(url)
        }

        if (photoUrls.length > 0) {
          try {
            await fetch('/api/vision/trigger', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Worker-Token': import.meta.env.VITE_WORKER_SECRET,
              },
              body: JSON.stringify({
                batch_id: batchId,
                items: [{ item_name_seed: item.name, photo_urls: photoUrls }],
              }),
            })
          } catch (err) {
            console.error(`Vision trigger failed for folder "${item.name}":`, err)
          }
        }

        if (i < pendingItems.length - 1) {
          await new Promise((r) => setTimeout(r, 500))
        }
      }
      setFolderProgress(null)
      setFoldersDone(true)
    } else {
      await uploadBatch(pendingItems)
    }
  }, [pendingItems, isFolderOfFolders, uploadBatch])

  const handleReset = useCallback(() => {
    reset()
    setPendingItems([])
    setValidationError(null)
    setIsFolderOfFolders(false)
    setFolderProgress(null)
    setFoldersDone(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [reset])

  const isProcessingFolders = folderProgress !== null
  const isDone = batch?.overallStatus === 'done'
  const itemsMap = batch?.items ?? {}
  const doneCount = Object.values(itemsMap).filter((i) => i.status === 'done').length

  return (
    <div className="space-y-4">
      {/* Folder-of-folders: sequential processing progress */}
      {isProcessingFolders && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm font-medium">
              Processing folder {folderProgress.current} of {folderProgress.total}:{' '}
              <span className="text-muted-foreground">{folderProgress.folderName}</span>
            </p>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${(folderProgress.current / folderProgress.total) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Folder-of-folders: done state */}
      {foldersDone && !isProcessingFolders && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-medium">
              Done —{' '}
              {pendingItems.length} folder{pendingItems.length !== 1 ? 's' : ''} submitted for
              processing.
            </p>
            <Button variant="outline" onClick={handleReset} className="mt-3 w-full">
              Start New Batch
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Drop zone + pending items preview */}
      {!isProcessingFolders && !foldersDone && !batch && (
        <>
          <div
            onDragEnter={(e) => { e.preventDefault(); dragCounterRef.current++; setIsDragOver(true) }}
            onDragOver={(e) => { e.preventDefault() }}
            onDragLeave={() => { dragCounterRef.current--; if (dragCounterRef.current === 0) setIsDragOver(false) }}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
              isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
          >
            <UploadCloud className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-base font-medium">Drop a folder of folders, a folder, or images here</p>
            <p className="text-sm text-muted-foreground mt-1">
              Parent folder → each subfolder becomes one item · JPG, PNG, WebP, HEIC · up to 1,200 photos
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/heic,.heic"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          {validationError && (
            <p className="text-sm text-destructive">{validationError}</p>
          )}

          {pendingItems.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm font-medium mb-2">
                  {isFolderOfFolders
                    ? `Ready to process ${pendingItems.length} folder${pendingItems.length !== 1 ? 's' : ''} as separate items`
                    : `Ready to upload ${pendingItems.length} item(s) · ${pendingItems.reduce((s, i) => s + i.files.length, 0)} photos`}
                </p>
                <ul className="space-y-1 mb-4">
                  {pendingItems.map((item) => (
                    <li key={item.name} className="text-sm flex justify-between">
                      <span className="truncate">{item.name}</span>
                      <span className="text-muted-foreground ml-2">
                        {item.files.length} photo{item.files.length !== 1 ? 's' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button onClick={() => void handleUpload()} className="w-full">
                  {isFolderOfFolders ? 'Process All Folders' : 'Start Upload'}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Single-batch upload progress (existing path) */}
      {batch && (
        <div>
          <OverallProgress
            percent={overallPercent}
            triggerStatus={batch.triggerStatus}
            triggerError={batch.triggerError}
            itemCount={Object.keys(itemsMap).length}
            doneCount={doneCount}
          />
          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {Object.values(itemsMap).map((item) => (
              <ItemProgress key={item.itemName} item={item} />
            ))}
          </div>
          {isDone && (
            <Button variant="outline" onClick={handleReset} className="mt-4 w-full">
              Start New Batch
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
