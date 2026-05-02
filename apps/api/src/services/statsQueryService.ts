import Database from 'better-sqlite3'
import { ReviewEventMetadataSchema, type DailyAssetStatRow, type DailyUserStatRow, type TopAssetRow, type ReviewActivityRow } from '../schemas/stats.js'

/** 최근 N일 일별 자산 통계 합산 (모든 자산 sum). */
export const getDailyAssetStats = (db: InstanceType<typeof Database>, days: number): DailyAssetStatRow[] =>
  db.prepare(`
    SELECT stat_date,
           SUM(view_count)    AS view_count,
           SUM(install_count) AS install_count,
           SUM(trigger_count) AS trigger_count
    FROM daily_asset_stats
    WHERE stat_date >= date('now', '-' || ? || ' days')
    GROUP BY stat_date
    ORDER BY stat_date ASC
  `).all(days) as DailyAssetStatRow[]

/** 최근 N일 일별 유저 통계 합산 (모든 유저 sum). */
export const getDailyUserStats = (db: InstanceType<typeof Database>, days: number): DailyUserStatRow[] =>
  db.prepare(`
    SELECT stat_date,
           SUM(session_count)   AS session_count,
           SUM(tool_call_count) AS tool_call_count
    FROM daily_user_stats
    WHERE stat_date >= date('now', '-' || ? || ' days')
    GROUP BY stat_date
    ORDER BY stat_date ASC
  `).all(days) as DailyUserStatRow[]

/** 최근 N일 동안 metric 기준 상위 L개 자산. */
export const getTopAssets = (
  db: InstanceType<typeof Database>,
  days: number,
  limit: number,
  metric: 'view_count' | 'install_count' | 'trigger_count',
): TopAssetRow[] => {
  // metric은 z.enum으로 검증된 값만 도달 — SQL injection 방지 보장
  const col = metric === 'view_count' ? 'view_count'
    : metric === 'install_count' ? 'install_count'
    : 'trigger_count'
  return db.prepare(`
    SELECT das.asset_id,
           a.name  AS asset_name,
           a.type  AS asset_type,
           SUM(das.view_count)    AS view_count,
           SUM(das.install_count) AS install_count,
           SUM(das.trigger_count) AS trigger_count
    FROM daily_asset_stats das
    JOIN assets a ON das.asset_id = a.id
    WHERE das.stat_date >= date('now', '-' || ? || ' days')
    GROUP BY das.asset_id
    ORDER BY SUM(das.${col}) DESC
    LIMIT ?
  `).all(days, limit) as TopAssetRow[]
}

/** 최근 N일 review_action 이벤트 — 보강 #4 Zod 파싱 적용. */
export const getReviewActivity = (db: InstanceType<typeof Database>, days: number): ReviewActivityRow[] => {
  const rows = db.prepare(`
    SELECT id, user_id, asset_id, ts, review_metadata
    FROM usage_events
    WHERE event_type = 'review_action'
      AND date(ts, 'unixepoch') >= date('now', '-' || ? || ' days')
    ORDER BY ts ASC, rowid ASC
  `).all(days) as { id: string; user_id: string; asset_id: string | null; ts: number; review_metadata: string }[]

  return rows.flatMap((row) => {
    const parsed = ReviewEventMetadataSchema.safeParse(
      typeof row.review_metadata === 'string' ? JSON.parse(row.review_metadata) : row.review_metadata,
    )
    if (!parsed.success) return []
    return [{ id: row.id, user_id: row.user_id, asset_id: row.asset_id, ts: row.ts, review_metadata: parsed.data }]
  })
}
