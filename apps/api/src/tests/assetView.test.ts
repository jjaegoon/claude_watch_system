/**
 * M5 영역 #1 — GET /assets/:id 조회 시 asset_view INSERT 검증
 * - bot User-Agent 차단
 * - 404 시 INSERT 없음
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { app } from '../app.js'
import { __resetForTest } from '../services/tokenService.js'
import { sqlite } from '@team-claude/db/client'

const ORIGIN = 'http://localhost:5173'
const IP = '10.0.50.1'

let accessToken: string
let approvedAssetId: string

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = `${ORIGIN},http://localhost:3000`
  process.env.JWT_ACCESS_SECRET = 'dev-access-secret-change-in-production'
  process.env.JWT_REFRESH_SECRET = 'dev-refresh-secret-change-in-production'
  process.env.LOG_LEVEL = 'silent'

  __resetForTest()

  // alice 로그인
  // auth.ts login 응답: { access_token, user } (data wrapper 없음)
  const loginRes = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Forwarded-For': IP },
    body: JSON.stringify({ email: 'alice@team.local', password: 'changeme' }),
  })
  const loginJson = await loginRes.json() as { access_token: string }
  accessToken = loginJson.access_token

  // approved 자산 ID 취득 (첫 번째 approved 자산)
  const listRes = await app.request('/assets', {
    headers: { Authorization: `Bearer ${accessToken}`, Origin: ORIGIN, 'X-Forwarded-For': IP },
  })
  const listJson = await listRes.json() as { ok: boolean; data: { items: Array<{ id: string }> } }
  approvedAssetId = listJson.data.items[0]!.id
})

describe('GET /assets/:id — asset_view INSERT (M5 영역 #1)', () => {
  it('인증 사용자 조회 시 asset_view 1건 INSERT', async () => {
    const before = (sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM usage_events WHERE event_type='asset_view' AND asset_id=?`
    ).get(approvedAssetId) as { cnt: number }).cnt

    await app.request(`/assets/${approvedAssetId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Origin: ORIGIN, 'X-Forwarded-For': IP },
    })

    const after = (sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM usage_events WHERE event_type='asset_view' AND asset_id=?`
    ).get(approvedAssetId) as { cnt: number }).cnt

    expect(after).toBe(before + 1)
  })

  it('bot User-Agent → asset_view INSERT 없음', async () => {
    const before = (sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM usage_events WHERE event_type='asset_view' AND asset_id=?`
    ).get(approvedAssetId) as { cnt: number }).cnt

    await app.request(`/assets/${approvedAssetId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Origin: ORIGIN,
        'X-Forwarded-For': IP,
        'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      },
    })

    const after = (sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM usage_events WHERE event_type='asset_view' AND asset_id=?`
    ).get(approvedAssetId) as { cnt: number }).cnt

    expect(after).toBe(before)
  })

  it('미존재 자산 (404) → asset_view INSERT 없음', async () => {
    const nonExistId = '00000000-0000-0000-0000-000000000999'
    const before = (sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM usage_events WHERE event_type='asset_view'`
    ).get() as { cnt: number }).cnt

    const res = await app.request(`/assets/${nonExistId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Origin: ORIGIN, 'X-Forwarded-For': IP },
    })

    const after = (sqlite.prepare(
      `SELECT COUNT(*) as cnt FROM usage_events WHERE event_type='asset_view'`
    ).get() as { cnt: number }).cnt

    expect(res.status).toBe(404)
    expect(after).toBe(before)
  })
})
