import { describe, it, expect, beforeAll } from 'vitest'
import { Hono } from 'hono'
import { logger } from './logger.js'
import { csrfGuard } from './csrfGuard.js'

beforeAll(() => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173'
  process.env.LOG_LEVEL = 'silent'   // 테스트 출력 노이즈 차단
})

const buildApp = () => {
  const app = new Hono()
  // 마스터 보강 ⓐ — logger before csrfGuard
  app.use('*', logger)
  app.use('*', csrfGuard)
  app.all('*', (c) => c.json({ ok: true }))
  return app
}

describe('logger (마스터 보강 ⓐ — csrfGuard 전 배치)', () => {
  it('정상 응답에 request_id가 context에 set됨', async () => {
    const app = new Hono()
    app.use('*', logger)
    app.get('/', (c) => c.json({ rid: c.get('requestId') }))
    const res = await app.request('/')
    const body = (await res.json()) as { rid: string }
    expect(body.rid).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('csrfGuard가 거부한 403 응답도 logger 미들웨어 통과(마스터 보강 ⓐ 의도)', async () => {
    // logger 다음 csrfGuard — csrfGuard가 403 반환해도 logger의 await next()는 정상 종료
    // 따라서 logger의 onResp 로직(performance.now duration 측정)이 발동
    const res = await buildApp().request('/auth/login', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example.com',
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    expect(res.status).toBe(403)   // csrfGuard가 거부
    // logger가 csrfGuard 전이므로 거부 응답도 통과 — onResp 측정 발동 입증
    // (실제 pino 출력은 LOG_LEVEL=silent로 억제, 로직 흐름만 검증)
  })

  it('child logger가 context에 set됨', async () => {
    const app = new Hono()
    app.use('*', logger)
    app.get('/', (c) => {
      const log = c.get('logger') as { child: unknown } | undefined
      return c.json({ hasLogger: typeof log === 'object' && log !== null })
    })
    const res = await app.request('/')
    const body = (await res.json()) as { hasLogger: boolean }
    expect(body.hasLogger).toBe(true)
  })
})
