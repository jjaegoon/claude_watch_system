# Episode — 2026-05-02 M1 Step 0-postfix — 환경 함정 7건 영구 정합화

## 개요

D+14. M1 Step 0 commit(`1bb9ca3`) 직후 schema.test.ts 재현 검증 과정에서 발견된 환경 함정 4건 + 사전 발견 3건 = 총 7건을 영구 정합화. 단일 commit으로 packageManager 필드 + pnpm.onlyBuiltDependencies 필드 + gotchas.md 5건 등재 + conventions.md 표준 2건 + 본 episode + INDEX 갱신.

**결과**: corepack 자동 활성 + native build scripts 자동 실행 + 함정 누적 등재. 새 셸·새 환경·새 팀원이 본 repo를 clone 시 `pnpm install`만으로 동작 가능 (Node 22 + nvm + corepack 가정).

---

## 발견된 환경 함정 4건 (시간순 stack trace)

### 함정 ① Node v24 잔존 (마스터 §Step 0 Done-when 실패)

**증상**: Step 0 Done-when 명령 `node -v | grep -E '^v22\.'`가 v24.12.0에서 실패. `.nvmrc 22` 작성으로 형식 충족했으나 실제 시스템은 v24 활성. nvm install 22 미수행.

**stack trace 인용**:
```
$ node -v
v24.12.0
$ source $HOME/.nvm/nvm.sh && nvm use 22
N/A: version "v22" is not yet installed.
You need to run `nvm install 22` to install and use it.
```

**처방**: `nvm install 22 && nvm use 22`. 단 v24에서도 schema.test.ts·typecheck·migrate 모두 통과 확인됨 — 마스터 Plan §Step 0 Done-when verbatim 충족만이 동기.

### 함정 ② nvm 글로벌 npm 패키지 손실 (gotcha #6)

**증상**: `nvm install 22` 후 `pnpm`, `corepack`, `tsx` 글로벌 패키지가 새 npm prefix(v22)에 부재. `pnpm: command not found`.

**stack trace 인용**:
```
$ nvm use 22
Now using node v22.x.x
$ pnpm install
zsh: command not found: pnpm
```

**처방**: `corepack enable` (Node 16.13+ 내장). corepack이 `package.json`의 `packageManager` 필드를 보고 자동 활성. 본 episode에서 `packageManager: "pnpm@10.33.2"` 필드를 영구 추가하여 차단.

### 함정 ③ pnpm Ignored build scripts (gotcha #7)

**증상**: `pnpm install` 후 better-sqlite3 native 바인딩 부재. schema.test.ts 실행 시 `.node` 모듈 ENOENT.

**stack trace 인용**:
```
$ pnpm install
... Ignored build scripts: better-sqlite3, esbuild.
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.

$ pnpm --filter @team-claude/db test
Error: Cannot find module '.../node_modules/better-sqlite3/build/Release/better_sqlite3.node'
    at Function.Module._resolveFilename (...)
```

**처방**: 즉시 복구 = `pnpm rebuild better-sqlite3 esbuild`. 영구 차단 = root `package.json.pnpm.onlyBuiltDependencies = ["better-sqlite3", "esbuild"]` 필드 추가. 본 episode commit에서 영구 적용.

### 함정 ④ schema.test.ts 일시 실패

**증상**: 함정 ② 또는 ③의 결과로 schema.test.ts 실패. user가 직접 재현 시 commit 1bb9ca3 이후 새 셸에서 `pnpm install` → `pnpm --filter @team-claude/db test` 실행 시 발생.

**stack trace 인용** (③의 결과):
```
Error: Cannot find module '.../node_modules/better-sqlite3/build/Release/better_sqlite3.node'
```

**처방**: 함정 ②③ 영구 차단으로 자동 해소. `pnpm install` 단일 명령으로 native 바인딩까지 자동 빌드.

---

## 영구 정합화 변경 (5파일)

