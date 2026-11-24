// Run with: npm test
// Bug: InventoryView "Archive Selected" set status Archived on Listed items too,
// leaving them live on eBay while the dashboard showed them as archived.
// No eBay call is made or mocked here: bulk archive must never touch eBay.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ITEM_STATUSES,
  bulkArchiveSkipMessage,
  canTransitionItem,
  splitForBulkArchive,
  type ItemStatus,
} from '../src/lib/itemStatus'

const row = (item_id: string, status: ItemStatus) => ({ item_id, status })

test('bulk archive skips Listed and SoldPendingApproval items (live eBay listing)', () => {
  const items = [
    row('a', 'PendingReview'),
    row('b', 'ReadyToList'),
    row('c', 'Listed'),
    row('d', 'SoldPendingApproval'),
    row('e', 'Sold'),
    row('f', 'Listed'),
  ]
  const { toArchive, skipped } = splitForBulkArchive(new Set(items.map((i) => i.item_id)), items)
  assert.deepEqual(toArchive, ['a', 'b', 'e'])
  assert.deepEqual(skipped.map((i) => i.item_id), ['c', 'd', 'f'])
})

test('bulk archive still archives everything else exactly as before', () => {
  // Already-archived rows and ids no longer in the loaded list were written as Archived before; keep that.
  const items = [row('x', 'Archived'), row('y', 'Sold')]
  const { toArchive, skipped } = splitForBulkArchive(new Set(['x', 'y', 'gone']), items)
  assert.deepEqual(toArchive, ['x', 'y', 'gone'])
  assert.deepEqual(skipped, [])
})

test('only selected items are considered', () => {
  const items = [row('a', 'Listed'), row('b', 'ReadyToList')]
  const { toArchive, skipped } = splitForBulkArchive(new Set(['b']), items)
  assert.deepEqual(toArchive, ['b'])
  assert.deepEqual(skipped, [])
})

test('the rule comes from the transition table: live-listing states cannot go straight to Archived', () => {
  assert.equal(canTransitionItem('Listed', 'Archived'), false)
  assert.equal(canTransitionItem('SoldPendingApproval', 'Archived'), false)
  for (const s of ITEM_STATUSES) {
    if (s === 'Archived') continue
    const { skipped } = splitForBulkArchive(new Set(['i']), [row('i', s)])
    assert.equal(skipped.length === 0, canTransitionItem(s, 'Archived'), s)
  }
})

test('skip message says how many and why', () => {
  assert.equal(bulkArchiveSkipMessage(0), null)
  assert.equal(bulkArchiveSkipMessage(1), '1 listed item skipped: end it on eBay first, then archive it.')
  assert.equal(bulkArchiveSkipMessage(2), '2 listed items skipped: end them on eBay first, then archive them.')
})
