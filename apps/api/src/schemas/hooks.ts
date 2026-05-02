import { z } from 'zod'

export const hookEventSchema = z.object({
  type: z.enum([
    'session_start', 'session_end', 'tool_call', 'file_edit',
    'skill_trigger', 'asset_view', 'asset_install',
  ]),
  user_id:     z.string().min(1),
  tool_name:   z.string().optional(),
  tool_use_id: z.string().optional(),
  session_id:  z.string().optional(),
  source:      z.string().optional().default('claude-code'),
  skill_name:  z.string().nullable().optional(),
  duration_ms: z.number().int().min(0).optional().default(0),
  success:     z.boolean().optional().default(true),
  timestamp:   z.number().optional(),
})

export type HookEventInput = z.infer<typeof hookEventSchema>
