import { useCallback, useEffect, useRef, useState } from 'react'

export interface PollStatusItem {
  item_id: string
  item_name: string
  identification_confidence: 'High' | 'Medium' | 'Low' | null
  status: string
  photos: string[]
}

interface PollState {
  items: PollStatusItem[]
  isDone: boolean
  error: string | null
}

export function useBatchPolling(batchId: string | null, expectedCount: number) {
  const [state, setState] = useState<PollState>({ items: [], isDone: false, error: null })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/vision/status?batch_id=${encodeURIComponent(id)}`)
      if (!res.ok) throw new Error(`Poll failed: ${res.status}`)
      const items = (await res.json()) as PollStatusItem[]
      const isDone = expectedCount > 0 && items.length >= expectedCount
      setState({ items, isDone, error: null })
      return isDone
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Poll error',
      }))
      return false
    }
  }, [expectedCount])

  useEffect(() => {
    if (!batchId) {
      setState({ items: [], isDone: false, error: null })
      return
    }

    void poll(batchId)

    intervalRef.current = setInterval(async () => {
      const done = await poll(batchId)
      if (done && intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }, 5000)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [batchId, poll])

  return state
}
