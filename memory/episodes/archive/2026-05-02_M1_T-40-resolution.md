# Episode — 2026-05-02 T-40 packages/db ESM exports + type:module (옵션 B-2)

## 개요

D+14. M1 Step 3(`4a51f2a`) 직후. Step 4 진입 직전 의무 결정 = **T-40 옵션 B-2 채택**. gotcha #9 정식 해결 + Step 2 임시 우회(apps/api 자체 connection) 회복. 5건 검증 모두 PASS — 옵션 A(tsup build/dist) fallback 불필요.

**시간 소요**: ~30분 (90분 한도의 1/3) — 옵션 B-2가 가장 가벼운 변경(3 PRAGMA 변경 + 4 import 회복)으로 충분.

---

## T-40 결정 배경 (옵션 비교)

| 옵션 | 변경 범위 | 회복 작업 | 단점 |
|---|---|---|---|
| A: tsup build/dist | packages/db에 build script + dist/ 사출 + dual format | ~60분 | dev 워크플로우 복잡(--watch 필요) |
| **B-2: type:module + exports field** ✅ | packages/db package.json + `.js` 명시 + ESM patterns | ~30분 | NodeNext tsconfig override 필요 |
| C: tsconfig path alias | tsconfig paths + bundler 설정 | ~45분 | tsx와 호환 변동 가능, 표준 ESM 우회 |

**채택 사유**: B-2가 표준 ESM/Node 패턴 정합 + 가장 가벼움. tsup 빌드 없이 dev tsx watch 그대로 작동. 검증 5건 PASS.

---

## 변경 매트릭스 (9 파일)

### packages/db (5)
| Path | 변경 |
|---|---|
| `packages/db/package.json` | `+type: "module"` + `+main`/`+types: ./src/index.ts` + `exports` 4 entry 조건부({types, default}) — `./`·`./schema`·`./client`·`./queries` |
| `packages/db/tsconfig.json` | `+module: NodeNext` + `+moduleResolution: NodeNext` override (루트 tsconfig는 CommonJS 유지) |
| `packages/db/src/index.ts` | 모든 relative export에 `.js` 명시 (`./client.js`·`./schema.js`·`./utils.js`·`./queries.js`) |
| `packages/db/src/client.ts` | `__dirname` ESM 비호환 → `import.meta.url` + `fileURLToPath` 패턴 / `import * as schema from './schema.js'` / `+export const sqlite` raw 노출(scripts에서 재사용) |
| `packages/db/src/schema.test.ts` | `from './schema.js'`·`./utils.js` 명시 |

### apps/api (4)
| Path | 변경 |
|---|---|
| `apps/api/src/lib/db.ts` | **전면 회복** — 자체 better-sqlite3 connection 제거 → `import { db } from '@team-claude/db/client'` + `import { users } from '@team-claude/db/schema'` + drizzle `eq` 직접 사용. UserRow type은 drizzle `InferSelectModel<typeof users>` 추론 |
| `apps/api/src/routes/auth.ts` | snake_case → camelCase 회복 (drizzle InferSelectModel 추론: `user.is_bot` → `user.isBot`, `user.password_hash` → `user.passwordHash`) |
| `apps/api/src/scripts/seed.ts` | `import { sqlite } from '@team-claude/db/client'` (자체 connection 제거) |
| `apps/api/src/scripts/reset-password.ts` | 동일 — `@team-claude/db/client` import |

---

## 검증 매트릭스 (5/5 PASS — 옵션 A fallback 미트리거)

| # | 항목 | 결과 |
|---|---|---|
| 1 | `pnpm install` | Already up to date (lock 변경 없음) ✅ |
| 2 | `pnpm --filter @team-claude/db typecheck` + `apps/api typecheck` | 양쪽 0 오류 ✅ — drizzle-orm 타입 hoisting 분리 자동 해결 (단일 인스턴스 인식) |
| 3 | `pnpm --filter @team-claude/api test` (vitest 20) + `packages/db test` (schema.test) | 21 PASS / 0 FAIL ✅ |
| 4 | dev 서버 + `/health` | 200 + 6 필드 정합 ✅ |
| 5 | `pnpm seed` + `/auth/login admin` | seed 5+6 idempotent + login admin role=admin ✅ |

