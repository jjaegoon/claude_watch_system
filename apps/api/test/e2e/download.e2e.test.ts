/**
 * M5 영역 #2 — GET /assets/:id/download e2e 테스트
 * - 자산 type별 다운로드 정보 정합 (skill·prompt·command·mcp)
 * - asset_download event INSERT 정합
 * - 권한 검증 (미인증 401, 미존재 404, invalid UUID 400)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { app } from '../../src/app.js'
import { __resetForTest } from '../../src/services/tokenService.js'
import { sqlite } from '@team-claude/db/client'

const ORIGIN = 'http://localhost:5173'
const IP = '10.0.60.1'

let aliceToken = ''
let adminToken = ''

// 자산 ID 맵 (type → id)
const assetIdByType: Record<string, string> = {}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = `${ORIGIN},http://localhost:3000`
  process.env.JWT_ACCESS_SECRET = 'dev-access-secret-change-in-production'
  process.env.JWT_REFRESH_SECRET = 'dev-refresh-secret-change-in-production'
  process.env.LOG_LEVEL = 'silent'

  __resetForTest()

  const loginAs = async (email: string): Promise<string> => {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Forwarded-For': IP },
      body: JSON.stringify({ email, password: 'changeme' }),
    })
    const json = await res.json() as { access_token: string }
    return json.access_token
  }

  aliceToken = await loginAs('alice@team.local')
  adminToken = await loginAs('admin@team.local')

  // approved 자산 목록에서 type별 첫 번째 자산 ID 취득
  const listRes = await app.request('/assets', {
    headers: { Authorization: `Bearer ${adminToken}`, Origin: ORIGIN, 'X-Forwarded-For': IP },
  })
  const listJson = await listRes.json() as {
    ok: boolean
    data: { items: Array<{ id: string; type: string }> }
  }
  for (const item of listJson.data.items) {
    if (!assetIdByType[item.type]) assetIdByType[item.type] = item.id
  }
})

const download = (token: string, id: string) =>
  app.request(`/assets/${id}/download`, {
    headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN, 'X-Forwarded-For': IP },
  })

// ── 인증 / 입력 검증 ──────────────────────────────────────────────────────────

describe('GET /assets/:id/download — 인증·입력 검증', () => {
  it('미인증 요청 → 401', async () => {
    const id = assetIdByType['skill'] ?? '00000000-0000-0000-0000-000000000001'
    const res = await app.request(`/assets/${id}/download`, {
      headers: { Origin: ORIGIN, 'X-Forwarded-For': IP },
    })
    expect(res.status).toBe(401)
  })

  it('invalid UUID → 400 INVALID_INPUT', async () => {
    const res = await app.request('/assets/not-a-uuid/download', {
      headers: { Authorization: `Bearer ${aliceToken}`, Origin: ORIGIN, 'X-Forwarded-For': IP },
    })
    expect(res.status).toBe(400)
    const json = await res.json() as { ok: boolean; error: { code: string } }
    expect(json.error.code).toBe('INVALID_INPUT')
  })

  it('미존재 자산 UUID → 404 NOT_FOUND', async () => {
    const res = await download(aliceToken, '00000000-0000-0000-0000-000000000999')
    expect(res.status).toBe(404)
    const json = await res.json() as { ok: boolean; error: { code: string } }
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('bot User-Agent → asset_download INSERT 없음', async () => {
    const id = assetIdByType['skill'] ?? '00000000-0000-0000-0000-000000000001'
    const before = (sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM usage_events WHERE event_type='asset_download' AND asset_id=?`
    ).get(id) as { cnt: number }).cnt

    await app.request(`/assets/${id}/download`, {
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        Origin: ORIGIN,
        'X-Forwarded-For': IP,
        'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      },
    })

    const after = (sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM usage_events WHERE event_type='asset_download' AND asset_id=?`
    ).get(id) as { cnt: number }).cnt

    expect(after).toBe(before)
  })
})

// ── Skill 다운로드 ──────────────────────────────────────────────────────────

describe('GET /assets/:id/download — skill', () => {
  it('skill download → type·install_target 포함 200', async () => {
    const id = assetIdByType['skill']
    if (!id) return // seed에 skill 없으면 skip
    const res = await download(aliceToken, id)
    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean; data: { type: string; install_target: string } }
    expect(json.ok).toBe(true)
    expect(json.data.type).toBe('skill')
    expect(typeof json.data.install_target).toBe('string')
  })

  it('skill download → asset_download 1건 INSERT', async () => {
    const id = assetIdByType['skill']
    if (!id) return
    const before = (sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM usage_events WHERE event_type='asset_download' AND asset_id=?`
    ).get(id) as { cnt: number }).cnt

    await download(adminToken, id)

    const after = (sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM usage_events WHERE event_type='asset_download' AND asset_id=?`
    ).get(id) as { cnt: number }).cnt
    expect(after).toBe(before + 1)
  })
})

// ── Prompt 다운로드 ────────────────────────────────────────────────────────

describe('GET /assets/:id/download — prompt', () => {
  it('prompt download → body_text 포함 200', async () => {
    const id = assetIdByType['prompt']
    if (!id) return
    const res = await download(aliceToken, id)
    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean; data: { type: string; body_text: string } }
    expect(json.ok).toBe(true)
    expect(json.data.type).toBe('prompt')
    expect(typeof json.data.body_text).toBe('string')
  })

  it('prompt download → asset_download 1건 INSERT', async () => {
    const id = assetIdByType['prompt']
    if (!id) return
    const before = (sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM usage_events WHERE event_type='asset_download' AND asset_id=?`
    ).get(id) as { cnt: number }).cnt

    await download(aliceToken, id)

    const after = (sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM usage_events WHERE event_type='asset_download' AND asset_id=?`
    ).get(id) as { cnt: number }).cnt
    expect(after).toBe(before + 1)
  })
})

// ── Command 다운로드 ───────────────────────────────────────────────────────

describe('GET /assets/:id/download — command', () => {
  it('command download → install_target 포함 200', async () => {
    const id = assetIdByType['command']
    if (!id) return
    const res = await download(adminToken, id)
    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean; data: { type: string; install_target: string } }
    expect(json.ok).toBe(true)
    expect(json.data.type).toBe('command')
    expect(typeof json.data.install_target).toBe('string')
  })
})

// ── MCP 다운로드 ──────────────────────────────────────────────────────────

describe('GET /assets/:id/download — mcp', () => {
  it('mcp download → mcp_config 포함 200', async () => {
    const id = assetIdByType['mcp']
    if (!id) return
    const res = await download(adminToken, id)
    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean; data: { type: string; mcp_config: string } }
    expect(json.ok).toBe(true)
    expect(json.data.type).toBe('mcp')
    expect(typeof json.data.mcp_config).toBe('string')
  })

  it('mcp download → asset_download 1건 INSERT', async () => {
    const id = assetIdByType['mcp']
    if (!id) return
    const before = (sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM usage_events WHERE event_type='asset_download' AND asset_id=?`
    ).get(id) as { cnt: number }).cnt

    await download(adminToken, id)

    const after = (sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM usage_events WHERE event_type='asset_download' AND asset_id=?`
    ).get(id) as { cnt: number }).cnt
    expect(after).toBe(before + 1)
  })
})
