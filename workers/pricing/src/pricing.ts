import Anthropic from '@anthropic-ai/sdk'
import type { Env, PendingItem, PricingUpdate, EbayComps, PricedItem } from './types'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      const retryAfter = err.headers?.get('retry-after')
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60_000
      await sleep(waitMs)
      return fn()
    }
    throw err
  }
}

const MODEL = 'claude-sonnet-4-6'
const MAX_SEARCH_TURNS = 8
const FLOOR_PRICE = 4.99

const CONDITION_MULTIPLIERS: Record<string, number> = {
  Mint: 1.10,
  VeryGood: 1.00,
  Good: 0.85,
  Fair: 0.70,
  Poor: 0.50,
}

const SEARCH_SYSTEM = `You are a pricing research agent. Search eBay SOLD listings only (LH_Sold=1 and LH_Complete=1), last 90 days. Return ONLY a JSON object with these exact keys:
comps_count (integer),
median_price (number),
price_range (string, format: '$15-$45'),
confidence ('High' | 'Medium' | 'Low').`

const LISTING_SYSTEM = `Generate eBay listing content for this item. Return ONLY a JSON object with these exact keys: title (string, max 80 chars), description_short (string, max 150 chars), description_long (string, HTML with <p> tags, 150-400 words). Title format: {brand} {series} {key_descriptor} {year} {MOC if sealed}. Never use these words anywhere: rare, vintage, look, must see. description_short format: {condition} {item_name}. {1 key detail}. Ships USPS flat rate. description_long sections in order: item identification, condition, completeness, shipping, returns, questions.`

const BUNDLE_SYSTEM = `Generate eBay bundle listing content for a lot of items. Return ONLY a JSON object with these exact keys: description_short (string, max 150 chars), description_long (string, HTML with <p> tags, 150-400 words). description_short format: {N} item lot. {condition range}. Ships USPS flat rate. description_long sections in order: lot overview, items included, combined condition, shipping, returns, questions. Never use these words anywhere: rare, vintage, look, must see.`

function parseJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as Record<string, unknown>
  } catch {
    return null
  }
}

function buildSearchQueries(item: PendingItem): string[] {
  const yearMatch = item.item_name.match(/\b(19|20)\d{2}\b/)
  const year = yearMatch ? yearMatch[0] : null

  if (item.brand && item.model_number) {
    const base = `${item.brand} ${item.model_number}`
    const withYear = year ? `${base} ${year}` : base
    const keyword = item.keywords?.[0] ?? item.item_name.split(' ')[0]
    const fallback = `${item.brand} ${keyword}`
    return [...new Set([withYear, base, fallback])].slice(0, 3)
  }

  const words = item.item_name.split(/\s+/).filter(w => w.length > 2)
  const specific = year
    ? [...new Set([...words, year])].slice(0, 7).join(' ')
    : words.slice(0, 5).join(' ')
  const medium = words.slice(0, 5).join(' ')
  const broad = words.slice(0, 3).join(' ')

  return [...new Set([specific, medium, broad])].slice(0, 3)
}

async function callWithWebSearch(
  systemPrompt: string,
  userMessage: string,
  env: Env
): Promise<string> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }]

  for (let turn = 0; turn < MAX_SEARCH_TURNS; turn++) {
    const resp = await withRateLimitRetry(() => client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      // web_search_20250305 is a server-side tool — Anthropic executes the search
      tools: [{ type: 'web_search_20250305', name: 'web_search' }] as Parameters<typeof client.messages.create>[0]['tools'],
      messages,
    }))

    messages.push({ role: 'assistant', content: resp.content })

    if (resp.stop_reason === 'end_turn') {
      const t = resp.content.find(b => b.type === 'text')
      return t && t.type === 'text' ? t.text : ''
    }

    if (resp.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = resp.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map(b => ({
          type: 'tool_result' as const,
          tool_use_id: b.id,
          content: '',
        }))
      messages.push({ role: 'user', content: toolResults })
    }
  }

  return ''
}

async function fetchEbayComps(
  query: string,
  env: Env
): Promise<EbayComps | null> {
  const text = await callWithWebSearch(SEARCH_SYSTEM, `Query: ${query}`, env)
  const parsed = parseJson(text)
  if (!parsed) return null

  const comps_count = typeof parsed.comps_count === 'number' ? Math.round(parsed.comps_count) : 0
  const median_price = typeof parsed.median_price === 'number' ? parsed.median_price : 0
  const price_range = typeof parsed.price_range === 'string' ? parsed.price_range : '$0-$0'
  const confidence = (['High', 'Medium', 'Low'] as const).includes(parsed.confidence as 'High' | 'Medium' | 'Low')
    ? (parsed.confidence as 'High' | 'Medium' | 'Low')
    : 'Low'

  return { comps_count, median_price, price_range, confidence }
}

// Round price to nearest .99 — uses 0.30 as midpoint threshold
// (e.g. 12.40 → 12.99, 12.20 → 11.99)
export function roundToNearest99(price: number): number {
  const floor = Math.floor(price)
  return price - floor >= 0.30 ? floor + 0.99 : floor - 0.01
}

