"use server"

import { db } from "@/lib/db"
import { posts, replies } from "@/lib/db/schema"
import { categories } from "@/lib/categories"
import { desc, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

const DEFAULT_NICKNAME = "とおりがかりさん"
const validCategories = new Set(categories.map((c) => c.value))

function clean(value: FormDataEntryValue | null, max: number) {
  return String(value ?? "").trim().slice(0, max)
}

export async function getPosts(category?: string) {
  const replyCount = sql<number>`(
    SELECT COUNT(*)::int FROM ${replies} WHERE ${replies.postId} = ${posts.id}
  )`.as("reply_count")

  const query = db
    .select({
      id: posts.id,
      nickname: posts.nickname,
      category: posts.category,
      title: posts.title,
      body: posts.body,
      createdAt: posts.createdAt,
      replyCount,
    })
    .from(posts)
    .orderBy(desc(posts.createdAt))

  if (category && validCategories.has(category)) {
    return query.where(eq(posts.category, category))
  }
  return query
}

export async function getPost(id: number) {
  const [post] = await db.select().from(posts).where(eq(posts.id, id))
  if (!post) return null
  const postReplies = await db
    .select()
    .from(replies)
    .where(eq(replies.postId, id))
    .orderBy(replies.createdAt)
  return { post, replies: postReplies }
}

export async function createPost(formData: FormData) {
  const title = clean(formData.get("title"), 100)
  const body = clean(formData.get("body"), 4000)
  const nickname = clean(formData.get("nickname"), 30) || DEFAULT_NICKNAME
  let category = clean(formData.get("category"), 20)
  if (!validCategories.has(category)) category = "other"

  if (!title || !body) {
    return { error: "タイトルと相談内容を入力してください。" }
  }

  const [created] = await db
    .insert(posts)
    .values({ title, body, nickname, category })
    .returning({ id: posts.id })

  revalidatePath("/")
  return { id: created.id }
}

export async function createReply(formData: FormData) {
  const postId = Number(formData.get("postId"))
  const body = clean(formData.get("body"), 2000)
  const nickname = clean(formData.get("nickname"), 30) || DEFAULT_NICKNAME

  if (!postId || Number.isNaN(postId)) {
    return { error: "投稿が見つかりませんでした。" }
  }
  if (!body) {
    return { error: "返信内容を入力してください。" }
  }

  await db.insert(replies).values({ postId, body, nickname })

  revalidatePath(`/post/${postId}`)
  revalidatePath("/")
  return { ok: true }
}
