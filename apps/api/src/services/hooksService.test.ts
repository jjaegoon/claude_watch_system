/**
 * T-13·T-14·T-23·T-29 hooksService 단위 테스트
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { enqueueEvent, __resetQueueForTest, flushForTest } from './hooksService.js'

// 인메모리 DB (각 테스트 독립)
const makeDb = (): InstanceType<typeof Database> => {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE assets (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      type TEXT NOT NULL DEFAULT 'skill', description TEXT,
      tags TEXT NOT NULL DEFAULT '[]', author_id TEXT, version TEXT NOT NULL DEFAULT '1.0.0',
      source_path TEXT, type_fields TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE usage_events (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      session_id TEXT,
      event_type TEXT NOT NULL CHECK (event_type IN (
        'session_start','session_end','tool_call','file_edit',
        'skill_trigger','asset_view','asset_install','review_action'
      )),
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

beforeEach(() => {
  db = makeDb()
  __resetQueueForTest()
})

afterEach(() => {
  __resetQueueForTest()
  db.close()
})

// ── 기본 영속화 ──────────────────────────────────────────────────────────────

describe('tool_call 이벤트 영속화', () => {
  it('enqueue + flush → usage_events INSERT', () => {
    enqueueEvent({ type: 'tool_call', user_id: 'user1', tool_name: 'Read', source: 'claude-code', duration_ms: 50, success: true }, db)
    flushForTest(db)

    const row = db.prepare('SELECT * FROM usage_events WHERE user_id = ?').get('user1') as Record<string, unknown>
    expect(row).not.toBeNull()
    expect(row['event_type']).toBe('tool_call')
    expect(row['tool_name']).toBe('Read')
  })

  it('T-29 metadata에 tool_use_id·duration_ms·success·source 저장', () => {
    enqueueEvent({ type: 'tool_call', user_id: 'u1', tool_use_id: 'tuid-123', duration_ms: 200, success: false, source: 'vscode' }, db)
    flushForTest(db)

    const row = db.prepare('SELECT metadata FROM usage_events WHERE user_id = ?').get('u1') as { metadata: string }
    const meta = JSON.parse(row.metadata) as Record<string, unknown>
    expect(meta['tool_use_id']).toBe('tuid-123')
    expect(meta['duration_ms']).toBe(200)
    expect(meta['success']).toBe(false)
    expect(meta['source']).toBe('vscode')
  })

  it('session_id 저장', () => {
    enqueueEvent({ type: 'tool_call', user_id: 'u1', session_id: 'sess-42', source: 'claude-code', duration_ms: 0, success: true }, db)
    flushForTest(db)

    const row = db.prepare('SELECT session_id FROM usage_events WHERE user_id = ?').get('u1') as { session_id: string }
    expect(row.session_id).toBe('sess-42')
  })
})

// ── T-14 skill_trigger ───────────────────────────────────────────────────────

describe('skill_trigger 이벤트 (T-14)', () => {
  it('skill_name → approved 자산 asset_id 매핑', () => {
    db.prepare(`INSERT INTO assets (id, name, status, type) VALUES ('asset-1', 'code-review-skill', 'approved', 'skill')`).run()

    enqueueEvent({ type: 'skill_trigger', user_id: 'u1', skill_name: 'code-review-skill', source: 'claude-code', duration_ms: 0, success: true }, db)
    flushForTest(db)

    const row = db.prepare(`SELECT asset_id FROM usage_events WHERE event_type = 'skill_trigger'`).get() as { asset_id: string }
    expect(row.asset_id).toBe('asset-1')
  })

  it('draft 자산은 매핑되지 않음 → asset_id null', () => {
    db.prepare(`INSERT INTO assets (id, name, status, type) VALUES ('asset-2', 'draft-skill', 'draft', 'skill')`).run()

    enqueueEvent({ type: 'skill_trigger', user_id: 'u1', skill_name: 'draft-skill', source: 'claude-code', duration_ms: 0, success: true }, db)
    flushForTest(db)

    const row = db.prepare(`SELECT asset_id FROM usage_events WHERE event_type = 'skill_trigger'`).get() as { asset_id: string | null }
    expect(row.asset_id).toBeNull()
  })

  it('미등록 skill_name → asset_id null', () => {
    enqueueEvent({ type: 'skill_trigger', user_id: 'u1', skill_name: 'nonexistent-skill', source: 'claude-code', duration_ms: 0, success: true }, db)
    flushForTest(db)

    const row = db.prepare(`SELECT asset_id FROM usage_events WHERE event_type = 'skill_trigger'`).get() as { asset_id: string | null }
    expect(row.asset_id).toBeNull()
  })

  it('skill_name null → asset_id null', () => {
    enqueueEvent({ type: 'skill_trigger', user_id: 'u1', skill_name: null, source: 'claude-code', duration_ms: 0, success: true }, db)
    flushForTest(db)

    const row = db.prepare(`SELECT asset_id FROM usage_events WHERE event_type = 'skill_trigger'`).get() as { asset_id: string | null }
    expect(row.asset_id).toBeNull()
  })

  it('T-29 metadata에 skill_name 저장', () => {
    db.prepare(`INSERT INTO assets (id, name, status, type) VALUES ('asset-3', 'my-skill', 'approved', 'skill')`).run()

    enqueueEvent({ type: 'skill_trigger', user_id: 'u1', skill_name: 'my-skill', source: 'claude-code', duration_ms: 10, success: true }, db)
    flushForTest(db)

    const row = db.prepare(`SELECT metadata FROM usage_events WHERE event_type = 'skill_trigger'`).get() as { metadata: string }
    const meta = JSON.parse(row.metadata) as Record<string, unknown>
    expect(meta['skill_name']).toBe('my-skill')
  })
})

// ── T-23 배치 flush ──────────────────────────────────────────────────────────

describe('T-23 배치 flush (50건)', () => {
  it('50건 INSERT 시 즉시 flush → 모두 DB에 저장', () => {
    for (let i = 0; i < 50; i++) {
      enqueueEvent({ type: 'tool_call', user_id: `user-${i}`, source: 'claude-code', duration_ms: 0, success: true }, db)
    }
    // 50번째 enqueue 시 즉시 flush됨

    const count = (db.prepare('SELECT COUNT(*) AS c FROM usage_events').get() as { c: number }).c
    expect(count).toBe(50)
  })
})

// ── T-23 100ms timeout flush ─────────────────────────────────────────────────

describe('T-23 100ms flush', () => {
  it('enqueue 후 flushForTest 수동 호출 → DB에 저장', () => {
    enqueueEvent({ type: 'file_edit', user_id: 'u1', tool_name: 'Edit', source: 'claude-code', duration_ms: 0, success: true }, db)
    // flushForTest는 setTimeout 없이 즉시 flush
    flushForTest(db)

    const count = (db.prepare('SELECT COUNT(*) AS c FROM usage_events').get() as { c: number }).c
    expect(count).toBe(1)
  })
})

// ── __resetQueueForTest ────────────────────────────────────────────────────

describe('__resetQueueForTest', () => {
  it('reset 후 flush → 아무것도 삽입 안 됨', () => {
    enqueueEvent({ type: 'tool_call', user_id: 'u1', source: 'claude-code', duration_ms: 0, success: true }, db)
    __resetQueueForTest()
    flushForTest(db)

    const count = (db.prepare('SELECT COUNT(*) AS c FROM usage_events').get() as { c: number }).c
    expect(count).toBe(0)
  })
})
