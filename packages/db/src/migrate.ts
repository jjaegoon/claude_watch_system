import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

// pnpm --filter @team-claude/db migrate → CWD = packages/db/
const DB_PATH = path.resolve(process.cwd(), '../../data/dev.db')
const MIGRATIONS_PATH = path.resolve(process.cwd(), 'migrations')

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')
db.pragma('synchronous = NORMAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS __migrations (
    name    TEXT PRIMARY KEY NOT NULL,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`)

const files = fs
  .readdirSync(MIGRATIONS_PATH)
  .filter((f) => f.endsWith('.sql'))
  .sort()

for (const file of files) {
  const name = file.replace('.sql', '')
  const already = db.prepare('SELECT 1 FROM __migrations WHERE name = ?').get(name)
  if (already) {
    console.log(`⏭  Skipped (already applied): ${file}`)
    continue
  }
  const sql = fs.readFileSync(path.join(MIGRATIONS_PATH, file), 'utf-8')
  db.exec(sql)
  db.prepare('INSERT INTO __migrations (name) VALUES (?)').run(name)
  console.log(`✅ Applied: ${file}`)
}

db.close()
console.log('✅ Migration complete')
