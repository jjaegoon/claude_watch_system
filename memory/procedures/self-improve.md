# Procedure — Self-Improve Loop

review-subagent BLOCKED 또는 regression 5% drop 시 자동 개선 루프.

## 트리거 1: review-subagent verdict=block

review-subagent가 JSON `{verdict: "block", blockers: [...]}` 반환 시:

1. **즉시 정지** — 다음 단계로 진행 금지
2. **blockers 우선 처리** — Critical은 모두 즉시 수정
3. **majors는 동일 turn 또는 직후** — 5분 이내 추가 turn에서 처리 가능
4. **minors는 별도 follow-up task** — `/schedule` 또는 GitHub issue로 지연 처리 가능
5. **재검토** — 수정 후 같은 review-subagent 재호출. verdict=approve까지 반복
6. **3 round 후에도 block 잔존 시** — 사용자 에스컬레이션

## 트리거 2: regression_test.py 5% drop

월 1회 (또는 milestone 전후) `evals/regression_test.py` 실행:

1. baseline_scores.json 로드
2. 4개 critical eval (auth, hooks_receive, fts5_search, skill_trigger) 재실행
3. 어느 하나라도 baseline 대비 5% 이상 하락 → self-improve 트리거

### Self-improve 단계

1. **회귀 원인 식별** — git log → 마지막 baseline 통과 commit 이후 변경
2. **Bisection** — git bisect로 원인 commit 식별
3. **수정 또는 baseline 갱신** — 의도된 변화면 baseline 갱신, 회귀면 수정
4. **재검증** — regression_test.py 재실행
5. **새 baseline 커밋** — `[regression] update baseline after T-XX correction`

## 트리거 3: gate_check.sh B-2 실패

자율 빌드 gate 실패 = self-improve 의무 트리거:

1. JSON output 분석 (precommit-check.sh + hooks-dry-run.sh)
2. 실패 원인 분류 — perms / checksums / secrets / blocklist / runtime
3. 1 round 자동 수정 시도
4. 재실행
5. 통과 시 commit; 실패 시 사용자 에스컬레이션

## 무한 루프 방지

- 수정 후 같은 blocker 3회 이상 재발 → 에스컬레이션 (인간 개입)
- 수정으로 새 blocker 발생 (regression) → 일단 revert 후 재설계
- 모델 토큰 한계 도달 → 압축 후 분할 진행

## review-subagent와의 계약

review-subagent는 5축(Security/API/ErrorHandling/Types/Tests)만 비평. 본 procedure는 review 결과를 받아 자동 액션. review-subagent가 `block` 외 기타 verdict 반환 시 본 procedure 미발동.

## 새 함정 발견 시

self-improve 과정에서 **새로운 함정** 발견 시 즉시 `memory/knowledge/gotchas.md`에 추가. 미래 빌드의 시간 절약. (예: globToRegex `**/` zero-dirs, scanner-allowlist 주석 거짓 매칭 등 — 모두 Stage 2 자가 발견 항목.)
