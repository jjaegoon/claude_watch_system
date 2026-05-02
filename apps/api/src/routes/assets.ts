import { Hono } from 'hono'
import { sqlite } from '@team-claude/db/client'
import { requireAuth } from '../middleware/auth.js'
import { assetListQuerySchema, assetIdParamSchema, createAssetSchema, updateAssetSchema, statusTransitionSchema } from '../schemas/asset.js'
import { listAssets, getAssetById } from '../services/assetQueryService.js'
import { buildFts5Query } from '../services/searchService.js'
import { createAsset, updateAsset } from '../services/assetWriteService.js'
import { transitionStatus, submitForReview } from '../services/assetStatusService.js'

export const assetsRoute = new Hono()

assetsRoute.use('*', requireAuth)

// GET /assets
assetsRoute.get('/', async (c) => {
  const user = c.get('user')

  const parsed = assetListQuerySchema.safeParse(c.req.query())
  if (!parsed.success) {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } },
      400,
    )
  }

  const query = parsed.data

  // Opt B: 3자 미만 q → 400 INVALID_INPUT
  if (query.q !== undefined) {
    const fts = buildFts5Query(query.q)
    if (query.q.trim().length > 0 && fts === '') {
      return c.json(
        { ok: false, error: { code: 'INVALID_INPUT', message: '검색어는 3자 이상 입력하세요 (trigram 최소 토큰)' } },
        400,
      )
    }
  }

  const result = await listAssets(query, user.sub, user.role, sqlite)
  return c.json({ ok: true, data: result })
})

// POST /assets (T-19·T-20·T-31B2·T-31C)
assetsRoute.post('/', async (c) => {
  const user = c.get('user')

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: '요청 본문이 JSON 형식이 아닙니다' } },
      400,
    )
  }

  const parsed = createAssetSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } },
      400,
    )
  }

  try {
    const asset = createAsset({ ...parsed.data, authorId: user.sub }, sqlite)
    return c.json({ ok: true, data: asset }, 201)
  } catch {
    return c.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: '자산 생성 중 오류가 발생했습니다' } },
      500,
    )
  }
})

// PUT /assets/:id (T-19·T-20·T-16·T-31B2)
assetsRoute.put('/:id', async (c) => {
  const user = c.get('user')

  const paramParsed = assetIdParamSchema.safeParse({ id: c.req.param('id') })
  if (!paramParsed.success) {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: '유효하지 않은 asset ID' } },
      400,
    )
  }

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: '요청 본문이 JSON 형식이 아닙니다' } },
      400,
    )
  }

  const bodyParsed = updateAssetSchema.safeParse(body)
  if (!bodyParsed.success) {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: bodyParsed.error.message } },
      400,
    )
  }

  try {
    const asset = updateAsset(paramParsed.data.id, bodyParsed.data, user.sub, user.role, sqlite)
    if (!asset) {
      return c.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'Asset을 찾을 수 없습니다' } },
        404,
      )
    }
    return c.json({ ok: true, data: asset })
  } catch {
    return c.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: '자산 수정 중 오류가 발생했습니다' } },
      500,
    )
  }
})

// POST /assets/:id/submit-for-review (T-16: draft→in_review, author OR reviewer+)
assetsRoute.post('/:id/submit-for-review', async (c) => {
  const user = c.get('user')

  const paramParsed = assetIdParamSchema.safeParse({ id: c.req.param('id') })
  if (!paramParsed.success) {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: '유효하지 않은 asset ID' } },
      400,
    )
  }

  try {
    const result = submitForReview(paramParsed.data.id, user.sub, user.role, sqlite)
    if (!result.ok) {
      const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'INVALID_TRANSITION' ? 409 : 403
      return c.json({ ok: false, error: { code: result.code, message: result.message } }, status)
    }
    return c.json({ ok: true, data: result.asset })
  } catch {
    return c.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: '상태 전이 중 오류가 발생했습니다' } },
      500,
    )
  }
})

// PATCH /assets/:id/status (T-16 전이 매트릭스 + T-34 system_user 예외)
assetsRoute.patch('/:id/status', async (c) => {
  const user = c.get('user')

  const paramParsed = assetIdParamSchema.safeParse({ id: c.req.param('id') })
  if (!paramParsed.success) {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: '유효하지 않은 asset ID' } },
      400,
    )
  }

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: '요청 본문이 JSON 형식이 아닙니다' } },
      400,
    )
  }

  const bodyParsed = statusTransitionSchema.safeParse(body)
  if (!bodyParsed.success) {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: bodyParsed.error.message } },
      400,
    )
  }

  try {
    const result = transitionStatus(
      paramParsed.data.id,
      bodyParsed.data.status,
      user.sub,
      user.role,
      sqlite,
      { reasonCode: bodyParsed.data.reason_code, changeNote: bodyParsed.data.change_note },
    )
    if (!result.ok) {
      const status = result.code === 'NOT_FOUND' ? 404
        : result.code === 'INVALID_TRANSITION' ? 409
        : result.code === 'REASON_REQUIRED' ? 422
        : 403
      return c.json({ ok: false, error: { code: result.code, message: result.message } }, status)
    }
    return c.json({ ok: true, data: result.asset })
  } catch {
    return c.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: '상태 전이 중 오류가 발생했습니다' } },
      500,
    )
  }
})

