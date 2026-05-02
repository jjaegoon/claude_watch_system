import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

const uuid = () => crypto.randomUUID()
const now = sql`(unixepoch())`

// ── users ──────────────────────────────────────────────────────────────────
export const users = sqliteTable('users', {
  id:           text('id').primaryKey().$defaultFn(uuid),
  email:        text('email').notNull().unique(),
  name:         text('name').notNull(),
  localId:      text('local_id').notNull().unique(),
  // T-34: system_user 역할 + isBot 컬럼 추가
  role:         text('role', { enum: ['member', 'reviewer', 'admin', 'system_user'] })
                  .notNull()
                  .default('member'),
  passwordHash: text('password_hash').notNull(),
  isBot:        integer('is_bot', { mode: 'boolean' }).notNull().default(false),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull().default(now),
})

// ── assets ─────────────────────────────────────────────────────────────────
export const assets = sqliteTable('assets', {
  id:          text('id').primaryKey().$defaultFn(uuid),
  type:        text('type', { enum: ['skill', 'prompt', 'command', 'mcp'] }).notNull(),
  name:        text('name').notNull(),
  description: text('description'),
  tags:        text('tags', { mode: 'json' })
                 .$type<string[]>()
                 .notNull()
                 .default(sql`'[]'`),
  authorId:    text('author_id').references(() => users.id),
  version:     text('version').notNull().default('1.0.0'),
  status:      text('status', {
                 enum: ['draft', 'in_review', 'approved', 'deprecated'],
               })
                 .notNull()
                 .default('draft'),
  sourcePath:  text('source_path'),
  typeFields:  text('type_fields', { mode: 'json' })
                 .$type<Record<string, unknown>>()
                 .notNull()
                 .default(sql`'{}'`),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull().default(now),
  updatedAt:   integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
}, (t) => ({
  nameVersionIdx: uniqueIndex('uq_asset_name_version').on(t.name, t.version),
  typeStatusIdx:  index('idx_assets_type_status').on(t.type, t.status),
  authorIdx:      index('idx_assets_author').on(t.authorId),
  updatedIdx:     index('idx_assets_updated').on(t.updatedAt),
}))

// ── asset_versions (T-20 스냅샷) ────────────────────────────────────────────
export const assetVersions = sqliteTable('asset_versions', {
  id:         text('id').primaryKey().$defaultFn(uuid),
  assetId:    text('asset_id')
                .notNull()
                .references(() => assets.id, { onDelete: 'cascade' }),
  version:    text('version').notNull(),
  snapshot:   text('snapshot', { mode: 'json' })
                .$type<Record<string, unknown>>()
                .notNull(),
  changedBy:  text('changed_by').references(() => users.id),
  changeNote: text('change_note'),
  createdAt:  integer('created_at', { mode: 'timestamp' }).notNull().default(now),
}, (t) => ({
  assetCreatedIdx: index('idx_versions_asset_created').on(t.assetId, t.createdAt),
}))

// ── UsageEventMetadata (T-29 보너스 필드) ──────────────────────────────────
export type UsageEventMetadata = {
  skill_name?:  string
  tool_use_id?: string
  duration_ms?: number | null
  success?:     boolean | null
  source?:      string
  [key: string]: unknown
}

// ── ReviewEventMetadata (D-B 보강 #1: review_action 전용) ─────────────────
export type ReviewEventMetadata = {
  actor_id:    string
  action:      'submit' | 'approve' | 'reject' | 'deprecate' | 'restore'
  reason_code: string | null
  comment:     string | null
}

