/**
 * U-Mj-2: 알림 서비스 + C-1 RBAC 검증
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { listNotifications, markRead } from '../services/notificationService.js'

let db: ReturnType<typeof Database>

const USER_A = 'user-notif-a'
const USER_B = 'user-notif-b'
const ASSET_1 = 'asset-notif-1'
const NOTIF_APPROVED = crypto.randomUUID()
const NOTIF_REJECTED = crypto.randomUUID()

beforeAll(() => {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      local_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
      password_hash TEXT NOT NULL DEFAULT '', is_bot INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE assets (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
      tags TEXT NOT NULL DEFAULT '[]', author_id TEXT REFERENCES users(id),
      version TEXT NOT NULL DEFAULT '1.0.0', status TEXT NOT NULL DEFAULT 'draft',
      source_path TEXT, type_fields TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      event_type TEXT NOT NULL CHECK (event_type IN ('review_approved', 'review_rejected', 'asset_published')),
      asset_id TEXT REFERENCES assets(id),
      metadata TEXT NOT NULL DEFAULT '{}',
      read_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  db.prepare(`INSERT INTO users(id, email, name, local_id, role) VALUES(?,?,?,?,?)`)
    .run(USER_A, 'a@notif.test', 'User A', 'ua', 'member')
  db.prepare(`INSERT INTO users(id, email, name, local_id, role) VALUES(?,?,?,?,?)`)
    .run(USER_B, 'b@notif.test', 'User B', 'ub', 'member')
  db.prepare(`INSERT INTO assets(id, type, name, tags, author_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?)`)
    .run(ASSET_1, 'skill', 'Notif Asset', '[]', USER_A, 1000000, 1000000)

  const BASE = Math.floor(Date.now() / 1000)
  db.prepare(`INSERT INTO notifications(id, user_id, event_type, asset_id, metadata, created_at) VALUES(?,?,?,?,?,?)`)
    .run(NOTIF_APPROVED, USER_A, 'review_approved', ASSET_1, '{}', BASE + 1)
  db.prepare(`INSERT INTO notifications(id, user_id, event_type, asset_id, metadata, created_at) VALUES(?,?,?,?,?,?)`)
    .run(NOTIF_REJECTED, USER_A, 'review_rejected', ASSET_1, '{}', BASE + 2)
})

afterAll(() => { db.close() })

// ─── listNotifications ────────────────────────────────────────────────────────

describe('listNotifications', () => {
  it('자신의 알림 반환 (최신순, gotcha #18 compound ORDER BY)', () => {
    const result = listNotifications(USER_A, false, db)
    expect(result.items.length).toBeGreaterThanOrEqual(2)
    expect(result.items.every(n => n.userId === USER_A)).toBe(true)
    // 최신순 정렬 검증
    if (result.items.length >= 2) {
      expect(result.items[0]!.createdAt).toBeGreaterThanOrEqual(result.items[1]!.createdAt)
    }
  })

  it('C-1 RBAC: USER_B는 알림 0건 (타인 알림 차단)', () => {
    const result = listNotifications(USER_B, false, db)
    expect(result.items.length).toBe(0)
    expect(result.unread_count).toBe(0)
  })

  it('unreadOnly=true: read_at IS NULL인 알림만', () => {
    const result = listNotifications(USER_A, true, db)
    expect(result.items.every(n => n.readAt === null)).toBe(true)
    expect(result.unread_count).toBeGreaterThanOrEqual(1)
  })
})

// ─── markRead ─────────────────────────────────────────────────────────────────

describe('markRead', () => {
  it('본인 알림 read_at 갱신 성공', () => {
    const result = markRead(NOTIF_APPROVED, USER_A, db)
    expect(result).not.toBeNull()
    expect(result?.id).toBe(NOTIF_APPROVED)
    expect(result?.read_at).toBeGreaterThan(0)
  })

  it('C-1 RBAC: 타인 알림 mark-read 차단 (null 반환)', () => {
    // USER_B가 USER_A의 알림을 읽으려 시도
    const result = markRead(NOTIF_REJECTED, USER_B, db)
    expect(result).toBeNull()
    // USER_A 알림은 여전히 unread
    const check = listNotifications(USER_A, true, db)
    expect(check.items.some(n => n.id === NOTIF_REJECTED)).toBe(true)
  })
})
