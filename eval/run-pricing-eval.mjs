#!/usr/bin/env node
/**
 * Runs the real workers/pricing priceItem() function against manually-verified
 * eBay sold-comp data and scores pricing accuracy.
 *
 * THIS IS THE SCRIPT THAT MATTERS MOST RIGHT NOW. priceItem() currently sources
 * comps by having Claude's web_search tool self-report a median price and comp
 * count as JSON — there is no independent verification of that number against
 * real eBay data. This script IS that independent verification. Run it BEFORE
 * touching anything, so you have a real "before" baseline. The known next step
 * after this is swapping fetchEbayComps() in workers/pricing/src/pricing.ts to
 * call an Apify sold-listings actor instead — re-run this exact script after
 * that change and diff the two result files to measure the improvement.
 *
 * Usage: npx tsx eval/run-pricing-eval.mjs [path-to-ground-truth.json]
 * Reads ANTHROPIC_API_KEY from workers/pricing/.dev.vars
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { priceItem } from '../workers/pricing/src/pricing.ts'
import { scorePricingItem, summarize } from './scoring.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function parseVars(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const vars = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const idx = trimmed.indexOf('=')
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    vars[key] = val
  }
  return vars
}

const devVarsPath = path.join(ROOT, 'workers', 'pricing', '.dev.vars')
if (!fs.existsSync(devVarsPath)) {
  console.error(`Missing ${devVarsPath}. Create it with ANTHROPIC_API_KEY=sk-ant-...`)
  process.exit(1)
}
const vars = parseVars(devVarsPath)
if (!vars.ANTHROPIC_API_KEY) {
  console.error(`ANTHROPIC_API_KEY not found in ${devVarsPath}`)
  process.exit(1)
}
if (!vars.APIFY_API_TOKEN) {
  console.warn(`\n⚠ APIFY_API_TOKEN not set in ${devVarsPath} — fetchEbayComps() will return null for all items.\n`)
}

const gtPath = process.argv[2] ?? path.join(ROOT, 'eval', 'ground_truth.json')
if (!fs.existsSync(gtPath)) {
  console.error(`Ground truth file not found: ${gtPath}`)
  console.error(`Copy eval/ground_truth.template.json to eval/ground_truth.json and fill it in with real items first.`)
  process.exit(1)
}
const groundTruth = JSON.parse(fs.readFileSync(gtPath, 'utf8'))

const uncheckedItems = groundTruth.filter((i) => !i.expected_comps?.checked_manually_on_ebay)
if (uncheckedItems.length > 0) {
  console.warn(
    `\n⚠ ${uncheckedItems.length} item(s) have checked_manually_on_ebay: false — their scores will be marked as total misses regardless of what priceItem() returns, because there's no real ground truth to compare against. Go manually search eBay sold/completed listings for these first if you want a real score on them.\n`
  )
}

const env = {
  ANTHROPIC_API_KEY: vars.ANTHROPIC_API_KEY,
  APIFY_API_TOKEN: vars.APIFY_API_TOKEN ?? '',
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  WORKER_SECRET: '',
}

console.log(`Running pricing eval on ${groundTruth.length} items (this is slow — priceItem() has a built-in 15s sleep per item plus web_search turns)...\n`)

const rows = []

for (const gtItem of groundTruth) {
  process.stdout.write(`  ${gtItem.id}... `)
  try {
    const pendingItem = {
      item_id: gtItem.id,
      item_name: gtItem.item_name_seed,
      brand: gtItem.expected.brand,
      model_number: gtItem.expected.model_number,
      category: gtItem.expected.category,
      subcategory: gtItem.expected.subcategory,
      condition_raw: gtItem.expected.condition_raw,
      condition_ebay: gtItem.expected.condition_raw,
      condition_notes: null,
      is_complete: gtItem.expected.is_complete,
      keywords: [],
      identification_confidence: 'High',
      batch_id: null,
      photos: gtItem.photo_urls,
      status: 'PendingReview',
    }
    const priced = await priceItem(pendingItem, env)
    const score = scorePricingItem(priced, gtItem.expected_comps)
    rows.push({ id: gtItem.id, priced, expected_comps: gtItem.expected_comps, ...score })
    if (score.total_miss) {
      console.log('✗ no usable price returned')
    } else {
      console.log(`predicted $${priced.ebay_comp_price_median} vs actual $${gtItem.expected_comps.median_price} (${score.price_error_pct}% error)`)
    }
  } catch (e) {
    console.log(`✗ ERROR: ${e.message}`)
    rows.push({ id: gtItem.id, error: e.message, total_miss: true })
  }
}

const totalMisses = rows.filter((r) => r.total_miss).length
const meanErrorPct = summarize(rows.filter((r) => !r.total_miss), 'price_error_pct')
const within15Count = rows.filter((r) => r.within_15_pct).length

console.log('\n── Pricing Eval Summary ─────────────────────────────')
console.log(`Items evaluated:              ${rows.length}`)
console.log(`Total misses (no price found): ${totalMisses}`)
console.log(`Mean absolute price error:     ${meanErrorPct.mean !== null ? meanErrorPct.mean + '%' : 'n/a'} (n=${meanErrorPct.count})`)
console.log(`Within 15% of actual:          ${within15Count}/${rows.length}`)
console.log('──────────────────────────────────────────────────────')

const resultsDir = path.join(ROOT, 'eval', 'results')
fs.mkdirSync(resultsDir, { recursive: true })
const outPath = path.join(resultsDir, `pricing-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(
  outPath,
  JSON.stringify({ meanErrorPct: meanErrorPct.mean, within15Count, totalMisses, rows }, null, 2)
)
console.log(`\nFull results written to ${path.relative(ROOT, outPath)}\n`)

console.log('NOTE: this run used the Apify automation-lab/ebay-sold-scraper actor as the comps source.')
console.log('To get a meaningful score, fill in expected_comps[].median_price and set checked_manually_on_ebay: true in eval/ground_truth.json.\n')
