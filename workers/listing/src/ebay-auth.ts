import type { Env } from './types'

let cachedToken: string | null = null
let tokenExpiresAt = 0

export async function getAccessToken(env: Env): Promise<string> {
  console.log('RAW refresh token from env:', JSON.stringify(env.EBAY_USER_REFRESH_TOKEN))
  const now = Date.now()
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken

  const base =
    env.EBAY_ENVIRONMENT === 'sandbox'
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com'

  const credentials = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`)
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: env.EBAY_USER_REFRESH_TOKEN,
    scope: [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.account',
    ].join(' '),
  })

  const res = await fetch(`${base}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`eBay token refresh failed ${res.status}: ${text}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = data.access_token
  tokenExpiresAt = now + data.expires_in * 1000
  return cachedToken
}
