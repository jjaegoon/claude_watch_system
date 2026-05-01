# Procedure — Plan Mode

## 목적

Edit/Write 도구 사용 전 plan 파일을 ~/.claude/plans/에 작성하여 의도·범위를 명시. precheck-plan.sh hook이 강제.

## 트리거 임계치

다음 중 하나라도 해당하면 plan mode 진입:

1. 신규 파일 ≥ 2개 생성 예상
2. 다중 파일·다중 디렉터리 변경
3. 결정 라운드(T-XX) 영향 가능성
4. RBAC·인증·CSRF 등 보안 표면 변경
5. 마이그레이션 변경 (008+; 001~007은 deny 차단)
6. 사용자가 명시적으로 "plan mode"·"플랜 모드" 요청
7. 변경 영향 불확실 (코드베이스 처음 만짐)

3-7 중 하나만 해당해도 plan mode. 1-2는 trivial 1-line 변경 외엔 모두 plan.

## precheck-plan.sh 검사 룰

- 위치: `~/.claude/team-hooks/precheck-plan.sh`
- 트리거: settings.json `PreToolUse` matcher `Edit|Write`
- 검사: `find ~/.claude/plans -maxdepth 2 -name '*.md' -mmin -60`
- 비어 있으면: exit 1 (Edit/Write 차단)
- 발견되면: exit 0 (통과)

## Plan 파일 구조 (권장 템플릿)

```markdown
# {제목}

## 컨텍스트
{왜 이 작업?}

## 사전 결정 사항
| # | 결정 | 근거 |

## 빌드 순서
{단계 nA→nB→nC}

## 파일 매니페스트
{path | action | section}

## 검증 방법
{어떻게 동작 확인?}

## 리스크 등록부 (Top 5)
{확률·영향·완화}

## 종료 조건 (Exit Criteria)
- [ ] ...
```

## ExitPlanMode 호출 시점

- 플랜 파일 작성 완료
- 사용자 명시적 질문 모두 해결 (AskUserQuestion 사용)
- 절대 "How does this look?" 류 텍스트 질문 금지 — ExitPlanMode가 그 역할

## 자율 모드 (Auto Mode) 운영

- 사용자가 Auto Mode 활성화 시 plan mode 진입 자체가 비권장
- 단 본 procedure의 트리거 임계치 5,6,7은 Auto Mode에서도 plan 작성 권장 (사용자 course correction 받음)

## 플랜 파일 mtime 1시간 룰

precheck-plan.sh는 mtime <60min만 인정. 1시간 초과 후 작업 재개 시 plan 파일 `touch`로 갱신 또는 새 plan 작성.
