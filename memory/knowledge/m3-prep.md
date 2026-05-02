# M3 사전 준비 컨텍스트

M2 Cowork 검토 통과 (★★★★★, 2026-05-02) 후 기록.

## 일정

| 항목 | 날짜 | 상태 |
|------|------|------|
| M2 Cowork ★★★★★ 통과 | 2026-05-02 | ✅ |
| D+29 봇 활성화 브리핑 (`d29-bot-activation-briefing`) | 2026-05-20 09:00 KST | ⏳ |
| Anthropic API key 발급 | D+29 이전 | ⏳ 필수 |
| M3 진입 | D+29 전후 | ⏳ |

## Anthropic API Key 의무 (T-33)

M3에서 활성화되는 외부 자원:
- `claude-review-bot` — PR 자동 리뷰 (`.github/workflows/claude-review.yml` 활성)
- LLM-as-Judge eval runner
- D+29 이전 `ANTHROPIC_API_KEY` 환경변수 및 GitHub Secret 설정 필수

## M3 범위 (6 영역)

1. **Hooks 영속화** — T-13 send-event.sh + T-15 usage_events flush worker (T-23)
2. **skill_trigger** — T-14 PostToolUse Skill 감지 + asset_id 매핑
3. **claude-review-bot** — T-34 system_user + D+29 활성
4. **daily_stats** — T-26 Cron 보고
5. **asset_review_log** — T-31D 재검토 (M3 시점)
6. **T-43 ADR 검토** (Cowork 사전 결정)

## gotcha #18 M3 적용 의무

M3에서 신규 작성하는 쿼리 중 gotcha #18 주의 영역:

| 파일 | 쿼리 | 요구 |
|------|------|------|
| `usage_events` INSERT/SELECT | `ORDER BY created_at, rowid` | T-23 flush worker |
| `asset_versions` SELECT | `ORDER BY rowid DESC LIMIT 1` | 이미 M2 적용 ✅ |
| `webhook_jobs` SELECT | `ORDER BY created_at, rowid LIMIT 1` | 이미 M2 적용 ✅ |

**M3 신규 쿼리 원칙**: `unixepoch()` 저장 컬럼 단독 ORDER BY 금지. 반드시 `, rowid` 타이브레이커 추가.

## M3 게이트

T-37 정합 — **사용자 어드민 검토 필수** (자동 통과 불가).
