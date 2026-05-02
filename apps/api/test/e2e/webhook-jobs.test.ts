/**
 * M2 Gate — webhook_jobs e2e 테스트 (T-15)
 * POST /assets/sync HMAC 검증 + DB 삽입 + worker 처리 검증.
 * catalog.e2e.test.ts와 동일 패턴(app.request + dev.db sqlite).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createHmac } from 'node:crypto'
import { app } from '../../src/app.js'
import { sqlite } from '@team-claude/db/client'
import { processNextJob } from '../../src/workers/webhookWorker.js'

const WEBHOOK_SECRET = 'test-webhook-secret-m2'
const PAYLOAD = JSON.stringify({ action: 'closed', merged: true, pull_request: { number: 42, title: 'feat: add skill' } })

const sign = (body: string) =>
  'sha256=' + createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')

beforeAll(() => {
  process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET
  process.env.LOG_LEVEL = 'silent'
  // 테스트 잔여물 정리
  sqlite.prepare(`DELETE FROM webhook_jobs WHERE source = 'github_pr_merge' AND payload LIKE '%feat: add skill%'`).run()
})

// ── POST /assets/sync (T-15 HMAC 검증) ──────────────────────────────────────

describe('POST /assets/sync (T-15)', () => {
  it('유효한 HMAC → 200 + webhook_jobs INSERT', async () => {
    const res = await app.request('/assets/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': sign(PAYLOAD),
      },
      body: PAYLOAD,
    })

    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean; data?: { id: string } }
    expect(json.ok).toBe(true)
    expect(json.data?.id).toBeTruthy()

    // DB에 잡이 삽입되었는지 확인
    const job = sqlite.prepare(`SELECT * FROM webhook_jobs WHERE id = ?`).get(json.data!.id) as Record<string, unknown>
    expect(job).not.toBeNull()
    expect(job['status']).toBe('pending')
    expect(job['source']).toBe('github_pr_merge')
  })

  it('X-Hub-Signature-256 헤더 없음 → 401', async () => {
    const res = await app.request('/assets/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: PAYLOAD,
    })
    expect(res.status).toBe(401)
  })

  it('잘못된 서명 → 401', async () => {
    const res = await app.request('/assets/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': 'sha256=invalid_signature',
      },
      body: PAYLOAD,
    })
    expect(res.status).toBe(401)
  })

  it('worker가 pending 잡 처리 → status=completed', async () => {
    // insert a job
    const res = await app.request('/assets/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': sign(PAYLOAD),
      },
      body: PAYLOAD,
    })
    const json = await res.json() as { ok: boolean; data?: { id: string } }
    const jobId = json.data!.id

    // drain all pending jobs (earlier tests may have left pending jobs)
    let drained = 0
    while (processNextJob(sqlite) && drained++ < 10) { /* drain */ }

    const job = sqlite.prepare(`SELECT status FROM webhook_jobs WHERE id = ?`).get(jobId) as { status: string } | undefined
    expect(job?.status).toBe('completed')
  })
})
