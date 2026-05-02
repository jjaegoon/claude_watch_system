import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { createAsset } from './assetWriteService.js'
import { transitionStatus, submitForReview } from './assetStatusService.js'

let db: InstanceType<typeof Database>

const AUTHOR_ID  = 'user-author-001'
const MEMBER_ID  = 'user-member-002'
const REVIEWER_ID = 'user-reviewer-003'
const ADMIN_ID   = 'user-admin-004'
const SYSTEM_ID  = 'user-system-005'

const BASE = { tags: [] as string[], typeFields: {} as Record<string, unknown> }

const mkAsset = (name: string, authorId: string) =>
  createAsset({ type: 'skill', name, version: '1.0.0', ...BASE, authorId }, db)

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
})

afterAll(() => db.close())

const versions = (assetId: string) =>
  (db.prepare('SELECT * FROM asset_versions WHERE asset_id = ?').all(assetId) as unknown[]).length

// ── submitForReview (T-16, 6케이스) ──────────────────────────────────────────

describe('submitForReview (T-16)', () => {
  it('author → draft→in_review OK + asset_versions 2건 (T-20)', () => {
    const a = mkAsset('submit-own', AUTHOR_ID)
    const r = submitForReview(a.id, AUTHOR_ID, 'member', db)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.asset.status).toBe('in_review')
    expect(versions(a.id)).toBe(2)
  })

  it('non-author member → FORBIDDEN', () => {
    const a = mkAsset('submit-other', AUTHOR_ID)
    const r = submitForReview(a.id, MEMBER_ID, 'member', db)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('FORBIDDEN')
  })

  it('reviewer → OK (타인 자산도 가능)', () => {
    const a = mkAsset('submit-reviewer', AUTHOR_ID)
    const r = submitForReview(a.id, REVIEWER_ID, 'reviewer', db)
    expect(r.ok).toBe(true)
  })

  it('admin → OK', () => {
    const a = mkAsset('submit-admin', AUTHOR_ID)
    const r = submitForReview(a.id, ADMIN_ID, 'admin', db)
    expect(r.ok).toBe(true)
  })

  it('이미 in_review → INVALID_TRANSITION', () => {
    const a = mkAsset('submit-again', AUTHOR_ID)
    submitForReview(a.id, AUTHOR_ID, 'member', db)
    const r = submitForReview(a.id, AUTHOR_ID, 'member', db)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('INVALID_TRANSITION')
  })

  it('존재하지 않는 ID → NOT_FOUND', () => {
    const r = submitForReview('00000000-0000-0000-0000-000000000001', AUTHOR_ID, 'member', db)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('NOT_FOUND')
  })
})

// ── transitionStatus PATCH /status (T-16·T-34, 14케이스) ────────────────────

