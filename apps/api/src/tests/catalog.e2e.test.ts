/**
 * M1 Step 8 — catalog e2e 테스트
 * 전체 앱(app.ts)에 대해 HTTP 수준에서 모든 Step 8 Done-when 시나리오 검증.
 * 실제 dev.db(seed 완료) 사용. 각 describe는 독립적인 JWT 상태(IP 분리 + __resetForTest).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { app } from '../app.js'
import { __resetForTest } from '../services/tokenService.js'

const ORIGIN = 'http://localhost:5173'

beforeAll(() => {
  process.env.CORS_ALLOWED_ORIGINS = `${ORIGIN},http://localhost:3000`
  process.env.JWT_ACCESS_SECRET = 'dev-access-secret-change-in-production'
  process.env.JWT_REFRESH_SECRET = 'dev-refresh-secret-change-in-production'
  process.env.LOG_LEVEL = 'silent'
})

// ── helpers ────────────────────────────────────────────────────────────────

const loginAs = (email: string, password: string, ip: string) =>
  app.request('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      'X-Forwarded-For': ip,
    },
    body: JSON.stringify({ email, password }),
  })

const extractRefreshToken = (res: Response): string => {
  const cookie = res.headers.get('set-cookie') ?? ''
  return cookie.match(/refresh_token=([^;]+)/)?.[1] ?? ''
}

const refreshWith = (token: string) =>
  app.request('/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      Cookie: `refresh_token=${token}`,
    },
  })

// ── POST /auth/login ───────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  const IP = '10.0.1.1'

  it('정상 로그인 → 200 + access_token + Set-Cookie refresh_token', async () => {
    const res = await loginAs('admin@team.local', 'changeme', IP)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { access_token: string; user: { email: string; role: string } }
    expect(typeof body.access_token).toBe('string')
    expect(body.access_token.length).toBeGreaterThan(0)
    expect(body.user.email).toBe('admin@team.local')
    expect(body.user.role).toBe('admin')
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('refresh_token=')
    expect(cookie).toContain('HttpOnly')
  })

  it('Origin=evil → 403 FORBIDDEN (T-17 CSRF 차단)', async () => {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example.com',
        'X-Forwarded-For': IP,
      },
      body: JSON.stringify({ email: 'admin@team.local', password: 'changeme' }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { ok: boolean; error: { code: string } }
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('6회 시도 → 429 RATE_LIMITED + Retry-After: 60 (T-18)', async () => {
    const RATE_IP = '10.0.99.1'
    for (let i = 0; i < 5; i++) {
      await loginAs('admin@team.local', 'wrong-password', RATE_IP)
    }
    const res = await loginAs('admin@team.local', 'changeme', RATE_IP)
    expect(res.status).toBe(429)
    const body = (await res.json()) as { ok: boolean; error: { code: string } }
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('RATE_LIMITED')
    expect(res.headers.get('Retry-After')).toBe('60')
  })
})

// ── POST /auth/refresh — rotation ─────────────────────────────────────────

describe('POST /auth/refresh — rotation', () => {
  const IP = '10.0.2.1'

  beforeAll(() => __resetForTest())

  it('refresh → 200 + 새 access_token + 새 Set-Cookie', async () => {
    const loginRes = await loginAs('admin@team.local', 'changeme', IP)
    const oldToken = extractRefreshToken(loginRes)
    expect(oldToken).toBeTruthy()

    const res = await refreshWith(oldToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { access_token: string }
    expect(typeof body.access_token).toBe('string')
    expect(body.access_token.length).toBeGreaterThan(0)
    const newCookie = res.headers.get('set-cookie') ?? ''
    expect(newCookie).toContain('refresh_token=')
  })

  it('새 access_token으로 GET /assets → 200', async () => {
    const loginRes = await loginAs('reviewer@team.local', 'changeme', IP)
    const token = extractRefreshToken(loginRes)
    const refreshRes = await refreshWith(token)
    const body = (await refreshRes.json()) as { access_token: string }

    const assetsRes = await app.request('/assets', {
      headers: { Authorization: `Bearer ${body.access_token}` },
    })
    expect(assetsRes.status).toBe(200)
  })

  it('old refresh_token 재사용 → 401 UNAUTHORIZED (도난 감지)', async () => {
    const loginRes = await loginAs('alice@team.local', 'changeme', IP)
    const oldToken = extractRefreshToken(loginRes)

    // 첫 번째 refresh (정상 rotation — oldToken은 blacklist 이동)
    await refreshWith(oldToken)

    // 같은 oldToken 재사용 → 도난 탐지 → 401
    const res = await refreshWith(oldToken)
    expect(res.status).toBe(401)
    const body = (await res.json()) as { ok: boolean; error: { code: string } }
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })
})

// ── POST /auth/refresh — blacklistAllByUser ────────────────────────────────

describe('POST /auth/refresh — blacklistAllByUser 도난 후 신규 토큰도 무효', () => {
  const IP = '10.0.2.2'

  beforeAll(() => __resetForTest())

  it('도난 감지 후 신규 발급 토큰 → 401 (blacklistAllByUser)', async () => {
    // alice 2회 로그인 → 두 개의 독립 refresh_token
    const login1 = await loginAs('alice@team.local', 'changeme', IP)
    const token1 = extractRefreshToken(login1)
    const login2 = await loginAs('alice@team.local', 'changeme', IP)
    const token2 = extractRefreshToken(login2)
    expect(token1).not.toBe(token2)

    // token1으로 rotation → rotatedToken 발급, token1 blacklist
    const rotateRes = await refreshWith(token1)
    const rotatedToken = extractRefreshToken(rotateRes)
    expect(rotatedToken).toBeTruthy()

    // token1 재사용 → 도난 의심 → blacklistAllByUser (token2 + rotatedToken 전부 무효화)
    const theftRes = await refreshWith(token1)
    expect(theftRes.status).toBe(401)

    // rotatedToken도 무효화됐는지 확인
    const res = await refreshWith(rotatedToken)
    expect(res.status).toBe(401)
  })
})

// ── GET /assets — 인증 + 검색 + RBAC ─────────────────────────────────────

describe('GET /assets — 인증·검색·draft RBAC', () => {
  const IP = '10.0.3.1'
  let adminToken = ''
  let aliceToken = ''

  beforeAll(async () => {
    __resetForTest()
    const r1 = await loginAs('admin@team.local', 'changeme', IP)
    adminToken = ((await r1.json()) as { access_token: string }).access_token

    const r2 = await loginAs('alice@team.local', 'changeme', IP)
    aliceToken = ((await r2.json()) as { access_token: string }).access_token
  })

  it('미인증 GET /assets → 401 UNAUTHORIZED', async () => {
    const res = await app.request('/assets')
    expect(res.status).toBe(401)
    const body = (await res.json()) as { ok: boolean; error: { code: string } }
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('인증 → 200 + approved 목록만', async () => {
    const res = await app.request('/assets', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { items: Array<{ status: string }> } }
    expect(body.ok).toBe(true)
    expect(body.data.items.length).toBeGreaterThan(0)
    expect(body.data.items.every((a) => a.status === 'approved')).toBe(true)
  })

  it('?q=code-review → 200 (T-27 하이픈 FTS5 처리)', async () => {
    const res = await app.request('/assets?q=code-review', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('?q=코드리 → 200 + 한국어 trigram 매칭 (T-42)', async () => {
    const res = await app.request('/assets?q=%EC%BD%94%EB%93%9C%EB%A6%AC', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { items: Array<{ name: string }> } }
    expect(body.ok).toBe(true)
    expect(body.data.items.some((a) => a.name.includes('코드'))).toBe(true)
  })

  it('?q=코드 (2자) → 400 INVALID_INPUT (trigram 최소 3자, Opt B)', async () => {
    const res = await app.request('/assets?q=%EC%BD%94%EB%93%9C', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { ok: boolean; error: { code: string } }
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('INVALID_INPUT')
  })

  it('draft RBAC: alice → 본인 draft 1개만', async () => {
    const res = await app.request('/assets?status=draft', {
      headers: { Authorization: `Bearer ${aliceToken}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { items: Array<{ status: string }> } }
    expect(body.ok).toBe(true)
    expect(body.data.items.length).toBe(1)
    expect(body.data.items[0]!.status).toBe('draft')
  })

  it('draft RBAC: admin → 전체 draft (alice + bob 포함, ≥2)', async () => {
    const res = await app.request('/assets?status=draft', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { items: unknown[] } }
    expect(body.ok).toBe(true)
    expect(body.data.items.length).toBeGreaterThanOrEqual(2)
  })
})

// ── GET /assets/:id — 상세 + RBAC ─────────────────────────────────────────

describe('GET /assets/:id — 상세 조회 + draft RBAC', () => {
  const IP = '10.0.4.1'
  let adminToken = ''
  let aliceToken = ''
  let bobToken = ''
  let approvedId = ''
  let aliceDraftId = ''

  beforeAll(async () => {
    __resetForTest()
    const r1 = await loginAs('admin@team.local', 'changeme', IP)
    adminToken = ((await r1.json()) as { access_token: string }).access_token

    const r2 = await loginAs('alice@team.local', 'changeme', IP)
    aliceToken = ((await r2.json()) as { access_token: string }).access_token

    const r3 = await loginAs('bob@team.local', 'changeme', IP)
    bobToken = ((await r3.json()) as { access_token: string }).access_token

    // approved 자산 ID 취득
    const listRes = await app.request('/assets', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const listBody = (await listRes.json()) as { data: { items: Array<{ id: string }> } }
    approvedId = listBody.data.items[0]!.id

    // alice 본인 draft ID 취득
    const draftRes = await app.request('/assets?status=draft', {
      headers: { Authorization: `Bearer ${aliceToken}` },
    })
    const draftBody = (await draftRes.json()) as { data: { items: Array<{ id: string }> } }
    aliceDraftId = draftBody.data.items[0]!.id
  })

  it('GET /assets/:id (approved) → 200 + typeFields 포함', async () => {
    const res = await app.request(`/assets/${approvedId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; data: { id: string; typeFields: unknown } }
    expect(body.ok).toBe(true)
    expect(body.data.id).toBe(approvedId)
    expect(body.data).toHaveProperty('typeFields')
  })

  it('GET /assets/:id (valid UUID, 존재하지 않음) → 404 NOT_FOUND', async () => {
    const res = await app.request('/assets/00000000-0000-0000-0000-000000000001', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { ok: boolean; error: { code: string } }
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('alice draft: alice → 200 (본인)', async () => {
    expect(aliceDraftId).toBeTruthy()
    const res = await app.request(`/assets/${aliceDraftId}`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    })
    expect(res.status).toBe(200)
  })

  it('alice draft: bob → 404 (타인 draft 접근 불가, T-19 RBAC)', async () => {
    expect(aliceDraftId).toBeTruthy()
    const res = await app.request(`/assets/${aliceDraftId}`, {
      headers: { Authorization: `Bearer ${bobToken}` },
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('alice draft: admin → 200 (admin은 전체 draft 접근)', async () => {
    expect(aliceDraftId).toBeTruthy()
    const res = await app.request(`/assets/${aliceDraftId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    expect(res.status).toBe(200)
  })
})

// ── GET /health ────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('→ 200 + status=ok + db=ok (T-24)', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; db: string; version: string }
    expect(body.status).toBe('ok')
    expect(body.db).toBe('ok')
    expect(typeof body.version).toBe('string')
  })
})
