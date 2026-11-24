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
// Listed and SoldPendingApproval have no -> Archived edge: those items may still have a live
// eBay listing, and the dashboard has no "end listing" call. Archiving them would hide a live
// listing. Add the edge back only together with code that ends the eBay listing first.
export const ITEM_STATUS_TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  PendingReview: ['ReadyToList', 'Archived'],
  ReadyToList: ['ReadyToList', 'Listed', 'Archived'],
  Listed: ['SoldPendingApproval'],
  SoldPendingApproval: ['Sold'],
  Sold: ['Archived'],
  Archived: ['PendingReview', 'ReadyToList'],
}

export function canTransitionItem(from: ItemStatus, to: ItemStatus): boolean {
  return ITEM_STATUS_TRANSITIONS[from].includes(to)
}

/**
 * InventoryView "Archive Selected": which selected ids to set Archived, and which to skip
 * because the transition table forbids -> Archived (live eBay listing). Already-Archived rows
 * and ids not in `items` are archived as before. Never ends, revises or deletes an eBay listing.
 */
export function splitForBulkArchive<T extends { item_id: string; status: ItemStatus }>(
  selectedIds: ReadonlySet<string>,
  items: readonly T[]
): { toArchive: string[]; skipped: T[] } {
  const byId = new Map(items.map((i) => [i.item_id, i]))
  const toArchive: string[] = []
  const skipped: T[] = []
  for (const id of selectedIds) {
    const item = byId.get(id)
    if (item && item.status !== 'Archived' && !canTransitionItem(item.status, 'Archived')) skipped.push(item)
    else toArchive.push(id)
  }
  return { toArchive, skipped }
}

/** User-facing notice for items bulk archive skipped; null when none were skipped. */
export function bulkArchiveSkipMessage(skippedCount: number): string | null {
  if (skippedCount <= 0) return null
  return skippedCount === 1
    ? '1 listed item skipped: end it on eBay first, then archive it.'
    : `${skippedCount} listed items skipped: end them on eBay first, then archive them.`
}

/** Statuses for which ItemDrawer renders an actions panel (others show "No actions available"). */
export const STATUSES_WITH_DRAWER_ACTIONS: readonly ItemStatus[] = ['ReadyToList', 'Listed', 'Sold', 'Archived']
