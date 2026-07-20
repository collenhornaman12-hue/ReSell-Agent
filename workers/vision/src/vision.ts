import Anthropic from '@anthropic-ai/sdk'
import { mapConditionEbay } from './condition-map'
import type { Env, TriggerItem, VisionExtracted } from './types'

const MODEL = 'claude-sonnet-4-6'
const MAX_IMAGES = 20

const VALID_CATEGORIES = [
  'Toys & Hobbies', 'Sports Memorabilia', 'Collectibles',
  'Entertainment Memorabilia', 'Books & Media', 'Other',
] as const

const VALID_CONDITIONS = ['Mint', 'VeryGood', 'Good', 'Fair', 'Poor'] as const
const VALID_CONFIDENCE = ['High', 'Medium', 'Low'] as const

const EXTRACTION_PROMPT = `You are an expert resale inventory analyst. Examine the provided product photos and return ONLY a JSON object with these exact keys — no markdown fences, no explanation, just the JSON:

{
  "item_name": "concise product name including brand and model if visible",
  "brand": "brand name or null",
  "model_number": "model or part number or null — only report if every character is clearly legible in the image; if any character is blurry, obscured, or inferred rather than read, use null",
  "category": "exactly one of: Toys & Hobbies, Sports Memorabilia, Collectibles, Entertainment Memorabilia, Books & Media, Other",
  "subcategory": "specific subcategory or null",
  "condition_raw": "exactly one of: Mint, VeryGood, Good, Fair, Poor",
  "condition_notes": "REQUIRED specific visual evidence when condition_raw is Mint or VeryGood — state exactly what you see that supports it (e.g. 'factory shrink wrap intact', 'no visible wear on any surface'). Use null only for Good/Fair/Poor with no notable defects.",
  "is_complete": true or false (true if item appears complete with all parts and accessories),
  "keywords": ["3 to 8 search keywords as an array"],
  "identification_confidence": "exactly one of: High, Medium, Low"
}

Condition definitions — apply strictly, do not default upward:
- Mint: factory sealed / never removed from packaging, OR opened but contents show zero visible wear, zero use, and remain in original internal packaging (e.g. still in original plastic wrap inside a tin/box). If you cannot point to specific evidence of one of these two cases, do NOT use Mint — use VeryGood instead.
- VeryGood: opened/used but only minor or no visible wear; no notable damage.
- Good: normal handling wear — minor scuffs, box wear, light scratches, small creases or tears on packaging corners/edges; fully functional and complete. A crease or tear visible on the packaging means it is NOT VeryGood — use Good.
- Fair: noticeable wear or moderate damage, still usable and complete.
- Poor: significant damage or missing parts.

If uncertain whether an item is Mint vs VeryGood and you cannot point to specific sealed-packaging or zero-wear evidence, use VeryGood. For all other adjacent tier decisions, describe what you see in condition_notes and rate what the evidence actually supports — do not default downward without a reason.

item_name and model_number guards — omit rather than guess: item_name must not include alphanumeric codes, pack shorthand, or series codes (any token that mixes letters and digits in a product-code pattern, e.g. "2PK20", "SP-47B", "SKU-XJ3") unless that exact string is clearly legible printed on the item or its packaging. Descriptive words — brand names, character names, "2-Pack", "Gift Set", "Anniversary Edition", "Series 2" — are always fine and encouraged. When a code token is uncertain, omit it entirely; a shorter accurate name is better than a longer name containing an invented token.

confidence guide: High = clearly identifiable item; Medium = partially visible or worn; Low = uncertain identity`

function parseJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as Record<string, unknown>
  } catch {
    return null
  }
}

function validateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function fallbackExtraction(itemNameSeed: string): VisionExtracted {
  return {
    item_name: itemNameSeed,
    brand: null,
    model_number: null,
    category: 'Other',
    subcategory: null,
    condition_raw: 'Good',
    condition_ebay: 'Good',
    condition_notes: 'Vision unable to identify',
    is_complete: true,
    keywords: [],
    identification_confidence: 'Low',
  }
}

export async function extractItem(
  item: TriggerItem,
  env: Env
): Promise<VisionExtracted> {
  if (item.photo_urls.length === 0) {
    return fallbackExtraction(item.item_name_seed)
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const imageBlocks = item.photo_urls.slice(0, MAX_IMAGES).map((url) => ({
    type: 'image' as const,
    source: { type: 'url' as const, url } as { type: 'url'; url: string },
  }))

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const rawText = textBlock && textBlock.type === 'text' ? textBlock.text : ''
    const parsed = parseJson(rawText)

    if (!parsed) return fallbackExtraction(item.item_name_seed)

    const category = validateEnum(parsed.category, VALID_CATEGORIES, 'Other')
    const condition_raw = validateEnum(parsed.condition_raw, VALID_CONDITIONS, 'Good')
    const identification_confidence = validateEnum(
      parsed.identification_confidence,
      VALID_CONFIDENCE,
      'Low'
    )
    const is_complete = typeof parsed.is_complete === 'boolean' ? parsed.is_complete : true
    const condition_ebay = mapConditionEbay(condition_raw, category, is_complete)

    return {
      item_name:
        typeof parsed.item_name === 'string' && parsed.item_name
          ? parsed.item_name
          : item.item_name_seed,
      brand: typeof parsed.brand === 'string' ? parsed.brand : null,
      model_number: typeof parsed.model_number === 'string' ? parsed.model_number : null,
      category,
      subcategory: typeof parsed.subcategory === 'string' ? parsed.subcategory : null,
      condition_raw,
      condition_ebay,
      condition_notes:
        typeof parsed.condition_notes === 'string' ? parsed.condition_notes : null,
      is_complete,
      keywords: Array.isArray(parsed.keywords)
        ? (parsed.keywords as unknown[]).filter((k): k is string => typeof k === 'string')
        : [],
      identification_confidence,
    }
  } catch {
    return fallbackExtraction(item.item_name_seed)
  }
}
