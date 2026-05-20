import { type ReactNode, useState } from 'react'
import { X } from 'lucide-react'
import { Sheet, SheetContent, SheetClose } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Item, ItemStatus } from '@/hooks/useInventory'
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

export function ItemDrawer({ item, onClose, updateItemStatus }: ItemDrawerProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  return (
    <>
      <Sheet open={item !== null} onOpenChange={(open) => { if (!open) onClose() }}>
        <SheetContent>
          {item && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
                <h2 className="text-base font-semibold truncate pr-4">{item.item_name}</h2>
                <SheetClose asChild>
                  <Button variant="ghost" size="icon" className="flex-shrink-0">
                    <X className="h-4 w-4" />
                  </Button>
                </SheetClose>
              </div>

              {/* Photos */}
              {item.photos && item.photos.length > 0 && (
                <div className="flex gap-2 px-6 py-3 overflow-x-auto border-b border-border flex-shrink-0">
                  {item.photos.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt=""
                      className="h-20 w-20 flex-shrink-0 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setLightboxSrc(src)}
                    />
                  ))}
                </div>
              )}

              {/* Fields — scrollable */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <FieldRow label="Item ID" value={item.item_id} />
                  <FieldRow label="Status" value={item.status} />
                  <FieldRow label="Brand" value={item.brand} />
                  <FieldRow label="Model" value={item.model_number} />
                  <FieldRow label="Category" value={item.category} />
                  <FieldRow label="Subcategory" value={item.subcategory} />
                  <FieldRow label="Condition (eBay)" value={item.condition_ebay} />
                  <FieldRow label="Condition (Raw)" value={item.condition_raw} />
                  <FieldRow label="Condition Notes" value={item.condition_notes} />
                  <FieldRow
                    label="Complete?"
                    value={item.is_complete === null ? null : item.is_complete ? 'Yes' : 'No'}
                  />
                  <FieldRow label="List Price" value={formatPrice(item.list_price_final)} />
                  <FieldRow label="eBay Price" value={formatPrice(item.ebay_price)} />
                  <FieldRow label="FB Price" value={formatPrice(item.fb_price)} />
                  <FieldRow label="Sale Price" value={formatPrice(item.sale_price)} />
                  <FieldRow label="Price Confidence" value={item.price_confidence} />
                  <FieldRow label="ID Confidence" value={item.identification_confidence} />
                  <FieldRow label="eBay Comps" value={item.ebay_comps_count} />
                  <FieldRow label="eBay Comp Range" value={item.ebay_comp_price_range} />
                  <FieldRow label="Listing Mode" value={item.listing_mode} />
                  <FieldRow label="eBay Listing ID" value={item.ebay_listing_id} />
                  <FieldRow label="Buyer Platform" value={item.buyer_platform} />
                  <FieldRow label="Buyer Handle" value={item.buyer_handle} />
                  <FieldRow label="Tracking #" value={item.tracking_number} />
                  <FieldRow label="Batch ID" value={item.batch_id} />
                  <FieldRow label="Description (Short)" value={item.description_short} />
                </div>
                {item.description_long && (
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      Description (Long)
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {item.description_long}
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-6 py-4 border-t border-border flex-shrink-0">
                {item.status === 'ReadyToList' && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() =>
                        console.log('TODO: Prompt 7 — publish to eBay', item.item_id)
                      }
                    >
                      Publish to eBay
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        void updateItemStatus(item.item_id, 'Archived').then(onClose)
                      }
                    >
                      Archive
                    </Button>
                  </div>
                )}
                {item.status === 'Listed' && item.ebay_listing_id && (
                  <a
                    href={`https://www.ebay.com/itm/${item.ebay_listing_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline underline-offset-2"
                  >
                    View on eBay: {item.ebay_listing_id}
                  </a>
                )}
                {item.status === 'Sold' && (
                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">Sale price:</span>{' '}
                      {formatPrice(item.sale_price)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Buyer:</span>{' '}
                      {item.buyer_handle ?? '—'}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Tracking:</span>{' '}
                      {item.tracking_number ?? '—'}
                    </p>
                  </div>
                )}
                {!['ReadyToList', 'Listed', 'Sold'].includes(item.status) && (
                  <p className="text-xs text-muted-foreground">
                    No actions available for status: {item.status}
                  </p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 cursor-pointer"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt=""
            className="max-h-[90vh] max-w-[90vw] object-contain rounded"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-1 hover:bg-black/80 transition-colors"
            onClick={() => setLightboxSrc(null)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  )
}
