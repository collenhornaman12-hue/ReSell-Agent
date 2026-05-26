#!/usr/bin/env node
/**
 * One-off: creates a merchant location in the eBay sandbox account.
 * Reads credentials from workers/listing/.dev.vars
 * Reads seller address from .env
 * Usage: node scripts/create-merchant-location.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── Parse key=value files ────────────────────────────────────────────────────

function parseVars(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const vars = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const idx = trimmed.indexOf('=')
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    vars[key] = val
  }
  return vars
}

const vars = parseVars(path.join(ROOT, 'workers', 'listing', '.dev.vars'))
const env  = parseVars(path.join(ROOT, '.env'))

const CLIENT_ID     = vars.EBAY_CLIENT_ID
const CLIENT_SECRET = vars.EBAY_CLIENT_SECRET
const REFRESH_TOKEN = vars.EBAY_USER_REFRESH_TOKEN
const ENVIRONMENT   = vars.EBAY_ENVIRONMENT ?? 'sandbox'

const BASE = ENVIRONMENT === 'sandbox'
  ? 'https://api.sandbox.ebay.com'
  : 'https://api.ebay.com'

const LOCATION_KEY = 'resell-agent-main'

// ── Get access token ─────────────────────────────────────────────────────────

async function getAccessToken() {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: REFRESH_TOKEN,
    scope: [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.account',
    ].join(' '),
  })

  const res = await fetch(`${BASE}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  })
  const data = await res.json()
  if (!res.ok) {
    console.error('Token response:', JSON.stringify(data, null, 2))
    throw new Error(`Token refresh failed: ${res.status}`)
  }
  console.log(`✓ Access token obtained (expires in ${data.expires_in}s)`)
  return data.access_token
}

// ── Create merchant location ─────────────────────────────────────────────────

async function createMerchantLocation(token) {
  const payload = {
    location: {
      address: {
        addressLine1: env.SELLER_STREET1,
        city: env.SELLER_CITY,
        stateOrProvince: env.SELLER_STATE,
        postalCode: env.SELLER_ZIP,
        country: env.SELLER_COUNTRY,
      },
    },
    locationTypes: ['WAREHOUSE'],
    name: 'ResellAgent Main',
    merchantLocationStatus: 'ENABLED',
  }

  console.log(`\nCreating location key: ${LOCATION_KEY}`)
  console.log('Payload:', JSON.stringify(payload, null, 2))

  const res = await fetch(
    `${BASE}/sell/inventory/v1/location/${encodeURIComponent(LOCATION_KEY)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    }
  )

  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }

  console.log(`\nHTTP ${res.status}`)
  console.log(JSON.stringify(data, null, 2))
  return { status: res.status, data }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const token = await getAccessToken()
const { status, data } = await createMerchantLocation(token)

if (status === 204 || status === 200 || status === 201) {
  console.log(`\n✓ Merchant location created: ${LOCATION_KEY}`)
  console.log(`  Add to workers/listing/.dev.vars:`)
  console.log(`  EBAY_MERCHANT_LOCATION_KEY=${LOCATION_KEY}`)
}
