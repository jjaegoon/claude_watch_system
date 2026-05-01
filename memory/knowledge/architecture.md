# Architecture — 모노레포·데이터 흐름

## 모노레포 구조

```
team_claude_system/
├── apps/
│   ├── api/      Hono 4 + Zod + Drizzle. routes/, middleware/, services/, workers/, schemas/
│   └── web/      React 18 + TanStack Query + Vite
├── packages/
│   └── db/       Drizzle ORM + better-sqlite3. schema.ts 단일 출처, migrations/ 저널
├── hooks/        T-13 wrapper + T-32 자율 인프라 (staging dir, install.sh로 ~/.claude/team-hooks/ 배포)
├── evals/        golden_set + runners + gate_check.sh + LLM judge
├── memory/       MEMORY_INDEX + knowledge + procedures + episodes (이 디렉터리)
├── .claude/      settings.json (프로젝트 스코프)
├── .github/workflows/ claude-review.yml (5축 PR 검사, D+29 활성)
├── test/         hooks-dry-run.sh
├── install.sh    hooks staging→deployment
└── CLAUDE.md     @import 진입점
```

별도 repo: `team-claude-assets` — SKILL.md, prompt, command, MCP 자산 (ASSETS_REPO_PATH env로 위치 지정).

## 핵심 데이터 흐름

### M1 자산 카탈로그 (CRUD)
```
[browser] → POST /assets → assetService.create → DB insert (assets + asset_versions snapshot, T-20)
                                              → FTS5 trigger 자동 sync (T-19)
                                              → 응답 201 { ok, data: { id, ... } }
```

### M2 Webhook 수신 (T-15)
```
[GitHub] → POST /webhooks/github → 서명 검증 → DB INSERT webhook_jobs status=pending → 200 응답
                                               ↓
[1s polling worker] → SELECT pending → 처리 → status=done | status=pending+1 | dead_letter (5회 후)
```

### M3 Hook 수신 (T-13, T-29)
```
[Claude Code session] → PostToolUse → ~/.claude/team-hooks/send-event.sh tool_call
                                       ↓
                                       jq 파싱 → curl & POST /hooks/event
                                       ↓
[apps/api] → POST /hooks/event → 큐 → 100ms flush 배치 50건 (T-23) → INSERT usage_events
                                       ↓ (T-14 skill_trigger 분기)
                                       Skill 도구 → metadata.skill_name → assets 조회 → asset_id 매핑
```

### M4 대시보드 (D+50+)
```
[browser] → GET /api/stats/daily → DB SELECT usage_events GROUP BY day → JSON
                                                                          ↓
                                                                          chart 렌더
```

## 외부 의존

| 자원 | 용도 | 활성화 시점 (T-33) |
|------|------|--------|
| Claude Max OAuth | 사용자 로그인 | 즉시 |
| GitHub PAT | webhook source | M2 (D+21) |
| Anthropic API key | review bot · LLM judge | M3 (D+29) |
| BetterStack | uptime + alert | M4 (D+36) |

## DB 테이블 (M1·M2 시점)

- `users` (id, email, password_hash, role, created_at) — T-16/T-18
- `assets` (id, type, name, version, status, author_id, ...) — T-19
- `asset_versions` (id, asset_id, snapshot_json, created_at) — T-20
- `assets_fts` (virtual FTS5, T-19) + 트리거
- `webhook_jobs` (id, payload, status, retries, created_at, dead_letter_reason) — T-15
- `usage_events` (id, type, user_id, tool_name, tool_use_id, asset_id, duration_ms, success, created_at) — T-23

## 보안 경계

- **External boundary**: HTTP 입력 → Zod 검증 (apps/api/src/schemas/)
- **Auth**: access_token (memory) + refresh_token (httpOnly cookie SameSite=Strict)
- **CSRF**: Origin header 검증 + SameSite=Strict
- **Secret**: `.env*` git-ignore. HOOKS_API_KEY는 ~/.claude/team-hooks/ env 또는 secret manager
- **Hook integrity**: SHA-256 .checksums.json (T-32C check #2)

## 흐름 외부에서 검토할 결정

- T-23 usage_events 100ms flush: latency vs DB load 트레이드. M3 시점 측정 후 조정 가능
- T-29 dedup: tool_use_id 우선 + 분 단위 fallback. 분 단위 fallback이 손실 가능 (ℹ️ 근사)
- T-15 webhook polling 1s: latency 트레이드. CDC/pg_notify 검토 가능 (post-MVP)
