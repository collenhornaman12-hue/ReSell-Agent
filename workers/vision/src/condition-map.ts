type CategoryGroup = 'CT' | 'SM' | 'BM'

export function getCategoryGroup(category: string): CategoryGroup {
  if (category === 'Sports Memorabilia') return 'SM'
  if (category === 'Books & Media') return 'BM'
  return 'CT'
}

type ConditionValue = string | ((isComplete: boolean) => string)

const EBAY_CONDITIONS: Record<string, Record<CategoryGroup, ConditionValue>> = {
  Mint: {
    CT: (isComplete: boolean) => (isComplete ? 'New' : 'Like New'),
    SM: (_isComplete: boolean) => 'Mint',
    BM: (isComplete: boolean) => (isComplete ? 'Brand New' : 'Like New'),
  },
  VeryGood: { CT: 'Very Good',                SM: 'Near Mint', BM: 'Very Good'  },
  Good:     { CT: 'Good',                     SM: 'Excellent', BM: 'Good'       },
  Fair:     { CT: 'Acceptable',               SM: 'Very Good', BM: 'Acceptable' },
  Poor:     { CT: 'For parts or not working', SM: 'Good',      BM: 'Poor'       },
}

export function mapConditionEbay(
  conditionRaw: string,
  category: string,
  isComplete: boolean
): string {
  const group = getCategoryGroup(category)
  const row = EBAY_CONDITIONS[conditionRaw] ?? EBAY_CONDITIONS['Good']
  const value = row[group]
  return typeof value === 'function' ? value(isComplete) : value
}
