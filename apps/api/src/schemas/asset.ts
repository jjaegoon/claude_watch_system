import { z } from 'zod'

export const assetListQuerySchema = z.object({
  q:      z.string().max(256).optional(),
  type:   z.enum(['skill', 'prompt', 'command', 'mcp']).optional(),
  status: z.enum(['draft', 'in_review', 'approved', 'deprecated']).optional(),
  tag:    z.string().max(30).optional(),
  sort:   z.enum(['updated_at', 'last_updated', 'name', 'view_count', 'download_count'])
            .optional()
            .default('updated_at'),
  limit:  z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().max(2048).optional(),
})

export const assetIdParamSchema = z.object({
  id: z.string().uuid(),
})

/** T-31C: command type slash_name 검증 (영소문자 시작, 2-31자, [a-z0-9-]) */
export const SlashNameSchema = z.string().regex(
  /^[a-z][a-z0-9-]{1,30}$/,
  'slash_name은 영소문자 시작 2-31자 [a-z0-9-] 형식이어야 합니다',
)

/** T-19 POST /assets 등록 스키마 + T-31C slash_name 검증 */
export const createAssetSchema = z.object({
  type:        z.enum(['skill', 'prompt', 'command', 'mcp']),
  name:        z.string().min(2).max(50),
  description: z.string().max(1000).optional(),
  tags:        z.array(z.string().max(30)).max(10).optional().default([]),
  version:     z.string().regex(/^\d+\.\d+\.\d+$/, 'semver x.y.z 형식 필요').optional().default('1.0.0'),
  sourcePath:  z.string().max(500).optional(),
  typeFields:  z.record(z.unknown()).optional().default({}),
}).superRefine((data, ctx) => {
  const slashName = data.typeFields?.['slash_name']
  if (data.type === 'command' && slashName !== undefined) {
    if (!SlashNameSchema.safeParse(slashName).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'slash_name은 영소문자 시작 2-31자 [a-z0-9-] 형식이어야 합니다',
        path: ['typeFields', 'slash_name'],
      })
    }
  }
})

/** T-19 PUT /assets/:id 부분 업데이트 스키마 (status 제외 — PATCH /status 별도) */
export const updateAssetSchema = z.object({
  name:        z.string().min(2).max(50).optional(),
  description: z.string().max(1000).optional(),
  tags:        z.array(z.string().max(30)).max(10).optional(),
  version:     z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
  sourcePath:  z.string().max(500).optional(),
  typeFields:  z.record(z.unknown()).optional(),
})

/** T-16 반려 사유 코드 — 자산_품질_기준.md §4 12종 */
export const RejectReasonSchema = z.enum([
  'R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06',
  'R-07', 'R-08', 'R-09', 'R-10', 'R-11', 'R-12',
])

/** T-16 PATCH /assets/:id/status 상태 전이 입력 스키마 */
export const statusTransitionSchema = z.object({
  status:      z.enum(['draft', 'in_review', 'approved', 'deprecated']),
  reason_code: RejectReasonSchema.optional(),
  change_note: z.string().max(500).optional(),
})

export type AssetListQuery        = z.infer<typeof assetListQuerySchema>
export type AssetIdParam          = z.infer<typeof assetIdParamSchema>
export type CreateAssetInput      = z.infer<typeof createAssetSchema>
export type UpdateAssetInput      = z.infer<typeof updateAssetSchema>
export type StatusTransitionInput = z.infer<typeof statusTransitionSchema>
