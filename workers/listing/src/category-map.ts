const MAP: Record<string, string> = {
  "Toys & Hobbies": "261068",
  "Sports Memorabilia": "261068",
  "Collectibles": "261068",
  "Entertainment Memorabilia": "45100",
  "Books & Media": "267",
}

export function getCategoryId(category: string | null): string {
  return (category && MAP[category]) ?? "261068"
}
