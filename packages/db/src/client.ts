import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from './schema.js'

// ESM (type:module) — __dirname 부재. import.meta.url로 대체 (T-40 옵션 B-2).
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// packages/db/src/ → ../../../ = project root
const DB_PATH = process.env.DATABASE_URL ?? path.resolve(__dirname, '../../../data/dev.db')

// raw sqlite도 export — apps/api scripts(seed/reset-password) 등에서 raw SQL/UPSERT 직접 사용 가능.
// gotcha #8 정합 — 4 PRAGMA 모두 set (단일 connection 공유).
export const sqlite = new Database(DB_PATH)

sqlite.pragma('journal_mode = WAL')
sqlite.pragma('busy_timeout = 5000')
sqlite.pragma('synchronous = NORMAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
export type DB = typeof db
