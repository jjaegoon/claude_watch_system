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

  return c.json({ ok: true, data: asset })
})
