export type Category = {
  value: string
  label: string
  emoji: string
}

export const categories: Category[] = [
  { value: "love", label: "恋愛・人間関係", emoji: "💕" },
  { value: "work", label: "仕事・学校", emoji: "💼" },
  { value: "family", label: "家族・くらし", emoji: "🏠" },
  { value: "health", label: "こころ・からだ", emoji: "🌱" },
  { value: "money", label: "お金のこと", emoji: "🪙" },
  { value: "other", label: "その他・雑談", emoji: "🌈" },
]

export function getCategory(value: string): Category {
  return categories.find((c) => c.value === value) ?? categories[categories.length - 1]
}
