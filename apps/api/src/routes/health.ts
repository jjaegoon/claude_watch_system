import { Hono } from 'hono'
import { pingDb, getWebhookPendingCount } from '../lib/db.js'
import { getQueueSize } from '../lib/queue.js'

/**
 * T-24 /health: BetterStack 모니터링 + 어드민 가시성.
 * 응답 6필드: status, db, queue_size, webhook_jobs_pending, version, uptime_seconds.
 * dbOk이면 200, 아니면 503.
 */
export const healthRoute = new Hono()

healthRoute.get('/', async (c) => {
  const dbOk = pingDb()
  const pending = dbOk ? getWebhookPendingCount() : 0

  return c.json(
    {
      status: dbOk ? 'ok' : 'error',
      db: dbOk ? 'ok' : 'error',
      queue_size: getQueueSize(),
      webhook_jobs_pending: pending,
      version: process.env.APP_VERSION ?? 'dev',
      uptime_seconds: Math.floor(process.uptime()),
    },
    dbOk ? 200 : 503,
  )
})
