#!/usr/bin/env python3
# T-36: 월 1회 LLM-as-Judge — 5축 페르소나 가치 신호 평가.
# 분기 인간 페르소나 리뷰 + 월 LLM 자동 판정 = 30-40% gap 보존 보완.
#
# Activation: D+29 (M3) Anthropic API key 발급 후. 그 전에는 dry-run.
# Cron: 매월 1일 09:00 UTC.

"""LLM-as-Judge monthly evaluation runner.

5 axes (T-36):
  1. decisiveness — 결정 명확성 (양가 표현 회피)
  2. cross_ref_accuracy — 결정 ID·문서 인용 정확성
  3. self_containment — 외부 의존 최소화
  4. persona_value_signal — 8명 팀에 실효 가치 시그널
  5. change_impact_matrix — 변경 영향 표 완비

Output: evals/baseline_scores.json 갱신 + JSON 리포트.

CRITICAL: GR-3 — Claude judges Claude는 같은 편향 가능. 인간 분기 리뷰가 보완.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
GOLDEN_SET = REPO_ROOT / "evals" / "golden_set"
BASELINE = REPO_ROOT / "evals" / "baseline_scores.json"

DRY_RUN = os.environ.get("ANTHROPIC_API_KEY", "").strip() == ""

JUDGE_PROMPT = """You are a critical reviewer scoring infrastructure decisions for a team-of-8 internal asset platform (Team Claude System). Score the supplied decision (T-XX) on 5 axes, each 1-5 integer:

1. decisiveness (1=hedged, 5=clear)
2. cross_ref_accuracy (1=missing refs, 5=fully cited)
3. self_containment (1=heavy external deps, 5=self-contained)
4. persona_value_signal (1=irrelevant, 5=clear team value)
5. change_impact_matrix (1=missing, 5=complete)

Output JSON only:
{"axis_1": <int>, "axis_2": <int>, "axis_3": <int>, "axis_4": <int>, "axis_5": <int>, "rationale": "<one-line>"}

NOTE: You may share Claude's bias. Quarterly human review compensates.
"""


def load_baseline() -> dict:
    if not BASELINE.exists():
        return {"version": 0, "scores": {}}
    try:
        return json.loads(BASELINE.read_text())
    except (json.JSONDecodeError, OSError):
        return {"version": 0, "scores": {}}


def save_baseline(data: dict) -> None:
    BASELINE.write_text(json.dumps(data, indent=2, sort_keys=True))


def load_decisions_to_judge() -> list[dict]:
    """Stub: in production, fetch decision text from Obsidian docs.
    For Stage 2 this returns a placeholder list. M3 wires real fetch.
    """
    return [
        {"id": "T-13", "title": "Hooks Wrapper Script", "summary": "..."},
        {"id": "T-19", "title": "FTS5 Search + Sanitization", "summary": "..."},
        # ... extend when M3 active
    ]


def judge_via_anthropic(prompt: str, decision_text: str) -> dict:
    """Real call when ANTHROPIC_API_KEY set. Stub otherwise."""
    if DRY_RUN:
        return {
            "axis_1": 3, "axis_2": 3, "axis_3": 3, "axis_4": 3, "axis_5": 3,
            "rationale": "DRY_RUN — ANTHROPIC_API_KEY not set",
        }
    # TODO(M3): import anthropic; client = anthropic.Anthropic(); ...
    raise NotImplementedError("Real Anthropic call wired in M3+ activation")


def main() -> int:
    timestamp = datetime.now(timezone.utc).isoformat()
    decisions = load_decisions_to_judge()
    baseline = load_baseline()

    results = []
    activation_pending = False
    for d in decisions:
        try:
            verdict = judge_via_anthropic(JUDGE_PROMPT, d.get("summary", ""))
        except NotImplementedError:
            activation_pending = True
            verdict = {
                "axis_1": 0, "axis_2": 0, "axis_3": 0, "axis_4": 0, "axis_5": 0,
                "rationale": "TODO(M3): real Anthropic call not yet wired",
            }
        results.append({
            "decision_id": d["id"],
            "title": d["title"],
            "scores": verdict,
            "evaluated_at": timestamp,
        })

    report = {
        "timestamp": timestamp,
        "dry_run": DRY_RUN,
        "decisions_judged": len(decisions),
        "results": results,
    }

    out_dir = REPO_ROOT / "evals" / "judge_reports"
    out_dir.mkdir(exist_ok=True)
    out_file = out_dir / f"{timestamp[:10]}_judge.json"
    out_file.write_text(json.dumps(report, indent=2))

    # Update baseline. Use dedicated namespace `llm_judge_scores` to avoid
    # collision with regression_test.py which writes eval-name keys to `scores`.
    baseline["version"] = baseline.get("version", 0) + 1
    baseline.setdefault("llm_judge_scores", {})
    for r in results:
        avg = sum(r["scores"][f"axis_{i}"] for i in range(1, 6)) / 5
        baseline["llm_judge_scores"][r["decision_id"]] = round(avg, 2)
    save_baseline(baseline)

    print(json.dumps(report, indent=2))
    # Surface activation-pending state via non-zero exit so monthly cron alerts.
    return 1 if activation_pending and not DRY_RUN else 0


if __name__ == "__main__":
    sys.exit(main())
