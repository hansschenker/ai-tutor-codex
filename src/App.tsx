import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import './App.css'

type ViewMode = 'teacher' | 'student' | 'admin' | 'student-questions' | 'teacher-questions'
type UserRole = 'teacher' | 'student' | 'admin'
type LessonStatus = 'draft' | 'published'
type AnswerSource = 'api' | 'local'
type QuestionAudience = 'student-shared' | 'teacher-private'

type CurrentUser = {
  id: string
  name: string
  role: UserRole
}

type SourceFile = {
  id: string
  name: string
  text: string
}

type Lesson = {
  id: string
  title: string
  objective: string
  body: string
  status: LessonStatus
  sourceFileIds: string[]
}

type Course = {
  id: string
  title: string
  goal: string
  audience: string
  description: string
  sources: SourceFile[]
  lessons: Lesson[]
}

type Question = {
  id: string
  lessonId?: string
  askedBy: string
  role: UserRole
  prompt: string
  answer: string
  source: AnswerSource
  audience: QuestionAudience
  estimatedTokens: number
  createdAt: string
}

type LimitSettings = {
  studentQuestionLimit: number
  teacherTokenLimit: number
  teacherMaxOutputTokens: number
}

const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001'

const initialLimits: LimitSettings = {
  studentQuestionLimit: 20,
  teacherTokenLimit: 100_000,
  teacherMaxOutputTokens: 900,
}

const initialCourse: Course = {
  id: 'course-1',
  title: 'Reactive Foundations',
  goal: 'Help students understand the core ideas of reactive programming from uploaded course material.',
  audience: 'Developers learning modern frontend architecture',
  description: 'A teacher-owned course generated from Markdown and text sources.',
  sources: [],
  lessons: [
    {
      id: 'lesson-1',
      title: 'What This Course Covers',
      objective: 'Understand the course goal and how generated lessons are structured.',
      body:
        'This starter lesson is editable. Upload Markdown or text files in the teacher view, then generate lesson drafts from the uploaded material.',
      status: 'published',
      sourceFileIds: [],
    },
  ],
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4)
}

