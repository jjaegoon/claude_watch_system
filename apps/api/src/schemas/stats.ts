import { z } from 'zod'

// ── 보강 #4 — review_metadata Zod runtime 파싱 헬퍼 ──────────────────────────
export const ReviewEventMetadataSchema = z.object({
  actor_id:    z.string(),
  action:      z.enum(['submit', 'approve', 'reject', 'deprecate', 'restore']),
  reason_code: z.string().nullable(),
  comment:     z.string().nullable(),
})
export type ReviewEventMetadataParsed = z.infer<typeof ReviewEventMetadataSchema>

// ── Query param schemas ───────────────────────────────────────────────────────
export const DailyStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
})

export const TopAssetsQuerySchema = z.object({
  days:   z.coerce.number().int().min(1).max(90).default(30),
  limit:  z.coerce.number().int().min(1).max(50).default(10),
  metric: z.enum(['view_count', 'install_count', 'trigger_count']).default('view_count'),
})

// ── Response types ────────────────────────────────────────────────────────────
export type DailyAssetStatRow = {
  stat_date:     string
  view_count:    number
  install_count: number
  trigger_count: number
}

export type DailyUserStatRow = {
  stat_date:       string
  session_count:   number
  tool_call_count: number
}

export type TopAssetRow = {
  asset_id:      string
  asset_name:    string
  asset_type:    string
  view_count:    number
  install_count: number
  trigger_count: number
}

export type ReviewActivityRow = {
  id:              string
  user_id:         string
  asset_id:        string | null
  ts:              number
  review_metadata: ReviewEventMetadataParsed
}
