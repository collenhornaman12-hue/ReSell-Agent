// Run with: npm test  (node --test via tsx, no extra deps)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { batchPercent, batchReducer, type BatchState, type UploadedPhoto } from '../src/lib/uploadBatch'

const photo = (n: number): UploadedPhoto => ({
  publicId: `p${n}`,
  secureUrl: `https://x/upload/p${n}.jpg`,
  thumbnailUrl: `https://x/upload/w_120,h_120,c_fill/p${n}.jpg`,
})

function started(): BatchState {
  let s = batchReducer(null, { type: 'init', batchId: 'b1' })
  s = batchReducer(s, { type: 'uploadsStarted' })
  return s as BatchState
}

test('init creates an idle/idle batch regardless of previous state', () => {
  const s = batchReducer(null, { type: 'init', batchId: 'b1' })
  assert.deepEqual(s, {
    batchId: 'b1',
    items: {},
    overallStatus: 'idle',
    triggerStatus: 'idle',
    expectedItemCount: 0,
  })
})

test('every non-init action is a no-op on a null (reset) batch', () => {
  const actions = [
    { type: 'uploadsStarted' },
    { type: 'itemStarted', itemKey: 'k', itemName: 'n', totalFiles: 1 },
    { type: 'photoUploaded', itemKey: 'k', photos: [photo(1)] },
    { type: 'photoFailed', itemKey: 'k', failedCount: 1 },
    { type: 'itemFinished', itemKey: 'k', failedCount: 0, totalFiles: 1 },
    { type: 'uploadsFinished' },
    { type: 'triggerStarted' },
    { type: 'triggerSucceeded', itemCount: 1 },
    { type: 'triggerFailed', error: 'x' },
  ] as const
  for (const a of actions) assert.equal(batchReducer(null, a), null, a.type)
})

test('happy path: idle -> uploading -> done, trigger idle -> pending -> success', () => {
  let s: BatchState | null = started()
  assert.equal(s.overallStatus, 'uploading')
  s = batchReducer(s, { type: 'itemStarted', itemKey: 'b1/a', itemName: 'a', totalFiles: 2 })
  assert.deepEqual(s!.items['b1/a'], {
    itemName: 'a', totalFiles: 2, uploadedCount: 0, failedCount: 0, status: 'uploading', photos: [],
  })
  s = batchReducer(s, { type: 'photoUploaded', itemKey: 'b1/a', photos: [photo(1)] })
  s = batchReducer(s, { type: 'photoUploaded', itemKey: 'b1/a', photos: [photo(1), photo(2)] })
  assert.equal(s!.items['b1/a'].uploadedCount, 2)
  s = batchReducer(s, { type: 'itemFinished', itemKey: 'b1/a', failedCount: 0, totalFiles: 2 })
  assert.equal(s!.items['b1/a'].status, 'done')
  assert.equal(s!.items['b1/a'].error, undefined)
  s = batchReducer(s, { type: 'uploadsFinished' })
  assert.equal(s!.overallStatus, 'done')
  s = batchReducer(s, { type: 'triggerStarted' })
  assert.equal(s!.triggerStatus, 'pending')
  s = batchReducer(s, { type: 'triggerSucceeded', itemCount: 1 })
  assert.equal(s!.triggerStatus, 'success')
  assert.equal(s!.expectedItemCount, 1)
})

test('photo snapshot is copied, not aliased', () => {
  const list = [photo(1)]
  let s: BatchState | null = started()
  s = batchReducer(s, { type: 'itemStarted', itemKey: 'k', itemName: 'n', totalFiles: 2 })
  s = batchReducer(s, { type: 'photoUploaded', itemKey: 'k', photos: list })
  list.push(photo(2))
  assert.equal(s!.items.k.photos.length, 1)
})

test('partial failure: item is done with an error message', () => {
  let s: BatchState | null = started()
  s = batchReducer(s, { type: 'itemStarted', itemKey: 'k', itemName: 'n', totalFiles: 3 })
  s = batchReducer(s, { type: 'photoFailed', itemKey: 'k', failedCount: 1 })
  assert.equal(s!.items.k.failedCount, 1)
  s = batchReducer(s, { type: 'itemFinished', itemKey: 'k', failedCount: 1, totalFiles: 3 })
  assert.equal(s!.items.k.status, 'done')
  assert.equal(s!.items.k.error, '1 file(s) failed')
})

test('total failure: item error, batch error when every item failed', () => {
  let s: BatchState | null = started()
  s = batchReducer(s, { type: 'itemStarted', itemKey: 'k', itemName: 'n', totalFiles: 2 })
  s = batchReducer(s, { type: 'itemFinished', itemKey: 'k', failedCount: 2, totalFiles: 2 })
  assert.equal(s!.items.k.status, 'error')
  assert.equal(s!.items.k.error, '2 file(s) failed')
  s = batchReducer(s, { type: 'uploadsFinished' })
  assert.equal(s!.overallStatus, 'error')
})

test('mixed results: batch is done when at least one item succeeded', () => {
  let s: BatchState | null = started()
  s = batchReducer(s, { type: 'itemStarted', itemKey: 'a', itemName: 'a', totalFiles: 1 })
  s = batchReducer(s, { type: 'itemFinished', itemKey: 'a', failedCount: 1, totalFiles: 1 })
  s = batchReducer(s, { type: 'itemStarted', itemKey: 'b', itemName: 'b', totalFiles: 1 })
  s = batchReducer(s, { type: 'itemFinished', itemKey: 'b', failedCount: 0, totalFiles: 1 })
  s = batchReducer(s, { type: 'uploadsFinished' })
  assert.equal(s!.overallStatus, 'done')
})

test('existing behaviour kept: a batch with zero items finishes as error', () => {
  const s = batchReducer(started(), { type: 'uploadsFinished' })
  assert.equal(s!.overallStatus, 'error')
})

test('trigger failure records the message', () => {
  let s: BatchState | null = batchReducer(started(), { type: 'triggerStarted' })
  s = batchReducer(s, { type: 'triggerFailed', error: 'Vision trigger failed (500): boom' })
  assert.equal(s!.triggerStatus, 'error')
  assert.equal(s!.triggerError, 'Vision trigger failed (500): boom')
})

test('batchPercent matches the old inline computation', () => {
  assert.equal(batchPercent(null), 0)
  let s: BatchState | null = started()
  assert.equal(batchPercent(s), 0)
  s = batchReducer(s, { type: 'itemStarted', itemKey: 'a', itemName: 'a', totalFiles: 0 })
  assert.equal(batchPercent(s), 0)
  s = batchReducer(s, { type: 'itemStarted', itemKey: 'b', itemName: 'b', totalFiles: 3 })
  s = batchReducer(s, { type: 'photoUploaded', itemKey: 'b', photos: [photo(1)] })
  assert.equal(batchPercent(s), 33)
  s = batchReducer(s, { type: 'photoUploaded', itemKey: 'b', photos: [photo(1), photo(2)] })
  assert.equal(batchPercent(s), 67)
})
