/**
 * T-16 상태 전이 서비스.
 * 전이 허용 매트릭스, RBAC(T-34 system_user 예외 포함), asset_versions 스냅샷(T-20).
 */
import Database from 'better-sqlite3'
import type { UserRole } from '../lib/db.js'
import type { AssetRow } from './assetQueryService.js'

const now = (): number => Math.floor(Date.now() / 1000)

type StatusCode = 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_TRANSITION' | 'REASON_REQUIRED'

export type StatusTransitionResult =
  | { ok: true; asset: AssetRow }
  | { ok: false; code: StatusCode; message: string }

/** T-16 허용 전이 매트릭스 */
const TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  draft:      ['in_review'],
  in_review:  ['approved', 'draft'],
  approved:   ['deprecated'],
  deprecated: ['approved'],
}

const FETCH_SQL = `
  SELECT id, type, name, description, tags,
         author_id AS authorId, version, status,
         source_path AS sourcePath, type_fields AS typeFields,
         created_at AS createdAt, updated_at AS updatedAt
  FROM assets WHERE id = ?
`

function rbacCheck(
  existing: AssetRow,
  newStatus: string,
  userId: string,
  role: UserRole,
): { ok: false; code: 'FORBIDDEN'; message: string } | null {
  const from = existing.status
  const authorId = existing.authorId

  if (from === 'draft' && newStatus === 'in_review') {
    if (role === 'member' && authorId !== userId) {
      return { ok: false, code: 'FORBIDDEN', message: 'draft → in_review: 작성자 본인 또는 reviewer+ 권한 필요' }
    }
    return null
  }

  if (from === 'in_review' && newStatus === 'approved') {
    if (role === 'member') {
      return { ok: false, code: 'FORBIDDEN', message: 'in_review → approved: reviewer+ 권한 필요' }
    }
    // T-16 self-review 방지; T-34 system_user 예외
    if (authorId === userId && role !== 'system_user') {
      return { ok: false, code: 'FORBIDDEN', message: 'in_review → approved: self-review 금지 (T-16)' }
    }
    return null
  }

  if (from === 'in_review' && newStatus === 'draft') {
    if (role === 'member') {
      return { ok: false, code: 'FORBIDDEN', message: 'in_review → draft(반려): reviewer+ 권한 필요' }
    }
    return null
  }

  if ((from === 'approved' && newStatus === 'deprecated') ||
      (from === 'deprecated' && newStatus === 'approved')) {
    if (role !== 'admin') {
      return { ok: false, code: 'FORBIDDEN', message: `${from} → ${newStatus}: admin 권한 필요` }
    }
    return null
  }

  return null
}

/** 단일 트랜잭션 상태 전이 + asset_versions 스냅샷 (T-20). */
export const transitionStatus = (
  assetId: string,
  newStatus: string,
  userId: string,
  role: UserRole,
  db: InstanceType<typeof Database>,
  opts?: { reasonCode?: string; changeNote?: string },
): StatusTransitionResult => {
  const existing = db.prepare(FETCH_SQL).get(assetId) as AssetRow | undefined
  if (!existing) return { ok: false, code: 'NOT_FOUND', message: 'Asset을 찾을 수 없습니다' }

  const allowed = TRANSITIONS[existing.status] ?? []
  if (!allowed.includes(newStatus)) {
    return {
      ok: false, code: 'INVALID_TRANSITION',
      message: `${existing.status} → ${newStatus} 전이는 허용되지 않습니다`,
    }
  }

  // in_review → draft 반려 시 reason_code 필수 (자산_품질_기준 §4)
  if (existing.status === 'in_review' && newStatus === 'draft' && !opts?.reasonCode) {
    return { ok: false, code: 'REASON_REQUIRED', message: '반려 시 reason_code 필수 (R-01 ~ R-12)' }
  }

  const rbac = rbacCheck(existing, newStatus, userId, role)
  if (rbac) return rbac

  const ts = now()
  const changeNote = opts?.reasonCode
    ? JSON.stringify({ reason_code: opts.reasonCode, note: opts.changeNote ?? null })
    : (opts?.changeNote ?? null)

  const insertVersion = db.prepare(`
    INSERT INTO asset_versions (id, asset_id, version, snapshot, changed_by, change_note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  db.transaction(() => {
    db.prepare(`UPDATE assets SET status = ?, updated_at = ? WHERE id = ?`).run(newStatus, ts, assetId)
    const updated = { ...existing, status: newStatus, updatedAt: ts }
    insertVersion.run(
      crypto.randomUUID(), assetId, existing.version,
      JSON.stringify(updated), userId, changeNote, ts,
    )
  })()

  return { ok: true, asset: db.prepare(FETCH_SQL).get(assetId) as AssetRow }
}

/** draft → in_review 편의 endpoint (T-16: author OR reviewer+). */
export const submitForReview = (
  assetId: string,
  userId: string,
  role: UserRole,
  db: InstanceType<typeof Database>,
): StatusTransitionResult => transitionStatus(assetId, 'in_review', userId, role, db)
