export interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  WORKER_SECRET: string
  EBAY_CLIENT_ID: string
  EBAY_CLIENT_SECRET: string
  EBAY_USER_REFRESH_TOKEN: string
  EBAY_REDIRECT_URI: string
  EBAY_ENVIRONMENT: string
  EBAY_FULFILLMENT_POLICY_ID: string
  EBAY_PAYMENT_POLICY_ID: string
  EBAY_RETURN_POLICY_ID: string
  EBAY_MERCHANT_LOCATION_KEY: string
}

export interface ReadyItem {
  item_id: string
  item_name: string
  brand: string | null
  model_number: string | null
  category: string | null
  subcategory: string | null
  condition_ebay: string | null
  condition_notes: string | null
  description_short: string | null
  description_long: string | null
  keywords: string[] | null
  photos: string[] | null
  list_price_final: number | null
  price_confidence: 'High' | 'Medium' | 'Low' | null
  listing_mode: 'Individual' | 'Bundle' | null
  batch_id: string | null
}

export interface ListResult {
  item_id: string
  listingId: string
}
