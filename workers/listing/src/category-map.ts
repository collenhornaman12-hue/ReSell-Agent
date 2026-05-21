const MAP: Record<string, string> = {
  'Toys & Hobbies': '220',
  'Sports Memorabilia': '64482',
  'Collectibles': '1',
  'Entertainment Memorabilia': '45100',
  'Books & Media': '267',
}

export function getCategoryId(category: string | null): string {
  return (category && MAP[category]) ?? '1'
}
