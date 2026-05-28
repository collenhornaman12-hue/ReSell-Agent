import type { Env } from './types'
import { validateEnv, validateItem, listItem, shouldAutoPublish } from './ebay-api'
import { fetchItem, fetchReadyToListByBatch, markListed } from './supabase'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

async function handleItem(env: Env, itemId: string): Promise<Response> {
  console.log('handleItem called for: ' + itemId)
  const envErr = validateEnv(env)
  if (envErr) return json({ error: envErr }, 422)

  let item
  try {
    item = await fetchItem(env, itemId)
  } catch (e) {
    return json({ error: (e as Error).message }, 404)
  }

  const itemErr = validateItem(item)
  if (itemErr) return json({ error: itemErr }, 422)

  try {
    const result = await listItem(env, item)
    await markListed(env, item.item_id, result.listingId)
    return json({ ok: true, item_id: item.item_id, listingId: result.listingId })
  } catch (e) {
    console.error('listItem failed:', e)
    return json({ error: (e as Error).message }, 502)
  }
}

async function processBatch(env: Env, batchId: string): Promise<void> {
  const items = await fetchReadyToListByBatch(env, batchId)
  const eligible = items.filter(shouldAutoPublish)
  for (const item of eligible) {
    try {
      const result = await listItem(env, item)
      await markListed(env, item.item_id, result.listingId)
    } catch {
      // individual failures don't abort the batch
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const token = request.headers.get('X-Worker-Token')
    if (token !== env.WORKER_SECRET) {
      return new Response('Unauthorized', { status: 401 })
    }

    const url = new URL(request.url)
    if (url.pathname !== '/api/listing/trigger' || request.method !== 'POST') {
      return json({ error: 'Not found' }, 404)
    }

    const body = (await request.json()) as { item_id?: string; batch_id?: string }

    if (body.item_id) {
      return handleItem(env, body.item_id)
    }

    if (body.batch_id) {
      const envErr = validateEnv(env)
      if (envErr) return json({ error: envErr }, 422)
      ctx.waitUntil(processBatch(env, body.batch_id))
      return json({ ok: true, queued: body.batch_id })
    }

    return json({ error: 'Provide item_id or batch_id' }, 400)
  },
}
