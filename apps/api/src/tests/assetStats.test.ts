/**
 * T-46 — GET /assets/:id 응답에 view_count·download_count 포함 검증 (CLI C-2)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { app } from '../app.js'
import { __resetForTest } from '../services/tokenService.js'
import { sqlite } from '@team-claude/db/client'

const ORIGIN = 'http://localhost:5173'
const IP = '10.0.52.1'

let accessToken: string
let approvedAssetId: string

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = `${ORIGIN},http://localhost:3000`
  process.env.JWT_ACCESS_SECRET = 'dev-access-secret-change-in-production'
  process.env.JWT_REFRESH_SECRET = 'dev-refresh-secret-change-in-production'
  process.env.LOG_LEVEL = 'silent'

  __resetForTest()

  const loginRes = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Forwarded-For': IP },
    body: JSON.stringify({ email: 'alice@team.local', password: 'changeme' }),
  })
  const loginJson = await loginRes.json() as { access_token: string }
  accessToken = loginJson.access_token

  const listRes = await app.request('/assets', {
    headers: { Authorization: `Bearer ${accessToken}`, Origin: ORIGIN, 'X-Forwarded-For': IP },
  })
  const listJson = await listRes.json() as { ok: boolean; data: { items: Array<{ id: string }> } }
  approvedAssetId = listJson.data.items[0]!.id

  // 테스트 시작 전 해당 자산의 usage_events 초기화 (다른 테스트 간섭 방지)
  sqlite.prepare(`DELETE FROM usage_events WHERE asset_id = ? AND event_type IN ('asset_view', 'asset_download')`).run(approvedAssetId)
})

describe('GET /assets/:id — view_count·download_count 포함 (T-46 CLI C-2)', () => {
  it('초기 상태: view_count=0, download_count=0', async () => {
    // 다른 테스트 간섭 방지: 초기화 후 즉시 조회
    sqlite.prepare(`DELETE FROM usage_events WHERE asset_id = ?`).run(approvedAssetId)

    // bot UA로 조회 → 이벤트 기록 안 됨 → 순수 초기 상태 확인
    const res = await app.request(`/assets/${approvedAssetId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Origin: ORIGIN,
        'X-Forwarded-For': IP,
        'user-agent': 'Googlebot/2.1',
      },
    })
    const json = await res.json() as { ok: boolean; data: { view_count: number; download_count: number } }

    expect(res.status).toBe(200)
    expect(json.data.view_count).toBe(0)
    expect(json.data.download_count).toBe(0)
  })

  it('GET /:id 호출 후 view_count 증가 반영', async () => {
    sqlite.prepare(`DELETE FROM usage_events WHERE asset_id = ?`).run(approvedAssetId)

    // 조회 2회
    await app.request(`/assets/${approvedAssetId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Origin: ORIGIN, 'X-Forwarded-For': IP },
    })
    await app.request(`/assets/${approvedAssetId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Origin: ORIGIN, 'X-Forwarded-For': IP },
    })

    // 세 번째 조회: 이미 2건 기록된 상태 반환 확인
    const res = await app.request(`/assets/${approvedAssetId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Origin: ORIGIN, 'X-Forwarded-For': IP },
    })
    const json = await res.json() as { ok: boolean; data: { view_count: number; download_count: number } }

    // 세 번째 조회 자체도 기록되므로 최소 2 이상
    expect(json.data.view_count).toBeGreaterThanOrEqual(2)
    expect(json.data.download_count).toBe(0)
  })

  it('GET /:id/download 호출 후 download_count 증가 반영', async () => {
    sqlite.prepare(`DELETE FROM usage_events WHERE asset_id = ?`).run(approvedAssetId)

    await app.request(`/assets/${approvedAssetId}/download`, {
      headers: { Authorization: `Bearer ${accessToken}`, Origin: ORIGIN, 'X-Forwarded-For': IP },
    })
    await app.request(`/assets/${approvedAssetId}/download`, {
      headers: { Authorization: `Bearer ${accessToken}`, Origin: ORIGIN, 'X-Forwarded-For': IP },
    })

    const res = await app.request(`/assets/${approvedAssetId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Origin: ORIGIN,
        'X-Forwarded-For': IP,
        'user-agent': 'Googlebot/2.1',  // view_count 오염 방지
      },
    })
    const json = await res.json() as { ok: boolean; data: { view_count: number; download_count: number } }

    expect(json.data.download_count).toBe(2)
  })

  it('view_count + download_count 동시 존재 확인', async () => {
    sqlite.prepare(`DELETE FROM usage_events WHERE asset_id = ?`).run(approvedAssetId)

    await app.request(`/assets/${approvedAssetId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Origin: ORIGIN, 'X-Forwarded-For': IP },
    })
    await app.request(`/assets/${approvedAssetId}/download`, {
      headers: { Authorization: `Bearer ${accessToken}`, Origin: ORIGIN, 'X-Forwarded-For': IP },
    })

    const res = await app.request(`/assets/${approvedAssetId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Origin: ORIGIN,
        'X-Forwarded-For': IP,
        'user-agent': 'Googlebot/2.1',
      },
    })
    const json = await res.json() as { ok: boolean; data: { view_count: number; download_count: number } }

    expect(json.data.view_count).toBeGreaterThanOrEqual(1)
    expect(json.data.download_count).toBe(1)
  })

  it('응답에 view_count·download_count 필드가 숫자 타입으로 존재', async () => {
    const res = await app.request(`/assets/${approvedAssetId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Origin: ORIGIN, 'X-Forwarded-For': IP },
    })
    const json = await res.json() as { ok: boolean; data: Record<string, unknown> }

    expect(typeof json.data['view_count']).toBe('number')
    expect(typeof json.data['download_count']).toBe('number')
  })
})
