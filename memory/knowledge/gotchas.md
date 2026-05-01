# Gotchas — 빌드타임 지뢰·운영 주의사항

본 파일은 시간을 잡아먹은 함정들의 누적 기록. 새 함정 발견 시 즉시 추가.

## T-13 staging deviation (Stage 2 도입)

T-13 명세는 `~/.claude/team-hooks/send-event.sh` 한 곳만 명시. 본 프로젝트는:
- **staging**: repo `hooks/`에서 작성·git 추적·CI 검증
- **deployment**: `install.sh`가 `~/.claude/team-hooks/`로 복사 + chmod + .checksums.json 생성

T-13 verbatim 경로는 deployment 위치만이며, staging은 운영 패턴. 향후 T-13 변경 시 양쪽 동기화 필수.

## scan-secrets.js 함정

1. **글로브 `**/`는 zero-or-more dirs**. `evals/golden_set/**/*.json`은 `evals/golden_set/test.json` (no subdir) ALSO 매칭해야 한다. globToRegex가 `**/`를 `(?:.*/)?`로 변환하지 않으면 false-positive.
2. **scanner-allowlist.ts 주석에 `paths: [...]` 텍스트 금지**. regex가 주석에서 거짓 매칭하여 빈 allowlist 로드 → 모든 파일 false-positive.
3. **JWT 패턴은 evals/golden_set/auth.json에 합법적으로 등장**. allowlist에 `evals/golden_set/**/*.json` 등록 필수.

## precommit-check.sh 함정

1. **stat 모드 비교는 octal-as-decimal 함정**. `stat -f '%Lp'`가 "755" 반환 → `[ "$mode" -gt 755 ]`는 동작하지만 의미상 부정확. 엄격 일치 (`!= "755"`)로 검사.
2. **staged secrets 검사는 working-tree 아닌 staged blob**. `git show :file | scan-secrets.js`로 stage 후 working-tree 수정 우회 차단.
3. **fork bomb 패턴은 변수 분할 인코딩**. `fb_a=':\('`, `fb_b='\)\{[[:space:]]*:'`로 split — 이 스크립트 자체가 secret scanner에 걸리지 않게.
4. **macOS BSD `stat -f` vs Linux GNU `stat -c`**. fallback OR로 둘 다 처리.

## send-event.sh 함정

1. **`select(. != "")`가 빈 스트림 → 객체 전체 사라짐**. `if $skill == "" then null else $skill end`로 명시적 null.
2. **`extract_n` validation 필수**. jq가 string 반환 시 `--argjson` 실패. case `*[!0-9]*` 패턴으로 디지트 검증.
3. **`set -uo pipefail`만 사용 (set -e 금지)**. fire-and-forget 보장.
4. **fire-and-forget curl은 서브셸 백그라운드 `(cmd &)`** — `cmd &`만 쓰면 부모 셸 wait. 서브셸로 완전 분리.

## Hook 활성화 함정

1. **PostToolUse pnpm typecheck는 .ts/.tsx/.mts/.cts 확장자만 트리거** (R11). 모든 Edit에 발화하면 60s+ 누적.
2. **precheck-plan.sh는 ~/.claude/plans/*.md mtime <60min 검사**. 플랜 파일 생성 안 하고 Edit 시도 시 즉시 차단 (셀프-브릭 가능). 본 메모리 파일도 Edit 시 정합 필요.
3. **사용자 글로벌 ~/.claude/settings.json hooks는 모든 세션 적용**. 다른 프로젝트에서도 plan 파일 요구.

## gate_check.sh 함정

1. **종료 코드 의미 명시**: 0=PASS-or-SKIP, 1=FAIL, 2=BLOCKED-user-admin. CI는 0만 허용.
2. **B-1은 migrations 비어있으면 SKIP**. M1·M3·M4는 BLOCKED (수동 검토). M2는 e2e 부재 시 PENDING.

## DB / FTS5 함정 (M1+ 진입 시 참고)

1. **FTS5 reserved chars**: `"-():*` 그리고 AND/OR/NOT. buildFts5Query 통과 필수 (T-19, T-27).
2. **FTS5 unicode61 토크나이저**: 한국어는 baseline. 특수 토큰 분리 필요 시 추가 옵션.
3. **SQLite WAL 모드**: `PRAGMA journal_mode=WAL` 필수 (gate B-1 검사).

## Auth 함정

1. **refresh_token Path=/auth 고정** (T-17). 다른 경로 cookie 누출 차단.
2. **rotation 후 old refresh 24h blacklist** — 즉시 만료 X (이중 사용 감지).
3. **rate limit 5/min/IP** — 정상 사용자 영향 없으나 분산 공격엔 IP 풀 필요.

## RBAC 함정 (T-16, T-34)

1. **author≠requester 검사** in_review→approved. self-review 차단.
2. **system_user role exempt** (T-34) — bot 자동화 시 self-review 면제. 단 bot은 author 될 수 없음.