function splitIntoLessonDrafts(sources: SourceFile[], courseGoal: string): Lesson[] {
  const chunks = sources.flatMap((source) => {
    const sections = source.text
      .split(/\n(?=#{1,3}\s)/)
      .map((section) => section.trim())
      .filter(Boolean)

    return (sections.length > 0 ? sections : [source.text]).map((section, index) => ({
      source,
      index,
      text: section,
    }))
  })

  return chunks.slice(0, 8).map(({ source, index, text }) => {
    const heading = text.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim()
    const title = heading || `${source.name.replace(/\.[^.]+$/, '')} ${index + 1}`
    const compactText = text.replace(/^#{1,3}\s+.+$/m, '').trim()

    return {
      id: makeId('lesson'),
      title,
      objective: `Connect this topic to the course goal: ${courseGoal}`,
      body:
        compactText.length > 900
          ? `${compactText.slice(0, 900).trim()}...\n\nTeacher note: expand or trim this generated draft before publishing.`
          : `${compactText}\n\nTeacher note: review this generated draft before publishing.`,
      status: 'draft',
      sourceFileIds: [source.id],
    }
  })
}

function answerFromText(title: string, question: string, text: string) {
  const searchWords = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3)

  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 30)

  const relevant = sentences
    .map((sentence) => ({
      sentence,
      score: searchWords.filter((word) => sentence.toLowerCase().includes(word)).length,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.sentence)

  if (relevant.length === 0) {
    return `I could not find a strong match inside "${title}". Ask a more specific question or add source material that covers this point.`
  }

  return `Based on "${title}", the most relevant points are:\n\n${relevant
    .map((sentence) => `- ${sentence}`)
    .join('\n')}\n\nSource scope: this answer is limited to the selected course material.`
}

export default function App() {
  const hasLoadedRemoteState = useRef(false)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [mode, setMode] = useState<ViewMode>('teacher')
  const [course, setCourse] = useState<Course>(initialCourse)
  const [limits, setLimits] = useState<LimitSettings>(initialLimits)
  const [selectedLessonId, setSelectedLessonId] = useState(initialCourse.lessons[0].id)
  const [studentQuestionText, setStudentQuestionText] = useState('')
  const [teacherQuestionText, setTeacherQuestionText] = useState('')
  const [pendingStudentQuestion, setPendingStudentQuestion] = useState('')
  const [questionSearchTerm, setQuestionSearchTerm] = useState('')
  const [questionReviewNotice, setQuestionReviewNotice] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [isAskingStudent, setIsAskingStudent] = useState(false)
  const [isAskingTeacher, setIsAskingTeacher] = useState(false)
  const [studentQuestionError, setStudentQuestionError] = useState('')
  const [teacherQuestionError, setTeacherQuestionError] = useState('')
  const [uploadMessage, setUploadMessage] = useState('No source files uploaded yet.')

  const selectedLesson = useMemo(
    () => course.lessons.find((lesson) => lesson.id === selectedLessonId) ?? course.lessons[0],
    [course.lessons, selectedLessonId],
  )

  const publishedLessons = course.lessons.filter((lesson) => lesson.status === 'published')
  const studentQuestions = questions.filter((question) => question.audience === 'student-shared')
  const teacherQuestions = questions.filter((question) => question.audience === 'teacher-private')
  const selectedLessonQuestions = studentQuestions.filter((question) => question.lessonId === selectedLesson?.id)
  const visibleStudentQuestions = questionSearchTerm.trim()
    ? studentQuestions.filter((question) => {
        const term = questionSearchTerm.toLowerCase().trim()
        return `${question.prompt} ${question.answer}`.toLowerCase().includes(term)
      })
    : studentQuestions
  const studentQuestionsUsed = currentUser
    ? studentQuestions.filter((question) => question.askedBy === currentUser.name).length
    : 0
  const teacherTokensUsed = teacherQuestions.reduce((sum, question) => sum + question.estimatedTokens, 0)
  const studentQuestionsRemaining = Math.max(limits.studentQuestionLimit - studentQuestionsUsed, 0)
  const teacherTokensRemaining = Math.max(limits.teacherTokenLimit - teacherTokensUsed, 0)

  useEffect(() => {
    async function loadRemoteState() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/bootstrap`)
        if (!response.ok) return

        const data = (await response.json()) as {
          course?: Course | null
          limits?: LimitSettings | null
          questions?: Question[]
        }

        if (data.course) {
          setCourse(data.course)
          setSelectedLessonId(data.course.lessons[0]?.id ?? '')
        }
        if (data.limits) setLimits(data.limits)
        if (data.questions) setQuestions(data.questions)
      } catch {
        // Local-only mode remains usable when the API or database is offline.
      } finally {
        hasLoadedRemoteState.current = true
      }
    }

    void loadRemoteState()
  }, [])

  async function persistCourse(nextCourse: Course) {
    if (!hasLoadedRemoteState.current) return
    try {
      await fetch(`${apiBaseUrl}/api/course`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course: nextCourse }),
      })
    } catch {
      // Keep the local app responsive even when persistence is unavailable.
    }
  }

  async function persistLimits(nextLimits: LimitSettings) {
    if (!hasLoadedRemoteState.current) return
    try {
      await fetch(`${apiBaseUrl}/api/limits`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limits: nextLimits }),
      })
    } catch {
      // Keep the local app responsive even when persistence is unavailable.
    }
  }

  async function persistQuestion(question: Question) {
    try {
      await fetch(`${apiBaseUrl}/api/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
    } catch {
      // The local Q&A history is still updated even if persistence is unavailable.
    }
  }

  function updateLimits(patch: Partial<LimitSettings>) {
    setLimits((current) => {
      const next = { ...current, ...patch }
      void persistLimits(next)
      return next
    })
  }

  function login(role: UserRole) {
    const firstPublishedLessonId = publishedLessons[0]?.id ?? course.lessons[0]?.id ?? ''

    setCurrentUser({
      id: `${role}-demo`,
      name: role === 'teacher' ? 'Teacher Demo' : role === 'admin' ? 'Admin Demo' : 'Student Demo',
      role,
    })
    setMode(role === 'admin' ? 'admin' : role)
    setSelectedLessonId(firstPublishedLessonId)
  }

  function logout() {
    setCurrentUser(null)
    setMode('teacher')
    setSelectedLessonId(course.lessons[0]?.id ?? '')
  }

  function updateCourseField(field: keyof Pick<Course, 'title' | 'goal' | 'audience' | 'description'>, value: string) {
    setCourse((current) => {
      const next = { ...current, [field]: value }
      void persistCourse(next)
      return next
    })
  }

  function updateLesson(lessonId: string, patch: Partial<Lesson>) {
    setCourse((current) => {
      const next = {
        ...current,
        lessons: current.lessons.map((lesson) => (lesson.id === lessonId ? { ...lesson, ...patch } : lesson)),
      }
      void persistCourse(next)
      return next
    })
  }

  function addBlankLesson() {
    const lesson: Lesson = {
      id: makeId('lesson'),
      title: 'New Lesson',
      objective: 'Describe what the student should be able to do after this lesson.',
      body: 'Write the lesson content here.',
      status: 'draft',
      sourceFileIds: [],
    }

    setCourse((current) => {
      const next = { ...current, lessons: [...current.lessons, lesson] }
      void persistCourse(next)
      return next
    })
    setSelectedLessonId(lesson.id)
  }

  function deleteLesson(lessonId: string) {
    setCourse((current) => {
      const remaining = current.lessons.filter((lesson) => lesson.id !== lessonId)
      setSelectedLessonId(remaining[0]?.id ?? '')
      const next = { ...current, lessons: remaining }
      void persistCourse(next)
      return next
    })
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) =>
      /\.(md|txt)$/i.test(file.name),
    )

    if (files.length === 0) {
      setUploadMessage('Choose Markdown or text files.')
      return
    }

    const uploaded = await Promise.all(
      files.map(async (file) => ({
        id: makeId('source'),
        name: file.name,
        text: await file.text(),
      })),
    )

    setCourse((current) => {
      const next = { ...current, sources: [...current.sources, ...uploaded] }
      void persistCourse(next)
      return next
    })
    setUploadMessage(`${uploaded.length} source file${uploaded.length === 1 ? '' : 's'} uploaded.`)
    event.target.value = ''
  }

  function generateLessons() {
    if (course.sources.length === 0) {
      setUploadMessage('Upload Markdown or text files before generating lessons.')
      return
    }

    const drafts = splitIntoLessonDrafts(course.sources, course.goal)
    setCourse((current) => {
      const next = { ...current, lessons: [...current.lessons, ...drafts] }
      void persistCourse(next)
      return next
    })
    setSelectedLessonId(drafts[0]?.id ?? selectedLessonId)
    setUploadMessage(`${drafts.length} lesson draft${drafts.length === 1 ? '' : 's'} generated.`)
  }

  function extractSearchKeyword(question: string) {
    const stopWords = new Set([
      'what',
      'when',
      'where',
      'which',
      'about',
      'should',
      'could',
      'would',
      'please',
      'explain',
      'understand',
      'lesson',
      'topic',
      'this',
      'that',
      'with',
      'from',
      'does',
      'have',
      'your',
      'course',
    ])
    return (
      question
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 3 && !stopWords.has(word))
        .sort((a, b) => b.length - a.length)[0] || question.trim().split(/\s+/)[0] || ''
    )
  }

  function askStudentQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!currentUser || !selectedLesson || studentQuestionText.trim().length === 0 || isAskingStudent) return

    if (studentQuestionsRemaining <= 0) {
      setStudentQuestionError(`You have used all ${limits.studentQuestionLimit} course questions.`)
      return
    }

    const prompt = studentQuestionText.trim()
    const keyword = extractSearchKeyword(prompt)

    setPendingStudentQuestion(prompt)
    setQuestionSearchTerm(keyword)
    setQuestionReviewNotice(
      `Before sending to ChatGPT, review existing student Q&A matching "${keyword}". Send only if these answers do not cover your question.`,
    )
    setMode('student-questions')
  }

  async function sendPendingStudentQuestion() {
    if (!pendingStudentQuestion) return
    await sendStudentQuestion(pendingStudentQuestion)
  }

  async function sendStudentQuestion(prompt: string) {
    if (!currentUser || !selectedLesson || isAskingStudent) return

    const sourceContext = course.sources
      .filter((source) => selectedLesson.sourceFileIds.includes(source.id))
      .map((source) => `Source: ${source.name}\n${source.text}`)
      .join('\n\n')
    const fallbackContext = `${selectedLesson.body}\n\n${sourceContext}`

    setIsAskingStudent(true)
    setStudentQuestionError('')

    try {
      const response = await fetch(`${apiBaseUrl}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: prompt,
          courseGoal: course.goal,
          lessonTitle: selectedLesson.title,
          lessonObjective: selectedLesson.objective,
          lessonBody: selectedLesson.body,
          sourceContext,
          maxOutputTokens: 600,
        }),
      })

      const data = (await response.json()) as { answer?: string; error?: string }

      if (!response.ok || !data.answer) {
        throw new Error(data.error || 'The tutor API did not return an answer.')
      }

      saveQuestion(currentUser, prompt, data.answer, 'api', 'student-shared', selectedLesson.id)
      setStudentQuestionText('')
      setPendingStudentQuestion('')
      setQuestionReviewNotice('')
    } catch (error) {
      const fallback = answerFromText(selectedLesson.title, prompt, fallbackContext)
      const message = error instanceof Error ? error.message : 'Could not reach the tutor API.'

      setStudentQuestionError(`${message} Showing a local fallback answer instead.`)
      saveQuestion(currentUser, prompt, fallback, 'local', 'student-shared', selectedLesson.id)
      setStudentQuestionText('')
      setPendingStudentQuestion('')
      setQuestionReviewNotice('')
    } finally {
      setIsAskingStudent(false)
    }
  }

  async function askTeacherQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!currentUser || teacherQuestionText.trim().length === 0 || isAskingTeacher) return

    const prompt = teacherQuestionText.trim()
    const allSourceContext = course.sources.map((source) => `Source: ${source.name}\n${source.text}`).join('\n\n')
    const allLessons = course.lessons
      .map((lesson) => `Lesson: ${lesson.title}\nObjective: ${lesson.objective}\n${lesson.body}`)
      .join('\n\n')
    const estimatedRequestTokens = estimateTokens(`${course.goal}\n${allLessons}\n${allSourceContext}\n${prompt}`)

    if (estimatedRequestTokens + limits.teacherMaxOutputTokens > teacherTokensRemaining) {
      setTeacherQuestionError(
        `Teacher token budget is too low for this question. Remaining: ${teacherTokensRemaining.toLocaleString()} estimated tokens.`,
      )
      return
    }

    setIsAskingTeacher(true)
    setTeacherQuestionError('')

    try {
      const response = await fetch(`${apiBaseUrl}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: prompt,
          courseGoal: course.goal,
          lessonTitle: 'Teacher course workspace',
          lessonObjective: 'Help the teacher improve course design, lesson quality, and student support.',
          lessonBody: allLessons,
          sourceContext: allSourceContext,
          maxOutputTokens: limits.teacherMaxOutputTokens,
        }),
      })

      const data = (await response.json()) as { answer?: string; error?: string }

      if (!response.ok || !data.answer) {
        throw new Error(data.error || 'The tutor API did not return an answer.')
      }

      saveQuestion(currentUser, prompt, data.answer, 'api', 'teacher-private')
      setTeacherQuestionText('')
    } catch (error) {
      const fallback = answerFromText('teacher course workspace', prompt, `${allLessons}\n\n${allSourceContext}`)
      const message = error instanceof Error ? error.message : 'Could not reach the tutor API.'

      setTeacherQuestionError(`${message} Showing a private local fallback answer instead.`)
      saveQuestion(currentUser, prompt, fallback, 'local', 'teacher-private')
      setTeacherQuestionText('')
    } finally {
      setIsAskingTeacher(false)
    }
  }

  function saveQuestion(
    user: CurrentUser,
    prompt: string,
    answer: string,
    source: AnswerSource,
    audience: QuestionAudience,
    lessonId?: string,
  ) {
    const question: Question = {
      id: makeId('question'),
      lessonId,
      askedBy: user.name,
      role: user.role,
      prompt,
      answer,
      source,
      audience,
      estimatedTokens: estimateTokens(`${prompt}\n${answer}`),
      createdAt: new Date().toLocaleString(),
    }

    setQuestions((current) => [...current, question])
    void persistQuestion(question)
  }

  function renderStudentQuestionsPage() {
    return (
      <section className="workspace single-column">
        <section className="panel">
          <p className="eyebrow">Shared student Q&A</p>
          <h2>Questions and answers from all students</h2>
          <p className="muted">Visible to teachers and students. Teacher-private questions are excluded.</p>
          {questionReviewNotice ? <p className="review-notice">{questionReviewNotice}</p> : null}
          <label className="search-box">
            Search existing questions
            <input
              value={questionSearchTerm}
              onChange={(event) => setQuestionSearchTerm(event.target.value)}
              placeholder="Search by keyword"
            />
          </label>
          {pendingStudentQuestion ? (
            <div className="pending-question">
              <div>
                <p className="eyebrow">Pending question</p>
                <strong>{pendingStudentQuestion}</strong>
              </div>
              <button className="primary" onClick={sendPendingStudentQuestion}>
                {isAskingStudent ? 'Sending...' : 'Send to ChatGPT'}
              </button>
            </div>
          ) : null}
          {studentQuestionError ? <p className="qa-error">{studentQuestionError}</p> : null}
          <div className="answer-list">
            {visibleStudentQuestions.length === 0 ? (
              <p className="muted">No matching student questions yet.</p>
            ) : (
              visibleStudentQuestions.map((question) => (
                <section className="answer" key={question.id}>
                  <h3>{question.prompt}</h3>
                  <small>
                    {question.askedBy} · {question.source === 'api' ? 'ChatGPT answer' : 'Local fallback'} ·{' '}
                    {question.createdAt}
                  </small>
                  <p>{question.answer}</p>
                </section>
              ))
            )}
          </div>
        </section>
      </section>
    )
  }

  function renderTeacherQuestionsPage() {
    return (
      <section className="workspace single-column">
        <section className="panel">
          <p className="eyebrow">Private teacher Q&A</p>
          <h2>Teacher-only questions</h2>
          <p className="muted">
            These questions are visible to teachers only. Students cannot access this page.
          </p>
          <div className="stat-grid">
            <div className="stat-card">
              <span>{teacherTokensUsed.toLocaleString()}</span>
              <small>Estimated tokens used</small>
            </div>
            <div className="stat-card">
              <span>{teacherTokensRemaining.toLocaleString()}</span>
              <small>Estimated tokens remaining</small>
            </div>
          </div>
          <form className="qa-form" onSubmit={askTeacherQuestion}>
            <label>
              Ask a private teacher question
              <textarea
                value={teacherQuestionText}
                onChange={(event) => setTeacherQuestionText(event.target.value)}
                placeholder="How can I improve this lesson sequence?"
              />
            </label>
            <button className="primary" type="submit">
              {isAskingTeacher ? 'Asking...' : 'Ask private question'}
            </button>
          </form>
          {teacherQuestionError ? <p className="qa-error">{teacherQuestionError}</p> : null}
          <div className="answer-list">
            {teacherQuestions.length === 0 ? (
              <p className="muted">No private teacher questions yet.</p>
            ) : (
              teacherQuestions.map((question) => (
                <section className="answer" key={question.id}>
                  <h3>{question.prompt}</h3>
                  <small>
                    {question.askedBy} · {question.source === 'api' ? 'ChatGPT answer' : 'Local fallback'} ·{' '}
                    {question.estimatedTokens.toLocaleString()} estimated tokens · {question.createdAt}
                  </small>
                  <p>{question.answer}</p>
                </section>
              ))
            )}
          </div>
        </section>
      </section>
    )
  }

  function renderAdminPage() {
    return (
      <section className="workspace admin-grid">
        <section className="panel">
          <p className="eyebrow">Admin</p>
          <h2>Usage limits</h2>
          <label>
            Student question limit
            <input
              min={1}
              type="number"
              value={limits.studentQuestionLimit}
              onChange={(event) =>
                updateLimits({
                  studentQuestionLimit: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Teacher token budget
            <input
              min={1_000}
              step={1_000}
              type="number"
              value={limits.teacherTokenLimit}
              onChange={(event) =>
                updateLimits({
                  teacherTokenLimit: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Teacher max output tokens per answer
            <input
              min={100}
              step={100}
              type="number"
              value={limits.teacherMaxOutputTokens}
              onChange={(event) =>
                updateLimits({
                  teacherMaxOutputTokens: Number(event.target.value),
                })
              }
            />
          </label>
        </section>
        <section className="panel">
          <p className="eyebrow">Current usage</p>
          <h2>Course activity</h2>
          <div className="stat-grid">
            <div className="stat-card">
              <span>{studentQuestions.length}</span>
              <small>Shared student questions</small>
            </div>
            <div className="stat-card">
              <span>{teacherQuestions.length}</span>
              <small>Private teacher questions</small>
            </div>
            <div className="stat-card">
              <span>{teacherTokensUsed.toLocaleString()}</span>
              <small>Teacher estimated tokens used</small>
            </div>
          </div>
        </section>
      </section>
    )
  }

  if (!currentUser) {
    return (
      <main className="app-shell login-shell">
        <section className="login-panel">
          <p className="eyebrow">AI Tutor</p>
          <h1>Choose your workspace</h1>
          <p>
            Teachers manage courses and can preview the student experience. Students see published lessons and shared
            student questions. Admins manage usage limits.
          </p>
          <div className="login-actions three-up">
            <button className="login-card" onClick={() => login('teacher')}>
              <span>Teacher</span>
              <small>Create courses, publish lessons, ask private teacher questions.</small>
            </button>
            <button className="login-card" onClick={() => login('student')}>
              <span>Student</span>
              <small>Take published courses and ask up to {limits.studentQuestionLimit} shared questions.</small>
            </button>
            <button className="login-card" onClick={() => login('admin')}>
              <span>Admin</span>
              <small>Change student question limits and teacher token budgets.</small>
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AI Tutor</p>
          <h1>Course Studio</h1>
        </div>
        <div className="session-controls">
          <div>
            <strong>{currentUser.name}</strong>
            <small>{currentUser.role}</small>
          </div>
          {currentUser.role === 'teacher' ? (
            <div className="segmented" aria-label="Teacher navigation">
              <button className={mode === 'teacher' ? 'active' : ''} onClick={() => setMode('teacher')}>
                Teacher
              </button>
              <button className={mode === 'student' ? 'active' : ''} onClick={() => setMode('student')}>
                Student preview
              </button>
              <button
                className={mode === 'student-questions' ? 'active' : ''}
                onClick={() => setMode('student-questions')}
              >
                Student Q&A
              </button>
              <button
                className={mode === 'teacher-questions' ? 'active' : ''}
                onClick={() => setMode('teacher-questions')}
              >
                Teacher Q&A
              </button>
            </div>
          ) : null}
          {currentUser.role === 'student' ? (
            <div className="segmented" aria-label="Student navigation">
              <button className={mode === 'student' ? 'active' : ''} onClick={() => setMode('student')}>
                Course
              </button>
              <button
                className={mode === 'student-questions' ? 'active' : ''}
                onClick={() => setMode('student-questions')}
              >
                Student Q&A
              </button>
            </div>
          ) : null}
          {currentUser.role === 'admin' ? (
            <div className="segmented" aria-label="Admin navigation">
              <button className={mode === 'admin' ? 'active' : ''} onClick={() => setMode('admin')}>
                Admin
              </button>
              <button
                className={mode === 'student-questions' ? 'active' : ''}
                onClick={() => setMode('student-questions')}
              >
                Student Q&A
              </button>
            </div>
          ) : null}
          <button onClick={logout}>Log out</button>
        </div>
      </header>

      {mode === 'admin' ? renderAdminPage() : null}
      {mode === 'student-questions' ? renderStudentQuestionsPage() : null}
      {mode === 'teacher-questions' && currentUser.role === 'teacher' ? renderTeacherQuestionsPage() : null}

      {mode === 'teacher' && currentUser.role === 'teacher' ? (
        <section className="workspace teacher-grid">
          <aside className="panel course-panel">
            <div className="panel-heading">
              <p className="eyebrow">Course setup</p>
              <h2>Teacher view</h2>
            </div>

            <label>
              Course title
              <input value={course.title} onChange={(event) => updateCourseField('title', event.target.value)} />
            </label>
            <label>
              Course goal
              <textarea value={course.goal} onChange={(event) => updateCourseField('goal', event.target.value)} />
            </label>
            <label>
              Audience
              <input value={course.audience} onChange={(event) => updateCourseField('audience', event.target.value)} />
            </label>
            <label>
              Description
              <textarea
                value={course.description}
                onChange={(event) => updateCourseField('description', event.target.value)}
              />
            </label>

            <div className="upload-box">
              <label className="file-label">
                Upload Markdown or text
                <input type="file" accept=".md,.txt,text/markdown,text/plain" multiple onChange={handleFiles} />
              </label>
              <p>{uploadMessage}</p>
              <button className="primary" onClick={generateLessons}>
                Generate lesson drafts
              </button>
            </div>

            <div className="source-list">
              <h3>Uploaded sources</h3>
              {course.sources.length === 0 ? (
                <p className="muted">No uploaded material yet.</p>
              ) : (
                course.sources.map((source) => (
                  <div className="source-row" key={source.id}>
                    <span>{source.name}</span>
                    <small>{source.text.length.toLocaleString()} chars</small>
                  </div>
                ))
              )}
            </div>
          </aside>

          <section className="panel lesson-panel">
            <div className="panel-heading row-heading">
              <div>
                <p className="eyebrow">Lesson editor</p>
                <h2>Add, change, delete, publish</h2>
              </div>
              <button onClick={addBlankLesson}>Add lesson</button>
            </div>

            <div className="lesson-layout">
              <nav className="lesson-list" aria-label="Teacher lesson list">
                {course.lessons.map((lesson, index) => (
                  <button
                    className={lesson.id === selectedLessonId ? 'lesson-tab selected' : 'lesson-tab'}
                    key={lesson.id}
                    onClick={() => setSelectedLessonId(lesson.id)}
                  >
                    <span>
                      {index + 1}. {lesson.title}
                    </span>
                    <small>{lesson.status}</small>
                  </button>
                ))}
              </nav>

              {selectedLesson ? (
                <div className="editor">
                  <label>
                    Lesson title
                    <input
                      value={selectedLesson.title}
                      onChange={(event) => updateLesson(selectedLesson.id, { title: event.target.value })}
                    />
                  </label>
                  <label>
                    Learning objective
                    <input
                      value={selectedLesson.objective}
                      onChange={(event) => updateLesson(selectedLesson.id, { objective: event.target.value })}
                    />
                  </label>
                  <label>
                    Lesson content
                    <textarea
                      className="lesson-body-input"
                      value={selectedLesson.body}
                      onChange={(event) => updateLesson(selectedLesson.id, { body: event.target.value })}
                    />
                  </label>
                  <div className="editor-actions">
                    <button
                      className={selectedLesson.status === 'published' ? 'success' : ''}
                      onClick={() =>
                        updateLesson(selectedLesson.id, {
                          status: selectedLesson.status === 'published' ? 'draft' : 'published',
                        })
                      }
                    >
                      {selectedLesson.status === 'published' ? 'Unpublish' : 'Publish'}
                    </button>
                    <button className="danger" onClick={() => deleteLesson(selectedLesson.id)}>
                      Delete lesson
                    </button>
                  </div>
                </div>
              ) : (
                <p className="muted">Create a lesson to start editing.</p>
              )}
            </div>
          </section>
        </section>
      ) : null}

      {mode === 'student' ? (
        <section className="workspace student-grid">
          <aside className="panel student-course">
            <p className="eyebrow">Student view</p>
            <h2>{course.title}</h2>
            <p>{course.description}</p>
            <div className="quota-banner">
              <strong>{studentQuestionsRemaining}</strong>
              <span>of {limits.studentQuestionLimit} questions remaining</span>
            </div>
            <dl>
              <div>
                <dt>Goal</dt>
                <dd>{course.goal}</dd>
              </div>
              <div>
                <dt>Audience</dt>
                <dd>{course.audience}</dd>
              </div>
            </dl>
            <h3>Lessons</h3>
            <nav className="lesson-list" aria-label="Student lesson list">
              {publishedLessons.length === 0 ? (
                <p className="muted">No published lessons yet.</p>
              ) : (
                publishedLessons.map((lesson, index) => (
                  <button
                    className={lesson.id === selectedLessonId ? 'lesson-tab selected' : 'lesson-tab'}
                    key={lesson.id}
                    onClick={() => setSelectedLessonId(lesson.id)}
                  >
                    <span>
                      {index + 1}. {lesson.title}
                    </span>
                    <small>ready</small>
                  </button>
                ))
              )}
            </nav>
          </aside>

          <section className="panel learning-panel">
            {selectedLesson && selectedLesson.status === 'published' ? (
              <>
                <p className="eyebrow">Current lesson</p>
                <h2>{selectedLesson.title}</h2>
                <p className="objective">{selectedLesson.objective}</p>
                <article className="lesson-content">{selectedLesson.body}</article>

                <form className="qa-form" onSubmit={askStudentQuestion}>
                  <label>
                    Ask about this lesson
                    <textarea
                      value={studentQuestionText}
                      onChange={(event) => setStudentQuestionText(event.target.value)}
                      placeholder="What should I understand about this topic?"
                    />
                  </label>
                  <button className="primary" type="submit" disabled={studentQuestionsRemaining <= 0}>
                    {isAskingStudent ? 'Asking...' : 'Ask question'}
                  </button>
                </form>

                {studentQuestionError ? <p className="qa-error">{studentQuestionError}</p> : null}

                <aside className="integration-note">
                  <h3>ChatGPT API connection</h3>
                  <p>
                    Student questions are saved to the shared Q&A page. Teacher-private questions are stored
                    separately and are not visible to students.
                  </p>
                </aside>

                <div className="answer-list">
                  {selectedLessonQuestions.map((question) => (
                    <section className="answer" key={question.id}>
                      <h3>{question.prompt}</h3>
                      <small>
                        {question.askedBy} · {question.source === 'api' ? 'ChatGPT answer' : 'Local fallback'} ·{' '}
                        {question.createdAt}
                      </small>
                      <p>{question.answer}</p>
                    </section>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <h2>No published lesson selected</h2>
                <p>Publish a lesson in the teacher view, then return here to learn from it.</p>
              </div>
            )}
          </section>
        </section>
      ) : null}
    </main>
  )
}
