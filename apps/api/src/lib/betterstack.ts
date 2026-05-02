/** T-24 BetterStack log shipping — BETTERSTACK_TOKEN env 없으면 no-op. */

const INGESTION_URL = 'https://in.logs.betterstack.com'

export type BetterStackLevel = 'info' | 'warn' | 'error'

export const shipLog = (
  level: BetterStackLevel,
  message: string,
  meta?: Record<string, unknown>,
): void => {
  const token = process.env.BETTERSTACK_TOKEN
  if (!token) return

  const payload = JSON.stringify({
    dt:      new Date().toISOString(),
    level,
    message,
    service: 'team-claude-api',
    ...meta,
  })

  // fire-and-forget — errors absorbed (never throw)
  fetch(INGESTION_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    payload,
  }).catch(() => undefined)
}
