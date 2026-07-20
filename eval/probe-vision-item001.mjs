#!/usr/bin/env node
/**
 * One-off probe: call extractItem() against item-001's real photos to verify
 * the updated EXTRACTION_PROMPT hallucination guards. Not part of the eval
 * framework — delete after use.
 *
 * Usage: npx tsx eval/probe-vision-item001.mjs
 * Reads ANTHROPIC_API_KEY from workers/vision/.dev.vars
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { extractItem } from '../workers/vision/src/vision.ts'

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

const devVars = parseVars(path.join(ROOT, 'workers/vision/.dev.vars'))
if (!devVars.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY not found in workers/vision/.dev.vars')
  process.exit(1)
}

const env = {
  ANTHROPIC_API_KEY: devVars.ANTHROPIC_API_KEY,
  SUPABASE_URL: devVars.SUPABASE_URL ?? '',
  SUPABASE_SERVICE_ROLE_KEY: devVars.SUPABASE_SERVICE_ROLE_KEY ?? '',
  WORKER_SECRET: devVars.WORKER_SECRET ?? '',
}

const groundTruth = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'eval/ground_truth.json'), 'utf8')
)
const item001 = groundTruth.find(item => item.id === 'item-001')
if (!item001) {
  console.error('item-001 not found in ground_truth.json')
  process.exit(1)
}

console.log(`photo_urls (${item001.photo_urls.length}):`)
item001.photo_urls.forEach(u => console.log(' ', u))
console.log()
console.log('Calling extractItem()...')

const result = await extractItem(
  { item_name_seed: item001.item_name_seed, photo_urls: item001.photo_urls },
  env
)

console.log()
console.log('=== extractItem() result ===')
console.log(JSON.stringify(result, null, 2))
