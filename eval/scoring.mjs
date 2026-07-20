// Shared scoring helpers for the vision and pricing eval scripts.
// Deliberately dependency-free — no fuzzy-match libraries — so the scoring logic
// is fully readable and auditable. Tune the normalize/fuzzy functions here if
// you find them too strict or too lenient once you see real results.

export function normalize(str) {
  if (str === null || str === undefined) return null
  return String(str).toLowerCase().trim().replace(/[^a-z0-9]/g, '')
}

// Loose match for free-text fields (brand, model_number): treats null==null as a
// match, and otherwise checks case/punctuation-insensitive substring in either
// direction. This avoids penalizing "LEGO" vs "Lego Group" as a miss.
export function looseMatch(actual, expected) {
  const a = normalize(actual)
  const e = normalize(expected)
  if (a === null && e === null) return true
  if (a === null || e === null) return false
  if (a === e) return true
  return a.includes(e) || e.includes(a)
}

export function exactMatch(actual, expected) {
  return actual === expected
}

export function scoreVisionItem(extracted, expected) {
  const fields = {
    category: exactMatch(extracted.category, expected.category),
    condition_raw: exactMatch(extracted.condition_raw, expected.condition_raw),
    is_complete: exactMatch(extracted.is_complete, expected.is_complete),
    brand: looseMatch(extracted.brand, expected.brand),
    model_number: looseMatch(extracted.model_number, expected.model_number),
  }
  const correctCount = Object.values(fields).filter(Boolean).length
  const totalFields = Object.keys(fields).length
  return {
    fields,
    field_accuracy: correctCount / totalFields,
    all_correct: correctCount === totalFields,
  }
}

export function scorePricingItem(priced, expectedComps) {
  const predictedMedian = priced.ebay_comp_price_median
  const actualMedian = expectedComps.median_price

  if (predictedMedian === null || predictedMedian === undefined || actualMedian === 0) {
    return {
      price_error_pct: null,
      within_15_pct: false,
      comps_count_predicted: priced.ebay_comps_count,
      comps_count_actual: expectedComps.comps_count,
      total_miss: true, // pricing worker found no usable comps at all
    }
  }

  const errorPct = (Math.abs(predictedMedian - actualMedian) / actualMedian) * 100

  return {
    price_error_pct: Math.round(errorPct * 10) / 10,
    within_15_pct: errorPct <= 15,
    comps_count_predicted: priced.ebay_comps_count,
    comps_count_actual: expectedComps.comps_count,
    total_miss: false,
  }
}

export function summarize(rows, key) {
  const values = rows.map((r) => r[key]).filter((v) => typeof v === 'number')
  if (values.length === 0) return { mean: null, count: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return { mean: Math.round(mean * 1000) / 1000, count: values.length }
}
