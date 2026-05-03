# Phase O — 운영 단계 컨텍스트

Phase B 종료(2026-05-03, M4 Cowork ★★★★★) 후 진입.
Phase O = D+45~D+50 (약 2026-06-05~2026-06-10).

## 현재 상태 (2026-05-03 기준)

| 항목 | 상태 |
|------|------|
| Phase B 완료 | ✅ M1+M2+M3+M4, 171 PASS, Cowork 4회 ★★★★★ |
| BetterStack token | ⏳ 사용자 발급 대기 (`BETTERSTACK_TOKEN` env) |
| Anthropic API key | ⏳ T-34 보류 중 — Phase O 재평가까지 불필요 |
| T-34 재평가 | 📅 2026-06-15 09:00 KST (Cowork `d29-bot-activation-briefing` 영구 등록) |
| 분기 인간 페르소나 | 📅 2026-07-30 09:00 KST (Cowork quarterly-human-persona-review 영구 등록) |
| 월 LLM-as-Judge | 📅 2026-06-01 09:00 KST (Cowork monthly-llm-as-judge 영구 등록, `evals/regression_test.py`) |

## Phase O 운영 절차

### 일일 헬스 점검 (수동 또는 세션 재개 시)
```bash
pnpm --filter @team-claude/api test          # 171+ PASS 확인
bash evals/gate_check.sh B-1                 # auto PASS 유지
curl -s http://localhost:3000/health | jq .  # status: ok 확인 (서버 실행 시)
```

### 주간 점검 (Phase O 진입 후)
- usage_events 누적 확인 → daily_stats 집계 정상 여부
- webhook_jobs dead_letter 누적 없음 확인
- BETTERSTACK_TOKEN 설정 후 로그 shipping 동작 확인

### 월간 LLM-as-Judge (T-36)
```bash
pnpm --filter @team-claude/api test  # regression baseline 대비 -5% 이상 시 self-improve 트리거
```
최초 baseline: 171 PASS (2026-05-03). M5 이후: 184 PASS. Hotfix: 196 PASS. **M6 이후: 211 PASS (2026-05-03)**. `evals/regression_test.py` 실행 의무.

### 분기 인간 페르소나 (T-36)
- 모델: Opus + ultrathink
- 입력: 운영 데이터 누적 + Self-improve 18건 + Phase B 자율 발견 패턴
- 최초 실행: ~2026-07-30

## 자체 페르소나 검토 결과 (Phase B 종료 시점, 2026-05-03)

Security: Minor 3건 (blocking 0)
- **[S1]** CORS `origin: []` 미정의 동작 — `CORS_ALLOWED_ORIGINS` 반드시 설정
- **[S2]** BetterStack fetch 타임아웃 미설정 → `AbortSignal.timeout(5000)` 추가 권고 (T-39 후보)
- **[S3]** statsQueryService metric 파라미터 — Zod enum 검증으로 SQL injection 방지 ✅

SRE: Risk 2건 (Phase O 수용)
- **[O1]** UTC 00:00 다운타임 → daily_stats 누락 (backfill 로직 T-44 후보)
- **[O2]** `lastRunDate` 재시작 시 리셋 → upsert으로 데이터 정합성 유지 ✅

## T-39 후보 (Phase O 개선 백로그)

| ID | 내용 | 우선순위 |
|----|------|---------|
| T-39a | BetterStack AbortSignal.timeout(5000) | Low |
| T-39b | precommit staged_secrets FAIL on git-rm deletions 정식 fix | Low |
| T-39c | gate_check.sh M5 지원 추가 (현재 B-1·B-2·M2·M1·M3·M4만 정의) | Low |
| T-44 (후보) | daily_stats backfill 로직 (downtime 복구) | Low |

## Phase 2 진입 검토 (D+90+ 보류)

비개발자 시나리오. Phase O 운영 1~2개월 후 재검토. 현 시점 결정 없음.

## T-34 재평가 체크리스트 (2026-06-15)

1. 운영 데이터: usage_events 누적 건수 + daily_stats 채워진 날짜 수
2. Anthropic API key 발급 여부
3. 옵션 A (즉시 활성) / B (보류 연장) / C (영구 보류) 결정
4. GR-3 정합 — 페르소나 결과 받아쓰기만, CLI 독자 결정 금지
