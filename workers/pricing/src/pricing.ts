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
const MAX_SEARCH_TURNS = 2
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

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from',
  'if', 'in', 'into', 'nor', 'of', 'on', 'onto', 'or', 'over',
  'so', 'that', 'the', 'this', 'to', 'under', 'with', 'yet',
])

function buildSearchQueries(item: PendingItem): string[] {
  const yearMatch = item.item_name.match(/\b(19|20)\d{2}\b/)
  const year = yearMatch ? yearMatch[0] : null
  const words = item.item_name
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()))

  if (item.brand && item.model_number) {
    const base = `${item.brand} ${item.model_number}`
    const withYear = year ? `${base} ${year}` : base
    const nameKeyword = words.slice(0, 3).join(' ')
    const brandFallback = `${item.brand} ${nameKeyword}`
    return [...new Set([withYear, base, brandFallback])].slice(0, 3)
  }

  // Prepend brand's first word when brand is known and not already in the item name
  const brandFirst = item.brand?.split(' ')[0] ?? null
  const brandAlreadyInName = brandFirst
    ? item.item_name.toLowerCase().includes(brandFirst.toLowerCase())
    : false
  const coreWords = brandFirst && !brandAlreadyInName
    ? [brandFirst, ...words]
    : words

  // diagnostic: log full untruncated data before any slice
  const specificLimit = year ? 8 : 7
  console.log(`[pricing] buildSearchQueries "${item.item_name.slice(0, 50)}":`, JSON.stringify({
    brand: item.brand,
    model_number: item.model_number,
    keywords: item.keywords,
    words_after_stop_filter: words,
    core_words: coreWords,
    specific_limit: specificLimit,
    included_in_specific: coreWords.slice(0, specificLimit),
    dropped_from_specific: coreWords.slice(specificLimit),
  }))

  const specific = year
    ? [...new Set([...coreWords, year])].slice(0, 8).join(' ')
    : coreWords.slice(0, 7).join(' ')
  const medium = coreWords.slice(0, 4).join(' ')

  return [...new Set([specific, medium])].slice(0, 3)
}

async function callWithWebSearch(
  systemPrompt: string,
  userMessage: string,
  env: Env
): Promise<string> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }]

  for (let turn = 0; turn < MAX_SEARCH_TURNS; turn++) {
    const trimmedMessages = messages.map((msg: any) => ({
      ...msg,
      content: Array.isArray(msg.content)
        ? msg.content.map((block: any) => {
            if (block.type === 'web_search_tool_result') {
              return {
                ...block,
                content: Array.isArray(block.content)
                  ? block.content.map((c: any) =>
                      c.type === 'text'
                        ? { ...c, text: c.text.slice(0, 400) }
                        : c
                    )
                  : block.content
              }
            }
            return block
          })
        : msg.content
    }))

    const resp = await withRateLimitRetry(() => client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      // web_search_20250305 is a server-side tool — Anthropic executes the search
      tools: [{ type: 'web_search_20250305', name: 'web_search' }] as Parameters<typeof client.messages.create>[0]['tools'],
      messages: trimmedMessages,
    }))

    console.log(`[tokens][search] turn=${turn} in=${resp.usage.input_tokens} out=${resp.usage.output_tokens}`)

    const truncatedContent = resp.content.map((block: any) => {
      if (block.type === 'web_search_tool_result') {
        const truncatedEncryptedContent = Array.isArray(block.content)
          ? block.content.map((c: any) =>
              c.type === 'text' ? { ...c, text: c.text.slice(0, 400) } : c
            )
          : block.content
        return { ...block, content: truncatedEncryptedContent }
      }
      return block
    })
    messages.push({ role: 'assistant', content: truncatedContent })

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
      const truncated = toolResults.map(tr => ({
        ...tr,
        content: typeof tr.content === 'string'
          ? tr.content.slice(0, 8000)
          : Array.isArray(tr.content)
            ? tr.content.map(c => c.type === 'text'
                ? { ...c, text: c.text.slice(0, 8000) }
                : c)
            : tr.content,
      }))
      messages.push({ role: 'user', content: truncated })
    }
  }

  return ''
}

