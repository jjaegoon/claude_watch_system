/**
 * T-15 Webhook 폴링 워커.
 * 1초 간격으로 pending/failed 잡 처리. MAX_RETRIES=5 초과 시 dead_letter.
 * T-20 정합: 상태 전이는 단순 UPDATE (asset_versions snapshot 대상 아님).
 *
 * 주의 (gotcha #8): 새 DB connection 열 시 4 PRAGMA 재설정 의무.
 * 본 워커는 apps/api sqlite 싱글톤을 공유 — 별도 connection 불필요.
 */
import Database from 'better-sqlite3'
import { sqlite } from '@team-claude/db/client'

const MAX_RETRIES = 5

interface WebhookJob {
  id: string
  source: string
  payload: string
  retry_count: number
}

const now = (): number => Math.floor(Date.now() / 1000)

function handleJob(job: WebhookJob): void {
  const payload = JSON.parse(job.payload) as unknown
  if (!payload || typeof payload !== 'object') {
    throw new Error('invalid webhook payload: not an object')
  }
  // M2: 페이로드 검증만 수행. M3에서 자산 sync 로직 추가.
}

/** 대기 중인 잡 1건 처리. 처리 시 true, 잡 없으면 false 반환. */
export const processNextJob = (db: InstanceType<typeof Database> = sqlite): boolean => {
  const job = db.prepare(`
    SELECT id, source, payload, retry_count
    FROM webhook_jobs
    WHERE status IN ('pending', 'failed') AND retry_count < ?
    ORDER BY created_at, rowid
    LIMIT 1
  `).get(MAX_RETRIES) as WebhookJob | undefined

  if (!job) return false

  const ts = now()
  db.prepare(`UPDATE webhook_jobs SET status = 'processing', started_at = ? WHERE id = ?`)
    .run(ts, job.id)

  try {
    handleJob(job)
    db.prepare(`UPDATE webhook_jobs SET status = 'completed', completed_at = ? WHERE id = ?`)
      .run(ts, job.id)
  } catch (err) {
    const newCount = job.retry_count + 1
    if (newCount >= MAX_RETRIES) {
      db.prepare(`UPDATE webhook_jobs SET status = 'dead_letter', last_error = ? WHERE id = ?`)
        .run(String(err), job.id)
    } else {
      db.prepare(`UPDATE webhook_jobs SET status = 'failed', retry_count = ?, last_error = ? WHERE id = ?`)
        .run(newCount, String(err), job.id)
    }
  }

  return true
}

/** 1초 간격 폴링 워커 시작. 반환된 timer로 정지 가능. */
export const startWorker = (db?: InstanceType<typeof Database>): ReturnType<typeof setInterval> =>
  setInterval(() => {
    try { processNextJob(db) } catch { /* absorb unexpected errors */ }
  }, 1000)
