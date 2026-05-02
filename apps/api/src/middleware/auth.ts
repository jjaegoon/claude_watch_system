import type { MiddlewareHandler } from 'hono'
import jwt from 'jsonwebtoken'

export type AuthUser = {
  sub: string
  email: string
  role: 'member' | 'reviewer' | 'admin' | 'system_user'
}

/**
 * JWT Bearer 인증 — 보호 라우트 전용 (Step 3+ 활용).
 * Authorization: Bearer <jwt> 검증 → c.set('user', payload).
 * 실패 시 401 UNAUTHORIZED.
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token 필요' } },
      401,
    )
  }
  const token = header.slice(7)
  const secret = process.env.JWT_ACCESS_SECRET
  if (!secret) {
    return c.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'JWT_ACCESS_SECRET 미설정' } },
      500,
    )
  }
  try {
    const payload = jwt.verify(token, secret) as AuthUser
    c.set('user', payload)
    return next()
  } catch {
    return c.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: '토큰 검증 실패' } },
      401,
    )
  }
}
