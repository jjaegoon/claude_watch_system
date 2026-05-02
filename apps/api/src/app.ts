import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from './middleware/logger.js'
import { csrfGuard } from './middleware/csrfGuard.js'
import { healthRoute } from './routes/health.js'

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const app = new Hono()

// 마스터 보강 ⓐ — 미들웨어 체인 순서: CORS → logger → csrfGuard → routes.
// logger를 csrfGuard 전에 배치 → 거부 응답(403)도 onResp에서 로그됨.
app.use(
  '*',
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Hub-Signature-256'],
    maxAge: 86400,
  }),
)
app.use('*', logger)
app.use('*', csrfGuard)

app.route('/health', healthRoute)

// 명시적 not-found 핸들러 — conventions §API 응답 형식 정합
app.notFound((c) =>
  c.json(
    { ok: false, error: { code: 'NOT_FOUND', message: 'Route not found' } },
    404,
  ),
)

app.onError((err, c) => {
  c.get('logger')?.error({ err }, 'unhandled error')
  return c.json(
    { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    500,
  )
})
