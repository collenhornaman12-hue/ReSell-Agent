import { createClient } from '@supabase/supabase-js'
import type { Env, PendingItem, PricingUpdate, Item, PricedItem, BundleInsert } from './types'

function getSupabase(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

export async function fetchPendingByBatch(
  batch_id: string,
  env: Env
): Promise<PendingItem[]> {
  const supabase = getSupabase(env)
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('batch_id', batch_id)
    .or('status.eq.PendingReview,and(status.eq.ReadyToList,price_confidence.eq.Low)')
  if (error) throw new Error(`fetchPendingByBatch failed: ${error.message}`)
  return (data ?? []) as PendingItem[]
}

export async function updateItem(
  item_id: string,
  update: PricingUpdate,
  env: Env
): Promise<void> {
  const supabase = getSupabase(env)
  const { error } = await supabase
    .from('items')
    .update(update)
    .eq('item_id', item_id)
  if (error) throw new Error(`updateItem failed: ${error.message}`)
}

export async function fetchItemsByBatch(
  batch_id: string,
  env: Env
): Promise<Item[]> {
  const supabase = getSupabase(env)
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('batch_id', batch_id)
  if (error) throw new Error(`fetchItemsByBatch failed: ${error.message}`)
  return data ?? []
}

export async function fetchPricedItemsByBatch(
  batch_id: string,
  env: Env
): Promise<PricedItem[]> {
  const supabase = getSupabase(env)
  const { data, error } = await supabase
    .from('items')
    .select('item_id, item_name, brand, subcategory, list_price_final, status, listing_mode, bundle_id')
    .eq('batch_id', batch_id)
    .eq('status', 'ReadyToList')
  if (error) throw new Error(`fetchPricedItemsByBatch failed: ${error.message}`)
  return (data ?? []) as PricedItem[]
}

export async function insertBundle(bundle: BundleInsert, env: Env): Promise<string> {
  const supabase = getSupabase(env)
  const { data, error } = await supabase
    .from('bundles')
    .insert(bundle)
    .select('bundle_id')
    .single()
  if (error) throw new Error(`insertBundle failed: ${error.message}`)
  return (data as { bundle_id: string }).bundle_id
}

export async function updateItemBundleMode(
  item_id: string,
  listing_mode: 'Individual' | 'Bundle',
  bundle_id: string | null,
  env: Env
): Promise<void> {
  const supabase = getSupabase(env)
  const { error } = await supabase
    .from('items')
    .update({ listing_mode, bundle_id })
    .eq('item_id', item_id)
  if (error) throw new Error(`updateItemBundleMode failed: ${error.message}`)
}
