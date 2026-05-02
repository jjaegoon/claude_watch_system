import { Hono } from 'hono'
import { sqlite } from '@team-claude/db/client'
import { requireAuth } from '../middleware/auth.js'
import { assetListQuerySchema, assetIdParamSchema } from '../schemas/asset.js'
import { listAssets, getAssetById } from '../services/assetQueryService.js'
import { buildFts5Query } from '../services/searchService.js'

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
