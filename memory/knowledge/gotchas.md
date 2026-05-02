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

## settings.json deny 라이프사이클 함정 (T-38)

1. **Write deny를 미존재 파일에 선적용하면 최초 생성이 차단됨**. Stage 2에서 migrations 001~007 Write deny 설정 → B-1에서 `pnpm migrate` 실패. 외부 heredoc 우회(Option B) 필요. T-38 원칙: Pre-creation 단계엔 Write deny 미적용, Post-creation 이후에만 Write+Edit deny 양방향 적용.
2. **Globbed 패턴 우선** (`00[1-9]*.sql`) — 개별 7줄 유지보수 부담 제거. 향후 010+ 추가 시 Edit deny 1줄만 추가하면 됨.
3. **Phase-out 단계 망각 주의** — deprecated 파일의 deny 제거 시점을 마일스톤 게이트 체크리스트에 등록해야 함 (T-38 결과 ①).

## #3 drizzle-kit migrate journal 부재 (B-1 발견)

- **증상**: `pnpm --filter @team-claude/db migrate`가 `drizzle-kit migrate` 호출 시 `meta/_journal.json` 부재로 실패. `drizzle-kit generate`를 거치지 않은 raw SQL 마이그레이션을 직접 작성한 경우 journal이 생성되지 않음.
- **stack trace 인용**: `Error: ENOENT: no such file or directory, open '.../packages/db/migrations/meta/_journal.json'`
- **처방 명령**:
  ```bash
  # B-1이 채택한 패턴: 커스텀 마이그레이터로 raw SQL 직접 적용
  # packages/db/src/migrate.ts — better-sqlite3로 SQL 파일 순차 실행 + __migrations 테이블 추적
  # package.json scripts.migrate를 "drizzle-kit migrate" → "tsx src/migrate.ts" 로 교체
  ```
- **영구 차단**: `packages/db/package.json`의 `scripts.migrate = "tsx src/migrate.ts"` 핀. drizzle-kit은 generate(스키마→SQL) 전용으로만 사용. 마이그레이션 실행은 커스텀 러너.
- **참조**: B-1 episode (2026-05-02_B-1.md), packages/db/src/migrate.ts:1

## #4 macOS BSD `timeout` 부재

- **증상**: `timeout 300 bash precommit-check.sh` 실행 시 `command not found: timeout` (zsh:1: not found). procedures/self-check.md가 `timeout 300 ...`을 권장하지만 macOS BSD에는 timeout 명령 미포함.
- **stack trace 인용**: `(eval):1: command not found: timeout` / `EXIT=127`
- **처방 명령**:
  ```bash
  # Option A: brew coreutils 설치
  brew install coreutils && gtimeout 300 bash $HOME/.claude/team-hooks/precommit-check.sh
  # Option B: timeout 없이 직접 실행 (스크립트 자체에 시간 제한 없음 — caller가 ctrl-c)
  bash $HOME/.claude/team-hooks/precommit-check.sh
  ```
