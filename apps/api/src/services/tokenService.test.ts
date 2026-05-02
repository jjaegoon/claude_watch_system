import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  blacklistToken,
  blacklistAllByUser,
  isBlacklisted,
  __resetForTest,
  type JwtPayload,
} from './tokenService.js'

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32chars-ABCDEFGH'
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32chars-WXYZ12'
})

beforeEach(() => {
  __resetForTest()
})

const payload: JwtPayload = { sub: 'u-1', email: 'a@b.c', role: 'member' }

describe('tokenService (T-18 마스터 보강 ②)', () => {
  it('access_token 왕복: sign → verify → 동일 payload', () => {
    const tok = signAccessToken(payload)
    const decoded = verifyAccessToken(tok)
    expect(decoded.sub).toBe('u-1')
    expect(decoded.email).toBe('a@b.c')
    expect(decoded.role).toBe('member')
  })

  it('refresh_token 왕복: sign → verify → 동일 payload', () => {
    const tok = signRefreshToken(payload)
    const decoded = verifyRefreshToken(tok)
    expect(decoded.sub).toBe('u-1')
  })

  it('blacklistToken → isBlacklisted true (refresh_token)', () => {
    const tok = signRefreshToken(payload)
    expect(isBlacklisted(tok)).toBe(false)
    blacklistToken(tok)
    expect(isBlacklisted(tok)).toBe(true)
  })

  it('blacklistAllByUser: 같은 user의 모든 refresh_token 무효화 (마스터 보강 ②)', () => {
    const t1 = signRefreshToken(payload)
    const t2 = signRefreshToken(payload)
    const t3 = signRefreshToken(payload)
    expect(isBlacklisted(t1)).toBe(false)
    expect(isBlacklisted(t2)).toBe(false)
    expect(isBlacklisted(t3)).toBe(false)

    blacklistAllByUser(payload.sub)

    expect(isBlacklisted(t1)).toBe(true)
    expect(isBlacklisted(t2)).toBe(true)
    expect(isBlacklisted(t3)).toBe(true)
  })

  it('blacklistAllByUser는 다른 user의 refresh_token에 영향 없음', () => {
    const otherPayload: JwtPayload = { sub: 'u-2', email: 'x@y.z', role: 'admin' }
    const u1Token = signRefreshToken(payload)
    const u2Token = signRefreshToken(otherPayload)

    blacklistAllByUser(payload.sub)

    expect(isBlacklisted(u1Token)).toBe(true)
    expect(isBlacklisted(u2Token)).toBe(false) // u-2는 영향 없음
  })

  it('access_token은 userTokens map에 추적되지 않음 (refresh_token만 추적)', () => {
    const access = signAccessToken(payload)
    blacklistAllByUser(payload.sub) // refresh_token만 blacklist
    // access_token은 stateless라 isBlacklisted 검사 대상이 아님 — 단지 추적 외 입증
    expect(isBlacklisted(access)).toBe(false)
  })

  it('blacklistAllByUser 후 새 refresh_token은 정상 발급 (재로그인 시나리오)', () => {
    const oldToken = signRefreshToken(payload)
    blacklistAllByUser(payload.sub)
    expect(isBlacklisted(oldToken)).toBe(true)

    // 재로그인 — 새 token 발급
    const newToken = signRefreshToken(payload)
    expect(isBlacklisted(newToken)).toBe(false)
  })

  it('verifyAccessToken: 잘못된 서명 → 예외', () => {
    expect(() => verifyAccessToken('not.a.jwt')).toThrow()
  })
})
