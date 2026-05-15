import { createClient } from '@supabase/supabase-js'
import type { Env, ItemInsert, StatusItem } from './types'

function getSupabase(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

export async function insertItem(item: ItemInsert, env: Env): Promise<void> {
  const supabase = getSupabase(env)
  const { error } = await supabase.from('items').insert(item)
  if (error) throw new Error(`Supabase insert failed: ${error.message}`)
}

export async function fetchItemsByBatch(
  batchId: string,
  env: Env
): Promise<StatusItem[]> {
  const supabase = getSupabase(env)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('items')
    .select('item_id, item_name, identification_confidence, status, photos')
    .eq('created_by', 'system')
    .gte('date_added', since)
    .order('date_added', { ascending: false })
    .limit(200)

  if (error) throw new Error(`Supabase query failed: ${error.message}`)
  if (!data) return []

  return (data as StatusItem[]).filter((item) =>
    Array.isArray(item.photos) && item.photos.some((url) => url.includes(batchId))
  )
}
