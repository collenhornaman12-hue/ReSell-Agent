import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Item, ItemStatus } from '@/hooks/useInventory'
import { useInventoryContext } from '@/context/InventoryContext'
import { formatPrice } from '@/lib/format'

interface ItemDrawerProps {
  item: Item | null
  onClose: () => void
  updateItemStatus: (item_id: string, newStatus: ItemStatus) => Promise<void>
}

function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-foreground break-words">{value ?? '—'}</p>
    </div>
  )
}

type EditFields = {
  item_name: string
  brand: string
  list_price_final: string
  ebay_price: string
  condition_ebay: string
  condition_notes: string
  description_short: string
  description_long: string
}

function toEditFields(item: Item): EditFields {
  return {
    item_name: item.item_name ?? '',
    brand: item.brand ?? '',
    list_price_final: item.list_price_final?.toString() ?? '',
    ebay_price: item.ebay_price?.toString() ?? '',
    condition_ebay: item.condition_ebay ?? '',
    condition_notes: item.condition_notes ?? '',
    description_short: item.description_short ?? '',
    description_long: item.description_long ?? '',
  }
}

const inputCls =
  'w-full text-sm border border-input rounded-md px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

export function ItemDrawer({ item, onClose, updateItemStatus }: ItemDrawerProps) {
  const { refresh, updateItem } = useInventoryContext()
  const [localItem, setLocalItem] = useState<Item | null>(item)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [unarchiving, setUnarchiving] = useState(false)
  const [unarchiveError, setUnarchiveError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editFields, setEditFields] = useState<EditFields>({
    item_name: '', brand: '', list_price_final: '', ebay_price: '',
    condition_ebay: '', condition_notes: '', description_short: '', description_long: '',
  })
  const [editError, setEditError] = useState<string | null>(null)
  const [savedFeedback, setSavedFeedback] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const photos = localItem?.photos ?? []

  // Sync localItem whenever a different item is opened
  useEffect(() => {
    setPublishError(null)
    setUnarchiveError(null)
    setIsEditing(false)
    setEditError(null)
    setSavedFeedback(false)
    setLightboxIndex(null)
    setLocalItem(item)
  }, [item?.item_id])

  // Lightbox keyboard navigation on document.body (bubble phase — fires before Radix's document listener)
  useEffect(() => {
    if (lightboxIndex === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setLightboxIndex(null) }
      if (e.key === 'ArrowLeft') setLightboxIndex(i => i !== null ? (i - 1 + photos.length) % photos.length : null)
      if (e.key === 'ArrowRight') setLightboxIndex(i => i !== null ? (i + 1) % photos.length : null)
    }
    document.body.addEventListener('keydown', handler)
    return () => document.body.removeEventListener('keydown', handler)
  }, [lightboxIndex, photos.length])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  function handleEnterEdit() {
    if (!localItem) return
    setEditFields(toEditFields(localItem))
    setEditError(null)
    setIsEditing(true)
  }

  function handleCancel() {
    setIsEditing(false)
    setEditError(null)
  }

  async function handleSave() {
    if (!localItem) return
    const original = toEditFields(localItem)
    const changes: Partial<Item> = {}

    if (editFields.item_name !== original.item_name) changes.item_name = editFields.item_name
    if (editFields.brand !== original.brand) changes.brand = editFields.brand || null
    if (editFields.list_price_final !== original.list_price_final)
      changes.list_price_final = editFields.list_price_final ? parseFloat(editFields.list_price_final) : null
    if (editFields.ebay_price !== original.ebay_price)
      changes.ebay_price = editFields.ebay_price ? parseFloat(editFields.ebay_price) : null
    if (editFields.condition_ebay !== original.condition_ebay) changes.condition_ebay = editFields.condition_ebay || null
    if (editFields.condition_notes !== original.condition_notes) changes.condition_notes = editFields.condition_notes || null
    if (editFields.description_short !== original.description_short) changes.description_short = editFields.description_short || null
    if (editFields.description_long !== original.description_long) changes.description_long = editFields.description_long || null

    if (Object.keys(changes).length === 0) {
      setIsEditing(false)
      return
    }

    setEditError(null)
    try {
      await updateItem(localItem.item_id, changes)
      setLocalItem((prev) => (prev ? { ...prev, ...changes } : prev))
      setIsEditing(false)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      setSavedFeedback(true)
      savedTimerRef.current = setTimeout(() => setSavedFeedback(false), 2000)
    } catch (e) {
      setEditError((e as Error).message)
    }
  }

  async function unarchiveItem() {
    if (!localItem) return
    setUnarchiving(true)
    setUnarchiveError(null)
    try {
      await updateItemStatus(localItem.item_id, 'ReadyToList')
      await refresh()
      onClose()
    } catch (e) {
      setUnarchiveError((e as Error).message)
    } finally {
      setUnarchiving(false)
    }
  }

  async function publishToEbay() {
    if (!localItem) return
    setPublishing(true)
    setPublishError(null)
    try {
      const res = await fetch('/api/listing/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Worker-Token': import.meta.env.VITE_WORKER_SECRET,
        },
        body: JSON.stringify({ item_id: localItem.item_id }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || data.error) {
        setPublishError(data.error ?? `Error ${res.status}`)
        return
      }
      await refresh()
      onClose()
    } catch (e) {
      setPublishError((e as Error).message)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <>
      {/* item (prop) controls open state; localItem drives all display */}
      <Sheet open={item !== null} onOpenChange={(open) => { if (!open) onClose() }}>
        <SheetContent aria-describedby={undefined}>
          {localItem && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
                <SheetTitle className="text-base font-semibold truncate pr-4">{localItem.item_name}</SheetTitle>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isEditing ? (
                    <>
                      <Button variant="outline" size="sm" onClick={handleCancel}>Cancel</Button>
                      <Button size="sm" onClick={() => void handleSave()}>Save</Button>
                    </>
                  ) : (
                    <>
                      {savedFeedback && <span className="text-xs text-green-600 font-medium">Saved</span>}
                      <Button variant="outline" size="sm" onClick={handleEnterEdit}>Edit</Button>
                    </>
                  )}
                  <SheetClose asChild>
                    <Button variant="ghost" size="icon" className="flex-shrink-0">
                      <X className="h-4 w-4" />
                    </Button>
                  </SheetClose>
                </div>
              </div>

              {/* Edit error */}
              {editError && (
                <p className="text-xs text-destructive px-6 py-2 border-b border-border">{editError}</p>
              )}

              {/* Photos */}
              {photos.length > 0 && (
                <div className="flex gap-2 px-6 py-3 overflow-x-auto border-b border-border flex-shrink-0">
                  {photos.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt=""
                      className="h-20 w-20 flex-shrink-0 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setLightboxIndex(i)}
                    />
                  ))}
                </div>
              )}

              {/* Fields — scrollable */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  {isEditing && (
                    <div className="col-span-2 min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Item Name</p>
                      <input
                        type="text"
                        className={inputCls}
                        value={editFields.item_name}
                        onChange={(e) => setEditFields((f) => ({ ...f, item_name: e.target.value }))}
                      />
                    </div>
                  )}
                  <FieldRow label="Item ID" value={localItem.item_id} />
                  <FieldRow label="Status" value={localItem.status} />
                  {isEditing ? (
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Brand</p>
                      <input
                        type="text"
                        className={inputCls}
                        value={editFields.brand}
                        onChange={(e) => setEditFields((f) => ({ ...f, brand: e.target.value }))}
                      />
                    </div>
                  ) : (
                    <FieldRow label="Brand" value={localItem.brand} />
                  )}
                  <FieldRow label="Model" value={localItem.model_number} />
                  <FieldRow label="Category" value={localItem.category} />
                  <FieldRow label="Subcategory" value={localItem.subcategory} />
                  {isEditing ? (
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Condition (eBay)</p>
                      <input
                        type="text"
                        className={inputCls}
                        value={editFields.condition_ebay}
                        onChange={(e) => setEditFields((f) => ({ ...f, condition_ebay: e.target.value }))}
                      />
                    </div>
                  ) : (
                    <FieldRow label="Condition (eBay)" value={localItem.condition_ebay} />
                  )}
                  <FieldRow label="Condition (Raw)" value={localItem.condition_raw} />
                  {isEditing ? (
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Condition Notes</p>
                      <textarea
                        className={`${inputCls} resize-none`}
                        rows={2}
                        value={editFields.condition_notes}
                        onChange={(e) => setEditFields((f) => ({ ...f, condition_notes: e.target.value }))}
                      />
                    </div>
                  ) : (
                    <FieldRow label="Condition Notes" value={localItem.condition_notes} />
                  )}
                  <FieldRow
                    label="Complete?"
                    value={localItem.is_complete === null ? null : localItem.is_complete ? 'Yes' : 'No'}
                  />
                  {isEditing ? (
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">List Price</p>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className={inputCls}
                        value={editFields.list_price_final}
                        onChange={(e) => setEditFields((f) => ({ ...f, list_price_final: e.target.value }))}
                      />
                    </div>
                  ) : (
                    <FieldRow label="List Price" value={formatPrice(localItem.list_price_final)} />
                  )}
                  {isEditing ? (
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">eBay Price</p>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className={inputCls}
                        value={editFields.ebay_price}
                        onChange={(e) => setEditFields((f) => ({ ...f, ebay_price: e.target.value }))}
                      />
                    </div>
                  ) : (
                    <FieldRow label="eBay Price" value={formatPrice(localItem.ebay_price)} />
                  )}
                  <FieldRow label="FB Price" value={formatPrice(localItem.fb_price)} />
                  <FieldRow label="Sale Price" value={formatPrice(localItem.sale_price)} />
                  <FieldRow label="Price Confidence" value={localItem.price_confidence} />
                  <FieldRow label="ID Confidence" value={localItem.identification_confidence} />
                  <FieldRow label="eBay Comps" value={localItem.ebay_comps_count} />
                  <FieldRow label="eBay Comp Range" value={localItem.ebay_comp_price_range} />
                  <FieldRow label="Listing Mode" value={localItem.listing_mode} />
                  <FieldRow label="eBay Listing ID" value={localItem.ebay_listing_id} />
                  <FieldRow label="Buyer Platform" value={localItem.buyer_platform} />
                  <FieldRow label="Buyer Handle" value={localItem.buyer_handle} />
                  <FieldRow label="Tracking #" value={localItem.tracking_number} />
                  <FieldRow label="Batch ID" value={localItem.batch_id} />
                  {isEditing ? (
                    <div className="col-span-2 min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Description (Short)</p>
                      <textarea
                        className={`${inputCls} resize-none`}
                        rows={3}
                        maxLength={150}
                        value={editFields.description_short}
                        onChange={(e) => setEditFields((f) => ({ ...f, description_short: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground text-right mt-0.5">
                        {editFields.description_short.length}/150
                      </p>
                    </div>
                  ) : (
                    <FieldRow label="Description (Short)" value={localItem.description_short} />
                  )}
                </div>
                {isEditing ? (
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Description (Long)</p>
                    <textarea
                      className={`${inputCls} resize-y`}
                      rows={8}
                      value={editFields.description_long}
                      onChange={(e) => setEditFields((f) => ({ ...f, description_long: e.target.value }))}
                    />
                  </div>
                ) : (
                  localItem.description_long && (
                    <div className="mt-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                        Description (Long)
                      </p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {localItem.description_long}
                      </p>
                    </div>
                  )
                )}
              </div>

              {/* Actions */}
              <div className="px-6 py-4 border-t border-border flex-shrink-0">
                {localItem.status === 'ReadyToList' && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button onClick={() => void publishToEbay()} disabled={publishing}>
                        {publishing ? 'Publishing…' : 'Publish to eBay'}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={publishing}
                        onClick={() =>
                          void updateItemStatus(localItem.item_id, 'Archived').then(onClose)
                        }
                      >
                        Archive
                      </Button>
                    </div>
                    {publishError && (
                      <p className="text-xs text-destructive">{publishError}</p>
                    )}
                  </div>
                )}
                {localItem.status === 'Listed' && localItem.ebay_listing_id && (
                  <a
                    href={`https://www.ebay.com/itm/${localItem.ebay_listing_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline underline-offset-2"
                  >
                    View on eBay: {localItem.ebay_listing_id}
                  </a>
                )}
                {localItem.status === 'Sold' && (
                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">Sale price:</span>{' '}
                      {formatPrice(localItem.sale_price)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Buyer:</span>{' '}
                      {localItem.buyer_handle ?? '—'}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Tracking:</span>{' '}
                      {localItem.tracking_number ?? '—'}
                    </p>
                  </div>
                )}
                {localItem.status === 'Archived' && (
                  <div className="space-y-2">
                    <Button onClick={() => void unarchiveItem()} disabled={unarchiving}>
                      {unarchiving ? 'Unarchiving…' : 'Unarchive Item'}
                    </Button>
                    {unarchiveError && (
                      <p className="text-xs text-destructive">{unarchiveError}</p>
                    )}
                  </div>
                )}
                {!['ReadyToList', 'Listed', 'Sold', 'Archived'].includes(localItem.status) && (
                  <p className="text-xs text-muted-foreground">
                    No actions available for status: {localItem.status}
                  </p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Lightbox — Portal into document.body, outside Radix Dialog's DOM tree */}
      {lightboxIndex !== null && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setLightboxIndex(null)}
        >
          <button
            style={{
              position: 'absolute', top: 16, right: 16,
              color: 'white', fontSize: 24, background: 'none',
              border: 'none', cursor: 'pointer', zIndex: 10000,
            }}
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(null) }}
          >✕</button>
          {photos.length > 1 && (
            <>
              <button
                style={{
                  position: 'absolute', left: 16, color: 'white',
                  fontSize: 32, background: 'none', border: 'none',
                  cursor: 'pointer', zIndex: 10000,
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex(i => i !== null ? (i - 1 + photos.length) % photos.length : null)
                }}
              >‹</button>
              <button
                style={{
                  position: 'absolute', right: 56, color: 'white',
                  fontSize: 32, background: 'none', border: 'none',
                  cursor: 'pointer', zIndex: 10000,
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxIndex(i => i !== null ? (i + 1) % photos.length : null)
                }}
              >›</button>
              <div style={{ position: 'absolute', bottom: 16, color: 'white', fontSize: 14 }}>
                {lightboxIndex + 1} / {photos.length}
              </div>
            </>
          )}
          <img
            src={photos[lightboxIndex]}
            style={{ maxHeight: '90vh', maxWidth: '90vw', objectFit: 'contain' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </>
  )
}
