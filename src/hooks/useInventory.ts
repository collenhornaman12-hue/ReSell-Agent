import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
)

export type ItemStatus =
  | 'PendingReview'
  | 'ReadyToList'
  | 'Listed'
  | 'SoldPendingApproval'
  | 'Sold'
  | 'Archived'

export interface Item {
  item_id: string
  photos: string[] | null
  item_name: string
  brand: string | null
  model_number: string | null
  category: string | null
  subcategory: string | null
  condition_raw: 'Mint' | 'VeryGood' | 'Good' | 'Fair' | 'Poor' | null
  condition_ebay: string | null
  condition_notes: string | null
  is_complete: boolean | null
  keywords: string[] | null
  identification_confidence: 'High' | 'Medium' | 'Low' | null
  description_short: string | null
  description_long: string | null
  ebay_search_query: string | null
  ebay_comps_count: number | null
  ebay_comp_price_median: number | null
  ebay_comp_price_range: string | null
  ebay_price: number | null
  fb_price: number | null
  list_price_final: number | null
  price_confidence: 'High' | 'Medium' | 'Low' | null
  price_override_reason: string | null
  listing_mode: 'Individual' | 'Bundle' | null
  bundle_id: string | null
  status: ItemStatus
  ebay_listing_id: string | null
  fb_listing_id: string | null
  price_drop_count: number | null
  last_price_drop_date: string | null
  weight_oz: number | null
  dimensions_lxwxh_in: string | null
  buyer_platform: 'eBay' | 'Facebook' | null
  buyer_handle: string | null
  sale_price: number | null
  shipping_carrier: string | null
  tracking_number: string | null
  shipping_label_url: string | null
  date_added: string | null
  date_listed: string | null
  date_sold: string | null
  created_by: string | null
  batch_id: string | null
}

export interface Metrics {
  total: number
  listedValue: number
  pendingReview: number
  listed: number
  sold: number
  archived: number
}

export interface UseInventoryReturn {
  items: Item[]
  metrics: Metrics
  loading: boolean
  error: string | null
  updateItemStatus: (item_id: string, newStatus: ItemStatus) => Promise<void>
  updateItem: (item_id: string, changes: Partial<Item>) => Promise<void>
  deleteItem: (item_id: string) => Promise<void>
  refresh: () => Promise<void>
}

function computeMetrics(items: Item[]): Metrics {
  return {
    total: items.length,
    listedValue: items
      .filter((i) => i.status === 'Listed')
      .reduce((sum, i) => sum + (i.list_price_final ?? 0), 0),
    pendingReview: items.filter(
      (i) =>
        i.status === 'PendingReview' ||
        (i.status === 'ReadyToList' &&
          ((i.list_price_final ?? 0) > 50 || i.price_confidence === 'Low'))
    ).length,
    listed: items.filter((i) => i.status === 'Listed').length,
    sold: items.filter((i) => i.status === 'Sold').length,
    archived: items.filter((i) => i.status === 'Archived').length,
  }
}

export function useInventory(): UseInventoryReturn {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('items')
      .select('*')
      .order('date_added', { ascending: false })
    if (err) {
      setError(err.message)
    } else {
      setItems((data as Item[]) ?? [])
      setError(null)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void refresh().finally(() => setLoading(false))

    intervalRef.current = setInterval(() => {
      void refresh()
    }, 30_000)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [refresh])

  const updateItemStatus = useCallback(
    async (item_id: string, newStatus: ItemStatus) => {
      const { error: err } = await supabase
        .from('items')
        .update({ status: newStatus })
        .eq('item_id', item_id)
      if (err) throw new Error(err.message)
      await refresh()
    },
    [refresh]
  )

  const updateItem = useCallback(
    async (item_id: string, changes: Partial<Item>) => {
      const res = await fetch(`/api/listing/item/${item_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Worker-Token': import.meta.env.VITE_WORKER_SECRET as string,
        },
        body: JSON.stringify(changes),
      })
      const data = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? `Error ${res.status}`)
      await refresh()
    },
    [refresh]
  )

  const deleteItem = useCallback(
    async (item_id: string) => {
      const { error: err } = await supabase.from('items').delete().eq('item_id', item_id)
      if (err) throw new Error(err.message)
      await refresh()
    },
    [refresh]
  )

  return {
    items,
    metrics: computeMetrics(items),
    loading,
    error,
    updateItemStatus,
    updateItem,
    deleteItem,
    refresh,
  }
}
