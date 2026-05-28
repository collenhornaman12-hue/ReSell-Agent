import type { Env, ReadyItem, ListResult } from './types'
import { getAccessToken } from './ebay-auth'
import { getCategoryId } from './category-map'

const BANNED = /\b(rare|vintage|look|must\s*see)\b/gi

const CONDITION_ENUM: Record<string, string> = {
  'New': 'NEW',
  'Brand New': 'NEW',
  'Like New': 'USED_EXCELLENT',
  'Mint': 'USED_EXCELLENT',
  'Near Mint': 'USED_EXCELLENT',
  'Very Good': 'USED_EXCELLENT',
  'Excellent': 'USED_EXCELLENT',
  'Good': 'USED_GOOD',
  'Acceptable': 'USED_ACCEPTABLE',
  'For parts or not working': 'FOR_PARTS_OR_NOT_WORKING',
  'Poor': 'FOR_PARTS_OR_NOT_WORKING',
}

export function validateEnv(env: Env): string | null {
  const required: (keyof Env)[] = [
    'EBAY_CLIENT_ID',
    'EBAY_CLIENT_SECRET',
    'EBAY_USER_REFRESH_TOKEN',
    'EBAY_FULFILLMENT_POLICY_ID',
    'EBAY_PAYMENT_POLICY_ID',
    'EBAY_RETURN_POLICY_ID',
    'EBAY_MERCHANT_LOCATION_KEY',
  ]
  for (const k of required) {
    if (!env[k]) return `Missing env var: ${k}`
  }
  return null
}

export function validateItem(item: ReadyItem): string | null {
  if (!item.list_price_final || item.list_price_final <= 0)
    return 'list_price_final is missing or zero'
  if (!item.condition_ebay) return 'condition_ebay is missing'
  return null
}

function ebayBase(env: Env): string {
  return env.EBAY_ENVIRONMENT === 'sandbox'
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com'
}

async function ebayRequest(
  env: Env,
  token: string,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${ebayBase(env)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? (JSON.parse(text) as unknown) : {}
  return { status: res.status, data }
}

function buildTitle(item: ReadyItem): string {
  const raw = `${item.brand ?? ''} ${item.item_name}`
    .trim()
    .replace(BANNED, '')
    .replace(/\s+/g, ' ')
    .trim()
  return raw.slice(0, 80)
}

async function upsertInventoryItem(env: Env, token: string, item: ReadyItem): Promise<void> {
  const sku = item.item_id
  const title = buildTitle(item)
  const description = item.description_long ?? item.description_short ?? item.item_name
  const imageUrls = (item.photos ?? []).slice(0, 12)

  const payload = {
    availability: { shipToLocationAvailability: { quantity: 1 } },
    condition: CONDITION_ENUM[item.condition_ebay ?? ''] ?? 'USED_GOOD',
    conditionDescription: item.condition_notes ?? undefined,
    product: {
      title,
      description,
      imageUrls,
      aspects: {
        ...(item.keywords?.length ? { Keywords: item.keywords.slice(0, 10) } : {}),
        Type: [item.subcategory ?? 'Action Figure'],
        Brand: [item.brand ?? 'Unknown'],
      },
    },
  }

  const { status, data } = await ebayRequest(
    env,
    token,
    'PUT',
    `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
    payload,
    { 'Content-Language': 'en-US' }
  )
  if (status !== 200 && status !== 204) {
    throw new Error(`upsertInventoryItem ${status}: ${JSON.stringify(data)}`)
  }
}

async function createOrGetOffer(env: Env, token: string, item: ReadyItem): Promise<string> {
  const sku = item.item_id
  const offerPayload = {
    sku,
    marketplaceId: 'EBAY_US',
    format: 'FIXED_PRICE',
    availableQuantity: 1,
    categoryId: getCategoryId(item.category),
    listingDescription: item.description_long ?? item.description_short ?? item.item_name,
    listingPolicies: {
      fulfillmentPolicyId: env.EBAY_FULFILLMENT_POLICY_ID,
      paymentPolicyId: env.EBAY_PAYMENT_POLICY_ID,
      returnPolicyId: env.EBAY_RETURN_POLICY_ID,
    },
    pricingSummary: {
      price: {
        currency: 'USD',
        value: item.list_price_final!.toFixed(2),
      },
    },
    merchantLocationKey: env.EBAY_MERCHANT_LOCATION_KEY,
  }

  const { status, data } = await ebayRequest(
    env,
    token,
    'POST',
    '/sell/inventory/v1/offer',
    offerPayload,
    { 'Content-Language': 'en-US' }
  )

  if (status === 201) {
    return (data as { offerId: string }).offerId
  }

  // errorId 25002: offer already exists — eBay returns the offerId in the error parameters
  const errors = (data as { errors?: Array<{ errorId: number; parameters?: Array<{ name: string; value: string }> }> }).errors ?? []
  const dup = errors.find((e) => e.errorId === 25002)
  if (dup) {
    const offerId = dup.parameters?.find((p) => p.name === 'offerId')?.value
    if (offerId) return offerId
    // fallback: retrieve via GET if the parameter wasn't present
    const listRes = await ebayRequest(
      env,
      token,
      'GET',
      `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`
    )
    const offers =
      (listRes.data as { offers?: Array<{ offerId: string }> }).offers ?? []
    if (!offers.length)
      throw new Error(`Offer exists for SKU ${sku} but could not be retrieved`)
    return offers[0].offerId
  }

  throw new Error(`createOffer ${status}: ${JSON.stringify(data)}`)
}

async function publishOffer(env: Env, token: string, offerId: string): Promise<string> {
  const { status, data } = await ebayRequest(
    env,
    token,
    'POST',
    `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`
  )
  if (status !== 200) {
    throw new Error(`publishOffer ${status}: ${JSON.stringify(data)}`)
  }
  return (data as { listingId: string }).listingId
}

export async function listItem(env: Env, item: ReadyItem): Promise<ListResult> {
  const token = await getAccessToken(env)
  await upsertInventoryItem(env, token, item)
  const offerId = await createOrGetOffer(env, token, item)
  const listingId = await publishOffer(env, token, offerId)
  return { item_id: item.item_id, listingId }
}

export function shouldAutoPublish(item: ReadyItem): boolean {
  return (item.list_price_final ?? 0) <= 50 && item.price_confidence !== 'Low'
}
