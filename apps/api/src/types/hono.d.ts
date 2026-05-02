import type { Logger } from 'pino'
import type { AuthUser } from '../middleware/auth.js'

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string
    logger: Logger
    user: AuthUser
  }
}
