/**
 * T-26 daily_stats Cron 단위 테스트
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { aggregateDaily, runDailyStatsIfDue, yesterdayUtc, __resetLastRunDateForTest } from './statsWorker.js'

const makeDb = (): InstanceType<typeof Database> => {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE assets (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      type TEXT NOT NULL DEFAULT 'skill', description TEXT,
      tags TEXT NOT NULL DEFAULT '[]', author_id TEXT,
      version TEXT NOT NULL DEFAULT '1.0.0', source_path TEXT,
      type_fields TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
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
      review_metadata TEXT
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
  `)
  return db
}

let db: InstanceType<typeof Database>

beforeEach(() => {
  db = makeDb()
  __resetLastRunDateForTest()
})

afterEach(() => {
  db.close()
})

const insertEvent = (
  userId: string,
  eventType: string,
  assetId: string | null,
  sessionId: string | null,
  tsOverride?: number,
) => {
  const ts = tsOverride ?? Math.floor(Date.now() / 1000)
  db.prepare(`
    INSERT INTO usage_events (id, user_id, event_type, asset_id, session_id, ts, metadata)
    VALUES (?, ?, ?, ?, ?, ?, '{}')
  `).run(crypto.randomUUID(), userId, eventType, assetId, sessionId, ts)
}

const insertAsset = (id: string, name: string) => {
  db.prepare(`INSERT INTO assets (id, name, type, status) VALUES (?, ?, 'skill', 'approved')`).run(id, name)
}

// ── aggregateDaily ────────────────────────────────────────────────────────────

describe('aggregateDaily', () => {
  it('이벤트 없음 → daily_stats 0건', () => {
    aggregateDaily(db, '2026-05-01')
    const count = (db.prepare('SELECT COUNT(*) AS c FROM daily_asset_stats').get() as { c: number }).c
    expect(count).toBe(0)
  })

  it('asset_view + install + trigger → 정확한 집계', () => {
    insertAsset('a1', 'skill-one')
    const dateTs = Math.floor(new Date('2026-05-01T12:00:00Z').getTime() / 1000)
    insertEvent('u1', 'asset_view',    'a1', 's1', dateTs)
    insertEvent('u1', 'asset_view',    'a1', 's1', dateTs)
    insertEvent('u1', 'asset_install', 'a1', 's1', dateTs)
    insertEvent('u1', 'skill_trigger', 'a1', 's1', dateTs)

    aggregateDaily(db, '2026-05-01')

    const row = db.prepare(`SELECT * FROM daily_asset_stats WHERE asset_id = 'a1' AND stat_date = '2026-05-01'`).get() as Record<string, number>
    expect(row['view_count']).toBe(2)
    expect(row['install_count']).toBe(1)
    expect(row['trigger_count']).toBe(1)
  })

  it('다른 날짜 이벤트는 집계 대상 제외', () => {
    insertAsset('a2', 'skill-two')
    const yesterday = Math.floor(new Date('2026-04-30T12:00:00Z').getTime() / 1000)
    insertEvent('u1', 'asset_view', 'a2', 's1', yesterday)

    aggregateDaily(db, '2026-05-01')
    const count = (db.prepare(`SELECT COUNT(*) AS c FROM daily_asset_stats WHERE stat_date = '2026-05-01'`).get() as { c: number }).c
    expect(count).toBe(0)
  })

  it('2회 실행 (idempotent) → 동일 결과 (upsert)', () => {
    insertAsset('a3', 'skill-three')
    const ts = Math.floor(new Date('2026-05-01T10:00:00Z').getTime() / 1000)
    insertEvent('u1', 'asset_view', 'a3', null, ts)

    aggregateDaily(db, '2026-05-01')
    aggregateDaily(db, '2026-05-01')

    const rows = db.prepare(`SELECT COUNT(*) AS c FROM daily_asset_stats WHERE asset_id = 'a3'`).get() as { c: number }
    expect(rows.c).toBe(1)
    const row = db.prepare(`SELECT view_count FROM daily_asset_stats WHERE asset_id = 'a3'`).get() as { view_count: number }
    expect(row.view_count).toBe(1)
  })

  it('daily_user_stats: session_count + tool_call_count 집계', () => {
    const ts = Math.floor(new Date('2026-05-01T08:00:00Z').getTime() / 1000)
    insertEvent('u2', 'tool_call', null, 'sess-A', ts)
    insertEvent('u2', 'tool_call', null, 'sess-A', ts)
    insertEvent('u2', 'tool_call', null, 'sess-B', ts)

    aggregateDaily(db, '2026-05-01')

    const row = db.prepare(`SELECT * FROM daily_user_stats WHERE user_id = 'u2' AND stat_date = '2026-05-01'`).get() as Record<string, number>
    expect(row['session_count']).toBe(2)
    expect(row['tool_call_count']).toBe(3)
  })
})

// ── runDailyStatsIfDue ────────────────────────────────────────────────────────

describe('runDailyStatsIfDue', () => {
  it('UTC 00시 아닐 때 → no-op (daily_stats 삽입 없음)', () => {
    const fakeNow = new Date('2026-05-02T10:00:00Z') // UTC 10시

    insertAsset('a-noop', 'noop-skill')
    const ts = Math.floor(new Date('2026-05-01T12:00:00Z').getTime() / 1000)
    insertEvent('u1', 'asset_view', 'a-noop', null, ts)

    runDailyStatsIfDue(db, fakeNow)

    const count = (db.prepare('SELECT COUNT(*) AS c FROM daily_asset_stats').get() as { c: number }).c
    expect(count).toBe(0)
  })
})

// ── yesterdayUtc ─────────────────────────────────────────────────────────────

describe('yesterdayUtc', () => {
  it('UTC 기준 전일 날짜 반환', () => {
    const result = yesterdayUtc(new Date('2026-05-02T05:00:00Z'))
    expect(result).toBe('2026-05-01')
  })
})
