# Decision Rules — 불변 결정·가드레일

본 파일은 GR-1 (T-13~T-30, T-32A~T-37 직접 변경 금지) 정합. 변경 필요 시 새 라운드 결정으로만 추가.

## Guard Rails (GR)

| ID | 내용 |
|----|------|
| GR-1 | 결정 라운드(T-XX) 직접 변경 금지. 새 결정으로만 진화 |
| GR-2 | INDEX 등록 전 페르소나 리뷰 필수 |
| GR-3 | Claude Code는 비즈니스/제품 결정 금지 — 페르소나 결과 받아쓰기 |
| GR-4 | Phase gate 통과 후에만 다음 단계 진입 |
| GR-5 | 평문 시크릿 전송 금지 |
| GR-6 | 근사값은 ℹ️·~ 마킹 (예: skill_trigger trust 근사) |
| GR-7 | 신규 파일/폴더 → 동일 PR에 INDEX 업데이트. CI 차단 |

## T-13 ~ T-24 (M1·M2·M3 핵심 결정)

| ID | 결정 1줄 |
|----|----------|
| T-13 | Hooks Wrapper Script — `~/.claude/team-hooks/send-event.sh` (stdin JSON + jq + envvar + curl &) |
| T-14 | skill_trigger Detection — PostToolUse `tool_name=="Skill"` + `metadata.skill_name` → server query |
| T-15 | webhook_jobs DB-backed queue + 1s polling, 5 retries, dead_letter |
| T-16 | RBAC author 조건부 — draft→in_review (author OR reviewer+); in_review→approved (reviewer+ AND author≠requester) |
| T-17 | CSRF — refresh_token httpOnly Secure SameSite=Strict Path=/auth + Origin 검증 (POST/PUT/PATCH/DELETE) |
| T-18 | Auth 흐름 — refresh + rotation + blacklist 24h; logout 무효화; login 5/min/IP rate limit |
| T-19 | FTS5 search + PUT partial update + 입력 검증 (slug name, semver, RFC5322 email, 8-128 password) |
| T-20 | asset_versions 스냅샷 — INSERT/UPDATE 시 즉시 (tx-coupled) |
| T-21 | Frontend Auth — access Context memory + refresh httpOnly cookie + boot fetch /auth/refresh |
| T-22 | type-specific Form — discriminated union TYPE_FIELD_COMPONENTS + Zod discriminatedUnion |
| T-23 | usage_events 100ms flush, 50-event tx; 큐 1000 cap |
| T-24 | /health 엔드포인트 + BetterStack Uptime free 3-min polls |

## T-25 ~ T-30 (Wave B 보강)

| ID | 결정 1줄 |
|----|----------|
| T-25 | ASSETS_REPO_PATH env var |
| T-26 | daily_stats Cron 보고 |
| T-27 | FTS5 input sanitization (buildFts5Query — 하이픈, AND/OR/NOT 이스케이프) |
| T-28 | MCP tool_name 필드 (send-event.sh 추출) |
| T-29 | Hooks bonus fields (duration_ms, tool_use_id, source, success) + dedup tool_use_id 우선 |
| T-30 | MCP token migration 예약 |

## T-32A ~ T-38 (Stage 1 자율 빌드 + deny 라이프사이클)

| ID | 결정 1줄 |
|----|----------|
| T-32A | scenario_tag KPI3 — `tool_use_id` 분기 ≥2종 (신규 필드 X) |
| T-32B | PreToolUse hook = 별도 `precheck-plan.sh` (SRP) |
| T-32C | precommit-check.sh = 통합 bash, 5분 timeout, JSON 출력 |
| T-32D | scan-secrets allowlist = TS 상수 (감사 = git history) |
| T-33 | 외부 자원 단계 — Claude Max OAuth now / API key M3 / PAT M2 / BetterStack M4 |
| T-34 | Review bot D+29 활성; system_user 역할 self-review 면제 |
| T-35 | 모니터링 = BetterStack 잠정; DataDog 재평가 Phase O D+46 |
| T-36 | 페르소나 cadence — 분기 인간 + 월 LLM-as-Judge |
| T-37 | 게이트 자동 — B-1·B-2·M2 자동; M1·M3·M4 사용자 어드민 |
| T-38 | settings.json deny 라이프사이클(pre/post/phase-out) 정합. Globbed 패턴 우선 |

## Non-decisions (자주 헷갈리는 것)

- 페르소나 리뷰 결과는 GR-3 따라 받아쓰기 — Claude Code가 결정 변경 금지
- 마이그레이션 001~007 직접 수정 금지 (settings.json deny). 새 마이그레이션은 008+
- main/master 브랜치 직접 push 금지 (settings.json deny). feature/* fix/*만 허용
- ℹ️ 근사 마킹 누락 시 GR-6 위반
