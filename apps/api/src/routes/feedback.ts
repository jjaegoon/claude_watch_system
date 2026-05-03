import { Hono } from 'hono'
import { sqlite } from '@team-claude/db/client'
import { requireAuth } from '../middleware/auth.js'
import { createFeedbackSchema, listFeedbackQuerySchema } from '../schemas/feedback.js'
import { createFeedback, listFeedback } from '../services/feedbackService.js'

export const feedbackRoute = new Hono()

feedbackRoute.use('*', requireAuth)

// POST /feedback — 인증된 모든 사용자 (asset 피드백 + S10 시스템 피드백)
feedbackRoute.post('/', async (c) => {
  const user = c.get('user')

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: '요청 본문이 JSON 형식이 아닙니다' } },
      400,
    )
  }

  const parsed = createFeedbackSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } },
      400,
    )
  }

  try {
    const result = createFeedback({
      userId: user.sub,
      assetId: parsed.data.asset_id,
      feedbackType: parsed.data.feedback_type,
      content: parsed.data.content,
    }, sqlite)
    return c.json({ ok: true, data: result }, 201)
  } catch {
    return c.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: '피드백 제출 중 오류가 발생했습니다' } },
      500,
    )
  }
})

// GET /feedback — reviewer+ 전용 (member 403)
feedbackRoute.get('/', (c) => {
  const user = c.get('user')

  if (user.role === 'member') {
    return c.json(
      { ok: false, error: { code: 'FORBIDDEN', message: '피드백 목록은 reviewer+ 권한 필요' } },
      403,
    )
  }

  const parsed = listFeedbackQuerySchema.safeParse(c.req.query())
  const assetId = parsed.success ? parsed.data.asset_id : undefined

  const items = listFeedback({ assetId }, sqlite)
  return c.json({ ok: true, data: { items } })
})
