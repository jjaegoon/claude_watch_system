import type { MiddlewareHandler } from 'hono'

/**
 * T-18 Login Rate Limit: IP당 분당 5회. 초과 시 429 + Retry-After: 60.
 * Step 2: 정의만. Step 3 routes/auth.ts의 POST /auth/login에 부착.
 *
 * 슬라이딩 윈도우 — Map<ip, timestamps[]>.
 * 윈도우 외 timestamps는 매 요청 시 garbage-collect.
 */
const WINDOW_MS = 60_000
const MAX_HITS = 5
const buckets = new Map<string, number[]>()

const clientIp = (c: Parameters<MiddlewareHandler>[0]): string => {
  const xff = c.req.header('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  // Hono node-server 환경에선 실제 remote ip 노출 제한 — 개발/테스트 fallback
  return c.req.header('x-real-ip') ?? 'unknown'
}

export const loginRateLimit: MiddlewareHandler = async (c, next) => {
  const ip = clientIp(c)
  const now = Date.now()
  const cutoff = now - WINDOW_MS

  const hits = (buckets.get(ip) ?? []).filter((t) => t > cutoff)
  if (hits.length >= MAX_HITS) {
    c.header('Retry-After', '60')
    return c.json(
      { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts' } },
      429,
    )
  }
  hits.push(now)
  buckets.set(ip, hits)
  return next()
}
