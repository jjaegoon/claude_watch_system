/**
 * T-13 Hooks 수신 라우트.
 * POST /hooks/event — Bearer <HOOKS_API_KEY> 인증 + 이벤트 큐잉.
 * csrfGuard는 /hooks/ 경로 예외 포함 (csrfGuard.ts L14).
 */
import { Hono } from 'hono'
import { hookEventSchema } from '../schemas/hooks.js'
import { enqueueEvent } from '../services/hooksService.js'

export const hooksRoute = new Hono()

hooksRoute.post('/event', async (c) => {
  const authHeader = c.req.header('Authorization')
  const apiKey = process.env.HOOKS_API_KEY

  if (!apiKey) {
    return c.json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'HOOKS_API_KEY 미설정' } }, 500)
  }

  if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
    return c.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Bearer 인증 실패' } }, 401)
  }

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ ok: false, error: { code: 'INVALID_INPUT', message: '유효하지 않은 JSON' } }, 400)
  }

  const parsed = hookEventSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? '스키마 검증 실패' } }, 400)
  }

  enqueueEvent(parsed.data)
  return c.json({ ok: true }, 202)
})
