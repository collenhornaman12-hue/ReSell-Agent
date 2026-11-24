// Run with: npm test  (node --test via tsx, no extra deps)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ITEM_STATUSES,
  ITEM_STATUS_TRANSITIONS,
  STATUSES_WITH_DRAWER_ACTIONS,
  canTransitionItem,
  needsPricing,
  needsReview,
  type ItemStatus,
} from '../src/lib/itemStatus'

// The predicates below are the exact inline expressions that lived in
// useInventory.computeMetrics, ReviewQueue and InventoryView before they were
// centralised. The new helpers must agree with them for every input.
type Probe = {
  status: ItemStatus
  list_price_final: number | null
  price_confidence: 'High' | 'Medium' | 'Low' | null
}

function legacyNeedsReview(i: Probe): boolean {
  return (
    i.status === 'PendingReview' ||
    (i.status === 'ReadyToList' &&
      ((i.list_price_final ?? 0) > 50 || i.price_confidence === 'Low'))
  )
}

function legacyNeedsPricing(i: Probe): boolean {
  return i.status === 'PendingReview' || (i.status === 'ReadyToList' && i.price_confidence === 'Low')
}

const PRICES = [null, 0, 4.98, 10, 49.99, 50, 50.01, 120]
const CONFIDENCES = [null, 'High', 'Medium', 'Low'] as const

function* allProbes(): Generator<Probe> {
  for (const status of ITEM_STATUSES)
    for (const list_price_final of PRICES)
      for (const price_confidence of CONFIDENCES) yield { status, list_price_final, price_confidence }
}

test('ITEM_STATUSES matches the items.status CHECK constraint, in lifecycle order', () => {
  assert.deepEqual(
    [...ITEM_STATUSES],
    ['PendingReview', 'ReadyToList', 'Listed', 'SoldPendingApproval', 'Sold', 'Archived']
  )
})

test('needsReview is identical to the legacy inline predicate', () => {
  for (const p of allProbes()) assert.equal(needsReview(p), legacyNeedsReview(p), JSON.stringify(p))
})

test('needsPricing is identical to the legacy inline predicate', () => {
  for (const p of allProbes()) assert.equal(needsPricing(p), legacyNeedsPricing(p), JSON.stringify(p))
})

test('invariant: everything that needs pricing also needs review', () => {
  for (const p of allProbes()) if (needsPricing(p)) assert.ok(needsReview(p), JSON.stringify(p))
})

test('invariant: only PendingReview / ReadyToList can need review', () => {
  for (const p of allProbes())
    if (needsReview(p)) assert.ok(p.status === 'PendingReview' || p.status === 'ReadyToList')
})

test('transition map has an entry for every status and only targets known statuses', () => {
  assert.deepEqual(Object.keys(ITEM_STATUS_TRANSITIONS).sort(), [...ITEM_STATUSES].sort())
  for (const targets of Object.values(ITEM_STATUS_TRANSITIONS))
    for (const t of targets) assert.ok((ITEM_STATUSES as readonly string[]).includes(t))
})

test('every transition the code performs today is allowed by the map', () => {
  const performed: Array<[ItemStatus, ItemStatus, string]> = [
    ['PendingReview', 'ReadyToList', 'pricing worker priceItem / ReviewQueue approve'],
    ['PendingReview', 'Archived', 'pricing worker floor price / ReviewQueue reject / bulk archive'],
    ['ReadyToList', 'ReadyToList', 'pricing worker re-price of Low confidence / ReviewQueue approve'],
    ['ReadyToList', 'Archived', 'pricing floor / ItemDrawer Archive / ReviewQueue reject / bulk archive'],
    ['ReadyToList', 'Listed', 'listing worker markListed'],
    ['Listed', 'Archived', 'InventoryView bulk archive'],
    ['Sold', 'Archived', 'InventoryView bulk archive'],
    ['SoldPendingApproval', 'Archived', 'InventoryView bulk archive'],
    ['Archived', 'PendingReview', 'ArchivedView restore'],
    ['Archived', 'ReadyToList', 'ItemDrawer unarchive'],
  ]
  for (const [from, to, who] of performed) assert.ok(canTransitionItem(from, to), `${from} -> ${to} (${who})`)
})

test('planned sale flow is modelled; nothing jumps straight to Sold or Listed from review', () => {
  assert.ok(canTransitionItem('Listed', 'SoldPendingApproval'))
  assert.ok(canTransitionItem('SoldPendingApproval', 'Sold'))
  assert.equal(canTransitionItem('PendingReview', 'Listed'), false)
  assert.equal(canTransitionItem('PendingReview', 'Sold'), false)
  assert.equal(canTransitionItem('Listed', 'Sold'), false)
  assert.equal(canTransitionItem('Sold', 'Listed'), false)
})

test('drawer action statuses keep their original order and contents', () => {
  assert.deepEqual([...STATUSES_WITH_DRAWER_ACTIONS], ['ReadyToList', 'Listed', 'Sold', 'Archived'])
})
