import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * apps/api 전용 sqlite connection.
 * packages/db client.ts와 별개 connection이므로 gotcha #8 정합 — 4 PRAGMA 모두 set 필수.
 *
 * 분리 이유: packages/db의 drizzle-orm sql 템플릿이 apps/api에서 ESM import 시
 * type+runtime hoisting 분리로 named export 검출 실패 (tsx + Node v24 ESM strict).
 * 본 connection은 raw better-sqlite3로 query — 같은 dev.db 파일(WAL이라 멀티 connection 안전).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH =
  process.env.DATABASE_URL ?? path.resolve(__dirname, '../../../../data/dev.db')

export const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('busy_timeout = 5000')
sqlite.pragma('synchronous = NORMAL')
sqlite.pragma('foreign_keys = ON')

/** 헬스 체크 — DB 연결 ping (T-24). */
export const pingDb = (): boolean => {
  try {
    sqlite.prepare('SELECT 1').get()
    return true
  } catch {
    return false
  }
}

/** webhook_jobs 큐 pending 카운트 (T-15·T-24 — /health 응답). */
export const getWebhookPendingCount = (): number => {
  const row = sqlite
    .prepare('SELECT COUNT(*) AS c FROM webhook_jobs WHERE status = ?')
    .get('pending') as { c: number } | undefined
  return row?.c ?? 0
}

// ── User row 타입·조회 (Step 3 인증) ─────────────────────────────────────
export type UserRole = 'member' | 'reviewer' | 'admin' | 'system_user'
export type UserRow = {
  id: string
  email: string
  name: string
  local_id: string
  role: UserRole
  password_hash: string
  is_bot: number
  created_at: number
}

export const findUserByEmail = (email: string): UserRow | undefined => {
  return sqlite
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(email) as UserRow | undefined
}

export const findUserById = (id: string): UserRow | undefined => {
  return sqlite
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(id) as UserRow | undefined
}
