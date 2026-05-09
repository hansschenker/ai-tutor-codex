import { integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const appState = pgTable('app_state', {
  key: varchar('key', { length: 80 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const questions = pgTable('questions', {
  id: varchar('id', { length: 120 }).primaryKey(),
  lessonId: varchar('lesson_id', { length: 120 }),
  askedBy: varchar('asked_by', { length: 160 }).notNull(),
  role: varchar('role', { length: 40 }).notNull(),
  prompt: text('prompt').notNull(),
  answer: text('answer').notNull(),
  source: varchar('source', { length: 40 }).notNull(),
  audience: varchar('audience', { length: 80 }).notNull(),
  estimatedTokens: integer('estimated_tokens').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
