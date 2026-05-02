import bcrypt from 'bcrypt'
import { sqlite } from '@team-claude/db/client'

/**
 * 마스터 보강 ⓑ — 5 user + 6 asset.
 * idempotent UPSERT(`ON CONFLICT(email) DO UPDATE`) — INSERT OR REPLACE는
 * row를 DELETE+INSERT라 FK referenced(assets.author_id) cascade 깨짐 위험.
 * UPSERT는 row UPDATE만 — id 유지, FK 안전.
 */

type SeedUser = {
  email: string
  name: string
  localId: string
  role: 'member' | 'reviewer' | 'admin' | 'system_user'
  password: string
  isBot: 0 | 1
}

type SeedAsset = {
  type: 'skill' | 'prompt' | 'command' | 'mcp'
  name: string
  version: string
  status: 'draft' | 'in_review' | 'approved' | 'deprecated'
  authorEmail: string
  tags: string[]
  description: string
}

const passwordHashes = async () => {
  const memberHash = await bcrypt.hash('changeme', 10)
  // Bot은 BOT-NO-LOGIN placeholder — 실제 로그인은 routes/auth.ts에서 isBot 검사로 차단
  const botHash = await bcrypt.hash('BOT-NO-LOGIN-PLACEHOLDER', 10)
  return { memberHash, botHash }
}

const seedUsers = async (): Promise<Map<string, string>> => {
  const { memberHash, botHash } = await passwordHashes()
  const users: SeedUser[] = [
    { email: 'admin@team.local',             name: 'Admin',             localId: 'admin',      role: 'admin',       password: memberHash, isBot: 0 },
    { email: 'reviewer@team.local',          name: 'Reviewer',          localId: 'reviewer',   role: 'reviewer',    password: memberHash, isBot: 0 },
    { email: 'alice@team.local',             name: 'Alice',             localId: 'alice',      role: 'member',      password: memberHash, isBot: 0 },
    { email: 'bob@team.local',               name: 'Bob',               localId: 'bob',        role: 'member',      password: memberHash, isBot: 0 },
    { email: 'claude-review-bot@team.local', name: 'Claude Review Bot', localId: 'review-bot', role: 'system_user', password: botHash,    isBot: 1 },
  ]

  // T-34: bot에 author 부여 차단은 assets seed 단계에서 검증 (bot은 assets.author_id에 등장 X)
  const upsert = sqlite.prepare(`
    INSERT INTO users (id, email, name, local_id, role, password_hash, is_bot)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      name          = excluded.name,
      local_id      = excluded.local_id,
      role          = excluded.role,
      password_hash = excluded.password_hash,
      is_bot        = excluded.is_bot
    RETURNING id
  `)

  const emailToId = new Map<string, string>()
  const tx = sqlite.transaction(() => {
    for (const u of users) {
      const id = crypto.randomUUID()
      const row = upsert.get(id, u.email, u.name, u.localId, u.role, u.password, u.isBot) as
        | { id: string }
        | undefined
      if (!row) throw new Error(`UPSERT 실패: ${u.email}`)
      emailToId.set(u.email, row.id)
    }
  })
  tx()
  return emailToId
}

const seedAssets = (emailToId: Map<string, string>): void => {
  const adminId = emailToId.get('admin@team.local')!
  const aliceId = emailToId.get('alice@team.local')!
  const bobId = emailToId.get('bob@team.local')!

  const assets: SeedAsset[] = [
    { type: 'skill',   name: 'Code Review',         version: '1.0.0', status: 'approved', authorEmail: 'admin@team.local', tags: ['review', 'quality'],     description: '코드 리뷰 자동화 skill' },
    { type: 'skill',   name: 'API Test Generator',  version: '1.0.0', status: 'approved', authorEmail: 'admin@team.local', tags: ['testing', 'api'],        description: 'API 단위 테스트 자동 생성' },
    { type: 'prompt',  name: 'Korean Translation',  version: '1.0.0', status: 'approved', authorEmail: 'alice@team.local', tags: ['translation', 'korean'], description: '한국어 번역 prompt' },
    { type: 'command', name: 'Build Status Check',  version: '1.0.0', status: 'approved', authorEmail: 'admin@team.local', tags: ['ci', 'status'],          description: 'CI 빌드 상태 확인 command' },
    { type: 'skill',   name: 'Alice WIP Skill',     version: '0.1.0', status: 'draft',    authorEmail: 'alice@team.local', tags: ['wip'],                   description: 'alice WIP draft' },
    { type: 'skill',   name: 'Bob WIP Skill',       version: '0.1.0', status: 'draft',    authorEmail: 'bob@team.local',   tags: ['wip'],                   description: 'bob WIP draft' },
  ]

  // T-34 정합 — bot 계정은 author 부여 금지 (assets 데이터에서 system_user 제외 보장)
  for (const a of assets) {
    if (a.authorEmail === 'claude-review-bot@team.local') {
      throw new Error('T-34 위반: bot에 asset author 부여 금지')
    }
  }

  const upsert = sqlite.prepare(`
    INSERT INTO assets (id, type, name, version, status, author_id, tags, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name, version) DO UPDATE SET
      type        = excluded.type,
      status      = excluded.status,
      author_id   = excluded.author_id,
      tags        = excluded.tags,
      description = excluded.description
  `)

  const tx = sqlite.transaction(() => {
    for (const a of assets) {
      const authorId =
        a.authorEmail === 'admin@team.local' ? adminId
        : a.authorEmail === 'alice@team.local' ? aliceId
        : a.authorEmail === 'bob@team.local' ? bobId
        : null
      if (!authorId) throw new Error(`unknown author: ${a.authorEmail}`)
      const id = crypto.randomUUID()
      upsert.run(id, a.type, a.name, a.version, a.status, authorId, JSON.stringify(a.tags), a.description)
    }
  })
  tx()
}

const main = async (): Promise<void> => {
  const emailToId = await seedUsers()
  seedAssets(emailToId)
  // eslint-disable-next-line no-console
  console.log('✅ Seed complete: 5 users + 6 assets (UPSERT idempotent)')
  sqlite.close()
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
