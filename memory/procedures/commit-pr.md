# Procedure — Commit & PR

## 커밋 메시지

### 헤더 (1줄, ≤72자)

- `[T-XX] verb 짧은 설명` — 단일 결정 영향
- `[Stage2] ...` — Stage 단위
- `[B-1] ...`, `[M2] ...` — 마일스톤 단위
- `[fix] ...`, `[docs] ...`, `[chore] ...` — 결정 영향 없는 류

### 본문 (선택, 권장)

- 빈 줄 후 본문
- WHY 중심 (WHAT은 diff에서 보임)
- 결정 ID, 리스크, 다음 단계 등 메타정보
- Co-Authored-By: 마지막 줄
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

## 절대 금지

- main/master 직접 push (settings.json deny `git push origin main*|master*`)
- `git push --force` (settings.json deny)
- `--no-verify` (hook 우회)
- 001~007 마이그레이션 변경 (settings.json deny)
- 사용자 미승인 destructive 작업 (rm -rf, history rewrite 등)

## 브랜치 / Worktree

### 브랜치 이름

- `feature/T-XX-short-description` — 결정 구현
- `feature/B-1-...`, `feature/M2-...` — 마일스톤 작업
- `fix/issue-description` — 버그 수정
- `docs/...`, `chore/...` — 결정 영향 없음

### Worktree 사용 (병렬 작업 시)

```bash
git worktree add ~/team_claude_system_worktrees/T-XX-feature feature/T-XX-...
```

worktree에서 commit·push, 종료 후 `git worktree remove`.

## PR 본문 템플릿

```markdown
## Summary
- {1-3 bullets, WHAT}

## Decision Reference
- {T-XX, GR-X}

## Test Plan
- [ ] unit/integration test 통과
- [ ] precommit-check.sh JSON `overall_ok: true`
- [ ] review-subagent BLOCKED = 0
- [ ] gate_check.sh {적용 게이트} 통과
- [ ] 수동 동작 확인 (UI 변경 시 브라우저 검증)

## INDEX Update (GR-7)
- {신규 파일 → 갱신한 INDEX 경로}

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Pre-commit 체크리스트

1. `precommit-check.sh` 실행 → `overall_ok: true`
2. 타입체크 통과 (`pnpm typecheck`)
3. 테스트 통과 (`pnpm test --filter <package>`)
4. 결정 ID·INDEX 업데이트 확인
5. CLAUDE.md @import 깨지지 않음
6. .env, secret 파일 staged 없음 (scan-secrets.js 검증)

## PR 머지 전 검증

- review-subagent verdict = approve (BLOCKED 0)
- claude-review.yml 5축 통과 (D+29 활성 후)
- 적용 게이트 자동 통과 (B-2 등)
- M1·M3·M4는 사용자 어드민 검토 (T-37)

## Commit Frequency

- 단일 결정 단일 commit 권장
- Stage 단위는 단일 commit (Stage 2 = 1 commit)
- WIP commit 후 squash 가능 — 단 push 전에 정리
