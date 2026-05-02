import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shipLog } from './betterstack.js'

beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 }))) })
afterEach(() => { vi.unstubAllGlobals(); delete process.env.BETTERSTACK_TOKEN })

describe('shipLog', () => {
  it('BETTERSTACK_TOKEN 없으면 fetch 미호출', () => {
    delete process.env.BETTERSTACK_TOKEN
    shipLog('info', 'test message')
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('BETTERSTACK_TOKEN 있으면 fetch 호출 + Authorization header', () => {
    process.env.BETTERSTACK_TOKEN = 'test-token-123'
    shipLog('warn', 'review action detected', { asset_id: 'a1' })
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce()
    const [url, opts] = (vi.mocked(fetch).mock.calls[0] as [string, RequestInit])
    expect(url).toBe('https://in.logs.betterstack.com')
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token-123')
  })

  it('fetch 오류 → 흡수 (throw 없음)', async () => {
    process.env.BETTERSTACK_TOKEN = 'test-token'
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))
    await expect(async () => {
      shipLog('error', 'critical failure')
      await new Promise((r) => setTimeout(r, 10))
    }).not.toThrow()
  })
})
