import Database from 'better-sqlite3'

export type FeedbackRow = {
  id: string
  userId: string
  assetId: string | null
  feedbackType: string
  content: string
  status: string
  createdAt: number
}

export const createFeedback = (
  data: { userId: string; assetId?: string; feedbackType: string; content: string },
  db: InstanceType<typeof Database>,
): { id: string } => {
  const id = crypto.randomUUID()
  const ts = Math.floor(Date.now() / 1000)

  db.prepare(`
    INSERT INTO feedback (id, user_id, asset_id, feedback_type, content, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?)
  `).run(id, data.userId, data.assetId ?? null, data.feedbackType, data.content, ts)

  return { id }
}

export const listFeedback = (
  query: { assetId?: string },
  db: InstanceType<typeof Database>,
): FeedbackRow[] => {
  const conditions: string[] = []
  const params: unknown[] = []

  if (query.assetId) {
    conditions.push('asset_id = ?')
    params.push(query.assetId)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  return db.prepare(`
    SELECT id, user_id AS userId, asset_id AS assetId, feedback_type AS feedbackType,
           content, status, created_at AS createdAt
    FROM feedback
    ${where}
    ORDER BY created_at DESC, id DESC
  `).all(...params) as FeedbackRow[]
}
