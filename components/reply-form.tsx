"use client"

import { useRef, useState, useTransition } from "react"
import { createReply } from "@/app/actions/board"

export function ReplyForm({ postId }: { postId: number }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    formData.set("postId", String(postId))
    startTransition(async () => {
      const res = await createReply(formData)
      if (res?.error) {
        setError(res.error)
        return
      }
      formRef.current?.reset()
    })
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="rounded-3xl border border-border bg-card p-5 shadow-sm"
    >
      <h2 className="mb-3 font-bold">あたたかい言葉を届ける</h2>
      <div className="mb-3">
        <input
          name="nickname"
          maxLength={30}
          placeholder="ニックネーム（任意）"
          className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <textarea
        name="body"
        rows={4}
        maxLength={2000}
        placeholder="相談者さんへ、あなたの気持ちや経験を書いてみてください。"
        className="w-full resize-y rounded-2xl border border-input bg-background px-4 py-3 leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
      {error && (
        <p className="mt-3 rounded-xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="mt-3 rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
      >
        {isPending ? "送信中…" : "返信する"}
      </button>
    </form>
  )
}
