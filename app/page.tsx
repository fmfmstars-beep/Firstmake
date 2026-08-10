import { Fragment } from "react"
import { getPosts } from "@/app/actions/board"
import { NewPostForm } from "@/components/new-post-form"
import { PostCard } from "@/components/post-card"
import { CategoryFilter } from "@/components/category-filter"
import { AdSlot } from "@/components/ad-slot"

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>
}) {
  const { cat } = await searchParams
  const posts = await getPosts(cat)

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-20 pt-8 sm:pt-12">
      <header className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground">
          <span aria-hidden>☕</span> みんなでそっと支え合う場所
        </div>
        <h1 className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
          ほっとカフェ掲示板
        </h1>
        <p className="mx-auto mt-3 max-w-md text-pretty leading-relaxed text-muted-foreground">
          恋愛、仕事、くらしのモヤモヤ。匿名で気軽に相談して、
          あたたかい言葉をもらえるお悩み相談の掲示板です。
        </p>
      </header>

      <div className="mb-6">
        <NewPostForm />
      </div>

      <div className="mb-5">
        <CategoryFilter active={cat} />
      </div>

      {posts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <p className="text-4xl" aria-hidden>
            🌷
          </p>
          <p className="mt-3 font-semibold">まだ相談がありません</p>
          <p className="mt-1 text-sm text-muted-foreground">
            最初のひとことを、あなたから。
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((p, i) => (
            <Fragment key={p.id}>
              <PostCard
                id={p.id}
                nickname={p.nickname}
                category={p.category}
                title={p.title}
                body={p.body}
                createdAt={p.createdAt}
                replyCount={p.replyCount}
              />
              {/* 5件ごとにさりげなく広告を挿入 */}
              {(i + 1) % 5 === 0 && i < posts.length - 1 && (
                <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_FEED} />
              )}
            </Fragment>
          ))}
        </div>
      )}
    </main>
  )
}
