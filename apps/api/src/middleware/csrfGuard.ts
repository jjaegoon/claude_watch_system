import type { MiddlewareHandler } from 'hono'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const parseAllowed = (): string[] =>
  (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * T-17 CSRF: Origin/Referer 헤더 검증.
 * SAFE_METHODS 통과 / `/hooks/`·`/assets/sync` 예외(Bearer/HMAC) /
 * 그 외 mutation은 CORS_ALLOWED_ORIGINS startsWith 일치 필수.
 * 실패 시 403 FORBIDDEN.
 */
export const csrfGuard: MiddlewareHandler = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next()

  const path = new URL(c.req.url).pathname
  if (path.startsWith('/hooks/') || path === '/assets/sync') return next()

  const origin = c.req.header('Origin') ?? c.req.header('Referer')
  const allowed = parseAllowed()

  if (!origin || !allowed.some((a) => origin.startsWith(a))) {
    return c.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'Origin 검증 실패' } },
      403,
    )
  }
  return next()
}
