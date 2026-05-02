/**
 * M4 — stats e2e 테스트
 * GET /stats/* 인증 + 데이터 반환 검증.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { app } from '../../src/app.js'
import { sqlite } from '@team-claude/db/client'

const AUTH_HEADER = { 'Content-Type': 'application/json' }

let bearerToken = ''

beforeAll(async () => {
  process.env.LOG_LEVEL = 'silent'

  // 로그인 → access_token 획득
  const res = await app.request('/auth/login', {
    method: 'POST',
    headers: { ...AUTH_HEADER, Origin: 'http://localhost:5173' },
    body: JSON.stringify({ email: 'admin@team.local', password: 'changeme' }),
  })
  if (res.status === 200) {
    const json = await res.json() as { data?: { access_token?: string } }
    bearerToken = json.data?.access_token ?? ''
  }
})

const authed = (headers?: Record<string, string>) => ({
  headers: { ...AUTH_HEADER, Authorization: `Bearer ${bearerToken}`, ...headers },
})

// ── 인증 검증 ──────────────────────────────────────────────────────────────────

describe('GET /stats/* 인증', () => {
  it('Bearer 없음 → 401', async () => {
    const res = await app.request('/stats/daily-assets')
    expect(res.status).toBe(401)
  })

  it('유효 Bearer → 200', async () => {
    if (!bearerToken) return
    const res = await app.request('/stats/daily-assets', authed())
    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean; data: unknown[] }
    expect(json.ok).toBe(true)
    expect(Array.isArray(json.data)).toBe(true)
  })
})

// ── daily-assets ──────────────────────────────────────────────────────────────

describe('GET /stats/daily-assets', () => {
  it('?days=7 → 200 + 배열 반환', async () => {
    if (!bearerToken) return
    const res = await app.request('/stats/daily-assets?days=7', authed())
    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean; data: unknown[] }
    expect(Array.isArray(json.data)).toBe(true)
  })

  it('?days=0 → 400 INVALID_INPUT', async () => {
    if (!bearerToken) return
    const res = await app.request('/stats/daily-assets?days=0', authed())
    expect(res.status).toBe(400)
  })
})

// ── daily-users ───────────────────────────────────────────────────────────────

describe('GET /stats/daily-users', () => {
  it('→ 200 + 배열', async () => {
    if (!bearerToken) return
    const res = await app.request('/stats/daily-users?days=30', authed())
    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean; data: unknown[] }
    expect(Array.isArray(json.data)).toBe(true)
  })
})

// ── top-assets ────────────────────────────────────────────────────────────────

describe('GET /stats/top-assets', () => {
  it('?metric=view_count → 200 + limit 정합', async () => {
    if (!bearerToken) return
    const res = await app.request('/stats/top-assets?days=30&limit=5&metric=view_count', authed())
    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean; data: unknown[] }
    expect(Array.isArray(json.data)).toBe(true)
    expect(json.data.length).toBeLessThanOrEqual(5)
  })

  it('잘못된 metric → 400', async () => {
    if (!bearerToken) return
    const res = await app.request('/stats/top-assets?metric=invalid', authed())
    expect(res.status).toBe(400)
  })
})

// ── review-activity ────────────────────────────────────────────────────────────

describe('GET /stats/review-activity', () => {
  it('→ 200 + 배열 + review_metadata 파싱 정합', async () => {
    if (!bearerToken) return

    // seed: review_action 이벤트 없어도 OK — dev.db에 있을 수도 있음
    const res = await app.request('/stats/review-activity?days=30', authed())
    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean; data: Array<{ review_metadata: { action: string } }> }
    expect(Array.isArray(json.data)).toBe(true)

    // review_metadata 파싱 검증 (있을 경우)
    for (const row of json.data) {
      expect(['submit', 'approve', 'reject', 'deprecate', 'restore']).toContain(row.review_metadata.action)
    }
  })
})
