# Team Claude System — Code Repo CLAUDE.md

내부 자산 플랫폼 코드 repo. 8명 팀 공동 사용. M1(카탈로그) → M2(등록+Webhook) → M3(Hooks+skill_trigger) → M4(대시보드).

## Project Identity (외부 @import)

@/Users/jjaegoon/Documents/Claude/Projects/Obsidian/01_Projects/Team-Claude-System/CLAUDE.md

## Memory Entry Point

@./memory/MEMORY_INDEX.md

## Code Entry Points (read order)

1. `./memory/MEMORY_INDEX.md` — 결정 규칙·컨벤션·아키텍처·gotchas + 최근 5 에피소드
2. `/Users/jjaegoon/Documents/Claude/Projects/Obsidian/01_Projects/Team-Claude-System/04_시스템설계/06_보강스펙.md` — T-13~T-30 (immutable per GR-1)
3. `/Users/jjaegoon/Documents/Claude/Projects/Obsidian/01_Projects/Team-Claude-System/04_시스템설계/08_보강스펙_T32~T37.md` — T-32A~T-37 자율 빌드 결정 (immutable per GR-1)
4. `/Users/jjaegoon/Documents/Claude/Projects/Obsidian/01_Projects/Team-Claude-System/06_개발워크플로/개발_워크플로.md` — sub-agent §3 / self-check §5.4 / 일일 루프
5. (M1 진입 시) `/Users/jjaegoon/Documents/Claude/Projects/Obsidian/01_Projects/Team-Claude-System/07_구현착수/B_M1_구현_Plan.md`

## Project-Specific Rules

### Plan Mode 강제
- **모든 Edit/Write는 plan 파일 선행 필수** (~/.claude/plans/*.md mtime <60min). `precheck-plan.sh` (settings.json PreToolUse) 강제
- Plan 트리거 임계: memory/procedures/plan-mode.md 참조

### Self-check 강제
- **commit 직전 `precommit-check.sh` 통과 필수** (timeout 300, JSON `overall_ok: true`)
- 7 검사: perms · checksums · env_secrets · staged_secrets · blocklist · rbac_xref · index_update

### Review-subagent
- **review-subagent BLOCKED = 0 before commit**
- 5축: Security · API · ErrorHandling · Types · Tests
- review-subagent 정의: `.claude/agents/review-subagent.md`

### 게이트 (T-37)
- **B-1 · B-2 · M2** = `evals/gate_check.sh <gate>` 자동 통과 필수
- **M1 · M3 · M4** = 사용자 어드민 검토 필수 (BLOCKED exit 2)

### Asset 등록 (T-14)
- SKILL.md curl Tracking 섹션 제거 (Hook 기반 자동 검출)
- 자산 repo: `team-claude-assets` (외부, ASSETS_REPO_PATH env)

### 브랜치
- **main 직접 push 금지** (settings.json deny). 로컬 commit은 OK
- feature/T-XX-... · fix/... 만 push 가능

### 마이그레이션 (T-19, T-15)
- **001~007 직접 수정 금지** (settings.json deny). 새 변경은 008+
- FTS5(008) · webhook_jobs(009)

### Decision IDs (immutable per GR-1)
- T-13~T-30 (06_보강스펙.md)
- T-32A~T-37 (08_보강스펙_T32~T37.md)
- 변경 필요 시 새 라운드 (T-38+) 발급

### Persona Review (GR-2)
- INDEX 등록 전 페르소나 리뷰 필수
- Claude Code는 비즈니스 결정 금지 (GR-3) — 페르소나 결과 받아쓰기

## 외부 자원 (T-33 단계적 활성화)

| 자원 | 상태 | 활성 시점 |
|------|------|-----------|
| Claude Max OAuth | 활성 | 즉시 |
| GitHub PAT (webhook) | 미발급 | M2 진입 (D+21) |
| Anthropic API key (review bot · LLM judge) | 미발급 | M3 진입 (D+29) |
| BetterStack Uptime | 미발급 | M4 진입 (D+36) |

미발급 단계에서 강제 활성화 시도 금지.

## 빠른 명령

```bash
# 의존성
pnpm install

# 타입 체크
pnpm typecheck

# 테스트
pnpm test
pnpm --filter @team-claude/api test

# 마이그레이션
pnpm --filter @team-claude/db migrate

# 자가점검 (commit 전)
timeout 300 bash ~/.claude/team-hooks/precommit-check.sh

# 자율 게이트
bash evals/gate_check.sh B-1
bash evals/gate_check.sh B-2
bash evals/gate_check.sh M2

# 훅 재배포 (hooks/* 변경 후)
bash install.sh
```

## 관련 디렉터리

- **Obsidian docs**: `/Users/jjaegoon/Documents/Claude/Projects/Obsidian/01_Projects/Team-Claude-System/`
- **Hooks 배포**: `~/.claude/team-hooks/` (install.sh로 deploy)
- **Plan 파일**: `~/.claude/plans/*.md` (precheck-plan.sh 검사 대상)
- **Sub-agents**: `.claude/agents/` (research · implementation · review · test · docs)
- **Memory**: `./memory/` (knowledge · procedures · episodes)
- **Evals**: `./evals/` (golden_set · runners · gate_check.sh)
