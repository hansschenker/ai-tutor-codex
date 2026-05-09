import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import OpenAI from 'openai'
import { databaseUrl } from './db/client.js'
import { getStateValue, listQuestions, saveQuestion, setStateValue, type StoredQuestion } from './db/store.js'

type AskRequest = {
  question?: string
  courseGoal?: string
  lessonTitle?: string
  lessonObjective?: string
  lessonBody?: string
  sourceContext?: string
  maxOutputTokens?: number
}

type PersistRequest = {
  course?: unknown
  limits?: unknown
  question?: StoredQuestion
}

const app = express()
const port = Number(process.env.PORT || 3001)
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://127.0.0.1:5174,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const openaiApiKey = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY

const client = openaiApiKey
  ? new OpenAI({ apiKey: openaiApiKey })
  : null

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`))
    },
  }),
)
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    openaiConfigured: Boolean(client),
    databaseConfigured: Boolean(databaseUrl),
  })
})

app.get('/api/bootstrap', async (_request, response) => {
  try {
    const [course, limits, savedQuestions] = await Promise.all([
      getStateValue('course', null),
      getStateValue('limits', null),
      listQuestions(),
    ])

    response.json({ course, limits, questions: savedQuestions })
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load database state.',
    })
  }
})

app.put('/api/course', async (request, response) => {
  try {
    const body = request.body as PersistRequest
    const course = await setStateValue('course', body.course)
    response.json({ course })
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to save course.',
    })
  }
})

app.put('/api/limits', async (request, response) => {
  try {
    const body = request.body as PersistRequest
    const limits = await setStateValue('limits', body.limits)
    response.json({ limits })
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to save limits.',
    })
  }
})

app.get('/api/questions', async (_request, response) => {
  try {
    response.json({ questions: await listQuestions() })
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load questions.',
    })
  }
})

app.post('/api/questions', async (request, response) => {
  try {
    const body = request.body as PersistRequest
    if (!body.question) {
      response.status(400).json({ error: 'Question is required.' })
      return
    }

    const question = await saveQuestion(body.question)
    response.json({ question })
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to save question.',
    })
  }
})

app.post('/api/ask', async (request, response) => {
  const body = request.body as AskRequest
  const question = body.question?.trim()

  if (!question) {
    response.status(400).json({ error: 'Question is required.' })
    return
  }

  if (!client) {
    response.status(503).json({
      error:
        'OpenAI is not configured. Add OPENAI_API_KEY to .env and restart the API server.',
    })
    return
  }

  try {
    const result = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.2',
      max_output_tokens: Math.min(Math.max(Number(body.maxOutputTokens || 700), 100), 2_000),
      instructions:
        'You are an AI tutor for a course platform. Answer the student using only the provided course and lesson context. If the answer is not supported by the context, say what is missing. Keep the answer concise, accurate, and instructional.',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                `Course goal: ${body.courseGoal || 'Not provided'}`,
                `Lesson title: ${body.lessonTitle || 'Not provided'}`,
                `Lesson objective: ${body.lessonObjective || 'Not provided'}`,
                '',
                'Lesson content:',
                body.lessonBody || 'Not provided',
                '',
                'Uploaded source context:',
                body.sourceContext || 'No uploaded source context provided.',
                '',
                `Student question: ${question}`,
              ].join('\n'),
            },
          ],
        },
      ],
    })

    response.json({ answer: result.output_text })
  } catch (error) {
    console.error(error)
    response.status(500).json({
      error: error instanceof Error ? error.message : 'OpenAI request failed.',
    })
  }
})

app.listen(port, '0.0.0.0', () => {
  console.log(`AI Tutor API running on port ${port}`)
})
