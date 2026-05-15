export interface Env {
  ANTHROPIC_API_KEY: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

export interface TriggerItem {
  item_name_seed: string
  photo_urls: string[]
}

export interface TriggerPayload {
  batch_id: string
  items: TriggerItem[]
}

export interface VisionExtracted {
  item_name: string
  brand: string | null
  model_number: string | null
  category: string
  subcategory: string | null
  condition_raw: string
  condition_ebay: string
  condition_notes: string | null
  is_complete: boolean
  keywords: string[]
  identification_confidence: 'High' | 'Medium' | 'Low'
}

export interface ItemInsert {
  photos: string[]
  item_name: string
  brand: string | null
  model_number: string | null
  category: string
  subcategory: string | null
  condition_raw: string
  condition_ebay: string
  condition_notes: string | null
  is_complete: boolean
  keywords: string[]
  identification_confidence: 'High' | 'Medium' | 'Low'
  status: 'PendingReview'
  created_by: 'system'
  ebay_price: null
  ebay_comps_count: number
  ebay_comp_price_median: null
  ebay_comp_price_range: null
  fb_price: null
  list_price_final: null
  price_confidence: null
  bundle_id: null
  listing_mode: null
}

export interface StatusItem {
  item_id: string
  item_name: string
  identification_confidence: 'High' | 'Medium' | 'Low' | null
  status: string
  photos: string[]
}