// ── usage_events (T-23·T-29, D-B T-31D) ───────────────────────────────────
export const usageEvents = sqliteTable('usage_events', {
  id:             text('id').primaryKey().$defaultFn(uuid),
  userId:         text('user_id').notNull(),
  sessionId:      text('session_id'),
  eventType:      text('event_type', {
                    enum: [
                      'session_start',
                      'session_end',
                      'tool_call',
                      'file_edit',
                      'skill_trigger',
                      'asset_view',
                      'asset_install',
                      'review_action',
                    ],
                  }).notNull(),
  assetId:        text('asset_id').references(() => assets.id),
  toolName:       text('tool_name'),
  filePath:       text('file_path'),
  ts:             integer('ts', { mode: 'timestamp' }).notNull().default(now),
  metadata:       text('metadata', { mode: 'json' })
                    .$type<UsageEventMetadata>()
                    .notNull()
                    .default(sql`'{}'`),
  reviewMetadata: text('review_metadata', { mode: 'json' })
                    .$type<ReviewEventMetadata>(),
}, (t) => ({
  tsIdx:          index('idx_events_ts').on(t.ts),
  assetTypeTsIdx: index('idx_events_asset_type_ts').on(t.assetId, t.eventType, t.ts),
  userTsIdx:      index('idx_events_user_ts').on(t.userId, t.ts),
  typeTsIdx:      index('idx_events_type_ts').on(t.eventType, t.ts),
}))

// ── feedback ────────────────────────────────────────────────────────────────
export const feedback = sqliteTable('feedback', {
  id:        text('id').primaryKey().$defaultFn(uuid),
  assetId:   text('asset_id')
               .notNull()
               .references(() => assets.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull(),
  rating:    integer('rating').notNull(),
  comment:   text('comment'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
}, (t) => ({
  userAssetIdx: uniqueIndex('uq_feedback_user_asset').on(t.assetId, t.userId),
  assetIdx:     index('idx_feedback_asset').on(t.assetId),
}))

// ── daily_asset_stats (T-26) ────────────────────────────────────────────────
export const dailyAssetStats = sqliteTable('daily_asset_stats', {
  id:            text('id').primaryKey().$defaultFn(uuid),
  assetId:       text('asset_id')
                   .notNull()
                   .references(() => assets.id, { onDelete: 'cascade' }),
  statDate:      text('stat_date').notNull(),
  viewCount:     integer('view_count').notNull().default(0),
  installCount:  integer('install_count').notNull().default(0),
  triggerCount:  integer('trigger_count').notNull().default(0),
  feedbackCount: integer('feedback_count').notNull().default(0),
  avgRatingX100: integer('avg_rating_x100'),
  createdAt:     integer('created_at', { mode: 'timestamp' }).notNull().default(now),
}, (t) => ({
  assetDateIdx: uniqueIndex('uq_daily_stats').on(t.assetId, t.statDate),
  dateIdx:      index('idx_daily_stats_date').on(t.statDate),
}))

// ── daily_user_stats (T-26) ─────────────────────────────────────────────────
export const dailyUserStats = sqliteTable('daily_user_stats', {
  id:            text('id').primaryKey().$defaultFn(uuid),
  userId:        text('user_id').notNull(),
  statDate:      text('stat_date').notNull(),
  sessionCount:  integer('session_count').notNull().default(0),
  toolCallCount: integer('tool_call_count').notNull().default(0),
  activeMinutes: integer('active_minutes').notNull().default(0),
  createdAt:     integer('created_at', { mode: 'timestamp' }).notNull().default(now),
}, (t) => ({
  userDateIdx: uniqueIndex('uq_daily_user_stats').on(t.userId, t.statDate),
}))

// ── webhook_jobs (T-15, schema only — worker は M2) ─────────────────────────
export const webhookJobs = sqliteTable('webhook_jobs', {
  id:          text('id').primaryKey().$defaultFn(uuid),
  source:      text('source', { enum: ['github_pr_merge'] }).notNull(),
  payload:     text('payload', { mode: 'json' })
                 .$type<Record<string, unknown>>()
                 .notNull(),
  status:      text('status', {
                 enum: ['pending', 'processing', 'completed', 'failed', 'dead_letter'],
               })
                 .notNull()
                 .default('pending'),
  retryCount:  integer('retry_count').notNull().default(0),
  lastError:   text('last_error'),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull().default(now),
  startedAt:   integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
}, (t) => ({
  statusIdx: index('idx_webhook_jobs_status').on(t.status, t.createdAt),
}))
