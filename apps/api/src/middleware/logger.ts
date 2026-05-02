import type { MiddlewareHandler } from 'hono'
import { pino } from 'pino'

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'team-claude-api' },
})

export type RequestLogger = typeof baseLogger

/**
 * pino 기반 요청 로깅 (마스터 보강 ⓐ — csrfGuard 전 배치).
 * 필드: method, path, status, duration_ms, request_id.
 * 거부 응답(403)도 onResp에서 캡처되어 보안 감사 가능.
 */
export const logger: MiddlewareHandler = async (c, next) => {
  const requestId = crypto.randomUUID()
  const start = performance.now()
  const method = c.req.method
  const path = new URL(c.req.url).pathname

  c.set('requestId', requestId)
  c.set('logger', baseLogger.child({ request_id: requestId }))

  await next()

  const duration_ms = Math.round(performance.now() - start)
  baseLogger.info({
    request_id: requestId,
    method,
    path,
    status: c.res.status,
    duration_ms,
  })
}