- **영구 차단**: 스크립트 본문에 timeout 도입 검토(T-39 후보). 또는 docs에 macOS는 `gtimeout` 사용 명시. 현재는 Bash tool의 `timeout` 파라미터(ms)로 대체 가능.
- **참조**: M1 Step 0 episode (2026-05-02_M1_Step0.md §해결한 문제 #6), procedures/self-check.md `호출 방법`

## #5 T-38 commit "B-1 후속" 메시지 vs ancestry 불일치

- **증상**: T-38 commit (177eaab) 메시지가 "B-1 후속, migrations 001~009 양방향 보호"라 하지만 실제 git ancestry는 Stage2(dddc90f) 직속 — B-1 commit(8921700)을 거치지 않음. commit message만 신뢰하면 packages/db/migrations·src 부재 상태에서 작업 진행 위험.
- **stack trace 인용**:
  ```
  $ git log --oneline -5 main
  177eaab [T-38] settings.json deny 라이프사이클 정합화 (B-1 후속, ...)
  dddc90f [Stage2] 자율 빌드 인프라 7종 구축
  # B-1 schema commit 부재
  ```
- **처방 명령**:
  ```bash
  # main 진입 전 모든 브랜치 ancestry 점검 의무
  git log --oneline --all --decorate -20
  git show <suspected-commit-hash> --name-only | head -30
  git merge-base <feature-branch> main
  ```
- **영구 차단**: 마일스톤 진입 전 체크리스트에 `git log --oneline --all --decorate -20` 의무화. commit message의 "후속" "follow-up" "based on" 류 표현은 ancestry 입증으로 채택 금지.
- **참조**: M1 Step 0 episode (2026-05-02_M1_Step0.md §해결한 문제 #1)

## #6 nvm 버전 전환 시 글로벌 npm 패키지 손실

- **증상**: `nvm install 22 && nvm use 22` 후 `pnpm`, `corepack`, `tsx` 등 글로벌 패키지가 사라짐. 각 Node 버전마다 npm prefix가 분리되기 때문. Step 0-postfix에서 v24→v22 전환 후 `pnpm: command not found` 발생.
- **stack trace 인용**: `zsh: command not found: pnpm` (after nvm use 22)
- **처방 명령**:
  ```bash
  # 즉시 복구
  corepack enable     # Node 16.13+ 내장. pnpm·yarn 자동 활성
  pnpm install        # packageManager 필드를 보고 정확 버전 채택
  # 또는 글로벌 재설치 (비추 — 프로젝트마다 버전 다름)
  npm i -g pnpm@10.33.2
  ```
- **영구 차단**: 루트 `package.json`에 `"packageManager": "pnpm@10.33.2"` 필드 핀. corepack이 이 필드를 보고 새 셸·새 환경에서 자동 정확 버전 활성. + `nvm install <ver>`마다 `corepack enable` 1회 실행이 표준.
- **참조**: Step 0-postfix episode, conventions.md "Node 버전 변경 시 .nvmrc + corepack enable + pnpm install --force 3단계 의무"

## #7 pnpm Ignored build scripts (better-sqlite3·esbuild native 빌드 누락)

- **증상**: pnpm 8.6+에서 보안상 default가 native 의존성의 `install`/`postinstall` script 비실행. `pnpm install` 로그에 `Ignored build scripts: better-sqlite3, esbuild` 출력. 이후 `import Database from 'better-sqlite3'` 시 `.node` 바인딩 부재로 schema.test.ts 실패.
- **stack trace 인용**:
  ```
  Error: Cannot find module '.../node_modules/better-sqlite3/build/Release/better_sqlite3.node'
  ```
  pnpm 출력: `Ignored build scripts: better-sqlite3, esbuild. Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.`
- **처방 명령**:
  ```bash
  # 즉시 복구
  pnpm rebuild better-sqlite3 esbuild
  # 또는 approve-builds 선택형
  pnpm approve-builds
  ```
- **영구 차단**: 루트 `package.json`에 `"pnpm": { "onlyBuiltDependencies": ["better-sqlite3", "esbuild"] }` 필드 추가. 이후 `pnpm install`이 자동으로 두 패키지의 build script 실행. **Native 의존성 추가 시 본 배열에 즉시 갱신 의무**(conventions.md 표준).
- **참조**: Step 0-postfix episode, conventions.md "Native 의존성 추가 시 root package.json `pnpm.onlyBuiltDependencies` 갱신 의무"

## #8 SQLite PRAGMA connection-scoped vs persistent (M1 Step 1 발견)

- **증상**: `busy_timeout`/`foreign_keys`는 connection-scoped — 새 sqlite3 CLI 연결에서 default(0/0) reset. 영속 검증 위해 set+query를 같은 connection에서 실행 필요.
- **stack trace 인용**:
  ```
  $ sqlite3 data/dev.db "PRAGMA busy_timeout;"     # 0  (client.ts에서 5000 set 했음에도)
  $ sqlite3 data/dev.db "PRAGMA foreign_keys;"     # 0  (client.ts에서 ON 했음에도)
  $ sqlite3 data/dev.db "PRAGMA journal_mode;"     # wal (persistent — 영속됨)
  $ sqlite3 data/dev.db "PRAGMA synchronous;"      # 1   (persistent)
  ```
- **분류**:
  | PRAGMA | 분류 | 영속 위치 |
  |---|---|---|
  | journal_mode | persistent | DB 파일 |
  | synchronous | persistent | DB 파일 |
  | page_size, encoding | persistent | DB 파일 |
  | busy_timeout | **connection-scoped** | 각 연결마다 reset |
  | foreign_keys | **connection-scoped** | 각 연결마다 reset |
  | cache_size | connection-scoped | 각 연결마다 reset |
- **처방 명령** (검증 시):
  ```bash
  # 단일 connection에서 set + query (정량 입증)
  sqlite3 data/dev.db <<'SQL'
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
  SELECT timeout FROM pragma_busy_timeout;     -- 5000
  SELECT foreign_keys FROM pragma_foreign_keys;-- 1
  SQL
  ```
- **영구 차단** (운영 시):
  - **모든 application connection**에서 4 PRAGMA 모두 set 필수 (client.ts 패턴):
    ```ts
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('busy_timeout = 5000')
    sqlite.pragma('synchronous = NORMAL')
    sqlite.pragma('foreign_keys = ON')
    ```
  - **별도 connection을 여는 코드는 동일하게 재설정 의무** (conventions.md 표준):
    - T-15 webhook_jobs worker (M2): polling worker가 새 connection 열 때
    - T-23 usage_events flush worker (M3): 100ms flush worker가 새 connection 열 때
    - 마이그레이션 러너 (`packages/db/src/migrate.ts`): 이미 4 PRAGMA set ✅
    - 미래 background job·CLI tool: 동일 의무
  - **누락 시 위험**:
    - busy_timeout=0 → 동시 쓰기 시 즉시 `SQLITE_BUSY` 발생 (재시도 없음)
    - foreign_keys=0 → CASCADE/REFERENCES 무시 → orphan row 누적
- **참조**: M1 Step 1 episode (2026-05-02_M1_Step1.md §C·§새 발견), client.ts:11-14, migrate.ts:13-16, conventions.md "DB connection 분리 시(worker 등) PRAGMA 재설정 의무"

## tsx + Node v24 ESM strict named export 검출 실패 (#9) — ✅ 해결됨 (T-40 commit, 2026-05-02)

**증상**:
1. `import { fn } from '@team-claude/db'` (root index.ts inline export) → undefined
2. subpath export `from '@team-claude/db/queries'` → undefined
3. `import * as q from '@team-claude/db'` namespace → import 성공하나 `q.fn is not a function`

**원인 (확정)**:
- packages/db package.json에 `"type": "module"` 부재 → Node ESM이 .ts를 CJS로 해석 시도 → tsx loader 변환과 충돌
- `exports` field가 string 단일 entry → 조건부 entry(types/default) 부재로 ESM 해석 실패
- relative import의 `.js` 확장자 부재 → Node ESM strict가 .ts 자동 매핑 거부

**정식 해결 (T-40 옵션 B-2)**:
- packages/db/package.json: `"type": "module"` + 조건부 `exports` field (4 entry: `./`·`./schema`·`./client`·`./queries`)
- packages/db/src/*.ts: 모든 relative import에 `.js` 확장자 명시
- packages/db/src/client.ts: `__dirname` ESM 비호환 → `import.meta.url` + `fileURLToPath` 패턴
- packages/db/tsconfig.json: `module: NodeNext` + `moduleResolution: NodeNext` override (루트 tsconfig는 CommonJS 유지)
- apps/api/src/lib/db.ts: 자체 better-sqlite3 connection 제거 → `@team-claude/db/client` + `@team-claude/db/schema` + drizzle `eq` 직접 사용 (drizzle-orm 타입 hoisting 분리도 단일 인스턴스로 자동 해결)

**임시 우회 (Step 2 → T-40에서 제거됨)**: ~~apps/api/src/lib/db.ts 자체 better-sqlite3 connection~~

**연관**: gotcha #8 (multi-connection PRAGMA 재설정) — T-40 후 단일 connection으로 회복 (packages/db client.ts에서 4 PRAGMA set, sqlite raw도 export하여 scripts에서 재사용)

**발견**: M1 Step 2 (2026-05-02 임시 우회) → **해결**: M1 Step 3 직후 T-40 (2026-05-02)

## JWT deterministic — 동일 payload+iat → 동일 token (#10)

**증상**: 1초 내 같은 payload로 `jwt.sign(...)` 두 번 호출 시 두 token이 byte-identical. 도난 감지 → blacklistAllByUser → 즉시 재로그인 시 발급된 새 refresh_token이 이전 token과 동일 string → `isBlacklisted=true` 오판으로 새 로그인 차단.

**stack trace 인용** (M1 Step 3 TDD 단위 테스트):
```
× tokenService > blacklistAllByUser 후 새 refresh_token은 정상 발급
  AssertionError: expected true to be false
  at expect(isBlacklisted(newToken)).toBe(false)
```

**원인**: `jsonwebtoken`은 deterministic — RFC 7519 표준 JWT는 같은 header + payload + secret + iat(초 단위) → 동일 signature → 동일 token string. 마이크로초 단위 호출 시 충돌.

**처방 명령** (즉시 적용):
```ts
import jwt from 'jsonwebtoken'

// jti(JWT ID) — RFC 7519 표준 claim. crypto.randomUUID()로 매 토큰마다 unique.
const newJti = (): string => globalThis.crypto.randomUUID()

export const signRefreshToken = (payload: JwtPayload): string =>
  jwt.sign(payload, refreshSecret(), {
    expiresIn: REFRESH_TTL,
    jwtid: newJti(),  // ← 핵심
  })
```

**영구 차단**:
- `jwt.sign(...)` 옵션에 `jwtid: <unique>` 항상 추가 — apps/api/src/services/tokenService.ts에 적용 완료
- conventions.md "JWT 발급 시 jwtid 옵션 의무" 표준 추가 후보
- 단위 테스트로 회귀 차단 — `tokenService.test.ts`의 "재로그인 후 새 token isBlacklisted=false" 케이스

**영향 범위**:
- T-18 토큰 회전·도난 감지 (refresh_token blacklistAllByUser) — 본 함정 발견 영역
- M2 webhook signing(향후) — webhook signature 재생성 시
- M3 skill_trigger token(향후) — 짧은 시간 내 다중 발급 가능

**발견**: M1 Step 3, 2026-05-02 (Step 3 episode §함정 ① + tokenService TDD 8 tests)

## #13 Drizzle ORM은 FTS5 MATCH 미지원 → raw SQL prepared statement 필수

**증상**: `db.select().from(assets).where(sql`assets_fts MATCH ${q}`)` 같은 Drizzle ORM query builder로 FTS5 MATCH 절 작성 시 타입 오류 또는 런타임 오류. Drizzle이 FTS5 가상 테이블을 일반 테이블처럼 처리하여 MATCH 연산자를 지원하지 않음.

**처방**:
```ts
// FTS5 서브쿼리는 반드시 raw SQL prepared statement 사용
const sql = `
  SELECT a.id, a.name, ...
  FROM assets a
  WHERE a.rowid IN (SELECT rowid FROM assets_fts WHERE assets_fts MATCH ?)
`
const rows = db.prepare(sql).all(ftsQuery) as AssetRow[]
```

**영구 차단**: FTS5 MATCH를 포함하는 모든 쿼리는 Drizzle ORM query builder 대신 `db.prepare(sql).all(...)` raw SQL 패턴 사용 의무. assetQueryService.ts에 적용 완료.

**발견**: M1 Step 4, 2026-05-02

## #14 FTS5 external content trigger의 DELETE/UPDATE 패턴 — `INSERT ... VALUES('delete', ...)` 필수

**증상**: external content FTS5 테이블(`content='assets'`)의 DELETE trigger에서 `DELETE FROM assets_fts WHERE rowid = old.rowid`를 사용하면 FTS5 인덱스가 실제로 갱신되지 않음. 삭제된 자산이 여전히 FTS MATCH에 매칭됨.

**원인**: FTS5 external content 테이블은 DML(INSERT/UPDATE/DELETE) 직접 실행 불가. FTS5 특수 명령어 문법을 통해 인덱스를 조작해야 함.

**처방**:
```sql
-- DELETE trigger: 'delete' 특수 명령 사용
CREATE TRIGGER assets_ad AFTER DELETE ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, name, description)
  VALUES ('delete', old.rowid, old.name, COALESCE(old.description, ''));
END;

-- UPDATE trigger: old 삭제 후 new 삽입 (두 단계)
CREATE TRIGGER assets_au AFTER UPDATE ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, name, description)
  VALUES ('delete', old.rowid, old.name, COALESCE(old.description, ''));
  INSERT INTO assets_fts(rowid, name, description)
  VALUES (new.rowid, new.name, COALESCE(new.description, ''));
END;
```

**영구 차단**: FTS5 external content 테이블 trigger 작성 시 DELETE는 반드시 `INSERT ... VALUES('delete', rowid, ...)` 패턴. `DELETE FROM fts WHERE rowid = X` 패턴 절대 사용 금지. migration 010에 적용 완료.

**연관**: gotcha #13 (Drizzle + FTS5 raw SQL). FTS5 spec §external content table.

**발견**: M1 Step 4, 2026-05-02

## #15 macOS NFD vs Linux NFC 한글 불일치 — `normalize('NFC')` 필수

**증상**: macOS 파일시스템은 한글 문자열을 NFD(분해형)로 저장. `'코드리뷰'.length` === macOS에서 NFD일 경우 8(초성+중성+종성 분해). 서버(Linux)에서는 NFC(결합형)로 `'코드리뷰'.length` === 4. `buildFts5Query`의 `< 3` 길이 체크가 환경에 따라 다르게 동작.

**처방**:
```ts
export const buildFts5Query = (raw: string): string => {
  if (!raw) return ''
  const normalized = raw.normalize('NFC')  // NFD → NFC (macOS → Linux 정합)
  if (normalized.length < 3) return ''     // trigram 최소 3자
  // ...
}
```

**영구 차단**: 한글 입력을 처리하는 모든 문자열 함수에서 `normalize('NFC')` 선행 의무. searchService.ts에 적용 완료. 특히 length 비교·substring 연산·FTS5 query 빌드 전에 정규화 필수.

**발견**: M1 Step 4, 2026-05-02 (C-5 자율 체크리스트 항목)

## #16 hooks/*.sh 패턴 정의 컨텍스트 라인 false-positive — 메타 hook 함정 ★★★★★

**증상**: precommit-check.sh(또는 hooks/*.sh 전반)를 staged 후 precommit-check.sh 자체를 실행하면, 스크립트 본문에 정의된 blocklist 패턴(포크 밤·DROP TABLE·`rm -rf` 등)을 scanner가 "위험 패턴 포함 파일"로 오탐. precommit-check.sh commit 자체가 blocklist FAIL로 차단됨.

**원인 (구조적 메타 함정)**: hook 스크립트는 위험 패턴을 탐지하기 위해 그 패턴 문자열을 코드 본문에 직접 정의한다. 이 "컨텍스트 라인"들이 스크립트 자신을 위험 파일로 오인하게 만듦. 탐지 도구가 탐지 규칙을 본문에 포함해야 하는 self-referential bootstrapping 구조의 본질적 함정.

**stack trace 인용**:
```
precommit-check: [blocklist] FAIL — staged file contains dangerous pattern: :\(\)\{
```
precommit-check.sh 안의 fork bomb 탐지 regex 문자열이 scan 자신에게 매칭.

**처방**:
1. **split encoding** — 위험 패턴 문자열을 변수로 분할하여 단순 문자열 매칭 우회:
   ```bash
   # fork bomb 분할 인코딩 (gotcha #3과 동일 처방)
   fb_a=':\('; fb_b='\)\{[[:space:]]*:'; pattern="${fb_a}${fb_b}"
   ```
2. **scanner-allowlist.ts 등재** — hooks/*.sh 경로 자체를 allowlist에 추가:
   ```ts
   // scanner-allowlist.ts
   { paths: ['hooks/*.sh', '.claude/**/*.sh'] }
   ```
3. **패턴 문자열 간접 참조** — blocklist 패턴을 외부 파일(예: `blocklist-patterns.txt`)에서 읽어 스크립트 본문에서 제거.

**영구 차단**:
- 새 blocklist 패턴을 hooks/*.sh에 직접 추가 시 split encoding 또는 allowlist 의무 (conventions.md "hooks/*.sh 패턴 정의 컨텍스트 라인 false-positive 영역" 참조)
- precommit-check.sh 변경 commit 전 스크립트 자체를 staged 후 precommit-check.sh 재실행으로 자기 검증 의무

**메타 인사이트**: M1 Step 4 자율 발견. 본 시스템이 자기 개선 메커니즘(precommit-check.sh) 자체의 취약점을 발견 — "보안 도구를 만드는 도구가 보안 도구의 룰을 어긴다"는 bootstrapping 문제. gotcha #3(precommit-check.sh 함정)의 메타 레벨 일반화.

**발견**: M1 Step 4, 2026-05-02 (자율 발견 보너스 — C-5 체크리스트 외)
