import { describe, it, expect, beforeAll } from 'vitest'
import { Hono } from 'hono'
import { csrfGuard } from './csrfGuard.js'

beforeAll(() => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173,http://localhost:3000'
})

const buildApp = () => {
  const app = new Hono()
  app.use('*', csrfGuard)
  app.all('*', (c) => c.json({ ok: true }))
  return app
}

describe('csrfGuard (T-17)', () => {
  it('GET (SAFE_METHODS)는 Origin 없이도 통과', async () => {
    const res = await buildApp().request('/auth/login', { method: 'GET' })
    expect(res.status).toBe(200)
  })

  it('OPTIONS (SAFE_METHODS) 통과', async () => {
    const res = await buildApp().request('/auth/login', { method: 'OPTIONS' })
    expect(res.status).toBe(200)
  })

  it('/hooks/event POST는 외부 Origin이라도 통과 (Bearer 인증 위임)', async () => {
    const res = await buildApp().request('/hooks/event', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example.com',
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    expect(res.status).toBe(200)
  })

  it('/assets/sync POST는 외부 Origin이라도 통과 (HMAC 위임)', async () => {
    const res = await buildApp().request('/assets/sync', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example.com',
        'X-Hub-Signature-256': 'sha256=fake',
      },
      body: '{}',
    })
    expect(res.status).toBe(200)
  })

  it('보호 경로 POST + 외부 Origin → 403 FORBIDDEN', async () => {
    const res = await buildApp().request('/auth/login', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example.com',
        'Content-Type': 'application/json',
      },
      body: '{"email":"x","password":"y"}',
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { ok: boolean; error: { code: string } }
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('보호 경로 POST + 허용 Origin → 통과', async () => {
    const res = await buildApp().request('/auth/login', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    expect(res.status).toBe(200)
  })

  it('보호 경로 POST + Origin 부재 + Referer만 있을 때 통과 (Referer fallback)', async () => {
    const res = await buildApp().request('/auth/login', {
      method: 'POST',
      headers: {
        Referer: 'http://localhost:5173/login',
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    expect(res.status).toBe(200)
  })

  it('보호 경로 POST + Origin·Referer 모두 부재 → 403', async () => {
    const res = await buildApp().request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(403)
  })
})
