/**
 * U-Mj-5: 피드백 서비스 검증 (S10 시스템 피드백 포함)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { createFeedback, listFeedback } from '../services/feedbackService.js'

let db: ReturnType<typeof Database>

const USER_A = 'user-fb-a'
const ASSET_1 = 'asset-fb-1'

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
    CREATE TABLE feedback (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      asset_id TEXT REFERENCES assets(id),
      feedback_type TEXT NOT NULL CHECK (feedback_type IN ('bug_report', 'improvement', 'system_feedback')),
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'wontfix')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  db.prepare(`INSERT INTO users(id, email, name, local_id, role) VALUES(?,?,?,?,?)`)
    .run(USER_A, 'a@fb.test', 'User A', 'ua', 'member')
  db.prepare(`INSERT INTO assets(id, type, name, tags, author_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?)`)
    .run(ASSET_1, 'skill', 'Feedback Asset', '[]', USER_A, 1000000, 1000000)
})

afterAll(() => { db.close() })

// ─── createFeedback ───────────────────────────────────────────────────────────

describe('createFeedback', () => {
  it('asset 피드백 생성 (bug_report + asset_id)', () => {
    const result = createFeedback({
      userId: USER_A, assetId: ASSET_1,
      feedbackType: 'bug_report', content: 'This is a reproducible bug',
    }, db)
    expect(result.id).toBeDefined()

    const items = listFeedback({ assetId: ASSET_1 }, db)
    const found = items.find(f => f.id === result.id)
    expect(found?.feedbackType).toBe('bug_report')
    expect(found?.status).toBe('open')
  })

  it('S10 시스템 피드백: asset_id = null (nullable 허용)', () => {
    const result = createFeedback({
      userId: USER_A,
      feedbackType: 'system_feedback',
      content: 'System-level improvement suggestion',
    }, db)
    expect(result.id).toBeDefined()

    const all = listFeedback({}, db)
    const found = all.find(f => f.id === result.id)
    expect(found?.assetId).toBeNull()
    expect(found?.feedbackType).toBe('system_feedback')
  })
})

// ─── listFeedback ─────────────────────────────────────────────────────────────

describe('listFeedback', () => {
  it('asset_id 필터: 특정 자산 피드백만 반환', () => {
    const items = listFeedback({ assetId: ASSET_1 }, db)
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items.every(f => f.assetId === ASSET_1)).toBe(true)
  })

  it('필터 없음: 전체 반환, gotcha #18 DESC 정렬', () => {
    const items = listFeedback({}, db)
    expect(items.length).toBeGreaterThanOrEqual(2)
    if (items.length >= 2) {
      expect(items[0]!.createdAt).toBeGreaterThanOrEqual(items[1]!.createdAt)
    }
  })
})