function applyConditionMultiplier(base: number, conditionRaw: string): number {
  return base * (CONDITION_MULTIPLIERS[conditionRaw] ?? 0.85)
}

async function generateListing(
  item: PendingItem,
  env: Env
): Promise<{ title: string; description_short: string; description_long: string } | null> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const resp = await withRateLimitRetry(() => client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: LISTING_SYSTEM,
    messages: [{ role: 'user', content: `Item data: ${JSON.stringify(item)}` }],
  }))

  const t = resp.content.find(b => b.type === 'text')
  const text = t && t.type === 'text' ? t.text : ''
  const parsed = parseJson(text)
  if (!parsed) return null

  return {
    title: typeof parsed.title === 'string' ? parsed.title : item.item_name,
    description_short: typeof parsed.description_short === 'string' ? parsed.description_short : '',
    description_long: typeof parsed.description_long === 'string' ? parsed.description_long : '',
  }
}

function pricingFailureFallback(item: PendingItem, usedQuery: string): PricingUpdate {
  return {
    ebay_search_query: usedQuery,
    ebay_comps_count: 0,
    ebay_comp_price_median: null,
    ebay_comp_price_range: null,
    ebay_price: null,
    list_price_final: null,
    price_confidence: 'Low',
    price_override_reason: null,
    description_short: `${item.item_name} (pricing failed — review)`,
    description_long: null,
    status: 'ReadyToList',
  }
}

export async function priceItem(item: PendingItem, env: Env): Promise<PricingUpdate> {
  const queries = buildSearchQueries(item)

  let comps: EbayComps | null = null
  let usedQuery = queries[0]

  for (const query of queries) {
    usedQuery = query
    try {
      const result = await fetchEbayComps(query, env)
      if (result) {
        comps = result
        if (comps.comps_count >= 3) break
      }
    } catch {
      try {
        const result = await fetchEbayComps(query, env)
        if (result) {
          comps = result
          if (comps.comps_count >= 3) break
        }
      } catch (e) {
        console.error(`[pricing] Search API failed for "${query}":`, e)
        return pricingFailureFallback(item, usedQuery)
      }
    }
  }

  if (!comps || comps.median_price <= 0) {
    return pricingFailureFallback(item, usedQuery)
  }

  let finalPrice = applyConditionMultiplier(comps.median_price, item.condition_raw)
  finalPrice *= item.is_complete ? 1.10 : 0.80

  let priceOverrideReason: string | null = null

  if (
    comps.comps_count >= 3 &&
    Math.abs(finalPrice - comps.median_price) / comps.median_price > 0.40
  ) {
    finalPrice = applyConditionMultiplier(comps.median_price, item.condition_raw)
    priceOverrideReason = '40% rule applied — market override'
  }

  finalPrice = roundToNearest99(finalPrice)

  if (finalPrice < FLOOR_PRICE) {
    return {
      ebay_search_query: usedQuery,
      ebay_comps_count: comps.comps_count,
      ebay_comp_price_median: comps.median_price,
      ebay_comp_price_range: comps.price_range,
      ebay_price: null,
      list_price_final: null,
      price_confidence: comps.confidence,
      price_override_reason: priceOverrideReason,
      description_short: null,
      description_long: null,
      status: 'Archived',
    }
  }

  // Wait for rate limit window to reset before listing generation
  await sleep(15000)

  let listing: Awaited<ReturnType<typeof generateListing>> = null
  try {
    listing = await generateListing(item, env)
  } catch {
    try {
      listing = await generateListing(item, env)
    } catch (e) {
      console.error(`[pricing] Listing generation failed for ${item.item_id}:`, e)
    }
  }

  return {
    ebay_search_query: usedQuery,
    ebay_comps_count: comps.comps_count,
    ebay_comp_price_median: comps.median_price,
    ebay_comp_price_range: comps.price_range,
    ebay_price: finalPrice,
    list_price_final: finalPrice,
    price_confidence: comps.confidence,
    price_override_reason: priceOverrideReason,
    description_short: listing?.description_short ?? `${item.item_name} (review needed)`,
    description_long: listing?.description_long ?? null,
    status: 'ReadyToList',
  }
}

export async function generateBundleDescription(
  items: PricedItem[],
  bundleName: string,
  rationale: string,
  env: Env
): Promise<{ description_short: string; description_long: string }> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const payload = {
    bundleName,
    rationale,
    items: items.map(i => ({ name: i.item_name, brand: i.brand, subcategory: i.subcategory, price: i.list_price_final })),
  }
  const resp = await withRateLimitRetry(() => client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: BUNDLE_SYSTEM,
    messages: [{ role: 'user', content: `Bundle data: ${JSON.stringify(payload)}` }],
  }))
  const t = resp.content.find(b => b.type === 'text')
  const text = t && t.type === 'text' ? t.text : ''
  const parsed = parseJson(text)
  return {
    description_short: typeof parsed?.description_short === 'string' ? parsed.description_short : `${bundleName} lot.`,
    description_long: typeof parsed?.description_long === 'string' ? parsed.description_long : '',
  }
}
