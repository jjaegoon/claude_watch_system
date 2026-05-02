/**
 * T-27 (GR-1 고정): buildFts5Query는 반드시 이 파일에 위치.
 * packages/db/utils.ts로 이동 금지.
 *
 * FTS5 MATCH 문자열 생성. trigram 토크나이저 전제 (T-42 migration 010).
 * 3자 미만 → '' 반환 (Opt B). 호출자가 빈 문자열 시 400 INVALID_INPUT 분기.
 */

// FTS5 reserved: `"():*^-` + AND/OR/NOT/NEAR 키워드 (대소문자 경계 체크)
// T-27 verbatim 정합. `-` 포함 필수 — "code-review" → "code* AND review*".
// C-1 자율 발견: FTS5 trigram에서 `code-review*` = "no such column: review" 에러 발생.
//   `-`를 reserved에 추가해야 하이픈 복합어가 안전하게 분리됨.
const FTS5_RESERVED = /["():*^-]|(?<![A-Z])\b(AND|OR|NOT|NEAR)\b(?![A-Z])/g

export const buildFts5Query = (raw: string): string => {
  if (!raw) return ''

  // gotcha #15: macOS HFS+ 경로 등에서 NFD 한글 반환 가능 → NFC 정규화 필수
  const normalized = raw.normalize('NFC')

  // Opt B: trigram 최소 토큰 3자. 미만이면 '' 반환 (호출자가 400 분기).
  if (normalized.length < 3) return ''

  const sanitized = normalized.replace(FTS5_RESERVED, ' ')
  const tokens = sanitized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 1)

  if (tokens.length === 0) return ''

  return tokens.map((t) => `${t}*`).join(' AND ')
}
