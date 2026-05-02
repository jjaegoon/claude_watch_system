import { Hono } from 'hono'
import { sqlite } from '@team-claude/db/client'
import { requireAuth } from '../middleware/auth.js'
import { DailyStatsQuerySchema, TopAssetsQuerySchema } from '../schemas/stats.js'
import { getDailyAssetStats, getDailyUserStats, getTopAssets, getReviewActivity } from '../services/statsQueryService.js'

export const statsRoute = new Hono()

statsRoute.use('*', requireAuth)

// GET /stats/daily-assets?days=30
statsRoute.get('/daily-assets', (c) => {
  const parsed = DailyStatsQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ ok: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } }, 400)
  const rows = getDailyAssetStats(sqlite, parsed.data.days)
  return c.json({ ok: true, data: rows })
})

// GET /stats/daily-users?days=30
statsRoute.get('/daily-users', (c) => {
  const parsed = DailyStatsQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ ok: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } }, 400)
  const rows = getDailyUserStats(sqlite, parsed.data.days)
  return c.json({ ok: true, data: rows })
})

// GET /stats/top-assets?days=30&limit=10&metric=view_count
statsRoute.get('/top-assets', (c) => {
  const parsed = TopAssetsQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ ok: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } }, 400)
  const { days, limit, metric } = parsed.data
  const rows = getTopAssets(sqlite, days, limit, metric)
  return c.json({ ok: true, data: rows })
})

// GET /stats/review-activity?days=30
statsRoute.get('/review-activity', (c) => {
  const parsed = DailyStatsQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ ok: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } }, 400)
  const rows = getReviewActivity(sqlite, parsed.data.days)
  return c.json({ ok: true, data: rows })
})
