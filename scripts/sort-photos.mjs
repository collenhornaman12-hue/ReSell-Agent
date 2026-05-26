#!/usr/bin/env node
/**
 * Usage: node scripts/sort-photos.mjs "<folder path>"
 * Example: node scripts/sort-photos.mjs "C:\Users\colle\Dropbox\Bulk Photos_Fred"
 *
 * Groups unsorted item photos by physical item using Claude Vision,
 * previews the groupings, then moves photos into named subfolders on confirm.
 */

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'

// ─── Configuration ──────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const BATCH_SIZE = 10
const MAX_IMAGE_SIZE_MB = 5
const MODEL = 'claude-sonnet-4-6'
const COST_PER_CALL = 0.015

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const MEDIA_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

// ─── Read ANTHROPIC_API_KEY from env or .env file ───────────────────────────

function loadApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  const envPath = path.join(ROOT, '.env')
  if (!fs.existsSync(envPath)) return null
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const idx = trimmed.indexOf('=')
    const key = trimmed.slice(0, idx).trim()
    if (key !== 'ANTHROPIC_API_KEY') continue
    return trimmed
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return null
}

const ANTHROPIC_API_KEY = loadApiKey()

// ─── Path normalization (Windows ↔ WSL) ─────────────────────────────────────

function normalizePath(inputPath) {
  // Running in WSL/Linux but given a Windows drive path → convert to /mnt/<drive>/...
  if (process.platform !== 'win32' && /^[A-Za-z]:[\\\/]/.test(inputPath)) {
    const drive = inputPath[0].toLowerCase()
    const rest = inputPath.slice(2).replace(/\\/g, '/')
    return `/mnt/${drive}${rest}`
  }
  // On Windows, normalize backslashes
  return inputPath.replace(/\\/g, path.sep)
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

function buildImageBlock(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const data = fs.readFileSync(filePath).toString('base64')
  return { type: 'image', source: { type: 'base64', media_type: MEDIA_TYPES[ext], data } }
}

function extractJSON(text) {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

// ─── Anthropic API (raw fetch — no SDK needed) ───────────────────────────────

async function callClaude(userContent, systemPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${body}`)
  }
  const data = await res.json()
  return data.content[0].text
}

// ─── Step 1: Read and sort photos ────────────────────────────────────────────

function readPhotos(folderPath) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const ext = path.extname(entry.name).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue
    const fullPath = path.join(folderPath, entry.name)
    const stat = fs.statSync(fullPath)
    const sizeMB = stat.size / (1024 * 1024)
    if (sizeMB > MAX_IMAGE_SIZE_MB) {
      console.warn(`  ⚠ Skipping ${entry.name} (${sizeMB.toFixed(1)} MB > ${MAX_IMAGE_SIZE_MB} MB limit)`)
      continue
    }
    files.push({ name: entry.name, path: fullPath, ctime: stat.birthtime ?? stat.mtime })
  }
  files.sort((a, b) => a.ctime - b.ctime)
  return files
}

// ─── Step 2: Group photos by item ────────────────────────────────────────────

const GROUP_SYSTEM = `You are helping group product photos by item for a resale business.
Look at these photos and group them by which photos show the same physical item. Consider: same object, same background setup, same shooting angle pattern, consistent lighting.

Return ONLY a JSON array of groups. Each group is an array of filenames. Example:
[
  ["photo1.jpg", "photo2.jpg", "photo3.jpg"],
  ["photo4.jpg", "photo5.jpg"],
  ["photo6.jpg"]
]

Rules:
- Every input filename must appear in exactly one group
- Groups should have 1-6 photos
- When uncertain, keep photos in separate groups (safer to over-split than under-group)`

async function groupBatch(files) {
  const content = []
  for (const file of files) {
    content.push(buildImageBlock(file.path))
    content.push({ type: 'text', text: file.name })
  }
  content.push({ type: 'text', text: `Group these ${files.length} photos by item. Return JSON only.` })

  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await callClaude(content, GROUP_SYSTEM)
    const groups = extractJSON(text)
    if (groups && Array.isArray(groups)) return groups
    if (attempt === 1) console.warn('  ⚠ Invalid JSON from Claude, retrying batch…')
  }

  console.error('  ✗ Could not parse JSON after retry — each photo in this batch gets its own group')
  return files.map((f) => [f.name])
}

async function groupAllPhotos(files) {
  const allGroups = []
  const total = Math.ceil(files.length / BATCH_SIZE)
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    console.log(`  Batch ${batchNum}/${total}: grouping ${batch.length} photos…`)
    const groups = await groupBatch(batch)
    allGroups.push(...groups)
  }
  return allGroups
}

// ─── Step 3: Name each group ──────────────────────────────────────────────────

const NAME_SYSTEM = `You are naming folders for resale product photos.
Look at this product photo and respond with ONLY a short folder name: 3-5 words, title case, no special characters except spaces.
Examples: "Red Mushroom Alien Figure", "Instax Mini Camera", "Star Wars Action Figure MOC"
Respond with the folder name only — no explanation, no quotes.`

async function nameGroup(firstFilePath) {
  const content = [
    buildImageBlock(firstFilePath),
    { type: 'text', text: 'Name this item as a folder name. 3-5 words, title case, no special characters.' },
  ]
  const text = await callClaude(content, NAME_SYSTEM)
  return text
    .trim()
    .replace(/[<>:"/\\|?*\r\n]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 50)
    .trim()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const inputArg = process.argv[2]
  if (!inputArg) {
    console.error('Usage: node scripts/sort-photos.mjs "<folder path>"')
    process.exit(1)
  }
  if (!ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY not found in environment or .env file')
    process.exit(1)
  }

  const folderPath = normalizePath(inputArg)
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    console.error(`Error: folder not found: ${folderPath}`)
    process.exit(1)
  }

  // ── Step 1 ──────────────────────────────────────────────────────────────────
  console.log(`\nReading photos from: ${folderPath}`)
  const files = readPhotos(folderPath)
  if (files.length === 0) {
    console.log('No supported photos found (.jpg, .jpeg, .png, .webp)')
    process.exit(0)
  }
  console.log(`Found ${files.length} photos (sorted by creation time)\n`)

  // ── Step 2 ──────────────────────────────────────────────────────────────────
  console.log('Grouping photos by item…')
  const rawGroups = await groupAllPhotos(files)

  // Validate: ensure every filename appears exactly once
  const fileMap = new Map(files.map((f) => [f.name, f]))
  const seen = new Set()
  const validGroups = []

  for (const group of rawGroups) {
    const members = []
    for (const name of group) {
      if (fileMap.has(name) && !seen.has(name)) {
        seen.add(name)
        members.push(name)
      }
    }
    if (members.length > 0) validGroups.push(members)
  }
  // Orphaned files (Claude missed them) → solo groups
  for (const f of files) {
    if (!seen.has(f.name)) validGroups.push([f.name])
  }

  // ── Step 3 ──────────────────────────────────────────────────────────────────
  console.log(`\nNaming ${validGroups.length} groups…`)
  const namedGroups = []
  for (let i = 0; i < validGroups.length; i++) {
    const groupFiles = validGroups[i]
    const firstFile = fileMap.get(groupFiles[0])
    process.stdout.write(`  ${i + 1}/${validGroups.length} `)
    const name = await nameGroup(firstFile.path)
    console.log(`→ "${name}" (${groupFiles.length} photo${groupFiles.length !== 1 ? 's' : ''})`)
    namedGroups.push({ name, files: groupFiles })
  }

  // ── Step 4: Preview ──────────────────────────────────────────────────────────
  const divider = '─'.repeat(60)
  console.log('\n' + divider)
  console.log('PROPOSED GROUPINGS\n')
  let soloCount = 0
  for (let i = 0; i < namedGroups.length; i++) {
    const { name, files: gf } = namedGroups[i]
    if (gf.length === 1) soloCount++
    console.log(`Group ${i + 1}: "${name}" — ${gf.length} photo${gf.length !== 1 ? 's' : ''}`)
    console.log(`  ${gf.join(', ')}`)
  }
  console.log(divider)
  console.log(`Total: ${namedGroups.length} groups, ${files.length} photos, ${soloCount} solo items`)

  const groupingCalls = Math.ceil(files.length / BATCH_SIZE)
  const namingCalls = namedGroups.length
  const totalCalls = groupingCalls + namingCalls
  console.log(`Estimated cost: ${totalCalls} API calls × $${COST_PER_CALL} = $${(totalCalls * COST_PER_CALL).toFixed(2)}\n`)

  const answer = await ask('Create these folders and move photos? (yes/no): ')
  if (answer !== 'yes' && answer !== 'y') {
    console.log('\nAborted — no files moved.')
    process.exit(0)
  }

  // ── Step 5: Create folders and move files ────────────────────────────────────
  console.log()
  let moved = 0
  let errors = 0

  for (const { name, files: groupFiles } of namedGroups) {
    // Deduplicate folder names
    let folderName = name
    let counter = 2
    while (fs.existsSync(path.join(folderPath, folderName))) {
      folderName = `${name} ${counter++}`
    }
    const destFolder = path.join(folderPath, folderName)
    fs.mkdirSync(destFolder, { recursive: true })
    console.log(`✓ ${folderName}/`)

    for (const fileName of groupFiles) {
      const src = path.join(folderPath, fileName)
      const dest = path.join(destFolder, fileName)
      try {
        fs.renameSync(src, dest)
        moved++
      } catch (e) {
        console.error(`  ✗ Could not move ${fileName}: ${e.message}`)
        errors++
      }
    }
  }

  console.log(`\nDone — ${moved} photos moved, ${errors} error${errors !== 1 ? 's' : ''}`)
  console.log(`Total API calls: ${totalCalls} × $${COST_PER_CALL} = $${(totalCalls * COST_PER_CALL).toFixed(2)}`)
}

main().catch((err) => {
  console.error('\nFatal:', err.message)
  process.exit(1)
})
