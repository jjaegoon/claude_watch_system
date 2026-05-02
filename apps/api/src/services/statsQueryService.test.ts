/**
 * M4 statsQueryService 단위 테스트 (보강 #4 포함)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { getDailyAssetStats, getDailyUserStats, getTopAssets, getReviewActivity } from './statsQueryService.js'

const makeDb = (): InstanceType<typeof Database> => {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE assets (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'skill',
      status TEXT NOT NULL DEFAULT 'approved', description TEXT,
      tags TEXT NOT NULL DEFAULT '[]', author_id TEXT,
      version TEXT NOT NULL DEFAULT '1.0.0', source_path TEXT,
      type_fields TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE daily_asset_stats (
      id TEXT PRIMARY KEY NOT NULL,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      stat_date TEXT NOT NULL,
      view_count INTEGER NOT NULL DEFAULT 0,
      install_count INTEGER NOT NULL DEFAULT 0,
      trigger_count INTEGER NOT NULL DEFAULT 0,
      feedback_count INTEGER NOT NULL DEFAULT 0,
      avg_rating_x100 INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(asset_id, stat_date)
    );
    CREATE TABLE daily_user_stats (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      stat_date TEXT NOT NULL,
      session_count INTEGER NOT NULL DEFAULT 0,
      tool_call_count INTEGER NOT NULL DEFAULT 0,
      active_minutes INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, stat_date)
    );
    CREATE TABLE usage_events (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      session_id TEXT,
      event_type TEXT NOT NULL,
      asset_id TEXT REFERENCES assets(id),
      tool_name TEXT,
      file_path TEXT,
      ts INTEGER NOT NULL DEFAULT (unixepoch()),
      metadata TEXT NOT NULL DEFAULT '{}',
      review_metadata TEXT,
      CHECK (
        (event_type = 'review_action' AND review_metadata IS NOT NULL) OR
        (event_type != 'review_action')
      )
    );
  `)
  return db
}

let db: InstanceType<typeof Database>

beforeEach(() => { db = makeDb() })
afterEach(() => { db.close() })

const insertAsset = (id: string, name: string) =>
  db.prepare(`INSERT INTO assets (id, name, type, status) VALUES (?, ?, 'skill', 'approved')`).run(id, name)

const insertDailyAsset = (assetId: string, date: string, v: number, i: number, t: number) =>
  db.prepare(`INSERT INTO daily_asset_stats (id, asset_id, stat_date, view_count, install_count, trigger_count)
    VALUES (?, ?, ?, ?, ?, ?)`).run(crypto.randomUUID(), assetId, date, v, i, t)

const insertDailyUser = (userId: string, date: string, s: number, tc: number) =>
  db.prepare(`INSERT INTO daily_user_stats (id, user_id, stat_date, session_count, tool_call_count)
    VALUES (?, ?, ?, ?, ?)`).run(crypto.randomUUID(), userId, date, s, tc)

const insertReviewEvent = (userId: string, assetId: string, action: string, ts?: number) =>
  db.prepare(`INSERT INTO usage_events (id, user_id, event_type, asset_id, ts, metadata, review_metadata)
    VALUES (?, ?, 'review_action', ?, ?, '{}', ?)`).run(
    crypto.randomUUID(), userId, assetId,
    ts ?? Math.floor(Date.now() / 1000),
    JSON.stringify({ actor_id: userId, action, reason_code: null, comment: null }),
  )

// ── getDailyAssetStats ────────────────────────────────────────────────────────

describe('getDailyAssetStats', () => {
  it('데이터 없음 → 빈 배열', () => {
    expect(getDailyAssetStats(db, 30)).toEqual([])
  })

  it('당일 데이터 → 합산 반환', () => {
    insertAsset('a1', 'skill-one')
    insertAsset('a2', 'skill-two')
    const today = new Date().toISOString().slice(0, 10)
    insertDailyAsset('a1', today, 5, 2, 1)
    insertDailyAsset('a2', today, 3, 1, 0)

    const rows = getDailyAssetStats(db, 30)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.stat_date).toBe(today)
    expect(rows[0]!.view_count).toBe(8)
    expect(rows[0]!.install_count).toBe(3)
    expect(rows[0]!.trigger_count).toBe(1)
  })

  it('days 범위 밖 데이터 → 제외', () => {
    insertAsset('a3', 'skill-three')
    insertDailyAsset('a3', '2020-01-01', 100, 50, 20)
    expect(getDailyAssetStats(db, 30)).toHaveLength(0)
  })

  it('날짜 ASC 정렬', () => {
    insertAsset('a4', 'skill-four')
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    insertDailyAsset('a4', today, 1, 0, 0)
    insertDailyAsset('a4', yesterday, 2, 0, 0)

    const rows = getDailyAssetStats(db, 30)
    expect(rows[0]!.stat_date <= rows[rows.length - 1]!.stat_date).toBe(true)
  })
})

// ── getDailyUserStats ─────────────────────────────────────────────────────────

describe('getDailyUserStats', () => {
  it('데이터 없음 → 빈 배열', () => {
    expect(getDailyUserStats(db, 30)).toEqual([])
  })

  it('session_count + tool_call_count 합산', () => {
    const today = new Date().toISOString().slice(0, 10)
    insertDailyUser('u1', today, 3, 15)
    insertDailyUser('u2', today, 2, 10)

    const rows = getDailyUserStats(db, 30)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.session_count).toBe(5)
    expect(rows[0]!.tool_call_count).toBe(25)
  })
})

// ── getTopAssets ──────────────────────────────────────────────────────────────

describe('getTopAssets', () => {
  it('데이터 없음 → 빈 배열', () => {
    expect(getTopAssets(db, 30, 10, 'view_count')).toEqual([])
  })

  it('view_count 기준 정렬 + limit', () => {
    insertAsset('b1', 'top-skill')
    insertAsset('b2', 'low-skill')
    const today = new Date().toISOString().slice(0, 10)
    insertDailyAsset('b1', today, 100, 5, 2)
    insertDailyAsset('b2', today, 10, 1, 0)

    const rows = getTopAssets(db, 30, 1, 'view_count')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.asset_id).toBe('b1')
    expect(rows[0]!.view_count).toBe(100)
  })

  it('install_count metric 정렬', () => {
    insertAsset('c1', 'install-leader')
    insertAsset('c2', 'view-leader')
    const today = new Date().toISOString().slice(0, 10)
    insertDailyAsset('c1', today, 5, 50, 0)
    insertDailyAsset('c2', today, 100, 1, 0)

    const rows = getTopAssets(db, 30, 10, 'install_count')
    expect(rows[0]!.asset_id).toBe('c1')
  })
})

// ── getReviewActivity (보강 #4) ───────────────────────────────────────────────

describe('getReviewActivity (보강 #4)', () => {
  it('review_action 없음 → 빈 배열', () => {
    expect(getReviewActivity(db, 30)).toEqual([])
  })

  it('submit 이벤트 → ReviewEventMetadataSchema 파싱 성공', () => {
    insertAsset('d1', 'review-asset')
    insertReviewEvent('u1', 'd1', 'submit')

    const rows = getReviewActivity(db, 30)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.review_metadata.action).toBe('submit')
    expect(rows[0]!.review_metadata.actor_id).toBe('u1')
    expect(rows[0]!.review_metadata.reason_code).toBeNull()
  })

  it('잘못된 review_metadata JSON → 해당 행 제외 (flatMap 필터)', () => {
    // review_metadata가 누락된 경우 CHECK constraint가 막으므로 실제 발생 없지만
    // 이미 DB에 있는 레거시 잘못된 JSON 대응 검증
    db.prepare(`
      INSERT INTO usage_events (id, user_id, event_type, ts, metadata, review_metadata)
      VALUES (?, 'u-bad', 'review_action', unixepoch(), '{}', ?)
    `).run(crypto.randomUUID(), '{"actor_id":"u-bad","action":"unknown_action","reason_code":null,"comment":null}')

    const rows = getReviewActivity(db, 30)
    expect(rows).toHaveLength(0)
  })

  it('ts ASC + rowid ASC 정렬', () => {
    insertAsset('d2', 'sort-asset')
    const tsOld = Math.floor(new Date('2026-05-01T10:00:00Z').getTime() / 1000)
    const tsNew = Math.floor(new Date('2026-05-01T12:00:00Z').getTime() / 1000)
    insertReviewEvent('u1', 'd2', 'submit', tsOld)
    insertReviewEvent('u2', 'd2', 'approve', tsNew)

    const rows = getReviewActivity(db, 90)
    expect(rows[0]!.review_metadata.action).toBe('submit')
    expect(rows[1]!.review_metadata.action).toBe('approve')
  })
})
