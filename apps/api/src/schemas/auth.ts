import { z } from 'zod'

/**
 * T-19 입력 검증: email RFC 5322 simplified + password 8-128.
 * Zod email validator는 RFC 5322 호환 ASCII subset 검증 (실용 정합).
 */
export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
})
export type LoginInput = z.infer<typeof loginSchema>

export const refreshBodySchema = z.object({
  refresh_token: z.string().min(1),
})
export type RefreshBodyInput = z.infer<typeof refreshBodySchema>
