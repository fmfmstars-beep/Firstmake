"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createPost } from "@/app/actions/board"
import { categories } from "@/lib/categories"

export function NewPostForm() {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState("love")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(formData: FormData) {
    setError(null)
    formData.set("category", category)
    startTransition(async () => {
      const res = await createPost(formData)
      if (res?.error) {
        setError(res.error)
        return
      }
      setOpen(false)
      if (res?.id) router.push(`/post/${res.id}`)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-3xl border-2 border-dashed border-primary/40 bg-card px-5 py-4 text-left transition hover:border-primary hover:bg-primary/5"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg text-primary-foreground transition group-hover:scale-110">
          ✎
        </span>
        <span className="text-muted-foreground">
          モヤモヤ、ここにそっと置いていきませんか？
        </span>
      </button>
    )
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">お悩みを相談する</h2>
        <button
          onClick={() => setOpen(false)}
          className="rounded-full px-3 py-1 text-sm text-muted-foreground hover:bg-muted"
        >
          閉じる
        </button>
      </div>

      <form action={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-2 block text-sm font-semibold">カテゴリ</label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                type="button"
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  category === c.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                <span className="mr-1">{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="nickname" className="mb-2 block text-sm font-semibold">
            ニックネーム（任意）
          </label>
          <input
            id="nickname"
            name="nickname"
            maxLength={30}
            placeholder="とおりがかりさん"
            className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div>
          <label htmlFor="title" className="mb-2 block text-sm font-semibold">
            タイトル
          </label>
          <input
            id="title"
            name="title"
            maxLength={100}
            placeholder="ひとことで言うと…"
            className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div>
          <label htmlFor="body" className="mb-2 block text-sm font-semibold">
            相談内容
          </label>
          <textarea
            id="body"
            name="body"
            rows={6}
            maxLength={4000}
            placeholder="どんなことでも大丈夫。今の気持ちを書いてみてください。"
            className="w-full resize-y rounded-2xl border border-input bg-background px-4 py-3 leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {error && (
          <p className="rounded-xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? "送信中…" : "相談を投稿する"}
        </button>
      </form>
    </div>
  )
}