describe('transitionStatus (T-16·T-34)', () => {
  it('in_review → approved (reviewer ≠ author) → OK', () => {
    const a = mkAsset('approve-ok', AUTHOR_ID)
    submitForReview(a.id, AUTHOR_ID, 'member', db)
    const r = transitionStatus(a.id, 'approved', REVIEWER_ID, 'reviewer', db)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.asset.status).toBe('approved')
  })

  it('in_review → approved (reviewer IS author) → FORBIDDEN self-review (T-16)', () => {
    const a = mkAsset('self-review', REVIEWER_ID)
    submitForReview(a.id, REVIEWER_ID, 'reviewer', db)
    const r = transitionStatus(a.id, 'approved', REVIEWER_ID, 'reviewer', db)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('FORBIDDEN')
  })

  it('in_review → approved (system_user IS author) → OK [T-34 예외]', () => {
    const a = mkAsset('system-self-approve', SYSTEM_ID)
    submitForReview(a.id, SYSTEM_ID, 'system_user', db)
    const r = transitionStatus(a.id, 'approved', SYSTEM_ID, 'system_user', db)
    expect(r.ok).toBe(true)
  })

  it('in_review → approved by member → FORBIDDEN', () => {
    const a = mkAsset('approve-member', AUTHOR_ID)
    submitForReview(a.id, AUTHOR_ID, 'member', db)
    const r = transitionStatus(a.id, 'approved', MEMBER_ID, 'member', db)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('FORBIDDEN')
  })

  it('in_review → draft (reviewer rejects, reason_code 포함) → OK', () => {
    const a = mkAsset('reject-ok', AUTHOR_ID)
    submitForReview(a.id, AUTHOR_ID, 'member', db)
    const r = transitionStatus(a.id, 'draft', REVIEWER_ID, 'reviewer', db, { reasonCode: 'R-03' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.asset.status).toBe('draft')
    // change_note에 reason_code 저장 확인
    const ver = db.prepare(
      `SELECT change_note FROM asset_versions WHERE asset_id = ? ORDER BY rowid DESC LIMIT 1`,
    ).get(a.id) as { change_note: string }
    expect(JSON.parse(ver.change_note).reason_code).toBe('R-03')
  })

  it('in_review → draft, reason_code 없음 → REASON_REQUIRED', () => {
    const a = mkAsset('reject-no-reason', AUTHOR_ID)
    submitForReview(a.id, AUTHOR_ID, 'member', db)
    const r = transitionStatus(a.id, 'draft', REVIEWER_ID, 'reviewer', db)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('REASON_REQUIRED')
  })

  it('in_review → draft by member → FORBIDDEN', () => {
    const a = mkAsset('reject-member', AUTHOR_ID)
    submitForReview(a.id, AUTHOR_ID, 'member', db)
    const r = transitionStatus(a.id, 'draft', MEMBER_ID, 'member', db, { reasonCode: 'R-05' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('FORBIDDEN')
  })

  it('approved → deprecated by admin → OK', () => {
    const a = mkAsset('deprecate-ok', AUTHOR_ID)
    submitForReview(a.id, AUTHOR_ID, 'member', db)
    transitionStatus(a.id, 'approved', REVIEWER_ID, 'reviewer', db)
    const r = transitionStatus(a.id, 'deprecated', ADMIN_ID, 'admin', db)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.asset.status).toBe('deprecated')
  })

  it('approved → deprecated by reviewer → FORBIDDEN', () => {
    const a = mkAsset('deprecate-reviewer', AUTHOR_ID)
    submitForReview(a.id, AUTHOR_ID, 'member', db)
    transitionStatus(a.id, 'approved', REVIEWER_ID, 'reviewer', db)
    const r = transitionStatus(a.id, 'deprecated', REVIEWER_ID, 'reviewer', db)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('FORBIDDEN')
  })

  it('deprecated → approved by admin (복구) → OK', () => {
    const a = mkAsset('reactivate-ok', AUTHOR_ID)
    submitForReview(a.id, AUTHOR_ID, 'member', db)
    transitionStatus(a.id, 'approved', REVIEWER_ID, 'reviewer', db)
    transitionStatus(a.id, 'deprecated', ADMIN_ID, 'admin', db)
    const r = transitionStatus(a.id, 'approved', ADMIN_ID, 'admin', db)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.asset.status).toBe('approved')
  })

  it('deprecated → approved by reviewer → FORBIDDEN', () => {
    const a = mkAsset('reactivate-reviewer', AUTHOR_ID)
    submitForReview(a.id, AUTHOR_ID, 'member', db)
    transitionStatus(a.id, 'approved', REVIEWER_ID, 'reviewer', db)
    transitionStatus(a.id, 'deprecated', ADMIN_ID, 'admin', db)
    const r = transitionStatus(a.id, 'approved', REVIEWER_ID, 'reviewer', db)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('FORBIDDEN')
  })

  it('draft → approved (단계 건너뜀) → INVALID_TRANSITION', () => {
    const a = mkAsset('skip-step', AUTHOR_ID)
    const r = transitionStatus(a.id, 'approved', ADMIN_ID, 'admin', db)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('INVALID_TRANSITION')
  })

  it('draft → deprecated → INVALID_TRANSITION', () => {
    const a = mkAsset('draft-to-dep', AUTHOR_ID)
    const r = transitionStatus(a.id, 'deprecated', ADMIN_ID, 'admin', db)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('INVALID_TRANSITION')
  })

  it('approved → draft (직접 되돌리기 불가) → INVALID_TRANSITION', () => {
    const a = mkAsset('approved-to-draft', AUTHOR_ID)
    submitForReview(a.id, AUTHOR_ID, 'member', db)
    transitionStatus(a.id, 'approved', REVIEWER_ID, 'reviewer', db)
    const r = transitionStatus(a.id, 'draft', ADMIN_ID, 'admin', db)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('INVALID_TRANSITION')
  })
})

