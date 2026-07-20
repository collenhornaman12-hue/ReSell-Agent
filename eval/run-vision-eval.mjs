#!/usr/bin/env node
/**
 * Runs the real workers/vision extractItem() function against a labeled
 * ground-truth set and scores identification accuracy.
 *
 * Usage: npx tsx eval/run-vision-eval.mjs [path-to-ground-truth.json]
 * Default ground truth path: eval/ground_truth.json (you create this from
 * eval/ground_truth.template.json — the template is never read directly).
 *
 * Reads ANTHROPIC_API_KEY from workers/vision/.dev.vars (same convention as
 * scripts/get-ebay-token.mjs).
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { extractItem } from '../workers/vision/src/vision.ts'
import { scoreVisionItem, summarize } from './scoring.mjs'

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

const devVarsPath = path.join(ROOT, 'workers', 'vision', '.dev.vars')
if (!fs.existsSync(devVarsPath)) {
  console.error(`Missing ${devVarsPath}. Create it with ANTHROPIC_API_KEY=sk-ant-...`)
  process.exit(1)
}
const vars = parseVars(devVarsPath)
if (!vars.ANTHROPIC_API_KEY) {
  console.error(`ANTHROPIC_API_KEY not found in ${devVarsPath}`)
  process.exit(1)
}

const gtPath = process.argv[2] ?? path.join(ROOT, 'eval', 'ground_truth.json')
if (!fs.existsSync(gtPath)) {
  console.error(`Ground truth file not found: ${gtPath}`)
  console.error(`Copy eval/ground_truth.template.json to eval/ground_truth.json and fill it in with real items first.`)
  process.exit(1)
}
const groundTruth = JSON.parse(fs.readFileSync(gtPath, 'utf8'))

const env = {
  ANTHROPIC_API_KEY: vars.ANTHROPIC_API_KEY,
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  WORKER_SECRET: '',
}

console.log(`\nRunning vision eval on ${groundTruth.length} items...\n`)

const rows = []

for (const gtItem of groundTruth) {
  process.stdout.write(`  ${gtItem.id}... `)
  try {
    const extracted = await extractItem(
      { item_name_seed: gtItem.item_name_seed, photo_urls: gtItem.photo_urls },
      env
    )
    const score = scoreVisionItem(extracted, gtItem.expected)
    rows.push({
      id: gtItem.id,
      extracted,
      expected: gtItem.expected,
      ...score,
      field_accuracy: score.field_accuracy,
    })
    console.log(score.all_correct ? '✓ all fields correct' : `△ ${Math.round(score.field_accuracy * 100)}% fields correct`)
  } catch (e) {
    console.log(`✗ ERROR: ${e.message}`)
    rows.push({ id: gtItem.id, error: e.message, field_accuracy: 0, all_correct: false })
  }
}

const strictAccuracy = rows.filter((r) => r.all_correct).length / rows.length
const lenientAccuracy = summarize(rows, 'field_accuracy').mean

console.log('\n── Vision Eval Summary ──────────────────────────────')
console.log(`Items evaluated:         ${rows.length}`)
console.log(`Strict accuracy (ALL fields correct): ${(strictAccuracy * 100).toFixed(1)}%`)
console.log(`Lenient accuracy (avg field match):    ${(lenientAccuracy * 100).toFixed(1)}%`)
console.log('──────────────────────────────────────────────────────')

const perFieldMisses = {}
for (const row of rows) {
  if (!row.fields) continue
  for (const [field, correct] of Object.entries(row.fields)) {
    if (!correct) perFieldMisses[field] = (perFieldMisses[field] ?? 0) + 1
  }
}
if (Object.keys(perFieldMisses).length > 0) {
  console.log('\nMisses by field (where the 95% target is most likely being missed):')
  for (const [field, count] of Object.entries(perFieldMisses).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${field}: ${count} miss(es)`)
  }
}

const resultsDir = path.join(ROOT, 'eval', 'results')
fs.mkdirSync(resultsDir, { recursive: true })
const outPath = path.join(resultsDir, `vision-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(outPath, JSON.stringify({ strictAccuracy, lenientAccuracy, rows }, null, 2))
console.log(`\nFull results written to ${path.relative(ROOT, outPath)}\n`)

if (strictAccuracy < 0.95) {
  console.log('⚠ Below the 95% target. Check per-field misses above before touching the pricing worker.\n')
}
