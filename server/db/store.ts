import { eq } from 'drizzle-orm'
import { db } from './client.js'
import { appState, questions } from './schema.js'

export type StoredQuestion = {
  id: string
  lessonId?: string
  askedBy: string
  role: string
  prompt: string
  answer: string
  source: string
  audience: string
  estimatedTokens: number
  createdAt: string
}

export async function getStateValue<T>(key: string, fallback: T): Promise<T> {
  if (!db) return fallback

  const rows = await db.select().from(appState).where(eq(appState.key, key)).limit(1)
  return rows[0]?.value as T ?? fallback
}

export async function setStateValue<T>(key: string, value: T): Promise<T> {
  if (!db) return value

  await db
    .insert(appState)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appState.key,
      set: { value, updatedAt: new Date() },
    })

  return value
}

export async function listQuestions(): Promise<StoredQuestion[]> {
  if (!db) return []

  const rows = await db.select().from(questions)
  return rows.map((row) => ({
    id: row.id,
    lessonId: row.lessonId ?? undefined,
    askedBy: row.askedBy,
    role: row.role,
    prompt: row.prompt,
    answer: row.answer,
    source: row.source,
    audience: row.audience,
    estimatedTokens: row.estimatedTokens,
    createdAt: row.createdAt.toLocaleString(),
  }))
}

export async function saveQuestion(question: StoredQuestion): Promise<StoredQuestion> {
  if (!db) return question

  await db
    .insert(questions)
    .values({
      id: question.id,
      lessonId: question.lessonId,
      askedBy: question.askedBy,
      role: question.role,
      prompt: question.prompt,
      answer: question.answer,
      source: question.source,
      audience: question.audience,
      estimatedTokens: question.estimatedTokens,
      createdAt: new Date(question.createdAt),
    })
    .onConflictDoNothing()

  return question
}
