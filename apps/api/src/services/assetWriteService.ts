/**
 * T-19 POST /assets + PUT /assets/:id 서비스.
 * T-20 asset_versions 스냅샷은 INSERT/UPDATE와 동일 트랜잭션으로 보장.
 * T-31B2: caller는 try-catch + 5xx 응답 패턴 사용 (내부 DB 오류는 throw).
 */
import Database from 'better-sqlite3'
import type { UserRole } from '../lib/db.js'
import type { CreateAssetInput, UpdateAssetInput } from '../schemas/asset.js'
import type { AssetRow } from './assetQueryService.js'

const now = (): number => Math.floor(Date.now() / 1000)

/** 단일 트랜잭션: assets INSERT + asset_versions INSERT (T-20). */
export const createAsset = (
  input: CreateAssetInput & { authorId: string },
  db: InstanceType<typeof Database>,
): AssetRow => {
  const id = crypto.randomUUID()
  const ts = now()

  const insertAsset = db.prepare(`
    INSERT INTO assets
      (id, type, name, description, tags, author_id, version, status, source_path, type_fields, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
  `)

  const insertVersion = db.prepare(`
    INSERT INTO asset_versions (id, asset_id, version, snapshot, changed_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  db.transaction(() => {
    insertAsset.run(
      id,
      input.type,
      input.name,
      input.description ?? null,
      JSON.stringify(input.tags ?? []),
      input.authorId,
      input.version,
      input.sourcePath ?? null,
      JSON.stringify(input.typeFields ?? {}),
      ts,
      ts,
    )

    const snapshot = {
      id, type: input.type, name: input.name,
      description: input.description ?? null,
      tags: input.tags ?? [],
      authorId: input.authorId,
      version: input.version,
      status: 'draft',
      sourcePath: input.sourcePath ?? null,
      typeFields: input.typeFields ?? {},
      createdAt: ts, updatedAt: ts,
    }

    insertVersion.run(
      crypto.randomUUID(), id, input.version,
      JSON.stringify(snapshot), input.authorId, ts,
    )
  })()

  return db.prepare(
    `SELECT id, type, name, description, tags,
            author_id AS authorId, version, status,
            source_path AS sourcePath, type_fields AS typeFields,
            created_at AS createdAt, updated_at AS updatedAt
     FROM assets WHERE id = ?`,
  ).get(id) as AssetRow
}

/** 부분 업데이트: 제공된 필드만 갱신 + asset_versions 스냅샷 INSERT (T-20). */
export const updateAsset = (
  assetId: string,
  input: UpdateAssetInput,
  userId: string,
  role: UserRole,
  db: InstanceType<typeof Database>,
): AssetRow | null => {
  const existing = db.prepare(
    `SELECT id, type, name, description, tags,
            author_id AS authorId, version, status,
            source_path AS sourcePath, type_fields AS typeFields,
            created_at AS createdAt, updated_at AS updatedAt
     FROM assets WHERE id = ?`,
  ).get(assetId) as AssetRow | undefined

  if (!existing) return null

  // RBAC: author는 본인 draft만, reviewer+/admin은 모든 자산 수정 가능
  if (role === 'member' && existing.authorId !== userId) return null

  const sets: string[] = []
  const params: unknown[] = []

  if (input.name !== undefined)        { sets.push('name = ?');        params.push(input.name) }
  if (input.description !== undefined) { sets.push('description = ?'); params.push(input.description) }
  if (input.tags !== undefined)        { sets.push('tags = ?');        params.push(JSON.stringify(input.tags)) }
  if (input.version !== undefined)     { sets.push('version = ?');     params.push(input.version) }
  if (input.sourcePath !== undefined)  { sets.push('source_path = ?'); params.push(input.sourcePath) }
  if (input.typeFields !== undefined)  { sets.push('type_fields = ?'); params.push(JSON.stringify(input.typeFields)) }

  if (sets.length === 0) return existing  // no-op

  const ts = now()
  sets.push('updated_at = ?')
  params.push(ts)
  params.push(assetId)

  const insertVersion = db.prepare(`
    INSERT INTO asset_versions (id, asset_id, version, snapshot, changed_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  db.transaction(() => {
    db.prepare(`UPDATE assets SET ${sets.join(', ')} WHERE id = ?`).run(...params)

    const updated = {
      ...existing,
      ...(input.name        !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.tags        !== undefined && { tags: JSON.stringify(input.tags) }),
      ...(input.version     !== undefined && { version: input.version }),
      ...(input.sourcePath  !== undefined && { sourcePath: input.sourcePath }),
      ...(input.typeFields  !== undefined && { typeFields: JSON.stringify(input.typeFields) }),
      updatedAt: ts,
    }

    insertVersion.run(
      crypto.randomUUID(), assetId,
      updated.version,
      JSON.stringify(updated),
      userId, ts,
    )
  })()

  return db.prepare(
    `SELECT id, type, name, description, tags,
            author_id AS authorId, version, status,
            source_path AS sourcePath, type_fields AS typeFields,
            created_at AS createdAt, updated_at AS updatedAt
     FROM assets WHERE id = ?`,
  ).get(assetId) as AssetRow
}
