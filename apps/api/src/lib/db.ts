import { eq, sql } from 'drizzle-orm'
import { db } from '@team-claude/db/client'
import { users, webhookJobs } from '@team-claude/db/schema'
import type { InferSelectModel } from 'drizzle-orm'

/**
 * T-40 옵션 B-2 회복 — packages/db의 client·schema 직접 사용.
 * Step 2의 자체 better-sqlite3 connection 우회는 제거 (gotcha #9 해결 후).
 */

export type UserRow = InferSelectModel<typeof users>
export type UserRole = UserRow['role']

export const findUserByEmail = (email: string): UserRow | undefined =>
  db.select().from(users).where(eq(users.email, email)).get()

export const findUserById = (id: string): UserRow | undefined =>
  db.select().from(users).where(eq(users.id, id)).get()

/** 헬스 체크 — DB 연결 ping (T-24). */
export const pingDb = (): boolean => {
  try {
    db.run(sql`SELECT 1`)
    return true
  } catch {
    return false
  }
}

/** webhook_jobs 큐 pending 카운트 (T-15·T-24 — /health 응답). */
export const getWebhookPendingCount = (): number => {
  const rows = db.all(
    sql`SELECT COUNT(*) AS c FROM webhook_jobs WHERE status = 'pending'`,
  ) as Array<{ c: number }>
  return rows[0]?.c ?? 0
}
