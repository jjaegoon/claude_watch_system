import Database from 'better-sqlite3'

export type NotificationRow = {
  id: string
  userId: string
  eventType: string
  assetId: string | null
  metadata: string
  readAt: number | null
  createdAt: number
}

export type ListNotificationsResult = {
  items: NotificationRow[]
  unread_count: number
}

/** C-1 RBAC: user_id = userId 필터 강제 — 타인 알림 노출 차단. */
export const listNotifications = (
  userId: string,
  unreadOnly: boolean,
  db: InstanceType<typeof Database>,
): ListNotificationsResult => {
  const conditions = ['user_id = ?']
  const params: unknown[] = [userId]

  if (unreadOnly) {
    conditions.push('read_at IS NULL')
  }

  const where = conditions.join(' AND ')

  const items = db.prepare(`
    SELECT id, user_id AS userId, event_type AS eventType, asset_id AS assetId,
           metadata, read_at AS readAt, created_at AS createdAt
    FROM notifications
    WHERE ${where}
    ORDER BY created_at DESC, id DESC
  `).all(...params) as NotificationRow[]

  const unreadRow = db.prepare(`
    SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL
  `).get(userId) as { count: number } | undefined

  return {
    items,
    unread_count: unreadRow?.count ?? 0,
  }
}

/**
 * C-1 RBAC: WHERE id = ? AND user_id = ? — 타인 알림 mark-read 차단.
 * 이미 읽은 경우도 null 반환 (changes = 0).
 */
export const markRead = (
  notificationId: string,
  userId: string,
  db: InstanceType<typeof Database>,
): { id: string; read_at: number } | null => {
  const ts = Math.floor(Date.now() / 1000)

  const result = db.prepare(`
    UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL
  `).run(ts, notificationId, userId)

  if (result.changes === 0) return null

  return { id: notificationId, read_at: ts }
}