function buildRelevanceTokens(query: string): string[] {
  // Drop the first token (brand — appears in every result by definition)
  return query.toLowerCase().split(/\s+/).filter(t => t.length > 1).slice(1)
}

async function fetchEbayComps(
  query: string,
  env: Env
): Promise<EbayComps | null> {
  try {
    const url = `https://api.apify.com/v2/acts/automation-lab~ebay-sold-scraper/run-sync-get-dataset-items?token=${env.APIFY_API_TOKEN}`
    const requestBody = JSON.stringify({
      searchQueries: [query],
      maxListingsPerSearch: 25,
      sort: 'newly_listed',
      condition: [],
    })

    const doFetch = async (): Promise<{ ok: boolean; text: string }> => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      })
      console.log(`[pricing] apify status=${r.status} query="${query}"`)
      const text = await r.text()
      console.log(`[pricing] apify raw body: ${text.length <= 500 ? text : text.slice(0, 500) + '…'}`)
      return { ok: r.ok, text }
    }

    let { ok, text: rawText } = await doFetch()
    if (!ok) return null

    let items = JSON.parse(rawText) as Record<string, unknown>[]
    if (!Array.isArray(items)) return null

    // Retry once on empty array — actor has transient failures on valid queries
    if (items.length === 0) {
      console.log(`[pricing] apify empty result for "${query}" — retrying after 1.5s`)
      await sleep(1500)
      const retry = await doFetch()
      if (!retry.ok) {
        console.log(`[pricing] apify retry HTTP error for "${query}" — treating as genuine zero`)
        return null
      }
      const retryItems = JSON.parse(retry.text) as Record<string, unknown>[]
      if (Array.isArray(retryItems) && retryItems.length > 0) {
        console.log(`[pricing] apify retry recovered ${retryItems.length} results for "${query}"`)
        items = retryItems
      } else {
        console.log(`[pricing] apify retry also empty for "${query}" — genuine zero`)
        return null
      }
    }

    // Title-relevance pre-filter — applied before outlier exclusion
    const relevanceTokens = buildRelevanceTokens(query)
    const relevanceThreshold = Math.ceil(relevanceTokens.length / 2)
    const relevantItems: Record<string, unknown>[] = []
    const rejectedTitles: string[] = []
    for (const item of items) {
      const title = typeof item.title === 'string' ? item.title : ''
      const lowerTitle = title.toLowerCase()
      const matchCount = relevanceTokens.filter(t => lowerTitle.includes(t)).length
      if (relevanceTokens.length === 0 || matchCount >= relevanceThreshold) {
        relevantItems.push(item)
      } else {
        rejectedTitles.push(`"${title.slice(0, 70)}" [${matchCount}/${relevanceTokens.length}]`)
      }
    }
    if (rejectedTitles.length > 0) {
      console.log(
        `[pricing] relevance filter: ${items.length} raw → ${relevantItems.length} kept` +
        ` (tokens [${relevanceTokens.join(', ')}], need ≥${relevanceThreshold})` +
        ` — rejected: ${rejectedTitles.join(' | ')}`
      )
    } else {
      console.log(
        `[pricing] relevance filter: ${items.length} raw → ${relevantItems.length} kept` +
        ` (tokens [${relevanceTokens.join(', ')}], need ≥${relevanceThreshold}, all passed)`
      )
    }

    const prices = relevantItems
      .map((item) => {
        const p = item.soldPrice
        return typeof p === 'number' ? p : null
      })
      .filter((p): p is number => p !== null && p > 0)

    if (prices.length === 0) return null

    // FIX 1: preliminary sort + median for outlier detection (PRD §5.2C)
    prices.sort((a, b) => a - b)

    // Bimodal/high-variance detection — runs before outlier exclusion on relevance-filtered prices
    if (prices.length >= 5) {
      const mean = prices.reduce((a, b) => a + b, 0) / prices.length
      const variance = prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length
      const cv = Math.sqrt(variance) / mean
      if (cv > 0.5) {
        // Find the largest gap where BOTH resulting clusters would have >= 2 items
        let maxQualifiedGap = 0
        let splitIdx = -1
        for (let i = 0; i < prices.length - 1; i++) {
          const gap = prices[i + 1] - prices[i]
          const lowerCount = i + 1
          const upperCount = prices.length - i - 1
          if (lowerCount >= 2 && upperCount >= 2 && gap > maxQualifiedGap) {
            maxQualifiedGap = gap
            splitIdx = i
          }
        }
        if (splitIdx >= 0) {
          const lower = prices.slice(0, splitIdx + 1)
          const upper = prices.slice(splitIdx + 1)
          const lowerRange = `$${lower[0].toFixed(2)}-$${lower[lower.length - 1].toFixed(2)}`
          const upperRange = `$${upper[0].toFixed(2)}-$${upper[upper.length - 1].toFixed(2)}`
          console.log(
            `[pricing] bimodal detected for "${query}": CV=${cv.toFixed(2)}` +
            ` — lower (n=${lower.length}) ${lowerRange}, upper (n=${upper.length}) ${upperRange}` +
            ` — flagging for human review`
          )
          return {
            comps_count: prices.length,
            median_price: 0,
            price_range: `${lowerRange} / ${upperRange} (bimodal — review)`,
            confidence: 'Low',
            note: 'comps split into two price clusters — possible product mismatch, human review required',
          }
        }
        console.log(
          `[pricing] high variance for "${query}" (CV=${cv.toFixed(2)}) but no qualified two-cluster split` +
          ` — continuing to outlier exclusion`
        )
      }
    }

    const rawMid = Math.floor(prices.length / 2)
    const prelimMedian =
      prices.length % 2 === 0
        ? (prices[rawMid - 1] + prices[rawMid]) / 2
        : prices[rawMid]

    const filtered = prices.filter(p => p <= prelimMedian * 3 && p >= prelimMedian / 3)
    const excludedCount = prices.length - filtered.length
    if (excludedCount > 0) {
      console.log(
        `[pricing] outlier exclusion: removed ${excludedCount}/${prices.length} prices` +
        ` (prelim median $${prelimMedian.toFixed(2)};` +
        ` excluded: ${prices.filter(p => p > prelimMedian * 3 || p < prelimMedian / 3).map(p => '$' + p.toFixed(2)).join(', ')})`
      )
    }

    if (filtered.length === 0) return null

    const mid = Math.floor(filtered.length / 2)
    const median_price =
      filtered.length % 2 === 0
        ? (filtered[mid - 1] + filtered[mid]) / 2
        : filtered[mid]

    const comps_count = filtered.length
    const min = filtered[0]
    const max = filtered[filtered.length - 1]
    const baseRange = `$${min.toFixed(2)}-$${max.toFixed(2)}`
    const price_range =
      excludedCount > 0
        ? `${baseRange} (${excludedCount} outlier${excludedCount > 1 ? 's' : ''} excluded)`
        : baseRange
    const confidence: 'High' | 'Medium' | 'Low' = comps_count >= 3 ? 'High' : 'Medium'

    return { comps_count, median_price, price_range, confidence }
  } catch (err) {
    console.log(`[pricing] apify fetch exception for "${query}":`, err)
    return null
  }
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

  console.log(`[tokens][listing] in=${resp.usage.input_tokens} out=${resp.usage.output_tokens}`)

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
    console.log(`[pricing] searchQuery: "${query}"`)
    try {
      const result = await fetchEbayComps(query, env)
      if (result) {
        comps = result
        if (comps.comps_count >= 1) break
      }
    } catch (e) {
      console.error(`[pricing] Search API failed for "${query}":`, e)
    }
  }

  if (!comps || comps.median_price <= 0) {
    if (comps?.note) {
      return {
        ebay_search_query: usedQuery,
        ebay_comps_count: comps.comps_count,
        ebay_comp_price_median: null,
        ebay_comp_price_range: comps.price_range,
        ebay_price: null,
        list_price_final: null,
        price_confidence: 'Low',
        price_override_reason: comps.note,
        description_short: `${item.item_name} — ${comps.note}`,
        description_long: null,
        status: 'ReadyToList',
      }
    }
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
