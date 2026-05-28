import { priceItem, generateBundleDescription, roundToNearest99 } from './pricing'
import {
  fetchPendingByBatch,
  updateItem,
  fetchItemsByBatch,
  fetchPricedItemsByBatch,
  insertBundle,
  updateItemBundleMode,
} from './supabase'
import type { Env, PendingItem, PricedItem } from './types'
import { checkRateLimit } from '../../shared/rateLimit'

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

async function processItems(items: PendingItem[], env: Env): Promise<void> {
  for (const item of items) {
    const update = await priceItem(item, env)
    await updateItem(item.item_id, update, env)
    console.log(
      `[${item.item_id}] ${item.item_name} | price: $${update.list_price_final?.toFixed(2) ?? 'null'} | confidence: ${update.price_confidence} | status: ${update.status}`
    )
  }
}

type BundleGroup = { rule: number; label: string; items: PricedItem[] }

async function evaluateBundles(batch_id: string, env: Env): Promise<void> {
  const eligible = await fetchPricedItemsByBatch(batch_id, env)

  if (eligible.length === 0) {
    console.log(`[bundles][${batch_id}] No ReadyToList items to evaluate`)
    return
  }

  const proposed: BundleGroup[] = []

  // Rule 1: 3+ items share same brand AND subcategory → themed lot
  const byBrandSub = new Map<string, PricedItem[]>()
  for (const item of eligible) {
    if (item.brand && item.subcategory) {
      const key = `${item.brand}||${item.subcategory}`
      if (!byBrandSub.has(key)) byBrandSub.set(key, [])
      byBrandSub.get(key)!.push(item)
    }
  }
  for (const [key, group] of byBrandSub) {
    if (group.length >= 3) proposed.push({ rule: 1, label: key, items: [...group] })
  }

  // Rule 2: list_price_final <= $10.00 → group by brand OR subcategory (separately)
  const lowValue = eligible.filter(i => (i.list_price_final ?? 0) <= 10.00)

  const byBrand2 = new Map<string, PricedItem[]>()
  for (const item of lowValue) {
    if (item.brand) {
      const key = `r2-brand:${item.brand}`
      if (!byBrand2.has(key)) byBrand2.set(key, [])
      byBrand2.get(key)!.push(item)
    }
  }
  for (const [key, group] of byBrand2) {
    if (group.length >= 2) proposed.push({ rule: 2, label: key, items: [...group] })
  }

  const bySubcat2 = new Map<string, PricedItem[]>()
  for (const item of lowValue) {
    if (item.subcategory) {
      const key = `r2-subcat:${item.subcategory}`
      if (!bySubcat2.has(key)) bySubcat2.set(key, [])
      bySubcat2.get(key)!.push(item)
    }
  }
  for (const [key, group] of bySubcat2) {
    if (group.length >= 2) proposed.push({ rule: 2, label: key, items: [...group] })
  }

  if (proposed.length === 0) {
    for (const item of eligible) {
      await updateItemBundleMode(item.item_id, 'Individual', null, env)
    }
    console.log(`[bundles][${batch_id}] No bundles formed. ${eligible.length} items set to Individual`)
    return
  }

  // Conflict resolution: items in multiple groups → assign to group with highest summed value
  const groupSum = (g: BundleGroup) =>
    g.items.reduce((s, i) => s + (i.list_price_final ?? 0), 0)

  const itemToGroups = new Map<string, BundleGroup[]>()
  for (const group of proposed) {
    for (const item of group.items) {
      if (!itemToGroups.has(item.item_id)) itemToGroups.set(item.item_id, [])
      itemToGroups.get(item.item_id)!.push(group)
    }
  }

  const itemAssignment = new Map<string, BundleGroup>()
  for (const [itemId, groups] of itemToGroups) {
    if (groups.length === 1) {
      itemAssignment.set(itemId, groups[0])
    } else {
      const sorted = [...groups].sort((a, b) => groupSum(b) - groupSum(a))
      itemAssignment.set(itemId, sorted[0])
      console.log(
        `[bundles] Item ${itemId} in ${groups.length} groups — assigned to "${sorted[0].label}" ($${groupSum(sorted[0]).toFixed(2)}). Alternatives: ${sorted.slice(1).map(g => `"${g.label}" ($${groupSum(g).toFixed(2)})`).join(', ')}`
      )
    }
  }

  // Rebuild final groups from assignments, respecting minimum sizes after conflict resolution
  const finalGroupItems = new Map<BundleGroup, string[]>()
  for (const [itemId, group] of itemAssignment) {
    if (!finalGroupItems.has(group)) finalGroupItems.set(group, [])
    finalGroupItems.get(group)!.push(itemId)
  }

  const itemById = new Map(eligible.map(i => [i.item_id, i]))
  const bundledItemIds = new Set<string>()

  for (const [group, assignedIds] of finalGroupItems) {
    const minSize = group.rule === 1 ? 3 : 2
    if (assignedIds.length < minSize) {
      console.log(`[bundles] Group "${group.label}" dropped to ${assignedIds.length} items after conflict resolution — skipping`)
      continue
    }

    const groupItems = assignedIds.map(id => itemById.get(id)!).filter(Boolean)
    const n = groupItems.length

    let bundleName: string
    let rationale: string
    if (group.rule === 1) {
      const [brand, subcat] = group.label.split('||')
      bundleName = `${brand} ${subcat} Lot (${n} items)`
      rationale = `Rule 1 — Complete set: ${n} items share brand "${brand}" and subcategory "${subcat}"`
    } else if (group.label.startsWith('r2-brand:')) {
      const brand = group.label.slice('r2-brand:'.length)
      bundleName = `${brand} Lot (${n} items)`
      rationale = `Rule 2 — Low value bundling: ${n} items share brand "${brand}" (each ≤ $10.00)`
    } else {
      const subcat = group.label.slice('r2-subcat:'.length)
      bundleName = `${subcat} Lot (${n} items)`
      rationale = `Rule 2 — Low value bundling: ${n} items share subcategory "${subcat}" (each ≤ $10.00)`
    }

    const totalPrice = groupItems.reduce((s, i) => s + (i.list_price_final ?? 0), 0)
    const bundlePrice = roundToNearest99(totalPrice * 0.85)

    let descShort: string | null = null
    let descLong: string | null = null
    try {
      const desc = await generateBundleDescription(groupItems, bundleName, rationale, env)
      descShort = desc.description_short
      descLong = desc.description_long
    } catch (e) {
      console.error(`[bundles] Description generation failed for "${bundleName}":`, e)
      descShort = `${bundleName}.`
    }

    let bundleId: string
    try {
      bundleId = await insertBundle(
        {
          bundle_name: bundleName,
          item_ids: assignedIds,
          bundle_price_ebay: bundlePrice,
          rationale,
          status: 'PendingReview',
          bundle_description_short: descShort,
          bundle_description_long: descLong,
        },
        env
      )
    } catch (e) {
      console.error(`[bundles] insertBundle failed for "${bundleName}":`, e)
      continue
    }

    for (const id of assignedIds) {
      await updateItemBundleMode(id, 'Bundle', bundleId, env)
      bundledItemIds.add(id)
    }

    console.log(
      `[bundles] Created "${bundleName}" (${bundleId}) — ${n} items @ $${bundlePrice.toFixed(2)} | ${rationale}`
    )
  }

  // Rule 3 + all non-bundled: set listing_mode = Individual, bundle_id = null
  for (const item of eligible) {
    if (!bundledItemIds.has(item.item_id)) {
      if ((item.list_price_final ?? 0) > 25.00) {
        console.log(
          `[bundles] Item ${item.item_id} "${item.item_name}" — Individual (price $${item.list_price_final?.toFixed(2)} > $25, no bundle partner)`
        )
      }
      await updateItemBundleMode(item.item_id, 'Individual', null, env)
    }
  }

  console.log(
    `[bundles][${batch_id}] Complete — ${finalGroupItems.size} bundle(s) created, ${eligible.length - bundledItemIds.size} item(s) set to Individual`
  )
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

    const token = request.headers.get('X-Worker-Token')
    if (token !== env.WORKER_SECRET) {
      return new Response('Unauthorized', { status: 401 })
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    if (!checkRateLimit(ip, 10)) {
      return new Response('Too Many Requests', { status: 429 })
    }

    if (request.method === 'POST' && url.pathname === '/api/pricing/trigger') {
      let body: { batch_id?: string }
      try {
        body = (await request.json()) as { batch_id?: string }
      } catch {
        return json({ error: 'Invalid JSON body' }, 400)
      }

      if (typeof body.batch_id !== 'string' || !body.batch_id) {
        return json({ error: 'Missing batch_id' }, 400)
      }

      let items: PendingItem[]
      try {
        items = await fetchPendingByBatch(body.batch_id, env)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return json({ error: msg }, 500)
      }

      if (items.length === 0) {
        return json({ status: 'queued', item_count: 0 })
      }

      const batchId = body.batch_id
      ctx.waitUntil(processItems(items, env).then(() => evaluateBundles(batchId, env)))
      return json({ status: 'queued', item_count: items.length })
    }

    if (request.method === 'GET' && url.pathname === '/api/pricing/status') {
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
