import jwt from 'jsonwebtoken'
import type { UserRole } from '../lib/db.js'

/**
 * T-18 tokenService — refresh_token 회전 + 도난 감지.
 *
 * 마스터 보강 ②: blacklistAllByUser는 동시 발급된 모든 refresh_token을 한 번에
 * 무효화하여, 도난 감지 시 단순 add보다 강한 보장 제공.
 *
 * 본 모듈은 refresh_token만 추적·블랙리스트한다.
 *   - access_token은 stateless·24h 자동 만료 → blacklist 의미 없음(재발급으로 회수 불가).
 *   - refresh_token은 30d 장기 유효 + 회전 → blacklist 필요.
 */

export type JwtPayload = {
  sub: string
  email: string
  role: UserRole
}

const ACCESS_TTL = '24h'
const REFRESH_TTL = '30d'
const BLACKLIST_TTL_MS = 24 * 60 * 60 * 1000
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000

const tokenBlacklist = new Map<string, number>() // refresh_token → expireAt(ms)
const userTokens = new Map<string, Set<string>>() // userId → Set<refresh_token>

const now = (): number => Date.now()

const cleanup = (): void => {
  const t = now()
  for (const [token, expireAt] of tokenBlacklist) {
    if (expireAt < t) tokenBlacklist.delete(token)
  }
}

const interval = setInterval(cleanup, CLEANUP_INTERVAL_MS)
// process 종료 시 자동 회수 — vitest worker hang 방지
if (typeof interval.unref === 'function') interval.unref()

const accessSecret = (): string => {
  const s = process.env.JWT_ACCESS_SECRET
  if (!s) throw new Error('JWT_ACCESS_SECRET 미설정')
  return s
}

const refreshSecret = (): string => {
  const s = process.env.JWT_REFRESH_SECRET
  if (!s) throw new Error('JWT_REFRESH_SECRET 미설정')
  return s
}

// jti 추가 — 동일 payload + 동일 시각 호출 시 deterministic JWT 충돌 방지
const newJti = (): string =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)

export const signAccessToken = (payload: JwtPayload): string =>
  jwt.sign(payload, accessSecret(), { expiresIn: ACCESS_TTL, jwtid: newJti() })

export const signRefreshToken = (payload: JwtPayload): string => {
  const token = jwt.sign(payload, refreshSecret(), {
    expiresIn: REFRESH_TTL,
    jwtid: newJti(),
  })
  let set = userTokens.get(payload.sub)
  if (!set) {
    set = new Set()
    userTokens.set(payload.sub, set)
  }
  set.add(token)
  return token
}

export const verifyAccessToken = (token: string): JwtPayload =>
  jwt.verify(token, accessSecret()) as JwtPayload

export const verifyRefreshToken = (token: string): JwtPayload =>
  jwt.verify(token, refreshSecret()) as JwtPayload

export const blacklistToken = (token: string): void => {
  tokenBlacklist.set(token, now() + BLACKLIST_TTL_MS)
}

/**
 * 도난 감지 시 호출 — 같은 user의 모든 refresh_token을 일괄 blacklist.
 * userTokens map의 token set을 비우고 다시 로그인 시 새 set 시작.
 */
export const blacklistAllByUser = (userId: string): void => {
  const set = userTokens.get(userId)
  if (!set) return
  for (const token of set) blacklistToken(token)
  userTokens.delete(userId)
}

export const isBlacklisted = (token: string): boolean => {
  const expireAt = tokenBlacklist.get(token)
  if (expireAt === undefined) return false
  if (expireAt < now()) {
    tokenBlacklist.delete(token)
    return false
  }
  return true
}

/** 테스트 전용 — 모든 state 초기화. */
export const __resetForTest = (): void => {
  tokenBlacklist.clear()
  userTokens.clear()
}
