import { z } from 'zod'

/** C-2: content 최소 10자 — 스팸 방지 */
export const createFeedbackSchema = z.object({
  asset_id:      z.string().uuid().optional(),
  feedback_type: z.enum(['bug_report', 'improvement', 'system_feedback']),
  content:       z.string().min(10).max(2000),
})

export const listFeedbackQuerySchema = z.object({
  asset_id: z.string().uuid().optional(),
})

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuerySchema>
