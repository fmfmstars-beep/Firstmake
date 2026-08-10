import Link from "next/link"
import { categories } from "@/lib/categories"

export function CategoryFilter({ active }: { active?: string }) {
  const all = { value: "", label: "すべて", emoji: "🗂️" }
  const items = [all, ...categories]
  return (
    <nav aria-label="カテゴリ" className="flex flex-wrap gap-2">
      {items.map((c) => {
        const isActive = (active ?? "") === c.value
        const href = c.value ? `/?cat=${c.value}` : "/"
        return (
          <Link
            key={c.value || "all"}
            href={href}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            <span className="mr-1">{c.emoji}</span>
            {c.label}
          </Link>
        )
      })}
    </nav>
  )
}
