import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { processNextJob } from './webhookWorker.js'

let db: InstanceType<typeof Database>

const insertJob = (id: string, payload: string, status = 'pending', retryCount = 0) =>
  db.prepare(`
    INSERT INTO webhook_jobs (id, source, payload, status, retry_count, created_at)
    VALUES (?, 'github_pr_merge', ?, ?, ?, unixepoch())
  `).run(id, payload, status, retryCount)

const getJob = (id: string) =>
  db.prepare(`SELECT * FROM webhook_jobs WHERE id = ?`).get(id) as Record<string, unknown>

beforeAll(() => {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE webhook_jobs (
      id           TEXT    PRIMARY KEY NOT NULL,
      source       TEXT    NOT NULL CHECK (source IN ('github_pr_merge')),
      payload      TEXT    NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
      retry_count  INTEGER NOT NULL DEFAULT 0,
      last_error   TEXT,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
      started_at   INTEGER,
      completed_at INTEGER
    )
  `)
})

afterAll(() => db.close())
beforeEach(() => db.exec('DELETE FROM webhook_jobs'))

// ── webhookWorker 단위 테스트 ─────────────────────────────────────────────────

describe('processNextJob (T-15)', () => {
  it('pending 없음 → false 반환', () => {
    expect(processNextJob(db)).toBe(false)
  })

  it('유효한 페이로드 → status=completed', () => {
    insertJob('job-ok', JSON.stringify({ action: 'closed', merged: true, pr: { number: 1 } }))
    const result = processNextJob(db)
    expect(result).toBe(true)
    const job = getJob('job-ok')
    expect(job['status']).toBe('completed')
    expect(job['completed_at']).not.toBeNull()
  })

  it('잘못된 페이로드 → status=failed, retry_count=1', () => {
    insertJob('job-bad', 'INVALID_JSON')
    processNextJob(db)
    const job = getJob('job-bad')
    expect(job['status']).toBe('failed')
    expect(job['retry_count']).toBe(1)
    expect(job['last_error']).toBeTruthy()
  })

  it('retry_count=4 실패 → status=dead_letter', () => {
    insertJob('job-dead', 'INVALID_JSON', 'pending', 4)
    processNextJob(db)
    const job = getJob('job-dead')
    expect(job['status']).toBe('dead_letter')
    expect(job['last_error']).toBeTruthy()
  })

  it('failed 잡도 재시도 대상', () => {
    insertJob('job-retry', 'INVALID_JSON', 'failed', 1)
    processNextJob(db)
    const job = getJob('job-retry')
    expect(job['status']).toBe('failed')
    expect(job['retry_count']).toBe(2)
  })
})
