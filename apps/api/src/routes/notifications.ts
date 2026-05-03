import { Hono } from 'hono'
import { sqlite } from '@team-claude/db/client'
import { requireAuth } from '../middleware/auth.js'
import { notificationIdParamSchema, listNotificationsQuerySchema } from '../schemas/notification.js'
import { listNotifications, markRead } from '../services/notificationService.js'

export const notificationsRoute = new Hono()

notificationsRoute.use('*', requireAuth)

// GET /notifications — C-1 RBAC: 요청 사용자 본인 알림만 (user_id = req.user.sub)
notificationsRoute.get('/', (c) => {
  const user = c.get('user')

  const parsed = listNotificationsQuerySchema.safeParse(c.req.query())
  const unreadOnly = parsed.success && parsed.data.unread === 1

  const result = listNotifications(user.sub, unreadOnly, sqlite)
  return c.json({ ok: true, data: result })
})

// PATCH /notifications/:id/read — C-1 RBAC: WHERE id=? AND user_id=? (타인 알림 갱신 차단)
notificationsRoute.patch('/:id/read', (c) => {
  const user = c.get('user')

  const paramParsed = notificationIdParamSchema.safeParse({ id: c.req.param('id') })
  if (!paramParsed.success) {
    return c.json(
      { ok: false, error: { code: 'INVALID_INPUT', message: '유효하지 않은 notification ID' } },
      400,
    )
  }

  const result = markRead(paramParsed.data.id, user.sub, sqlite)
  if (!result) {
    return c.json(
      { ok: false, error: { code: 'NOT_FOUND', message: '알림을 찾을 수 없거나 이미 읽었습니다' } },
      404,
    )
  }

  return c.json({ ok: true, data: result })
})
