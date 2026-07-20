export interface Env {
  ANTHROPIC_API_KEY: string
  APIFY_API_TOKEN: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  WORKER_SECRET: string
}

export interface PendingItem {
  item_id: string
  item_name: string
  brand: string | null
  model_number: string | null
  category: string
  subcategory: string | null
  condition_raw: string
  condition_ebay: string
  condition_notes: string | null
  is_complete: boolean
  keywords: string[] | null
  identification_confidence: 'High' | 'Medium' | 'Low' | null
  batch_id: string | null
  photos: string[]
  status: string
}

export interface EbayComps {
  comps_count: number
  median_price: number
  price_range: string
  confidence: 'High' | 'Medium' | 'Low'
  note?: string
}

export interface PricingUpdate {
  ebay_search_query: string
  ebay_comps_count: number
  ebay_comp_price_median: number | null
  ebay_comp_price_range: string | null
  ebay_price: number | null
  list_price_final: number | null
  price_confidence: 'High' | 'Medium' | 'Low' | null
  price_override_reason: string | null
  description_short: string | null
  description_long: string | null
  status: 'ReadyToList' | 'Archived'
}

export type Item = Record<string, unknown>

export interface PricedItem {
  item_id: string
  item_name: string
  brand: string | null
  subcategory: string | null
  list_price_final: number | null
  status: string
  listing_mode: string | null
  bundle_id: string | null
}

export interface BundleInsert {
  bundle_name: string
  item_ids: string[]
  bundle_price_ebay: number
  rationale: string
  status: 'PendingReview'
  bundle_description_short: string | null
  bundle_description_long: string | null
}
