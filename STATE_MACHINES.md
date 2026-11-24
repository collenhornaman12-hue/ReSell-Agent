# State machines

Every place in ReSell-Agent where a value moves through named states. Update this file
(and the code's single source of truth, where one exists) when you add a state or a transition.

Tests: `npm test` (root, `tests/*.test.ts`), `cd workers/listing && npm test`, `cd workers/vision && npm test`.

---

## 1. Item status lifecycle — `items.status`

- **Source of truth:** `src/lib/itemStatus.ts` (`ITEM_STATUSES`, `ITEM_STATUS_TRANSITIONS`, `canTransitionItem`).
  DB: CHECK constraint in `supabase/migrations/20260519000000_fix_items_schema.sql`.
  `ItemStatus` is re-exported from `src/hooks/useInventory.ts` for existing imports.
- **States:** `PendingReview` → `ReadyToList` → `Listed` → `SoldPendingApproval` → `Sold`, plus `Archived`.
- **Transition map is advisory.** Nothing enforces it at runtime; the DB only checks membership and anon
  may `UPDATE (status)` to any value. `tests/itemStatus.test.ts` asserts every current call site is in the map.

| From | To | Triggered by |
|---|---|---|
| (insert) | PendingReview | vision worker `processItems` (`workers/vision/src/index.ts`) |
| PendingReview | ReadyToList | pricing worker `priceItem` (`workers/pricing/src/pricing.ts`); ReviewQueue Approve |
| PendingReview / ReadyToList | Archived | pricing worker when price < floor; ReviewQueue Reject; ItemDrawer Archive (ReadyToList only) |
| ReadyToList | ReadyToList | pricing worker re-prices `Low` confidence items; ReviewQueue Approve |
| ReadyToList | Listed | listing worker `markListed` (`workers/listing/src/supabase.ts`) — also sets `ebay_listing_id`, `date_listed` |
| Listed | SoldPendingApproval → Sold | **planned, no code yet** |
| any | Archived | InventoryView "Archive Selected" (bulk; does not end a live eBay listing) |
| Archived | PendingReview | ArchivedView Restore (row button and bulk) |
| Archived | ReadyToList | ItemDrawer "Unarchive Item" |

**Invariants**
- Only `PendingReview` and `ReadyToList` items can need review.
- `needsPricing(i) ⇒ needsReview(i)`.
- ItemDrawer shows an actions panel only for `STATUSES_WITH_DRAWER_ACTIONS` (`ReadyToList, Listed, Sold, Archived`).
- `ItemsTable` `STATUS_CLASS` is `satisfies Record<ItemStatus, string>` — adding a status without a badge colour fails `tsc`.

**Known gaps (not changed):** Unarchive goes to `ReadyToList` from the drawer but `PendingReview` from the
Archived view. Bulk archive of a `Listed` item leaves it live on eBay.

## 2. Status gates (derived, not stored)

| Gate | Definition | Lives in | Used by |
|---|---|---|---|
| `needsReview` | `PendingReview` OR (`ReadyToList` AND (price > $50 OR confidence `Low`)) | `src/lib/itemStatus.ts` | ReviewQueue list, MetricsStrip "Pending Review" count |
| `needsPricing` | `PendingReview` OR (`ReadyToList` AND confidence `Low`) | `src/lib/itemStatus.ts` | InventoryView "Price Pending / Low Confidence" batches |
| (same, PostgREST) | `status.eq.PendingReview,and(status.eq.ReadyToList,price_confidence.eq.Low)` | `workers/pricing/src/supabase.ts` `fetchPendingByBatch` | pricing worker input |
| `shouldAutoPublish` | price ≤ $50 AND confidence ≠ `Low` (on `ReadyToList` rows) | `workers/listing/src/ebay-api.ts` | listing worker batch mode |

**Invariant:** for `ReadyToList`, `shouldAutoPublish` is the exact complement of `needsReview` — every item is
either auto-published or shown for review (`workers/listing/test/ebay-api.test.ts`). Change the $50 threshold
(`REVIEW_PRICE_THRESHOLD`) in both places together. The two `needsPricing` copies must stay in sync by hand.

## 3. Pricing outcome — `priceItem` (`workers/pricing/src/pricing.ts`)

Decision per item, written in one `updateItem` call:

| Outcome | status | price_confidence | list_price_final |
|---|---|---|---|
| No comps, search returned a note | ReadyToList | Low | null (note in `price_override_reason`) |
| No comps / search failed | ReadyToList | Low | null (`description_short` ends "pricing failed — review") |
| Priced below `FLOOR_PRICE` | Archived | from comps | null |
| Priced | ReadyToList | from comps | rounded `.99` price (40% rule may override) |

`Low` results stay `needsPricing`, so the next "Price Pending" run retries them.

## 4. Listing mode / bundles — `items.listing_mode`, `items.bundle_id`, `bundles.status`

- `listing_mode`: `null` (from vision) → `Individual` | `Bundle` set by `evaluateBundles` (`workers/pricing/src/index.ts`) for `ReadyToList` items in the batch. Rules in `CLAUDE.md`.
- `bundles.status` shares the item CHECK list but is only ever inserted as `PendingReview`; no code moves it.

## 5. eBay publish pipeline — listing worker (`workers/listing/src/index.ts`)

Single item (`POST /api/listing/trigger {item_id}`):
`validateEnv` (422) → `fetchItem` where `status = ReadyToList` (404) → `validateItem` (422) →
`upsertInventoryItem` → `createOrGetOffer` → `publishOffer` → `markListed` (any step failing → 502, status unchanged).

Batch (`{batch_id}`): `validateEnv` → 200 `{queued}` immediately; in background, every `ReadyToList` row passing
`shouldAutoPublish` runs the same steps; individual failures are swallowed.

## 6. Upload batch — `useCloudinaryUpload` (`src/lib/uploadBatch.ts`)

- **Source of truth:** pure `batchReducer(state, action)`; the hook only dispatches. Tested in `tests/uploadBatch.test.ts`.
- `null` = no batch / reset. Every action except `init` is ignored on `null`, so late callbacks after Reset are no-ops.
- Two parallel sub-states:
  - `overallStatus`: `idle` → `uploading` → `done` | `error` (`error` only when every item failed — including zero items).
  - `triggerStatus`: `idle` → `pending` → `success` | `error` (`triggerError` set). Starts after uploads finish.
- Per item `status`: `uploading` → `done` | `error` (`error` when all its files failed; partial failure is `done` + `error` text). `pending` exists in the type but is never set.
- Actions: `init, uploadsStarted, itemStarted, photoUploaded, photoFailed, itemFinished, uploadsFinished, triggerStarted, triggerSucceeded, triggerFailed`.

**Known gaps (not changed):** if every upload fails the vision trigger still fires with zero items, and no
"Start New Batch/Session" button appears (it needs `overallStatus === 'done'`), so the user must reload.
MobileUpload then polls `/api/vision/status` every 5 s indefinitely (`expectedItemCount` is 0, so `isDone` never flips).

## 7. BatchUpload screen phases — `src/components/upload/BatchUpload.tsx`

Encoded by flags (`pendingItems`, `isFolderOfFolders`, `folderProgress`, `foldersDone`, `batch`, `validationError`):
`empty` → `selected` (pendingItems > 0) → either
`processingFolders` (folderProgress ≠ null) → `foldersDone`, or the single-batch path (`batch` ≠ null, machine 6).
"Start New Batch" (`handleReset`) returns to `empty`. Folder mode does not check the trigger response status.

## 8. MobileUpload — `src/components/upload/MobileUpload.tsx`

`capturing` (sessions, one `activeSessionId`) → `batch` view once `uploadBatch` starts (machine 6) →
vision polling via `useBatchPolling` starts when `triggerStatus === 'success'`.

## 9. Batch polling — `src/hooks/useBatchPolling.ts`

`idle` (no batchId) → `polling` every 5 s → `done` when `items.length >= expectedCount > 0` (interval cleared).
A failed poll sets `error` but keeps the last `items` and keeps polling.

## 10. ItemDrawer async actions — `src/components/dashboard/ItemDrawer.tsx`

Each is `idle → pending → idle | error` encoded as a boolean + error string:
- Publish (`publishing`, `publishError`): success refreshes and closes the drawer.
- Unarchive (`unarchiving`, `unarchiveError`): success refreshes and closes.
- Edit (`isEditing`, `editError`, `savedFeedback`): `viewing → editing → (save) viewing + "Saved" for 2 s | editing + error`. No pending state while saving.
- Lightbox: `lightboxIndex` `null | 0..n-1`.
Opening a different item resets errors, edit mode, feedback and lightbox.

## 11. Inventory load and bulk pricing

- `useInventory`: `loading` (first load only) / `error` (shown in MetricsStrip) / `items`; refreshes every 30 s.
- InventoryView "Price Pending": `pricing` + `pricingProgress {current,total}` → idle again after all batches and a refresh.

## 12. Schema-only machines (no code yet)

- `notifications.status`: `Pending | Approved | Rejected | Dismissed`; `notifications.type` lists the planned events.
- `messages.direction`: `Inbound | Outbound`.
