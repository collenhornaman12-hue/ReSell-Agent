import { describe, it, expect } from 'vitest'
import { shouldAutoPublish, validateItem } from '../src/ebay-api'
import type { ReadyItem } from '../src/types'

// Gate for the ReadyToList -> Listed transition (batch auto-publish) and the
// pre-flight check for single-item publish. See STATE_MACHINES.md.

function item(over: Partial<ReadyItem> = {}): ReadyItem {
  return {
    item_id: 'i1',
    item_name: 'Thing',
    brand: null,
    model_number: null,
    category: null,
    subcategory: null,
    condition_ebay: 'Good',
    condition_notes: null,
    description_short: null,
    description_long: null,
    keywords: null,
    photos: null,
    list_price_final: 19.99,
    price_confidence: 'High',
    listing_mode: 'Individual',
    batch_id: 'b1',
    ...over,
  }
}

// Mirror of the dashboard's review gate for ReadyToList items
// (src/lib/itemStatus.ts needsReview). Auto-publish must be its exact complement
// so that every ReadyToList item is either auto-published or shown for review.
const dashboardNeedsReview = (i: ReadyItem) =>
  (i.list_price_final ?? 0) > 50 || i.price_confidence === 'Low'

describe('shouldAutoPublish', () => {
  it('publishes cheap, confident items', () => {
    expect(shouldAutoPublish(item({ list_price_final: 50, price_confidence: 'Medium' }))).toBe(true)
  })
  it('holds items over $50 for review', () => {
    expect(shouldAutoPublish(item({ list_price_final: 50.01 }))).toBe(false)
  })
  it('holds Low confidence items for review', () => {
    expect(shouldAutoPublish(item({ price_confidence: 'Low' }))).toBe(false)
  })
  it('treats a null price as $0 (validateItem rejects it later)', () => {
    expect(shouldAutoPublish(item({ list_price_final: null }))).toBe(true)
  })
  it('is the exact complement of the dashboard review gate', () => {
    for (const list_price_final of [null, 0, 10, 50, 50.01, 200])
      for (const price_confidence of [null, 'High', 'Medium', 'Low'] as const) {
        const i = item({ list_price_final, price_confidence })
        expect(shouldAutoPublish(i)).toBe(!dashboardNeedsReview(i))
      }
  })
})

describe('validateItem', () => {
  it('accepts a priced item with an eBay condition', () => {
    expect(validateItem(item())).toBeNull()
  })
  it('rejects a missing or zero price', () => {
    expect(validateItem(item({ list_price_final: null }))).toBe('list_price_final is missing or zero')
    expect(validateItem(item({ list_price_final: 0 }))).toBe('list_price_final is missing or zero')
  })
  it('rejects a missing condition', () => {
    expect(validateItem(item({ condition_ebay: null }))).toBe('condition_ebay is missing')
  })
})
