# AI Tutor Codex

A local prototype of an AI Tutor course platform with separate teacher and student experiences.

## Features

- Role login for teachers and students.
- Teachers can create course metadata, upload Markdown/text sources, generate lesson drafts, edit lessons, delete lessons, and publish lessons.
- Teachers can preview the student view.
- Students only see published lessons.
- Students can ask lesson-scoped questions.
- The frontend calls a local API server at `/api/ask`; the server calls OpenAI's Responses API when `OPENAI_API_KEY` is configured.

## Setup

```powershell
npm.cmd install
Copy-Item .env.example .env
```

Edit `.env` and set:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

Never put the OpenAI API key in React/browser code. Keep it in `.env` on the server.

## Neon + Drizzle Database

Create a Neon project, copy the pooled connection string, and put it in `.env`:

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
```

Apply the schema:

```powershell
npm.cmd run db:push
```

The app persists:

- Course metadata, uploaded source text, and lessons in `app_state`.
- Admin usage limits in `app_state`.
- Shared student Q&A and private teacher Q&A in `questions`.

If `DATABASE_URL` is missing, the app still runs in local-only mode.

## Run Frontend And API

```powershell
npm.cmd run dev:full
```

Open:

```text
http://127.0.0.1:5174/
```

## Run Separately

Terminal 1:

```powershell
npm.cmd run api
```

Terminal 2:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5174
```

## API Endpoints

```text
GET  http://127.0.0.1:3001/api/health
POST http://127.0.0.1:3001/api/ask
```

`POST /api/ask` expects:

```json
{
  "question": "What is this lesson about?",
  "courseGoal": "Course goal",
  "lessonTitle": "Lesson title",
  "lessonObjective": "Lesson objective",
  "lessonBody": "Lesson content",
  "sourceContext": "Relevant uploaded source text"
}
```

## Production Notes

This prototype sends lesson context from the browser to the server. For production, store course content server-side, retrieve relevant lesson/source chunks on the backend, and only let authorized students ask questions against courses they can access.
