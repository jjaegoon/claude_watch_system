import { describe, it, expect, beforeAll } from 'vitest'
import { Hono } from 'hono'
import { healthRoute } from './health.js'

beforeAll(() => {
  process.env.LOG_LEVEL = 'silent'
})

describe('routes/health (T-24)', () => {
  it('GET /health → 200 + 6 필드 (dev.db 정상)', async () => {
    const app = new Hono()
    app.route('/health', healthRoute)
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      status: string
      db: string
      queue_size: number
      webhook_jobs_pending: number
      version: string
      uptime_seconds: number
    }
    expect(body.status).toBe('ok')
    expect(body.db).toBe('ok')
    expect(typeof body.queue_size).toBe('number')
    expect(body.queue_size).toBeGreaterThanOrEqual(0)
    expect(typeof body.webhook_jobs_pending).toBe('number')
    expect(body.webhook_jobs_pending).toBeGreaterThanOrEqual(0)
    expect(typeof body.version).toBe('string')
    expect(body.version.length).toBeGreaterThan(0)
    expect(typeof body.uptime_seconds).toBe('number')
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0)
  })
})