| Path | Action | 핵심 |
|---|---|---|
| `package.json` (루트) | EDIT | `+packageManager: "pnpm@10.33.2"` (corepack 자동 활성) / `+pnpm.onlyBuiltDependencies: ["better-sqlite3", "esbuild"]` (build scripts 자동 실행) |
| `memory/knowledge/gotchas.md` | EDIT | 신규 5 함정 (#3 drizzle-kit journal · #4 macOS BSD timeout · #5 T-38 ancestry 불일치 · #6 nvm 글로벌 손실 · #7 pnpm Ignored build scripts) — 각 항목 stack trace + 처방 + 영구 차단 3축 |
| `memory/knowledge/conventions.md` | EDIT | 표준 §환경/패키지 매니저 신설 — Native 의존성 갱신 의무 + Node 변경 3단계 + packageManager 필드 필수 |
| `memory/episodes/2026-05-02_M1_Step0-postfix.md` | CREATE | 본 episode |
| `memory/MEMORY_INDEX.md` | EDIT | postfix episode 등록 (가장 최신 위) |

---

## 결정 (T-XX 참조)

| ID | 흡수 방식 |
|----|-----------|
| (gotcha-fix) | 영구 정합화 commit — 결정 ID 신규 발급 없음. T-39 ADR 후보 메타 패턴은 별도 |
| T-32C | precommit-check 항목 8(`onlyBuiltDependencies` 갱신 검사) 후보 — gotchas.md #7 + conventions.md 신설 표준에서 명시. T-39 후보로 위임 |
| T-32D | scanner-allowlist 변경 없음 |

신규 결정 발급: 0건 (GR-1 정합).

---

## 메타 패턴 — T-39 ADR 후보 ("인수인계 §0 사전 알림 누락")

**관찰**: M1 Step 0 작업 진입 직전 사용자 prompt에 "준비됐다고 답하고 Step 0부터 Plan 모드 시작"이 명시. 그러나 작업 시점에 다음 환경 사전조건이 명시되지 않음:

- Node 22 LTS 활성 여부
- nvm install 22 완료 여부
- corepack enable 완료 여부
- packageManager 필드 부재로 인한 pnpm 버전 표류 가능성
- pnpm.onlyBuiltDependencies 부재로 인한 native build silent skip
- B-1 commit ancestry 통합 여부 (별도 진단 필요)

이는 마스터 Plan §Step 0가 "Risks: Node.js 22 미설치 시 버전 불일치"로 1줄 요약했지만, 실제 함정은 **연쇄적**(nvm → 글로벌 손실 → pnpm 부재 → install 안 됨 → ...)으로 하나의 §리스크 줄로 충분히 전달되지 않는 메타 패턴.

**T-39 ADR 후보**: 마일스톤 진입 전 §0 "환경 사전 알림" 표준화 — 8명 팀 dogfooding 시점에 각 팀원의 새 머신·새 셸에서 동일 함정 반복 가능성. 분기 페르소나 리뷰(T-36) 시 본 항목 검토 권고.

**현재 후속**:
- 본 episode + gotchas.md 5건 + conventions.md 2건으로 **함정 도큐먼트화** 완료
- packageManager + onlyBuiltDependencies 필드로 **자동 차단** 완료
- T-39 ADR(있다면)은 마스터 보강스펙 라운드에서 결정

---

## 검증 (commit 전)

```bash
# 함정 ②③ 영구 차단 입증
rm -rf node_modules
pnpm install
# → packageManager 필드를 corepack이 인식하여 pnpm@10.33.2 자동 활성
# → onlyBuiltDependencies가 better-sqlite3·esbuild build script 자동 실행
# → "Ignored build scripts" 경고 사라짐

pnpm --filter @team-claude/db test
# → schema.test.ts: all assertions passed (native 바인딩 정상)

bash $HOME/.claude/team-hooks/precommit-check.sh
# → 7/7 PASS (overall_ok=true)
```

---

## 통계

- 신규 파일: 1 (본 episode)
- 수정 파일: 4 (package.json + gotchas.md + conventions.md + MEMORY_INDEX.md)
- gotchas.md 신규 함정: 5 (#3·#4·#5·#6·#7)
- conventions.md 신규 표준: 2 (Native 의존성 갱신 의무 + Node 변경 3단계)
- 환경 함정 정복 시간: ~30분 (감지 + 처방 + 영구 차단 작성)
- T-39 ADR 후보 발견: 1 (인수인계 §0 사전 알림 메타 패턴)

---

## 다음 세션 인계

1. **Step 1 진입 가능** — packageManager + onlyBuiltDependencies 활성. 새 머신·새 셸에서 `pnpm install` 단일 명령으로 환경 셋업 완료.
2. **gotchas.md 통계**: 기존 11 섹션 + 신규 5 = 16 섹션. 누적 카운트 증가 예의주시.
3. **T-39 ADR 후보** — 인수인계 §0 사전 알림 표준화는 페르소나 리뷰(T-36 분기)에 위임.
4. **Step 1 마스터 §Step 1 (L59~100) verbatim 검증** — B-1이 schema·migrations 작성, 본 Step은 정합 확인 + 누락 보강.
