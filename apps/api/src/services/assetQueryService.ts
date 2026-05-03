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

export type TagRow = { tag: string; count: number }

/**
 * 승인된 자산의 DISTINCT 태그 목록 + 자산 수 집계 (U-Mj-3).
 * gotcha #18: compound ORDER BY 의무 — count DESC, tag ASC
 */
export const getTags = (db: InstanceType<typeof Database>): TagRow[] => {
  return db.prepare(`
    SELECT t.value AS tag, COUNT(DISTINCT a.id) AS count
    FROM assets a, json_each(a.tags) AS t
    WHERE a.status = 'approved'
      AND t.value IS NOT NULL
      AND t.value != ''
    GROUP BY t.value
    ORDER BY count DESC, t.value ASC
  `).all() as TagRow[]
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
  const { q, type, status, tag, limit = 20, cursor, sort = 'updated_at' } = query

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

  // tag 필터 (U-Mj-3: json_each 서브쿼리)
  if (tag) {
    conditions.push('EXISTS (SELECT 1 FROM json_each(a.tags) WHERE value = ?)')
    params.push(tag)
  }

  // cursor 페이지네이션 (gotcha #18: compound ORDER BY 정합)
  const isCountSort = sort === 'view_count' || sort === 'download_count'
  if (cur) {
    if (sort === 'updated_at' || sort === 'last_updated') {
      conditions.push('(a.updated_at < ? OR (a.updated_at = ? AND a.id < ?))')
      params.push(cur.updated_at, cur.updated_at, cur.id)
    } else {
      // name·view_count·download_count: id 기반 cursor (D-10 정합)
      conditions.push('a.id < ?')
      params.push(cur.id)
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // SELECT + ORDER BY (gotcha #18: 모든 ORDER BY compound 정합)
  let selectSql: string
  let orderBy: string

  if (isCountSort) {
    const eventType = sort === 'view_count' ? 'asset_view' : 'asset_download'
    selectSql = `
      SELECT a.id, a.type, a.name, a.description, a.tags,
             a.author_id AS authorId, a.version, a.status,
             a.source_path AS sourcePath, a.type_fields AS typeFields,
             a.created_at AS createdAt, a.updated_at AS updatedAt,
             (SELECT COUNT(*) FROM usage_events ue
              WHERE ue.asset_id = a.id AND ue.event_type = '${eventType}') AS sort_count
      FROM assets a
      ${where}`
    orderBy = 'sort_count DESC, a.id DESC'
  } else {
    selectSql = `
      SELECT a.id, a.type, a.name, a.description, a.tags,
             a.author_id AS authorId, a.version, a.status,
             a.source_path AS sourcePath, a.type_fields AS typeFields,
             a.created_at AS createdAt, a.updated_at AS updatedAt
      FROM assets a
      ${where}`
    orderBy = (sort === 'name') ? 'a.name ASC, a.id ASC' : 'a.updated_at DESC, a.id DESC'
  }

  // limit+1 조회로 next_cursor 존재 여부 확인
  const sql = `${selectSql} ORDER BY ${orderBy} LIMIT ?`
  params.push(limit + 1)

  const rows = db.prepare(sql).all(...params) as (AssetRow & { sort_count?: number })[]

  let nextCursor: string | null = null
  if (rows.length > limit) {
    rows.pop()
    const last = rows[rows.length - 1]
    if (last) {
      nextCursor = encodeCursor({ id: last.id, updated_at: last.updatedAt })
    }
  }

  // sort_count 컬럼은 내부 정렬용 — 응답에서 제외
  const items: AssetRow[] = rows.map(({ sort_count: _sc, ...rest }) => rest)

  return { items, nextCursor }
}
