/**
 * U-Mj-1: 카탈로그 sort 파라미터 검증
 * U-Mj-3: 태그 브라우징 + tag 필터 검증
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { listAssets, getTags } from '../services/assetQueryService.js'

let db: ReturnType<typeof Database>

const USER_A = 'user-sort-a'
const ASSET_NEWER  = 'asset-sort-newer'
const ASSET_OLDER  = 'asset-sort-older'
const ASSET_ALPHA  = 'asset-sort-alpha'  // name: "aardvark"
const ASSET_OMEGA  = 'asset-sort-omega'  // name: "zebra"
const ASSET_TAGGED_AI  = 'asset-tagged-ai'
const ASSET_TAGGED_SEC = 'asset-tagged-sec'
const ASSET_TAGGED_BOTH = 'asset-tagged-both'

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
    CREATE TABLE usage_events (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT, event_type TEXT NOT NULL,
      asset_id TEXT REFERENCES assets(id), tool_name TEXT, file_path TEXT,
      ts INTEGER NOT NULL DEFAULT (unixepoch()),
      metadata TEXT NOT NULL DEFAULT '{}', review_metadata TEXT
    );
    CREATE VIRTUAL TABLE assets_fts USING fts5(
      name, description, content='assets', content_rowid='rowid', tokenize='trigram'
    );
    CREATE TRIGGER assets_ai AFTER INSERT ON assets BEGIN
      INSERT INTO assets_fts(rowid, name, description)
      VALUES (new.rowid, new.name, COALESCE(new.description, ''));
    END;
    CREATE TRIGGER assets_ad AFTER DELETE ON assets BEGIN
      INSERT INTO assets_fts(assets_fts, rowid, name, description)
      VALUES ('delete', old.rowid, old.name, COALESCE(old.description, ''));
    END;
  `)

  db.prepare(`INSERT INTO users(id, email, name, local_id, role) VALUES(?,?,?,?,?)`)
    .run(USER_A, 'sorta@test.local', 'Sort A', 'sorta', 'member')

  const insertAsset = db.prepare(`
    INSERT INTO assets(id, type, name, description, tags, author_id, version, status, created_at, updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)
  `)

  const BASE = 1000000
  insertAsset.run(ASSET_NEWER,  'skill',   'Newer Skill',   null, '["ai"]',        USER_A, '1.0.0', 'approved', BASE + 200, BASE + 200)
  insertAsset.run(ASSET_OLDER,  'skill',   'Older Skill',   null, '["security"]',  USER_A, '1.0.0', 'approved', BASE + 100, BASE + 100)
  insertAsset.run(ASSET_ALPHA,  'prompt',  'aardvark',      null, '[]',            USER_A, '1.0.0', 'approved', BASE + 50,  BASE + 50)
  insertAsset.run(ASSET_OMEGA,  'command', 'zebra',         null, '[]',            USER_A, '1.0.0', 'approved', BASE + 10,  BASE + 10)
  insertAsset.run(ASSET_TAGGED_AI,   'skill',  'AI Tag Asset',   null, '["ai","ml"]',            USER_A, '1.0.0', 'approved', BASE + 5, BASE + 5)
  insertAsset.run(ASSET_TAGGED_SEC,  'skill',  'Sec Tag Asset',  null, '["security"]',           USER_A, '1.0.0', 'approved', BASE + 4, BASE + 4)
  insertAsset.run(ASSET_TAGGED_BOTH, 'prompt', 'Both Tag Asset', null, '["ai","security"]',      USER_A, '1.0.0', 'approved', BASE + 3, BASE + 3)

  // view_count 이벤트: ASSET_OLDER가 3번, ASSET_NEWER가 1번
  const insertEvent = db.prepare(`
    INSERT INTO usage_events(id, user_id, event_type, asset_id, ts) VALUES(?,?,?,?,?)
  `)
  insertEvent.run('ev-1', USER_A, 'asset_view', ASSET_OLDER, BASE + 101)
  insertEvent.run('ev-2', USER_A, 'asset_view', ASSET_OLDER, BASE + 102)
  insertEvent.run('ev-3', USER_A, 'asset_view', ASSET_OLDER, BASE + 103)
  insertEvent.run('ev-4', USER_A, 'asset_view', ASSET_NEWER, BASE + 201)
  // download_count: ASSET_ALPHA 2번
  insertEvent.run('ev-5', USER_A, 'asset_download', ASSET_ALPHA, BASE + 51)
  insertEvent.run('ev-6', USER_A, 'asset_download', ASSET_ALPHA, BASE + 52)
})

afterAll(() => { db.close() })

// ─── U-Mj-1: sort 검증 ────────────────────────────────────────────────────────

describe('listAssets — sort=last_updated', () => {
  it('sort=last_updated: updated_at DESC 순서 (NEWER → OLDER)', async () => {
    const result = await listAssets({ sort: 'last_updated', limit: 10 }, USER_A, 'member', db)
    const ids = result.items.map(a => a.id)
    expect(ids.indexOf(ASSET_NEWER)).toBeLessThan(ids.indexOf(ASSET_OLDER))
  })
})

describe('listAssets — sort=name', () => {
  it('sort=name: name ASC 순서 (aardvark → zebra)', async () => {
    const result = await listAssets({ sort: 'name', limit: 10 }, USER_A, 'member', db)
    const ids = result.items.map(a => a.id)
    expect(ids.indexOf(ASSET_ALPHA)).toBeLessThan(ids.indexOf(ASSET_OMEGA))
  })
})

describe('listAssets — sort=view_count', () => {
  it('sort=view_count: 조회수 높은 자산 우선 (OLDER=3 > NEWER=1)', async () => {
    const result = await listAssets({ sort: 'view_count', limit: 10 }, USER_A, 'member', db)
    const ids = result.items.map(a => a.id)
    expect(ids.indexOf(ASSET_OLDER)).toBeLessThan(ids.indexOf(ASSET_NEWER))
  })
})

// ─── U-Mj-3: tag 필터 + getTags 검증 ─────────────────────────────────────────

describe('listAssets — tag 필터', () => {
  it('tag=ai: ai 태그 자산만 반환 (security 태그 자산 제외)', async () => {
    const result = await listAssets({ tag: 'ai', sort: 'updated_at', limit: 20 }, USER_A, 'member', db)
    expect(result.items.every(a => {
      const tags = JSON.parse(a.tags) as string[]
      return tags.includes('ai')
    })).toBe(true)
    // security 전용 자산 제외 확인
    expect(result.items.find(a => a.id === ASSET_TAGGED_SEC)).toBeUndefined()
  })

  it('tag=security: security 태그 자산만 반환', async () => {
    const result = await listAssets({ tag: 'security', sort: 'updated_at', limit: 20 }, USER_A, 'member', db)
    const ids = result.items.map(a => a.id)
    expect(ids).toContain(ASSET_OLDER)
    expect(ids).toContain(ASSET_TAGGED_SEC)
    expect(ids).toContain(ASSET_TAGGED_BOTH)
    expect(ids).not.toContain(ASSET_NEWER)  // ai 태그만
  })
})

describe('getTags', () => {
  it('getTags: 승인된 자산의 태그 집계 반환 (count DESC, tag ASC 정렬)', () => {
    const tags = getTags(db)
    expect(tags.length).toBeGreaterThan(0)
    // ai: 3개 자산 (ASSET_NEWER + ASSET_TAGGED_AI + ASSET_TAGGED_BOTH), security: 3개
    const aiTag = tags.find(t => t.tag === 'ai')
    const secTag = tags.find(t => t.tag === 'security')
    expect(aiTag?.count).toBe(3)
    expect(secTag?.count).toBe(3)
    // gotcha #18: count DESC, tag ASC → count 동점 시 tag ASC
    const firstTag = tags[0]
    expect(firstTag).toBeDefined()
    expect(firstTag!.count).toBeGreaterThanOrEqual(tags[tags.length - 1]!.count)
  })
})
