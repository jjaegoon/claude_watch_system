import { Hono } from 'hono'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import bcrypt from 'bcrypt'
import { loginRateLimit } from '../middleware/loginRateLimit.js'
import { loginSchema, refreshBodySchema } from '../schemas/auth.js'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  blacklistToken,
  blacklistAllByUser,
  isBlacklisted,
  type JwtPayload,
} from '../services/tokenService.js'
import { findUserByEmail, findUserById, type UserRow } from '../lib/db.js'

const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 // seconds (30d)

const isProd = (): boolean => process.env.NODE_ENV === 'production'

const refreshCookieOptions = () =>
  ({
    httpOnly: true,
    secure: isProd(),
    sameSite: 'Strict' as const,
    path: '/auth',
    maxAge: REFRESH_MAX_AGE,
  }) as const

const userPayload = (u: UserRow): JwtPayload => ({
  sub: u.id,
  email: u.email,
  role: u.role,
})

const userPublic = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
})

export const authRoute = new Hono()

// ── POST /auth/login (T-18 rate limit) ────────────────────────────────────
authRoute.post('/login', loginRateLimit, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: '입력 검증 실패' } },
      400,
    )
  }
  const { email, password } = parsed.data
  const user = findUserByEmail(email)
  // T-34 정합 — bot 계정 로그인 차단
  if (!user || user.isBot || user.role === 'system_user') {
    return c.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: '잘못된 자격 증명' } },
      401,
    )
  }
  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) {
    return c.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: '잘못된 자격 증명' } },
      401,
    )
  }
  const payload = userPayload(user)
  const access_token = signAccessToken(payload)
  const refresh_token = signRefreshToken(payload)
  setCookie(c, 'refresh_token', refresh_token, refreshCookieOptions())
  return c.json({ access_token, user: userPublic(user) })
})

// ── POST /auth/refresh (T-18 회전 + 도난 감지) ───────────────────────────
authRoute.post('/refresh', async (c) => {
  let token = getCookie(c, 'refresh_token')
  if (!token) {
    const body = await c.req.json().catch(() => null)
    const parsed = refreshBodySchema.safeParse(body)
    if (parsed.success) token = parsed.data.refresh_token
  }
  if (!token) {
    return c.json(
      {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Refresh 토큰이 유효하지 않습니다.' },
      },
      401,
    )
  }

  // 1. blacklist 우선 확인 — 도난 의심
  if (isBlacklisted(token)) {
    let userId: string | undefined
    try {
      const decoded = verifyRefreshToken(token)
      userId = decoded.sub
    } catch {
      // 서명 실패해도 도난일 수 있으나 user 식별 불가 → blacklist만
    }
    if (userId) blacklistAllByUser(userId)
    return c.json(
      {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Refresh 토큰이 유효하지 않습니다.' },
      },
      401,
    )
  }

  // 2. 서명·만료 검증
  let payload: JwtPayload
  try {
    payload = verifyRefreshToken(token)
  } catch {
    return c.json(
      {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Refresh 토큰이 유효하지 않습니다.' },
      },
      401,
    )
  }

  // 3. 회전 — 이전 토큰 blacklist + 새 발급
  blacklistToken(token)

  // user 정보 갱신 (role 변경 가능성)
  const user = findUserById(payload.sub)
  if (!user || user.isBot) {
    return c.json(
      {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Refresh 토큰이 유효하지 않습니다.' },
      },
      401,
    )
  }
  const newPayload = userPayload(user)
  const access_token = signAccessToken(newPayload)
  const new_refresh = signRefreshToken(newPayload)
  setCookie(c, 'refresh_token', new_refresh, refreshCookieOptions())
  return c.json({ access_token, user: userPublic(user) })
})

// ── POST /auth/logout ─────────────────────────────────────────────────────
authRoute.post('/logout', async (c) => {
  const token = getCookie(c, 'refresh_token')
  if (token) blacklistToken(token)
  deleteCookie(c, 'refresh_token', { path: '/auth' })
  return c.body(null, 204)
})
