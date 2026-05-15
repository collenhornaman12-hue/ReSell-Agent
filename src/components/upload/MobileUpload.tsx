import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { OverallProgress, ItemProgress } from './UploadProgress'
import { useCloudinaryUpload } from '@/hooks/useCloudinaryUpload'
import { Camera, Plus } from 'lucide-react'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

interface Session {
  id: string
  name: string
  files: File[]
  previews: string[]
}

export function MobileUpload() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const sessionCounterRef = useRef(1)
  const pendingCaptureSessionRef = useRef<string | null>(null)
  const allPreviewUrlsRef = useRef<Set<string>>(new Set())
  const { batch, uploadBatch, overallPercent, reset } = useCloudinaryUpload()

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null

  const handleNewItem = useCallback(() => {
    const id = crypto.randomUUID()
    const name = `Item ${sessionCounterRef.current++}`
    setSessions((prev) => [...prev, { id, name, files: [], previews: [] }])
    setActiveSessionId(id)
  }, [])

  const handleCameraCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const targetId = pendingCaptureSessionRef.current
      if (!targetId) return
      const files = Array.from(e.target.files ?? []).filter((f) => ACCEPTED.includes(f.type))
      if (files.length === 0) return

      const newPreviews = files.map((f) => URL.createObjectURL(f))
      newPreviews.forEach((url) => allPreviewUrlsRef.current.add(url))

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== targetId) return s
          return { ...s, files: [...s.files, ...files], previews: [...s.previews, ...newPreviews] }
        })
      )

      if (cameraInputRef.current) cameraInputRef.current.value = ''
    },
    []
  )

  const handleUploadAll = useCallback(async () => {
    const items = sessions.filter((s) => s.files.length > 0).map((s) => ({ name: s.name, files: s.files }))
    if (items.length === 0) return
    await uploadBatch(items)
  }, [sessions, uploadBatch])

  const handleReset = useCallback(() => {
    sessions.forEach((s) => s.previews.forEach((url) => URL.revokeObjectURL(url)))
    allPreviewUrlsRef.current.clear()
    reset()
    setSessions([])
    setActiveSessionId(null)
    sessionCounterRef.current = 1
  }, [sessions, reset])

  useEffect(() => {
    return () => {
      allPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const isUploading = batch?.overallStatus === 'uploading'
  const isDone = batch?.overallStatus === 'done'
  const totalPhotos = sessions.reduce((s, sess) => s + sess.files.length, 0)

  if (batch) {
    const itemsMap = batch.items
    const doneCount = Object.values(itemsMap).filter((i) => i.status === 'done').length
    return (
      <div className="space-y-4">
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
          <Button variant="outline" onClick={handleReset} className="w-full">
            Start New Session
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* New Item button */}
      <Button
        onClick={handleNewItem}
        size="lg"
        className="w-full h-16 text-lg gap-2"
      >
        <Plus className="h-6 w-6" />
        New Item
      </Button>

      {/* Active session status */}
      {activeSession && (
        <Card className="border-primary">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-medium">{activeSession.name}</p>
                <p className="text-sm text-muted-foreground">{activeSession.files.length} photo(s)</p>
              </div>
              <Badge>Active</Badge>
            </div>
            {/* Thumbnail strip */}
            {activeSession.previews.length > 0 && (
              <div className="flex gap-1 overflow-x-auto pb-1 mb-3">
                {activeSession.previews.slice(-8).map((url) => (
                  <img
                    key={url}
                    src={url}
                    alt=""
                    className="w-14 h-14 object-cover rounded flex-shrink-0"
                  />
                ))}
              </div>
            )}
            {/* Camera trigger */}
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                pendingCaptureSessionRef.current = activeSessionId
                cameraInputRef.current?.click()
              }}
            >
              <Camera className="h-4 w-4" />
              Add Photos
            </Button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handleCameraCapture}
            />
          </CardContent>
        </Card>
      )}

      {/* All sessions list */}
      {sessions.length > 0 && (
        <div className="space-y-2">
          {sessions.map((session) => (
            <Card
              key={session.id}
              className={`cursor-pointer transition-colors ${session.id === activeSessionId ? 'border-primary' : ''}`}
              onClick={() => setActiveSessionId(session.id)}
            >
              <CardContent className="pt-3 pb-3 flex items-center justify-between">
                <span className="text-sm font-medium">{session.name}</span>
                <span className="text-sm text-muted-foreground">{session.files.length} photos</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload all button */}
      {totalPhotos > 0 && (
        <Button
          onClick={handleUploadAll}
          className="w-full"
          disabled={isUploading}
        >
          Upload All ({sessions.length} items · {totalPhotos} photos)
        </Button>
      )}
    </div>
  )
}
