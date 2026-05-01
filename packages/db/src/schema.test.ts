import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import assert from 'node:assert/strict'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import * as schema from './schema'
import type { UsageEventMetadata } from './schema'
import { toRating, fromRating } from './utils'

// ── 컴파일 타임 타입 검증 ──────────────────────────────────────────────────
type UserSelect = InferSelectModel<typeof schema.users>
type UserInsert = InferInsertModel<typeof schema.users>
type AssetSelect = InferSelectModel<typeof schema.assets>
type WebhookJobSelect = InferSelectModel<typeof schema.webhookJobs>

// T-34: system_user 역할 포함 확인
const _roleCheck: UserSelect['role'] = 'system_user'
// T-34: isBot boolean 타입 확인
const _isBotCheck: UserSelect['isBot'] = true
// T-29: UsageEventMetadata 필드 확인
const _meta: UsageEventMetadata = { tool_use_id: 'x', skill_name: 'y', duration_ms: 100, success: true, source: 'z' }
// asset status enum 확인
const _status: AssetSelect['status'] = 'in_review'
// webhook_jobs status enum 확인
const _wjStatus: WebhookJobSelect['status'] = 'dead_letter'

// 미사용 변수 경고 억제
void _roleCheck; void _isBotCheck; void _meta; void _status; void _wjStatus

// ── 런타임 smoke test (in-memory SQLite) ─────────────────────────────────
const sqlite = new Database(':memory:')
sqlite.pragma('foreign_keys = ON')

sqlite.exec(`
  CREATE TABLE users (
    id            TEXT    PRIMARY KEY NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    name          TEXT    NOT NULL,
    local_id      TEXT    NOT NULL UNIQUE,
    role          TEXT    NOT NULL DEFAULT 'member'
                          CHECK (role IN ('member', 'reviewer', 'admin', 'system_user')),
    password_hash TEXT    NOT NULL,
    is_bot        INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch())
  )
`)

const db = drizzle(sqlite, { schema })

// T-34: system_user 삽입 + 조회
const [bot] = db
  .insert(schema.users)
  .values({
    email:        'claude-review-bot@team.local',
    name:         'Claude Review Bot',
    localId:      'review-bot',
    role:         'system_user',
    passwordHash: 'BOT-NO-LOGIN',
    isBot:        true,
  })
  .returning()
  .all()

assert.ok(bot, 'bot 삽입 성공')
assert.equal(bot.role, 'system_user', 'role = system_user')
assert.equal(bot.isBot, true, 'isBot = true')
assert.ok(typeof bot.id === 'string' && bot.id.length > 0, 'UUID 자동 생성')

// T-34: member 기본값 확인
const [member] = db
  .insert(schema.users)
  .values({
    email:        'member@team.local',
    name:         'Test Member',
    localId:      'test-member',
    passwordHash: 'hash',
  })
  .returning()
  .all()

assert.ok(member, 'member 삽입 성공')
assert.equal(member.role, 'member', '기본 role = member')
assert.equal(member.isBot, false, '기본 isBot = false')

// utils: toRating / fromRating 왕복 변환
assert.equal(toRating(480), 4.8, 'toRating(480) = 4.8')
assert.equal(fromRating(4.8), 480, 'fromRating(4.8) = 480')
assert.equal(toRating(null), null, 'toRating(null) = null')
assert.equal(fromRating(5), 500, 'fromRating(5) = 500')

sqlite.close()
console.log('✅ schema.test.ts: all assertions passed')
