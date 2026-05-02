import { sql } from 'drizzle-orm'
import { db } from './client.js'

/**
 * 헬스 체크 — DB 연결 ping (T-24).
 * raw SQL 사용으로 외부 패키지의 drizzle-orm hoisting 타입 분리 문제 회피.
 */
export const pingDb = (): boolean => {
  try {
    db.run(sql`SELECT 1`)
    return true
  } catch {
    return false
  }
}

/**
 * webhook_jobs 큐 pending 카운트 (T-15·T-24 — /health 응답).
 * raw SQL 사용 (drizzle-orm hoisting 우회).
 */
export const getWebhookPendingCount = (): number => {
  const rows = db.all(
    sql`SELECT COUNT(*) AS c FROM webhook_jobs WHERE status = 'pending'`,
  ) as Array<{ c: number }>
  return rows[0]?.c ?? 0
}
