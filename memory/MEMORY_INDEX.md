# Memory Index — Team Claude System

지속 메모리 진입점. 각 세션 시작 시 코드 repo의 CLAUDE.md가 이 파일을 @import 한다.

## Knowledge (불변 규칙·맥락)

@./knowledge/decision-rules.md
@./knowledge/conventions.md
@./knowledge/architecture.md
@./knowledge/gotchas.md

## Procedures (반복 절차)

@./procedures/plan-mode.md
@./procedures/self-check.md
@./procedures/commit-pr.md
@./procedures/self-improve.md

## Episodes (마일스톤 단위 휘발성 기억)

직전 5개 에피소드만 자동 임포트. 6개 이상 누적 시 오래된 것은 archive.

@./episodes/2026-05-02_Stage2-fix.md
@./episodes/2026-05-02_B-1.md
@./episodes/2026-05-02_Stage2.md

<!-- 다음 에피소드 추가 시 위에서부터 5개만 유지하고 나머지는 episodes/archive/로 이동. -->
