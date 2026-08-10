import Link from "next/link"
import { notFound } from "next/navigation"
import { getPost } from "@/app/actions/board"
import { ReplyForm } from "@/components/reply-form"
import { AdSlot } from "@/components/ad-slot"
import { getCategory } from "@/lib/categories"
import { timeAgo } from "@/lib/time"

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const postId = Number(id)
  if (Number.isNaN(postId)) notFound()

  const data = await getPost(postId)
  if (!data) notFound()

  const { post, replies } = data
  const cat = getCategory(post.category)

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-20 pt-6 sm:pt-10">
      <Link
        href="/"
        className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-card px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm transition hover:text-foreground"
      >
        <span aria-hidden>←</span> 掲示板にもどる
      </Link>

      <article className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
            <span>{cat.emoji}</span>
            {cat.label}
          </span>
          <span className="text-xs text-muted-foreground">{timeAgo(post.createdAt)}</span>
        </div>
        <h1 className="text-balance text-2xl font-extrabold leading-snug">{post.title}</h1>
        <p className="mt-4 whitespace-pre-wrap text-pretty leading-relaxed">{post.body}</p>
        <p className="mt-5 text-sm text-muted-foreground">相談者： {post.nickname}</p>
      </article>

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE} />

      <section className="mt-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
          <span aria-hidden>💬</span>
          みんなの返信
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-sm text-accent-foreground">
            {replies.length}
          </span>
        </h2>

        {replies.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
            まだ返信がありません。最初のやさしい一言を。
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {replies.map((r) => (
              <li
                key={r.id}
                className="rounded-3xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold">{r.nickname}</span>
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(r.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-pretty leading-relaxed">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8">
        <ReplyForm postId={postId} />
      </div>
    </main>
  )
}
