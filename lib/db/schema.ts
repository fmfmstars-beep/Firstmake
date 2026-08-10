import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core"

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  nickname: text("nickname").notNull().default("とおりがかりさん"),
  category: text("category").notNull().default("other"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const replies = pgTable("replies", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  nickname: text("nickname").notNull().default("とおりがかりさん"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export type Post = typeof posts.$inferSelect
export type Reply = typeof replies.$inferSelect
