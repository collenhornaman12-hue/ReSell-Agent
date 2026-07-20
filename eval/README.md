# Eval Harness

Scores the real `workers/vision` and `workers/pricing` code against a hand-labeled
ground-truth set of real items. No mocking — this calls the actual Anthropic API
with the actual extraction/pricing logic, so the scores reflect exactly what the
app will do in production.

## Why this exists

You can't know if you're at 95%+ accuracy without a labeled answer key. This
harness is that answer key, plus the scripts to grade against it.

## One-time setup

```bash
npm install -D tsx          # from repo root — lets Node run the .ts worker files directly
```

Make sure `ANTHROPIC_API_KEY` is set in both:
- `workers/vision/.dev.vars`
- `workers/pricing/.dev.vars`

(These already exist per the project's env-var convention — see root `CLAUDE.md`.)

## Step 1 — Build your ground truth set (manual, do this first)

1. Pick **15–20 real items** you'd actually list — mix of easy IDs (clear branding)
   and hard ones (worn tags, obscure marks). This mix matters: an eval set of only
   easy items will report a misleadingly high accuracy score.
2. Photograph each one the same way the app would receive it, and get each photo
   set to a public URL (upload through the app's existing `BatchUpload`/`MobileUpload`
   flow to Cloudinary — using the real upload path means your eval matches production
   conditions, not a different image pipeline).
3. Copy `eval/ground_truth.template.json` to `eval/ground_truth.json`.
4. For each item, fill in `expected` — this is easy, you own the item, you already
   know the true brand/category/condition. `category` and `condition_raw` **must**
   match the exact enum values or the schema's CHECK constraint would reject them
   in production too (see `VALID_CATEGORIES`/`VALID_CONDITIONS` in
   `workers/vision/src/vision.ts` for the authoritative list).
5. For `expected_comps`, manually go search eBay: filter to **Sold** + **Completed
   listings**, last 90 days, and record the actual median sold price and comp count
   yourself. Set `checked_manually_on_ebay: true` once you've done this — items left
   `false` get scored as automatic misses in the pricing eval since there's nothing
   real to check `priceItem()`'s output against.

This step is the actual work. There's no way to automate hand-labeling your own
inventory — but it only needs to happen once, and you can keep adding items to
`ground_truth.json` over time as a growing regression set.

## Step 2 — Run the vision eval

```bash
npx tsx eval/run-vision-eval.mjs
```

Scores `extractItem()` against your `expected` fields. Reports:
- **Strict accuracy** — % of items where every field matched
- **Lenient accuracy** — average per-field match rate
- **Per-field miss breakdown** — tells you exactly which field is dragging the
  score down (e.g. if `condition_raw` is the repeat offender, that's a prompt-tuning
  problem in `vision.ts`; if `brand` is, that's a harder identification problem)

## Step 3 — Run the pricing eval

```bash
npx tsx eval/run-pricing-eval.mjs
```

**This is the one that matters most right now.** `priceItem()` currently sources
comps by having Claude's own `web_search` tool self-report a `median_price` and
`comps_count` as JSON, with no independent check against real eBay data. This
script *is* that independent check — it's slow (each item has a built-in 15s sleep
plus web search turns) but it will tell you, for the first time, how far off the
current self-reported pricing actually is from real sold prices.

Run this and save the result before changing anything.

## Step 4 — the pending fix (don't forget this)

Once you have a pricing baseline from Step 3, the known next step is: swap
`fetchEbayComps()` in `workers/pricing/src/pricing.ts` from the current
`web_search`-self-report approach to a real Apify eBay sold-listings actor call.
That's a scoped, surgical change — everything else in `pricing.ts` (condition
multipliers, `.99` rounding, the 40% override rule, bundle logic) stays as-is.

After making that swap, re-run `npx tsx eval/run-pricing-eval.mjs` against the
**same** `ground_truth.json` and diff the two result files in `eval/results/` to
measure the actual accuracy improvement — not a guess, a number.

## Results

Every run writes a timestamped JSON file to `eval/results/` with full per-item
detail (not just the console summary) so you can track accuracy over time as you
tune the prompts or swap the comps source.
