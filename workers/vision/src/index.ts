import { extractItem } from './vision'
import { insertItem, fetchItemsByBatch } from './supabase'
import type { Env, TriggerItem, TriggerPayload, ItemInsert, VisionExtracted } from './types'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

async function processItems(
  batchId: string,
  items: TriggerItem[],
  env: Env
): Promise<void> {
  const CHUNK_SIZE = 50
  for (let offset = 0; offset < items.length; offset += CHUNK_SIZE) {
    const chunk = items.slice(offset, offset + CHUNK_SIZE)
    for (const item of chunk) {
      const extracted: VisionExtracted = await extractItem(item, env)

      const record: ItemInsert = {
        ...extracted,
        photos: item.photo_urls,
        status: 'PendingReview',
        created_by: 'system',
        ebay_price: null,
        ebay_comps_count: 0,
        ebay_comp_price_median: null,
        ebay_comp_price_range: null,
        fb_price: null,
        list_price_final: null,
        price_confidence: null,
        bundle_id: null,
        listing_mode: null,
      }

      try {
        await insertItem(record, env)
      } catch (err) {
        console.error(`[vision] Failed to insert ${item.item_name_seed}:`, err)
      }
    }
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (request.method === 'POST' && url.pathname === '/api/vision/trigger') {
      let payload: TriggerPayload
      try {
        payload = (await request.json()) as TriggerPayload
      } catch {
        return json({ error: 'Invalid JSON body' }, 400)
      }

      if (typeof payload.batch_id !== 'string' || !payload.batch_id || !Array.isArray(payload.items)) {
        return json({ error: 'Missing batch_id or items' }, 400)
      }

      const validItems = payload.items.filter(
        (i) =>
          typeof i.item_name_seed === 'string' &&
          Array.isArray(i.photo_urls) &&
          i.photo_urls.length > 0
      )

      ctx.waitUntil(processItems(payload.batch_id, validItems, env))

      return json({ status: 'queued', item_count: validItems.length })
    }

    if (request.method === 'GET' && url.pathname === '/api/vision/status') {
      const batchId = url.searchParams.get('batch_id')
      if (!batchId) return json({ error: 'Missing batch_id' }, 400)

      try {
        const items = await fetchItemsByBatch(batchId, env)
        return json(items)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return json({ error: msg }, 500)
      }
    }

    return json({ error: 'Not found' }, 404)
  },
}