---

## 결정 (T-XX 참조)

| ID | 흡수 |
|---|---|
| **T-40 (확정)** | 옵션 B-2 채택 — packages/db type:module + exports field + .js 명시 + import.meta.url ESM 패턴 + tsconfig NodeNext override. apps/api 자체 connection 우회 제거 |
| gotcha #9 | **해결** (gotchas.md 갱신 — "✅ 해결됨 T-40 commit") |
| gotcha #8 | 단일 connection 회복 (packages/db client.ts에서 4 PRAGMA set, raw sqlite도 export하여 scripts에서 재사용) — connection 분기 우회 패턴 제거 |

신규 결정 발급: 1건 (**T-40 확정**, GR-1 정합 — 새 결정 라운드).

---

## 새 발견 / 함정

### 함정 ①: Node v24 ESM strict의 `__dirname` 부재 (gotcha #11 후보)

**증상**: packages/db에 `type: "module"` 추가 후 `__dirname` reference 시 ReferenceError.

**해결**: ESM 표준 패턴
```ts
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
```

**향후**: 모든 packages/db ESM 모듈에서 동일 패턴 사용. apps/api는 이미 lib/db.ts에서 적용됨.

### 함정 ②: drizzle InferSelectModel은 schema의 camelCase 필드명 사용 (gotcha #12 후보)

**증상**: schema.ts에서 `is_bot`(SQLite) ↔ `isBot`(drizzle JS field). InferSelectModel은 drizzle 매핑 후 camelCase로 추론. routes/auth.ts에서 snake_case 사용 시 typecheck 실패.

**해결**: drizzle 타입 사용 시 camelCase 필드명 사용 (`user.isBot`, `user.passwordHash`). 향후 routes에서 snake_case 사용 금지 — typecheck로 자동 회귀 차단.

**향후**: conventions.md에 "drizzle InferSelectModel 사용 시 camelCase 필드 의무" 표준 추가 후보.

---

## drizzle-orm 타입 hoisting 자동 해결 (Step 2 함정 ② 회복)

Step 2 episode 함정 ②에서 보고된 "drizzle-orm 타입 hoisting 분리" 문제(SQLiteColumn private property 비호환)는 T-40 옵션 B-2 적용 후 **자동 해결됨**:

- packages/db에 `type: "module"` + 명시적 exports → ESM resolver가 단일 drizzle-orm 인스턴스 인식
- apps/api에서 `import { db } from '@team-claude/db/client'` + `import { users } from '@team-claude/db/schema'` + `import { eq } from 'drizzle-orm'` 후 `db.select().from(users).where(eq(users.email, email)).get()` 정상 typecheck

추가 우회(pnpm.overrides·tsconfig path alias) 불필요.

---

## 다음 세션 인계

1. **Step 4 진입 가능** — packages/db query helper 정합. 마스터 §Step 4 (B_M1_구현_Plan L256~302) — GET /assets + GET /assets/:id + searchService.ts(buildFts5Query) + draft RBAC 필터(마스터 보강 ⓒ).
2. **Step 4 모델**: Opus + ultrathink (FTS5 한국어 토크나이저 + draft RBAC + buildFts5Query 단위 테스트 5케이스).
3. **MEMORY_INDEX 5/5 한도** — Step 4 episode 추가 시 가장 오래된 `2026-05-02_M1_Step0-postfix.md`를 archive 이동 필요.
4. **gotcha #11·#12 후보 등록** — ESM `__dirname` 부재 + drizzle camelCase 필드. gotcha #10 정식 등재 commit 후 별도 등재 가능.

---

## 측정값

- 신규 파일: 1 (본 episode)
- 수정 파일: 9 (packages/db: 5 + apps/api: 4)
- RENAME: 1 (M1_Step0 → archive/)
- 검증: 5/5 PASS
- 시간: ~30분 (90분 한도의 1/3)
- 옵션 A fallback: 미트리거
- 신규 결정: T-40 확정 (1건)
