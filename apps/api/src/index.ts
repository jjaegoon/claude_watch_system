import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { app } from './app.js'
import { startWorker } from './workers/webhookWorker.js'

// Load .env file (dev convenience — no new dependencies)
try {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const lines = readFileSync(resolve(__dirname, '../../../.env'), 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 1) continue
    const key = trimmed.slice(0, eqIdx)
    const val = trimmed.slice(eqIdx + 1)
    if (key && !(key in process.env)) process.env[key] = val
  }
} catch { /* .env absent — rely on system env */ }

const port = Number(process.env.PORT ?? 3000)

const server = serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`[team-claude-api] listening on http://localhost:${info.port}`)
})

// T-15: webhook_jobs 폴링 워커 시작
const workerTimer = startWorker()

process.on('SIGTERM', () => {
  clearInterval(workerTimer)
  server.close()
})