// ── D-B review_action events (T-31D + 보강 #1) ─────────────────────────────

describe('D-B review_action usage_events (T-31D)', () => {
  const getReviewEvents = (assetId: string) =>
    db.prepare(
      `SELECT event_type, review_metadata FROM usage_events WHERE asset_id = ? AND event_type = 'review_action' ORDER BY rowid ASC`
    ).all(assetId) as { event_type: string; review_metadata: string }[]

  it('submitForReview → review_action "submit" INSERT (review_metadata NOT NULL)', () => {
    const a = mkAsset('review-event-submit', AUTHOR_ID)
    submitForReview(a.id, AUTHOR_ID, 'member', db)

    const events = getReviewEvents(a.id)
    expect(events).toHaveLength(1)
    const meta = JSON.parse(events[0]!.review_metadata) as Record<string, unknown>
    expect(meta['action']).toBe('submit')
    expect(meta['actor_id']).toBe(AUTHOR_ID)
    expect(meta['reason_code']).toBeNull()
  })

  it('approve → review_action "approve" INSERT', () => {
    const a = mkAsset('review-event-approve', AUTHOR_ID)
    submitForReview(a.id, AUTHOR_ID, 'member', db)
    transitionStatus(a.id, 'approved', REVIEWER_ID, 'reviewer', db)

    const events = getReviewEvents(a.id)
    // submit + approve = 2 events
    const approveEvt = events.find((e) => JSON.parse(e.review_metadata)['action'] === 'approve')
    expect(approveEvt).toBeTruthy()
    const meta = JSON.parse(approveEvt!.review_metadata) as Record<string, unknown>
    expect(meta['actor_id']).toBe(REVIEWER_ID)
  })

  it('reject → review_action "reject" + reason_code 저장', () => {
    const a = mkAsset('review-event-reject', AUTHOR_ID)
    submitForReview(a.id, AUTHOR_ID, 'member', db)
    transitionStatus(a.id, 'draft', REVIEWER_ID, 'reviewer', db, { reasonCode: 'R-07' })

    const events = getReviewEvents(a.id)
    const rejectEvt = events.find((e) => JSON.parse(e.review_metadata)['action'] === 'reject')
    expect(rejectEvt).toBeTruthy()
    const meta = JSON.parse(rejectEvt!.review_metadata) as Record<string, unknown>
    expect(meta['reason_code']).toBe('R-07')
  })

  it('deprecate → review_action "deprecate" INSERT', () => {
    const a = mkAsset('review-event-deprecate', AUTHOR_ID)
    submitForReview(a.id, AUTHOR_ID, 'member', db)
    transitionStatus(a.id, 'approved', REVIEWER_ID, 'reviewer', db)
    transitionStatus(a.id, 'deprecated', ADMIN_ID, 'admin', db)

    const events = getReviewEvents(a.id)
    const deprEvt = events.find((e) => JSON.parse(e.review_metadata)['action'] === 'deprecate')
    expect(deprEvt).toBeTruthy()
  })
})
