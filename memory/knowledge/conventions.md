# Conventions — 코드 스타일·작성 규칙

CLAUDE.md (Obsidian 프로젝트 디렉터리)의 코드 스타일을 압축.

## TypeScript

- **strict 모드 필수** (tsconfig: strict, noUncheckedIndexedAccess, noImplicitAny)
- `any` 금지. `unknown` + 명시적 narrowing 사용
- `console.log` 금지 (개발 중 임시 OK, commit 전 제거). Logger는 `pino` 또는 직접 정의 wrapper
- **`jwt.sign` 호출 시 `jwtid: crypto.randomUUID()` 옵션 의무** (gotcha #10 + T-41 정합). 누락 시 동일 payload+iat → 동일 token 충돌 위험. M3+ 신규 JWT path 추가 시 ESLint `no-jwt-sign-without-jti` 룰 도입 검토.
- export 함수·타입은 JSDoc 주석 (1-2줄, why-only)
- 라우트 핸들러는 `apps/api/src/routes/*.ts`에만, middleware는 `apps/api/src/middleware/*.ts`
- 스키마는 `packages/db/src/schema.ts` 단일 출처
- Zod 검증기는 `apps/api/src/schemas/` (asset.ts, auth.ts 등)

## API 응답 형식

```
{ "ok": true, "data": {...} }   // success
{ "ok": false, "error": { "code": "STR", "message": "..." } }   // failure
```

코드는 SCREAMING_SNAKE_CASE (예: `INVALID_INPUT`, `RATE_LIMITED`).

## 마이그레이션 (packages/db/migrations/)

- 파일명: `XXX_description.sql` (3자리 zero-pad)
- 001~007: 직접 수정 금지 (settings.json deny). 새 변경은 008+
- 항상 idempotent: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
- FTS5 트리거는 마이그레이션과 함께 (T-19)
- **T-47 (table recreation 표준 패턴)**: SQLite schema 본질 변경(CHECK enum 추가·컬럼 타입 변경·NOT NULL 제약 추가 등) = `CREATE TABLE new → INSERT FROM old → DROP old → RENAME new` 4단계 의무. `ALTER TABLE ADD COLUMN`은 nullable 컬럼 추가에만 허용. 누적 적용: migration 011·012(usage_events) + 014(feedback) — 3회 검증됨.
- **DB connection 분리 시(worker 등) PRAGMA 재설정 의무** (T-19 + gotcha #8) — `busy_timeout`·`foreign_keys`는 connection-scoped이므로 새 connection을 여는 모든 코드(M2 webhook worker·M3 usage_events flush worker·CLI 등)는 client.ts와 동일한 4 PRAGMA(`journal_mode=WAL`·`busy_timeout=5000`·`synchronous=NORMAL`·`foreign_keys=ON`) set 필수.

## React (apps/web)

- React 18, TanStack Query v5, React Router v6
- Context + useReducer (Zustand 금지 — T-21)
- Auth: access_token Context memory, refresh httpOnly cookie
- Form 컴포넌트: discriminated union via TYPE_FIELD_COMPONENTS (T-22)
- API 호출 wrapper: `apps/web/src/lib/apiClient.ts` (401 → refresh → retry → logout)

## 커밋 메시지

- 헤더: `[T-XX] verb 짧은 설명` 또는 `[Stage2] ...`, `[B-1] ...`
- 본문: WHY 중심 (WHAT은 diff에서 보임)
- 결정 ID는 항상 commit 메시지 또는 PR 본문에 명시
- `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` 추가 (Claude Code 사용 시)

## 브랜치

- `main` 직접 push 금지 (settings.json deny — local commit OK)
- 기능 작업: `feature/T-XX-short-description`
- 버그 수정: `fix/issue-description`
- worktree 사용 시: `~/team_claude_system_worktrees/T-XX-short-description`

## 테스트

- Unit: 같은 디렉터리 `*.test.ts`
- Integration: `apps/api/src/__tests__/integration/*.test.ts`
- Eval (Critical path): `evals/runners/*.test.ts` 소비 `evals/golden_set/*.json`
- E2E (M2+): `apps/api/test/e2e/*.test.ts`

## 문서

- 모든 신규 파일/디렉터리 → 동일 PR에 `00_INDEX.md` 또는 적합한 INDEX 갱신 (GR-7)
- Korean Obsidian docs 경로: `/Users/jjaegoon/Documents/Claude/Projects/Obsidian/01_Projects/Team-Claude-System/`
- 새 결정은 04_시스템설계/ 적합 파일에 round로 추가 (T-13~T-30 변경 X)

## Asset (SKILL/Prompt/Command/MCP)

- SKILL.md curl Tracking 섹션 제거 (T-14: Hook 기반 자동 검출)
- 등록은 페르소나 리뷰 후 INDEX 등록 (GR-2, GR-7)
- 자산 repo: `team-claude-assets` (별도 repo, ASSETS_REPO_PATH env)

## 환경 / 패키지 매니저 (Step 0-postfix 정합)

- **Native 의존성 추가 시 root `package.json`의 `pnpm.onlyBuiltDependencies` 갱신 의무** — pnpm 8.6+ default가 native 의존성의 install/postinstall script 비실행. 추가 안 하면 `pnpm install`이 build script를 silent skip하여 import 시 `.node` 바인딩 부재로 런타임 실패. 본 배열 갱신은 PR 필수 체크리스트(precommit-check.sh 항목 8 후보).
  - 현재 핀: `["better-sqlite3", "esbuild"]`
  - 신규 native 의존성(예: `bcrypt`, `sharp`) 추가 시 즉시 본 배열에 추가.
  - gotcha #7 참조.

- **Node 버전 변경 시 3단계 의무**: `.nvmrc` 갱신 + `corepack enable` + `pnpm install --force`
  1. `.nvmrc` 버전 핀 갱신 (또는 신규 파일 시 작성)
  2. `corepack enable` — pnpm/yarn 자동 활성. `package.json`의 `packageManager` 필드를 보고 정확 버전 채택
  3. `pnpm install --force` — Node ABI 변경 시 native 모듈 재컴파일 강제 (better-sqlite3 등)
  - 단계 누락 시 `pnpm: command not found`(글로벌 손실) 또는 native 바인딩 ABI 불일치.
  - **Node 버전 전환·새 셸 세션 재진입 후 native 의존성(better-sqlite3 등) 사용 전 `pnpm install` 재실행 필수** — ABI 불일치(ERR_DLOPEN_FAILED) 방지. gotcha #17 참조.
  - gotcha #6 참조.

- **`packageManager` 필드 필수** — `package.json`의 `packageManager: "pnpm@<exact-version>"` 핀. corepack이 본 필드를 보고 새 셸·새 환경에서 자동 정확 버전 활성. 누락 시 nvm 전환·새 머신 설정 시 버전 표류.

## Hooks (hooks/*.sh)

- **hooks/*.sh 패턴 정의 컨텍스트 라인은 staged_secrets/blocklist false-positive 영역** — blocklist 탐지 패턴 문자열을 hooks/*.sh 본문에 직접 포함 시 precommit-check.sh 자체 commit이 차단됨. split encoding(`fb_a`·`fb_b` 변수 분할) 또는 scanner-allowlist.ts 등재 필수. gotcha #16 참조.
