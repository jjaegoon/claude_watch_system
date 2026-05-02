/**
 * T-13·T-14·T-23·T-29: Hook 이벤트 버퍼·영속화 서비스.
 * T-23: 100ms flush 또는 50-event 배치 tx.
 * T-14: skill_trigger 시 skill_name → asset_id 매핑 (approved 자산 조회).
 * T-29: duration_ms·tool_use_id·success·source → metadata JSON.
 * gotcha #18: usage_events 조회 시 ORDER BY ts, rowid 의무.
 */
import Database from 'better-sqlite3'
import { sqlite } from '@team-claude/db/client'
import type { HookEventInput } from '../schemas/hooks.js'

const FLUSH_INTERVAL_MS = 100
const FLUSH_BATCH_SIZE  = 50

interface QueueEntry {
  event:   HookEventInput
  assetId: string | null
}

let queue:       HookEventInput[] = []
let flushTimer:  ReturnType<typeof setTimeout> | null = null
let _db:         InstanceType<typeof Database> = sqlite

const now = (): number => Math.floor(Date.now() / 1000)

/** T-14: skill_name → approved 자산 ID 조회. 미존재 시 null. */
const resolveAssetId = (skillName: string | null | undefined, db: InstanceType<typeof Database>): string | null => {
  if (!skillName) return null
  const row = db.prepare(
    `SELECT id FROM assets WHERE name = ? AND status = 'approved' LIMIT 1`
  ).get(skillName) as { id: string } | undefined
  return row?.id ?? null
}

const flushNow = (db: InstanceType<typeof Database>): void => {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  if (queue.length === 0) return

  const batch = queue.splice(0, queue.length)

  const entries: QueueEntry[] = batch.map((event) => ({
    event,
    assetId: event.type === 'skill_trigger' ? resolveAssetId(event.skill_name, db) : null,
  }))

  const insert = db.prepare(`
    INSERT INTO usage_events (id, user_id, session_id, event_type, asset_id, tool_name, ts, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  db.transaction(() => {
    for (const { event, assetId } of entries) {
      const metadata = JSON.stringify({
        tool_use_id: event.tool_use_id ?? null,
        duration_ms: event.duration_ms ?? 0,
        success:     event.success ?? true,
        source:      event.source ?? 'claude-code',
        ...(event.skill_name ? { skill_name: event.skill_name } : {}),
      })
      insert.run(
        crypto.randomUUID(),
        event.user_id,
        event.session_id ?? null,
        event.type,
        assetId,
        event.tool_name ?? null,
        now(),
        metadata,
      )
    }
  })()
}

const scheduleFlush = (db: InstanceType<typeof Database>): void => {
  if (flushTimer) return
  flushTimer = setTimeout(() => { flushTimer = null; flushNow(db) }, FLUSH_INTERVAL_MS)
}

/** イベント キューに追加。50件満 즉시 flush, 아니면 100ms 후 flush. */
export const enqueueEvent = (event: HookEventInput, db: InstanceType<typeof Database> = sqlite): void => {
  _db = db
  queue.push(event)
  if (queue.length >= FLUSH_BATCH_SIZE) flushNow(db)
  else scheduleFlush(db)
}

/** 테스트 격리용: 큐 + 타이머 초기화. */
export const __resetQueueForTest = (): void => {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  queue = []
}

/** 테스트에서 즉시 flush 강제. */
export const flushForTest = (db: InstanceType<typeof Database> = sqlite): void => flushNow(db)
