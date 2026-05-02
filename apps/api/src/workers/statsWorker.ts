/**
 * T-26 daily_stats Cron 워커.
 * 매 1시간마다 UTC 00시를 감지해 전일 usage_events → daily_asset_stats·daily_user_stats 집계.
 * aggregateDaily는 순수 함수 — 테스트에서 직접 호출 가능.
 * gotcha #18: 집계 쿼리는 GROUP BY이므로 ORDER BY ts, rowid 불필요.
 *            단 디버그 SELECT 작성 시 ORDER BY ts, rowid 의무.
 */
import Database from 'better-sqlite3'
import { sqlite } from '@team-claude/db/client'

let lastRunDate = ''

/** YYYY-MM-DD 형식으로 전일 날짜 반환 (UTC). */
export const yesterdayUtc = (now = new Date()): string => {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** usage_events → daily_asset_stats·daily_user_stats 집계 (upsert). */
export const aggregateDaily = (db: InstanceType<typeof Database>, statDate: string): void => {
  const assetRows = db.prepare(`
    SELECT asset_id,
           SUM(CASE WHEN event_type = 'asset_view'    THEN 1 ELSE 0 END) AS view_count,
           SUM(CASE WHEN event_type = 'asset_install' THEN 1 ELSE 0 END) AS install_count,
           SUM(CASE WHEN event_type = 'skill_trigger' THEN 1 ELSE 0 END) AS trigger_count
    FROM usage_events
    WHERE asset_id IS NOT NULL
      AND date(ts, 'unixepoch') = ?
    GROUP BY asset_id
  `).all(statDate) as { asset_id: string; view_count: number; install_count: number; trigger_count: number }[]

  const userRows = db.prepare(`
    SELECT user_id,
           COUNT(DISTINCT session_id)                                    AS session_count,
           SUM(CASE WHEN event_type = 'tool_call' THEN 1 ELSE 0 END)    AS tool_call_count
    FROM usage_events
    WHERE date(ts, 'unixepoch') = ?
    GROUP BY user_id
  `).all(statDate) as { user_id: string; session_count: number; tool_call_count: number }[]

  db.transaction(() => {
    for (const row of assetRows) {
      db.prepare(`
        INSERT INTO daily_asset_stats (id, asset_id, stat_date, view_count, install_count, trigger_count, feedback_count)
        VALUES (?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(asset_id, stat_date) DO UPDATE SET
          view_count    = excluded.view_count,
          install_count = excluded.install_count,
          trigger_count = excluded.trigger_count
      `).run(crypto.randomUUID(), row.asset_id, statDate, row.view_count, row.install_count, row.trigger_count)
    }

    for (const row of userRows) {
      db.prepare(`
        INSERT INTO daily_user_stats (id, user_id, stat_date, session_count, tool_call_count, active_minutes)
        VALUES (?, ?, ?, ?, ?, 0)
        ON CONFLICT(user_id, stat_date) DO UPDATE SET
          session_count  = excluded.session_count,
          tool_call_count = excluded.tool_call_count
      `).run(crypto.randomUUID(), row.user_id, statDate, row.session_count, row.tool_call_count)
    }
  })()
}

/** UTC 00시일 때만 당일 집계 실행 (중복 방지). now 파라미터는 테스트용. */
export const runDailyStatsIfDue = (db: InstanceType<typeof Database> = sqlite, now = new Date()): void => {
  if (now.getUTCHours() !== 0) return
  const statDate = yesterdayUtc(now)
  if (statDate === lastRunDate) return
  lastRunDate = statDate
  aggregateDaily(db, statDate)
}

/** 1시간마다 runDailyStatsIfDue 호출 (T-26 Cron). */
export const startStatsCron = (db: InstanceType<typeof Database> = sqlite): ReturnType<typeof setInterval> =>
  setInterval(() => {
    try { runDailyStatsIfDue(db) } catch { /* absorb */ }
  }, 3_600_000)

/** 테스트용 lastRunDate 초기화. */
export const __resetLastRunDateForTest = (): void => { lastRunDate = '' }