// GET /assets/:id/download — 자산 type별 다운로드 정보 (M5 영역 #2)
assetsRoute.get('/:id/download', async (c) => {
  const user = c.get('user')

  const parsed = assetIdParamSchema.safeParse({ id: c.req.param('id') })
  if (!parsed.success) {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: '유효하지 않은 asset ID' } },
      400,
    )
  }

  const asset = await getAssetById(parsed.data.id, user.sub, user.role, sqlite)

  if (!asset) {
    return c.json(
      { ok: false, error: { code: 'NOT_FOUND', message: 'Asset을 찾을 수 없습니다' } },
      404,
    )
  }

  let typeFields: Record<string, unknown> = {}
  try {
    typeFields = (typeof asset.typeFields === 'string'
      ? JSON.parse(asset.typeFields)
      : (asset.typeFields ?? {})) as Record<string, unknown>
  } catch { /* empty typeFields */ }

  let downloadInfo: Record<string, unknown>
  const assetName = asset.name as string
  const assetType = asset.type as string

  if (assetType === 'skill') {
    const repoPath = typeFields.repo_path as string | undefined
    const installTarget = (typeFields.install_target as string | undefined)
      ?? `~/.claude/skills/${assetName}/`
    downloadInfo = {
      type: 'skill',
      name: assetName,
      repo_path: repoPath ?? null,
      install_target: installTarget,
      install_command: repoPath
        ? `git clone <ASSETS_REPO_URL>/${repoPath} "${installTarget}"`
        : null,
    }
  } else if (assetType === 'prompt') {
    downloadInfo = {
      type: 'prompt',
      name: assetName,
      body_text: (typeFields.body_text as string | undefined) ?? (asset.description as string | null) ?? '',
    }
  } else if (assetType === 'command') {
    const repoPath = typeFields.repo_path as string | undefined
    const installTarget = (typeFields.install_target as string | undefined)
      ?? `~/.claude/commands/${assetName}.md`
    downloadInfo = {
      type: 'command',
      name: assetName,
      repo_path: repoPath ?? null,
      install_target: installTarget,
      body_text: (typeFields.body_text as string | undefined) ?? (asset.description as string | null) ?? '',
    }
  } else {
    // mcp
    downloadInfo = {
      type: 'mcp',
      name: assetName,
      repo_url: (typeFields.repo_url as string | undefined) ?? null,
      mcp_config: (typeFields.mcp_config as string | undefined) ?? null,
    }
  }

  // asset_install 이벤트 기록 (fire-and-forget, gotcha #18 정합 — ORDER BY ts, rowid)
  try {
    sqlite.prepare(
      `INSERT INTO usage_events (id, user_id, event_type, asset_id, ts, metadata)
       VALUES (?, ?, 'asset_install', ?, unixepoch(), '{"source":"catalog_ui"}')`
    ).run(crypto.randomUUID(), user.sub, parsed.data.id)
  } catch { /* fire-and-forget */ }

  return c.json({ ok: true, data: downloadInfo })
})

// GET /assets/:id
assetsRoute.get('/:id', async (c) => {
  const user = c.get('user')

  const parsed = assetIdParamSchema.safeParse({ id: c.req.param('id') })
  if (!parsed.success) {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: '유효하지 않은 asset ID' } },
      400,
    )
  }

  const asset = await getAssetById(parsed.data.id, user.sub, user.role, sqlite)

  if (!asset) {
    return c.json(
      { ok: false, error: { code: 'NOT_FOUND', message: 'Asset을 찾을 수 없습니다' } },
      404,
    )
  }

  // asset_view 이벤트 기록 — bot 차단, fire-and-forget (M5 영역 #1)
  const ua = c.req.header('user-agent') ?? ''
  if (!/bot|crawler|spider/i.test(ua)) {
    try {
      sqlite.prepare(
        `INSERT INTO usage_events (id, user_id, event_type, asset_id, ts, metadata)
         VALUES (?, ?, 'asset_view', ?, unixepoch(), '{"source":"catalog_ui"}')`
      ).run(crypto.randomUUID(), user.sub, parsed.data.id)
    } catch { /* fire-and-forget */ }
  }

  return c.json({ ok: true, data: asset })
})
