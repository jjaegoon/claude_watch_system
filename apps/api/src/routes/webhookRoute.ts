/**
 * T-15 Webhook 수신 엔드포인트.
 * HMAC-SHA256(X-Hub-Signature-256) 검증 후 webhook_jobs INSERT.
 * csrfGuard는 /assets/sync 를 예외 처리(Bearer/HMAC auth 사용).
 */
import { Hono } from 'hono'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { sqlite } from '@team-claude/db/client'

export const webhookRoute = new Hono()

webhookRoute.post('/sync', async (c) => {
  const signature = c.req.header('X-Hub-Signature-256')
  if (!signature) {
    return c.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'X-Hub-Signature-256 헤더 필요' } },
      401,
    )
  }

  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) {
    return c.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Webhook secret 미설정' } },
      500,
    )
  }

  const body = await c.req.text()
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')

  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return c.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'Webhook 서명 검증 실패' } },
      401,
    )
  }

  try {
    const id = crypto.randomUUID()
    const ts = Math.floor(Date.now() / 1000)
    sqlite.prepare(`
      INSERT INTO webhook_jobs (id, source, payload, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, 'github_pr_merge', body, ts)

    return c.json({ ok: true, data: { id } })
  } catch {
    return c.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Webhook 저장 실패' } },
      500,
    )
  }
})
