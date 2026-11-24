// Single source of truth for the item status lifecycle on the dashboard.
// Mirrors the items.status CHECK constraint in supabase/migrations.
// See STATE_MACHINES.md -> "Item status lifecycle". Update both when you add a state.

export const ITEM_STATUSES = [
  'PendingReview',
  'ReadyToList',
  'Listed',
  'SoldPendingApproval',
  'Sold',
  'Archived',
] as const

export type ItemStatus = (typeof ITEM_STATUSES)[number]

type Confidence = 'High' | 'Medium' | 'Low' | null

/** Minimal shape the gates need, so workers/tests can call them without a full Item. */
export interface StatusGateInput {
  status: ItemStatus
  list_price_final: number | null
  price_confidence: Confidence
}

/** Price above this always needs a human look before listing (listing worker uses the same cut-off). */
export const REVIEW_PRICE_THRESHOLD = 50

/**
 * Item shows in the Review queue / "Pending Review" metric.
 * For ReadyToList items this is the exact complement of the listing worker's
 * shouldAutoPublish() (workers/listing/src/ebay-api.ts).
 */
export function needsReview(i: StatusGateInput): boolean {
  return (
    i.status === 'PendingReview' ||
    (i.status === 'ReadyToList' &&
      ((i.list_price_final ?? 0) > REVIEW_PRICE_THRESHOLD || i.price_confidence === 'Low'))
  )
}

/**
 * Item is (re)picked up by the pricing worker. Must match the PostgREST filter in
 * workers/pricing/src/supabase.ts fetchPendingByBatch():
 *   status.eq.PendingReview,and(status.eq.ReadyToList,price_confidence.eq.Low)
 */
export function needsPricing(i: Pick<StatusGateInput, 'status' | 'price_confidence'>): boolean {
  return i.status === 'PendingReview' || (i.status === 'ReadyToList' && i.price_confidence === 'Low')
}

/**
 * Transitions the app performs (or plans: Listed -> SoldPendingApproval -> Sold).
 * Advisory only: nothing enforces it at runtime yet; the DB only checks membership.
 * tests/itemStatus.test.ts asserts every current call site's transition is listed here.
 */
export const ITEM_STATUS_TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  PendingReview: ['ReadyToList', 'Archived'],
  ReadyToList: ['ReadyToList', 'Listed', 'Archived'],
  Listed: ['SoldPendingApproval', 'Archived'],
  SoldPendingApproval: ['Sold', 'Archived'],
  Sold: ['Archived'],
  Archived: ['PendingReview', 'ReadyToList'],
}

export function canTransitionItem(from: ItemStatus, to: ItemStatus): boolean {
  return ITEM_STATUS_TRANSITIONS[from].includes(to)
}

/** Statuses for which ItemDrawer renders an actions panel (others show "No actions available"). */
export const STATUSES_WITH_DRAWER_ACTIONS: readonly ItemStatus[] = ['ReadyToList', 'Listed', 'Sold', 'Archived']
