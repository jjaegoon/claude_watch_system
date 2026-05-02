import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { createAsset, updateAsset } from './assetWriteService.js'
import { SlashNameSchema } from '../schemas/asset.js'

let db: InstanceType<typeof Database>

const ADMIN_ID = 'user-admin-001'
const ALICE_ID = 'user-alice-001'

beforeAll(() => {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL, local_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      password_hash TEXT NOT NULL DEFAULT '',
      is_bot INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE assets (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT, tags TEXT NOT NULL DEFAULT '[]',
      author_id TEXT, version TEXT NOT NULL DEFAULT '1.0.0',
      status TEXT NOT NULL DEFAULT 'draft',
      source_path TEXT, type_fields TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE asset_versions (
      id TEXT PRIMARY KEY, asset_id TEXT NOT NULL,
      version TEXT NOT NULL,
      snapshot TEXT NOT NULL DEFAULT '{}',
      changed_by TEXT,
      change_note TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
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
  `)

  db.prepare(`INSERT INTO users(id, email, name, local_id, role) VALUES(?,?,?,?,?)`)
    .run(ADMIN_ID, 'admin@test.local', 'Admin', 'admin', 'admin')
  db.prepare(`INSERT INTO users(id, email, name, local_id, role) VALUES(?,?,?,?,?)`)
    .run(ALICE_ID, 'alice@test.local', 'Alice', 'alice', 'member')
})

afterAll(() => db.close())

// ── SlashNameSchema 단위 테스트 (T-31C, 5케이스) ────────────────────────────

describe('SlashNameSchema (T-31C)', () => {
  it('valid: my-command → PASS', () => {
    expect(SlashNameSchema.safeParse('my-command').success).toBe(true)
  })

  it('leading digit: 1command → FAIL', () => {
    expect(SlashNameSchema.safeParse('1command').success).toBe(false)
  })

  it('uppercase: MyCmd → FAIL', () => {
    expect(SlashNameSchema.safeParse('MyCmd').success).toBe(false)
  })

  it('single char: a → FAIL (최소 2자)', () => {
    expect(SlashNameSchema.safeParse('a').success).toBe(false)
  })

  it('too long: a + 31chars → FAIL (최대 31자)', () => {
    expect(SlashNameSchema.safeParse('a' + 'b'.repeat(31)).success).toBe(false)
  })
})

// ── createAsset ──────────────────────────────────────────────────────────────

describe('createAsset (T-19·T-20)', () => {
  it('skill 자산 생성 → status=draft + asset_versions 1건', () => {
    const asset = createAsset({
      type: 'skill', name: 'Test Skill', version: '1.0.0',
      description: 'test skill', tags: ['test'], typeFields: {},
      authorId: ALICE_ID,
    }, db)

    expect(asset.id).toBeTruthy()
    expect(asset.status).toBe('draft')
    expect(asset.type).toBe('skill')
    expect(asset.name).toBe('Test Skill')
    expect(asset.authorId).toBe(ALICE_ID)

    // T-20: asset_versions 스냅샷 생성 검증
    const versions = db.prepare(
      'SELECT * FROM asset_versions WHERE asset_id = ?',
    ).all(asset.id) as Array<{ version: string }>
    expect(versions.length).toBe(1)
    expect(versions[0]!.version).toBe('1.0.0')
  })

  it('command 자산 + typeFields.slash_name 포함', () => {
    const asset = createAsset({
      type: 'command', name: 'My Command', version: '1.0.0',
      tags: [], typeFields: { slash_name: 'my-cmd', usage: 'usage description' },
      authorId: ADMIN_ID,
    }, db)

    expect(asset.status).toBe('draft')
    const fields = JSON.parse(asset.typeFields) as { slash_name: string }
    expect(fields.slash_name).toBe('my-cmd')
  })

  it('tags + FTS5 인덱스에 추가됨', () => {
    const asset = createAsset({
      type: 'prompt', name: 'Korean Prompt', version: '1.0.0',
      description: '한국어 번역 프롬프트', tags: ['korean'], typeFields: {},
      authorId: ALICE_ID,
    }, db)

    // FTS5 검색으로 확인
    const rows = db.prepare(
      `SELECT a.id FROM assets a
       WHERE a.rowid IN (SELECT rowid FROM assets_fts WHERE assets_fts MATCH ?)`,
    ).all('한국어') as Array<{ id: string }>
    expect(rows.some((r) => r.id === asset.id)).toBe(true)
  })
})

// ── updateAsset ──────────────────────────────────────────────────────────────

describe('updateAsset (T-19·T-20)', () => {
  it('author → 본인 draft 수정 가능, asset_versions 추가', () => {
    const asset = createAsset({
      type: 'skill', name: 'Original', version: '1.0.0',
      tags: [], typeFields: {}, authorId: ALICE_ID,
    }, db)

    const updated = updateAsset(asset.id, { name: 'Updated', version: '1.1.0' },
      ALICE_ID, 'member', db)

    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('Updated')
    expect(updated!.version).toBe('1.1.0')

    // T-20: 버전 스냅샷 2건 (생성 + 수정)
    const versions = db.prepare(
      'SELECT * FROM asset_versions WHERE asset_id = ?',
    ).all(asset.id)
    expect(versions.length).toBe(2)
  })

  it('member 타인 → null (RBAC 거부)', () => {
    const asset = createAsset({
      type: 'skill', name: 'Alice Only', version: '1.0.0',
      tags: [], typeFields: {}, authorId: ALICE_ID,
    }, db)

    const result = updateAsset(asset.id, { name: 'Hacked' }, ADMIN_ID, 'member', db)
    // ADMIN_ID가 member role이면 타인 draft 수정 불가
    expect(result).toBeNull()
  })

  it('admin → 타인 자산 수정 가능', () => {
    const asset = createAsset({
      type: 'skill', name: 'Alice Asset', version: '1.0.0',
      tags: [], typeFields: {}, authorId: ALICE_ID,
    }, db)

    const updated = updateAsset(asset.id, { description: 'admin edited' },
      ADMIN_ID, 'admin', db)
    expect(updated).not.toBeNull()
    expect(updated!.description).toBe('admin edited')
  })

  it('존재하지 않는 ID → null', () => {
    const result = updateAsset(
      '00000000-0000-0000-0000-000000000001',
      { name: 'ghost' }, ALICE_ID, 'member', db,
    )
    expect(result).toBeNull()
  })

  it('빈 input → 변경 없이 기존 반환', () => {
    const asset = createAsset({
      type: 'mcp', name: 'MCP Asset', version: '2.0.0',
      tags: [], typeFields: {}, authorId: ALICE_ID,
    }, db)

    const result = updateAsset(asset.id, {}, ALICE_ID, 'member', db)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('MCP Asset')
    // no-op: asset_versions still 1
    const versions = db.prepare(
      'SELECT * FROM asset_versions WHERE asset_id = ?',
    ).all(asset.id)
    expect(versions.length).toBe(1)
  })
})
