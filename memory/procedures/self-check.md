# Procedure — Self-Check (precommit-check.sh)

T-32C 통합 자가점검. 06_개발워크플로/개발_워크플로.md §5.4 절차의 자동화.

## 호출 방법

```bash
timeout 300 bash ~/.claude/team-hooks/precommit-check.sh
```

5분 timeout은 caller가 강제. 스크립트 자체는 timeout 미적용.

## 7개 검사 항목

| # | 검사 | 통과 조건 |
|---|------|-----------|
| 1 | perms | hooks 4종 mode = 0755 정확 일치 |
| 2 | checksums | .checksums.json SHA-256과 실제 파일 일치 |
| 3 | env_secrets | tracked 파일에 `HOOKS_API_KEY=...20+chars` 평문 없음 |
| 4 | staged_secrets | staged blob (git show :file) scan-secrets.js 통과 |
| 5 | blocklist | staged diff에 위험 패턴 (rm -rf /, dd, mkfs, fork bomb, DROP TABLE 등) 없음 |
| 6 | rbac_xref | RBAC routes 변경 시 commit message에 [[거버넌스_라이프사이클]] §3 cross-ref (INFO만, FAIL X) |
| 7 | index_update | 신규 파일 추가 시 INDEX 변경 동시 (GR-7; WARN 수준) |

## JSON 출력 스키마

```json
{
  "overall_ok": true | false,
  "elapsed_seconds": <int>,
  "timeout_seconds": 300,
  "checks": [
    { "check": "<name>", "status": "PASS|FAIL|WARN|INFO|SKIP", "message": "<text>" },
    ...
  ]
}
```

## 종료 코드

- 0: 모든 검사 PASS (또는 WARN/INFO/SKIP만)
- 1: 하나 이상 FAIL

## 호출 시점

- commit 직전 (수동 또는 git hook)
- review-subagent 전후 (선택)
- gate_check.sh B-2 내부 (test/hooks-dry-run.sh와 함께)

## 실패 대응

- perms FAIL: `bash install.sh` 재실행
- checksums FAIL: hooks 변경 후 install.sh 재실행으로 .checksums.json 갱신
- env_secrets FAIL: secret 제거 + git filter-branch 또는 BFG repo cleaner
- staged_secrets FAIL: 해당 파일을 allowlist (scanner-allowlist.ts) 추가 검토 또는 secret 제거
- blocklist FAIL: 위험 명령 staged 제거. False positive면 패턴 정제 (T-32D 정합 검토)
- rbac_xref INFO: commit message에 cross-ref 추가
- index_update WARN: 동일 PR에 INDEX 갱신
