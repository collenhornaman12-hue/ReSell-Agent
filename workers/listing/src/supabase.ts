import type { Env, ReadyItem } from './types'

function headers(env: Env) {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  }
}

export async function fetchItem(env: Env, itemId: string): Promise<ReadyItem> {
  const url = `${env.SUPABASE_URL}/rest/v1/items?item_id=eq.${itemId}&status=eq.ReadyToList&select=*`
  const res = await fetch(url, { headers: headers(env) })
  if (!res.ok) throw new Error(`Supabase fetchItem ${res.status}`)
  const rows = (await res.json()) as ReadyItem[]
  if (!rows.length) throw new Error(`Item ${itemId} not found or not ReadyToList`)
  return rows[0]
}

export async function fetchReadyToListByBatch(env: Env, batchId: string): Promise<ReadyItem[]> {
  const url = `${env.SUPABASE_URL}/rest/v1/items?batch_id=eq.${batchId}&status=eq.ReadyToList&select=*`
  const res = await fetch(url, { headers: headers(env) })
  if (!res.ok) throw new Error(`Supabase fetchBatch ${res.status}`)
  return (await res.json()) as ReadyItem[]
}

export async function markListed(env: Env, itemId: string, listingId: string): Promise<void> {
  const url = `${env.SUPABASE_URL}/rest/v1/items?item_id=eq.${itemId}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers(env),
    body: JSON.stringify({
      status: 'Listed',
      ebay_listing_id: listingId,
      date_listed: new Date().toISOString(),
    }),
  })
  if (!res.ok) throw new Error(`Supabase markListed ${res.status}`)
}
