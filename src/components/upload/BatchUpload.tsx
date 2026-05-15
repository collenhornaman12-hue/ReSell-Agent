import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { OverallProgress, ItemProgress } from './UploadProgress'
import { useCloudinaryUpload } from '@/hooks/useCloudinaryUpload'
import { UploadCloud } from 'lucide-react'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILES = 1200

interface FolderItem {
  name: string
  files: File[]
}

async function readEntries(entry: FileSystemDirectoryEntry): Promise<File[]> {
  return new Promise((resolve) => {
    const reader = entry.createReader()
    const files: File[] = []
    const readBatch = () => {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(files)
          return
        }
        const promises = entries.map((e) => {
          if (e.isFile) {
            return new Promise<void>((res) => {
              ;(e as FileSystemFileEntry).file((f) => {
                if (ACCEPTED.includes(f.type)) files.push(f)
                res()
              })
            })
          }
          if (e.isDirectory) {
            return readEntries(e as FileSystemDirectoryEntry).then((subFiles) => {
              files.push(...subFiles)
            })
          }
          return Promise.resolve()
        })
        Promise.all(promises).then(readBatch)
      })
    }
    readBatch()
  })
}

async function extractFolderItems(dataTransfer: DataTransfer): Promise<FolderItem[]> {
  const items = Array.from(dataTransfer.items)
  const folderMap: Record<string, File[]> = {}

  await Promise.all(
    items.map(async (item) => {
      const entry = item.webkitGetAsEntry()
      if (!entry) return
      if (entry.isDirectory) {
        const files = await readEntries(entry as FileSystemDirectoryEntry)
        if (files.length > 0) {
          folderMap[entry.name] = [...(folderMap[entry.name] ?? []), ...files]
        }
      } else if (entry.isFile) {
        const file = item.getAsFile()
        if (file && ACCEPTED.includes(file.type)) {
          const key = 'Untitled Item'
          folderMap[key] = [...(folderMap[key] ?? []), file]
        }
      }
    })
  )

  return Object.entries(folderMap).map(([name, files]) => ({ name, files }))
}

function validateItems(items: FolderItem[]): string | null {
  const total = items.reduce((s, i) => s + i.files.length, 0)
  if (total === 0) return 'No valid image files found.'
  if (total > MAX_FILES) return `Too many files (${total}). Max is ${MAX_FILES}.`
  return null
}

export function BatchUpload() {
  const [isDragOver, setIsDragOver] = useState(false)
  const [pendingItems, setPendingItems] = useState<FolderItem[]>([])
  const [validationError, setValidationError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  const { batch, uploadBatch, overallPercent, reset } = useCloudinaryUpload()

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragOver(false)
    setValidationError(null)
    const items = await extractFolderItems(e.dataTransfer)
    const err = validateItems(items)
    if (err) { setValidationError(err); setPendingItems([]); return }
    setPendingItems(items)
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null)
    const files = Array.from(e.target.files ?? []).filter((f) => ACCEPTED.includes(f.type))
    if (files.length === 0) { setValidationError('No valid image files selected.'); return }
    if (files.length > MAX_FILES) { setValidationError(`Too many files (${files.length}). Max is ${MAX_FILES}.`); return }
    setPendingItems([{ name: 'Uploaded Photos', files }])
  }, [])

  const handleUpload = useCallback(async () => {
    if (pendingItems.length === 0) return
    await uploadBatch(pendingItems)
  }, [pendingItems, uploadBatch])

  const handleReset = useCallback(() => {
    reset()
    setPendingItems([])
    setValidationError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [reset])

  const isDone = batch?.overallStatus === 'done'
  const itemsMap = batch?.items ?? {}
  const doneCount = Object.values(itemsMap).filter((i) => i.status === 'done').length

  return (
    <div className="space-y-4">
      {!batch && (
        <>
          <div
            onDragEnter={(e) => { e.preventDefault(); dragCounterRef.current++; setIsDragOver(true) }}
            onDragOver={(e) => { e.preventDefault() }}
            onDragLeave={() => { dragCounterRef.current--; if (dragCounterRef.current === 0) setIsDragOver(false) }}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
          >
            <UploadCloud className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-base font-medium">Drop folders or images here</p>
            <p className="text-sm text-muted-foreground mt-1">Each folder becomes one item · JPG, PNG, WebP · up to 1,200 photos</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
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
                  Ready to upload {pendingItems.length} item(s) ·{' '}
                  {pendingItems.reduce((s, i) => s + i.files.length, 0)} photos
                </p>
                <ul className="space-y-1 mb-4">
                  {pendingItems.map((item) => (
                    <li key={item.name} className="text-sm flex justify-between">
                      <span className="truncate">{item.name}</span>
                      <span className="text-muted-foreground ml-2">{item.files.length} photos</span>
                    </li>
                  ))}
                </ul>
                <Button onClick={handleUpload} className="w-full">Start Upload</Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

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
