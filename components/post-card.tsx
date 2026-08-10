import Link from "next/link"
import { getCategory } from "@/lib/categories"
import { timeAgo } from "@/lib/time"

type PostCardProps = {
  id: number
  nickname: string
  category: string
  title: string
  body: string
  createdAt: Date | string
  replyCount: number
}

export function PostCard(props: PostCardProps) {
  const cat = getCategory(props.category)
  return (
    <Link
      href={`/post/${props.id}`}
      className="group block rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
          <span>{cat.emoji}</span>
          {cat.label}
        </span>
        <span className="text-xs text-muted-foreground">{timeAgo(props.createdAt)}</span>
      </div>

      <h3 className="text-balance text-lg font-bold leading-snug transition group-hover:text-primary">
        {props.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-pretty text-sm leading-relaxed text-muted-foreground">
        {props.body}
      </p>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{props.nickname}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 font-semibold text-accent-foreground">
          <span aria-hidden>💬</span>
          {props.replyCount}
          <span className="sr-only">件の返信</span>
        </span>
      </div>
    </Link>
  )
}
