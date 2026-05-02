import { z } from 'zod'

export const assetListQuerySchema = z.object({
  q:      z.string().max(256).optional(),
  type:   z.enum(['skill', 'prompt', 'command', 'mcp']).optional(),
  status: z.enum(['draft', 'in_review', 'approved', 'deprecated']).optional(),
  tag:    z.string().optional(),
  sort:   z.enum(['updated_at', 'name']).optional().default('updated_at'),
  limit:  z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().max(2048).optional(),
})

export const assetIdParamSchema = z.object({
  id: z.string().uuid(),
})

export type AssetListQuery = z.infer<typeof assetListQuerySchema>
export type AssetIdParam  = z.infer<typeof assetIdParamSchema>
