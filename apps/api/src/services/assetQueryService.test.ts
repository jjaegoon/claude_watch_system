import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '@team-claude/db/schema'
import { listAssets, getAssetById } from './assetQueryService.js'
import type { UserRole } from '../lib/db.js'

// in-memory SQLite 테스트 DB
let testDb: ReturnType<typeof Database>

const ASSET_APPROVED = 'asset-approved-1'
const ASSET_DRAFT_ALICE = 'asset-draft-alice'
const ASSET_DRAFT_BOB = 'asset-draft-bob'
const ASSET_IN_REVIEW = 'asset-in-review-1'
const ASSET_DEPRECATED = 'asset-deprecated-1'

const USER_ALICE = 'user-alice'
const USER_BOB = 'user-bob'
const USER_REVIEWER = 'user-reviewer'
const USER_ADMIN = 'user-admin'

beforeAll(() => {
  testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')

  // 최소 스키마
  testDb.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      local_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      password_hash TEXT NOT NULL DEFAULT '',
      is_bot INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE assets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      author_id TEXT REFERENCES users(id),
      version TEXT NOT NULL DEFAULT '1.0.0',
      status TEXT NOT NULL DEFAULT 'draft',
      source_path TEXT,
      type_fields TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE VIRTUAL TABLE assets_fts USING fts5(
      name, description,
      content='assets', content_rowid='rowid',
      tokenize='trigram'
    );
    CREATE TRIGGER assets_ai AFTER INSERT ON assets BEGIN
      INSERT INTO assets_fts(rowid, name, description)
      VALUES (new.rowid, new.name, COALESCE(new.description, ''));
    END;
    CREATE TRIGGER assets_au AFTER UPDATE ON assets BEGIN
      INSERT INTO assets_fts(assets_fts, rowid, name, description)
      VALUES ('delete', old.rowid, old.name, COALESCE(old.description, ''));
      INSERT INTO assets_fts(rowid, name, description)
      VALUES (new.rowid, new.name, COALESCE(new.description, ''));
    END;
    CREATE TRIGGER assets_ad AFTER DELETE ON assets BEGIN
      INSERT INTO assets_fts(assets_fts, rowid, name, description)
      VALUES ('delete', old.rowid, old.name, COALESCE(old.description, ''));
    END;
  `)

  // 사용자 삽입
  const insertUser = testDb.prepare(
    `INSERT INTO users(id, email, name, local_id, role) VALUES(?,?,?,?,?)`
  )
  insertUser.run(USER_ALICE,    'alice@test.local',    'Alice',    'alice',    'member')
  insertUser.run(USER_BOB,      'bob@test.local',      'Bob',      'bob',      'member')
  insertUser.run(USER_REVIEWER, 'reviewer@test.local', 'Reviewer', 'reviewer', 'reviewer')
  insertUser.run(USER_ADMIN,    'admin@test.local',    'Admin',    'admin',    'admin')

  // 자산 삽입
  const insertAsset = testDb.prepare(
    `INSERT INTO assets(id, type, name, description, tags, author_id, version, status)
     VALUES(?,?,?,?,?,?,?,?)`
  )
  insertAsset.run(ASSET_APPROVED,   'skill',   'Approved Skill',   'approved desc',   '[]', USER_ALICE, '1.0.0', 'approved')
  insertAsset.run(ASSET_DRAFT_ALICE,'skill',   'Alice Draft',      'alice draft desc','[]', USER_ALICE, '0.1.0', 'draft')
  insertAsset.run(ASSET_DRAFT_BOB,  'skill',   'Bob Draft',        'bob draft desc',  '[]', USER_BOB,   '0.1.0', 'draft')
  insertAsset.run(ASSET_IN_REVIEW,  'prompt',  'In Review Prompt', 'review desc',     '[]', USER_BOB,   '0.5.0', 'in_review')
  insertAsset.run(ASSET_DEPRECATED, 'command', 'Deprecated Cmd',   'deprecated desc', '[]', USER_ALICE, '0.0.1', 'deprecated')
})

afterAll(() => {
  testDb.close()
})

// assetQueryService를 테스트 DB로 주입하기 위해 db 오버라이드
// NOTE: assetQueryService는 `db` 파라미터를 받도록 설계됨 (testability)

describe('getAssetById — RBAC 4×4', () => {
  // approved: 모두 접근 가능
  it('member 본인 → approved 200', async () => {
    const result = await getAssetById(ASSET_APPROVED, USER_ALICE, 'member', testDb)
    expect(result?.id).toBe(ASSET_APPROVED)
  })

  it('member 타인 → approved 200', async () => {
    const result = await getAssetById(ASSET_APPROVED, USER_BOB, 'member', testDb)
    expect(result?.id).toBe(ASSET_APPROVED)
  })

  it('reviewer → approved 200', async () => {
    const result = await getAssetById(ASSET_APPROVED, USER_REVIEWER, 'reviewer', testDb)
    expect(result?.id).toBe(ASSET_APPROVED)
  })

  it('admin → approved 200', async () => {
    const result = await getAssetById(ASSET_APPROVED, USER_ADMIN, 'admin', testDb)
    expect(result?.id).toBe(ASSET_APPROVED)
  })

  // draft: member 본인만 접근, 타인은 null (→ 404)
  it('member 본인 → draft 200 (자신의 draft)', async () => {
    const result = await getAssetById(ASSET_DRAFT_ALICE, USER_ALICE, 'member', testDb)
    expect(result?.id).toBe(ASSET_DRAFT_ALICE)
  })

  it('member 타인 → draft null (→ 404)', async () => {
    const result = await getAssetById(ASSET_DRAFT_ALICE, USER_BOB, 'member', testDb)
    expect(result).toBeNull()
  })

  it('reviewer → draft 200', async () => {
    const result = await getAssetById(ASSET_DRAFT_ALICE, USER_REVIEWER, 'reviewer', testDb)
    expect(result?.id).toBe(ASSET_DRAFT_ALICE)
  })

  it('admin → draft 200', async () => {
    const result = await getAssetById(ASSET_DRAFT_ALICE, USER_ADMIN, 'admin', testDb)
    expect(result?.id).toBe(ASSET_DRAFT_ALICE)
  })

  // in_review: member 본인만, 타인 null (자율 확장 — 검토 작업물 노출 방지)
  it('member 본인 → in_review 200', async () => {
    const result = await getAssetById(ASSET_IN_REVIEW, USER_BOB, 'member', testDb)
    expect(result?.id).toBe(ASSET_IN_REVIEW)
  })

  it('member 타인 → in_review null (→ 404)', async () => {
    const result = await getAssetById(ASSET_IN_REVIEW, USER_ALICE, 'member', testDb)
    expect(result).toBeNull()
  })

  it('reviewer → in_review 200', async () => {
    const result = await getAssetById(ASSET_IN_REVIEW, USER_REVIEWER, 'reviewer', testDb)
    expect(result?.id).toBe(ASSET_IN_REVIEW)
  })

  it('admin → in_review 200', async () => {
    const result = await getAssetById(ASSET_IN_REVIEW, USER_ADMIN, 'admin', testDb)
    expect(result?.id).toBe(ASSET_IN_REVIEW)
  })

  // deprecated: 모두 접근 가능
  it('member 타인 → deprecated 200', async () => {
    const result = await getAssetById(ASSET_DEPRECATED, USER_BOB, 'member', testDb)
    expect(result?.id).toBe(ASSET_DEPRECATED)
  })

  it('admin → deprecated 200', async () => {
    const result = await getAssetById(ASSET_DEPRECATED, USER_ADMIN, 'admin', testDb)
    expect(result?.id).toBe(ASSET_DEPRECATED)
  })

  // 존재하지 않는 ID
  it('존재하지 않는 ID → null', async () => {
    const result = await getAssetById('non-existent-id', USER_ALICE, 'member', testDb)
    expect(result).toBeNull()
  })
})

describe('listAssets — RBAC + 검색', () => {
  // 기본 (status 미지정): approved만
  it('member: status 미지정 → approved만', async () => {
    const result = await listAssets({ sort: 'updated_at', limit: 20 }, USER_ALICE, 'member', testDb)
    expect(result.items.every(a => a.status === 'approved')).toBe(true)
    expect(result.items.some(a => a.status === 'draft')).toBe(false)
  })

  // ?status=draft: member는 본인만
  it('member: ?status=draft → 본인 draft만', async () => {
    const result = await listAssets({ status: 'draft', sort: 'updated_at', limit: 20 }, USER_ALICE, 'member', testDb)
    expect(result.items.every(a => a.authorId === USER_ALICE)).toBe(true)
    expect(result.items.every(a => a.status === 'draft')).toBe(true)
  })

  // ?status=draft: reviewer는 전체
  it('reviewer: ?status=draft → 전체 draft', async () => {
    const result = await listAssets({ status: 'draft', sort: 'updated_at', limit: 20 }, USER_REVIEWER, 'reviewer', testDb)
    expect(result.items.length).toBe(2) // alice + bob draft
    expect(result.items.every(a => a.status === 'draft')).toBe(true)
  })

  // ?status=draft: admin은 전체
  it('admin: ?status=draft → 전체 draft', async () => {
    const result = await listAssets({ status: 'draft', sort: 'updated_at', limit: 20 }, USER_ADMIN, 'admin', testDb)
    expect(result.items.length).toBe(2)
  })

  // FTS5 검색
  it('FTS5 검색 → 매칭 자산만', async () => {
    const result = await listAssets({ q: 'approved', sort: 'updated_at', limit: 20 }, USER_ALICE, 'member', testDb)
    expect(result.items.some(a => a.name === 'Approved Skill')).toBe(true)
  })

  // cursor 페이지네이션
  it('cursor 페이지네이션 — 두 번째 페이지 중복 없음', async () => {
    // 전체 approved 자산이 1개뿐이므로 limit=1로 첫 페이지 확인
    const page1 = await listAssets({ sort: 'updated_at', limit: 1 }, USER_ALICE, 'member', testDb)
    expect(page1.items.length).toBe(1)
    // 단일 자산 → 두 번째 페이지 없음
    if (page1.nextCursor) {
      const page2 = await listAssets({ sort: 'updated_at', limit: 1, cursor: page1.nextCursor }, USER_ALICE, 'member', testDb)
      const ids1 = page1.items.map(a => a.id)
      const ids2 = page2.items.map(a => a.id)
      const overlap = ids1.filter(id => ids2.includes(id))
      expect(overlap.length).toBe(0)
    }
  })
})
