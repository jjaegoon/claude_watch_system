/**
 * T-19 RBAC 필터 + T-27 FTS5 검색 통합 쿼리 서비스.
 *
 * gotcha #13: Drizzle ORM은 FTS5 MATCH 미지원 → raw SQL prepared statement 사용.
 * external content FTS5 패턴: FTS rowid = assets 테이블 내부 INTEGER rowid.
 * JOIN: `WHERE a.rowid IN (SELECT rowid FROM assets_fts WHERE assets_fts MATCH ?)`
 */

import Database from 'better-sqlite3'
import type { UserRole } from '../lib/db.js'
import { buildFts5Query } from './searchService.js'
import type { AssetListQuery } from '../schemas/asset.js'

export type AssetRow = {
  id: string
  type: string
  name: string
  description: string | null
  tags: string          // JSON string
  authorId: string | null
  version: string
  status: string
  sourcePath: string | null
  typeFields: string    // JSON string
  createdAt: number
  updatedAt: number
}

export type ListResult = {
  items: AssetRow[]
  nextCursor: string | null
}

type CursorPayload = { id: string; updated_at: number }

const encodeCursor = (p: CursorPayload): string =>
  Buffer.from(JSON.stringify(p)).toString('base64url')

const decodeCursor = (s: string): CursorPayload | null => {
  try {
    return JSON.parse(Buffer.from(s, 'base64url').toString()) as CursorPayload
  } catch {
    return null
  }
}

export type AssetStats = {
  view_count: number
  download_count: number
}

/** asset_view + asset_download 이벤트 집계 (T-46). */
export const getAssetStats = (
  assetId: string,
  db: InstanceType<typeof Database>,
): AssetStats => {
  const row = db.prepare(`
    SELECT
      COUNT(CASE WHEN event_type = 'asset_view' THEN 1 END) AS view_count,
      COUNT(CASE WHEN event_type = 'asset_download' THEN 1 END) AS download_count
    FROM usage_events
    WHERE asset_id = ?
  `).get(assetId) as { view_count: number; download_count: number } | undefined
  return {
    view_count: row?.view_count ?? 0,
    download_count: row?.download_count ?? 0,
  }
}

/** db 파라미터: 프로덕션은 packages/db client.ts sqlite, 테스트는 in-memory sqlite. */
export const getAssetById = async (
  assetId: string,
  userId: string,
  role: UserRole,
  db: InstanceType<typeof Database>,
): Promise<AssetRow | null> => {
  const row = db.prepare(`
    SELECT id, type, name, description, tags, author_id AS authorId, version, status,
           source_path AS sourcePath, type_fields AS typeFields, created_at AS createdAt,
           updated_at AS updatedAt
    FROM assets
    WHERE id = ?
  `).get(assetId) as AssetRow | undefined

  if (!row) return null

  // RBAC: draft + in_review → member 본인만 (타인은 null = 404)
  if (row.status === 'draft' || row.status === 'in_review') {
    if (role === 'member' && row.authorId !== userId) return null
  }

  return row
}

export const listAssets = async (
  query: AssetListQuery,
  userId: string,
  role: UserRole,
  db: InstanceType<typeof Database>,
): Promise<ListResult> => {
  const { q, type, status, limit = 20, cursor, sort = 'updated_at' } = query

  // FTS5 검색 쿼리 빌드
  const ftsQuery = q ? buildFts5Query(q) : ''

  // cursor 디코드
  const cur = cursor ? decodeCursor(cursor) : null

  // WHERE 절 조건 구성
  const conditions: string[] = []
  const params: unknown[] = []

  // FTS5 서브쿼리 조건 (gotcha #13: raw SQL)
  if (ftsQuery) {
    conditions.push('a.rowid IN (SELECT rowid FROM assets_fts WHERE assets_fts MATCH ?)')
    params.push(ftsQuery)
  }

  // type 필터
  if (type) {
    conditions.push('a.type = ?')
    params.push(type)
  }

  // status + RBAC 필터
  if (!status) {
    // 기본: approved만 (모든 role)
    conditions.push("a.status = 'approved'")
  } else if (status === 'draft' || status === 'in_review') {
    conditions.push('a.status = ?')
    params.push(status)
    // member는 본인 author만
    if (role === 'member') {
      conditions.push('a.author_id = ?')
      params.push(userId)
    }
  } else {
    // approved, deprecated: 모두 접근
    conditions.push('a.status = ?')
    params.push(status)
  }

  // cursor 페이지네이션
  if (cur) {
    if (sort === 'updated_at') {
      conditions.push('(a.updated_at < ? OR (a.updated_at = ? AND a.id < ?))')
      params.push(cur.updated_at, cur.updated_at, cur.id)
    } else {
      // name 정렬 시 cursor는 id 기반
      conditions.push('a.id < ?')
      params.push(cur.id)
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const orderBy = sort === 'updated_at' ? 'a.updated_at DESC, a.id DESC' : 'a.name ASC, a.id ASC'

  // limit+1 조회로 next_cursor 존재 여부 확인
  const sql = `
    SELECT a.id, a.type, a.name, a.description, a.tags,
           a.author_id AS authorId, a.version, a.status,
           a.source_path AS sourcePath, a.type_fields AS typeFields,
           a.created_at AS createdAt, a.updated_at AS updatedAt
    FROM assets a
    ${where}
    ORDER BY ${orderBy}
    LIMIT ?
  `
  params.push(limit + 1)

  const rows = db.prepare(sql).all(...params) as AssetRow[]

  let nextCursor: string | null = null
  if (rows.length > limit) {
    rows.pop()
    const last = rows[rows.length - 1]
    if (last) {
      nextCursor = encodeCursor({ id: last.id, updated_at: last.updatedAt })
    }
  }

  return { items: rows, nextCursor }
}
