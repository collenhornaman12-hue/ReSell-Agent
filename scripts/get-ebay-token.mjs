#!/usr/bin/env node
/**
 * One-off: obtains an eBay sandbox refresh token via OAuth authorization code flow.
 * Reads credentials from workers/listing/.dev.vars
 * Usage: node scripts/get-ebay-token.mjs
 */

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

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

const CLIENT_ID     = vars.EBAY_CLIENT_ID
const CLIENT_SECRET = vars.EBAY_CLIENT_SECRET
const REDIRECT_URI  = vars.EBAY_REDIRECT_URI  // RuName

const SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
].join(' ')

const AUTH_URL =
  'https://auth.sandbox.ebay.com/oauth2/authorize' +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}`

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// eBay sometimes returns the code URL-encoded — decode it
function extractCode(input) {
  // If user pasted the full redirect URL, extract the code= param
  try {
    const url = new URL(input)
    const code = url.searchParams.get('code')
    if (code) return decodeURIComponent(code)
  } catch {
    // not a URL — treat as raw code
  }
  return decodeURIComponent(input)
}

console.log('\n── Step 1: Open this URL in your browser and log in to your eBay sandbox account ──\n')
console.log(AUTH_URL)
console.log('\nAfter you authorize, eBay will redirect to your RuName landing page.')
console.log('Copy either the full redirect URL or just the "code" query parameter value.\n')

const raw = await ask('Paste the authorization code (or full redirect URL): ')
const code = extractCode(raw)

if (!code) {
  console.error('No code found in input.')
  process.exit(1)
}

console.log(`\n── Step 2: Exchanging code for tokens… ──\n`)

const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
const body = new URLSearchParams({
  grant_type: 'authorization_code',
  code,
  redirect_uri: REDIRECT_URI,
})

const res = await fetch('https://api.sandbox.ebay.com/identity/v1/oauth2/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Authorization: `Basic ${credentials}`,
  },
  body: body.toString(),
})

const data = await res.json()

if (!res.ok) {
  console.error(`Token exchange failed (HTTP ${res.status}):`)
  console.error(JSON.stringify(data, null, 2))
  process.exit(1)
}

console.log(`✓ Token exchange succeeded\n`)
console.log(`Access token  (r^0, ~2hr):  ${data.access_token}\n`)
console.log(`Refresh token (r^1, ~18mo): ${data.refresh_token}\n`)
console.log('── Add to workers/listing/.dev.vars ──')
console.log(`EBAY_USER_REFRESH_TOKEN=${data.refresh_token}`)
