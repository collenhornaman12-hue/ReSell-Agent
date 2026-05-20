import { createClient } from '@supabase/supabase-js'
import type { Env, Item, ItemInsert } from './types'

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
