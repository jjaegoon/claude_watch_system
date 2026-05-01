// buildFts5Query는 apps/api/src/services/searchService.ts에 배치 (T-27, M1 Step 4)

/** avg_rating_x100 integer → floating-point rating 변환 */
export const toRating = (x100: number | null): number | null =>
  x100 == null ? null : x100 / 100

/** floating-point rating → avg_rating_x100 integer 변환 */
export const fromRating = (rating: number): number => Math.round(rating * 100)
