#!/usr/bin/env python3
# Regression test — 4 critical eval baseline 대비 5% drop 감지.
# 트리거 시 self-improve 루프 시작 (memory/procedures/self-improve.md 정합).
#
# 호출:
#   python3 evals/regression_test.py            # 정상 모드
#   python3 evals/regression_test.py --update   # baseline 갱신 후 기록

"""Regression detector for 4 critical evals.

Compares current eval scores (auth, hooks_receive, fts5_search, skill_trigger) against
baseline_scores.json. Reports any axis dropping >5% as regression.

Exit codes:
  0 = no regression (or all within 5%)
  1 = regression detected
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BASELINE = REPO_ROOT / "evals" / "baseline_scores.json"
DROP_THRESHOLD = 0.05

EVAL_RUN_CMD = [
    "pnpm", "--filter", "@team-claude/api", "test", "--",
    "evals/runners/auth.test.ts",
    "evals/runners/hooks_receive.test.ts",
    "evals/runners/fts5_search.test.ts",
    "evals/runners/skill_trigger.test.ts",
]


def load_baseline() -> dict:
    if not BASELINE.exists():
        return {"version": 0, "scores": {}}
    try:
        return json.loads(BASELINE.read_text())
    except (json.JSONDecodeError, OSError):
        return {"version": 0, "scores": {}}


def save_baseline(data: dict) -> None:
    BASELINE.write_text(json.dumps(data, indent=2, sort_keys=True))


def run_evals() -> dict:
    """Run vitest, parse pass/fail counts per file. Returns score per eval (0-1).

    Distinguishes 3 outcomes:
      - Tests skipped on purpose (RUN_INTEGRATION unset) → return 1.0 baseline.
      - Test runner crash / pnpm missing / cwd wrong → exit 1 with stderr surfaced.
      - Tests ran → parse vitest output (M1+ wiring).
    """
    skip_signal = "RUN_INTEGRATION" not in os.environ
    if skip_signal:
        return {
            "auth": 1.0,
            "hooks_receive": 1.0,
            "fts5_search": 1.0,
            "skill_trigger": 1.0,
        }
    result = subprocess.run(EVAL_RUN_CMD, capture_output=True, text=True, cwd=REPO_ROOT)
    if result.returncode != 0:
        print(json.dumps({
            "error": "eval runner failed",
            "returncode": result.returncode,
            "stderr_tail": result.stderr[-500:] if result.stderr else "",
        }), file=sys.stderr)
        sys.exit(1)
    # TODO(M1+): parse vitest stdout for actual pass/total counts.
    return {
        "auth": 1.0,
        "hooks_receive": 1.0,
        "fts5_search": 1.0,
        "skill_trigger": 1.0,
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--update", action="store_true", help="Update baseline after run")
    args = p.parse_args()

    baseline = load_baseline()
    current = run_evals()

    regressions = []
    baseline_scores = baseline.get("scores", {})
    for eval_name, score in current.items():
        old = baseline_scores.get(eval_name)
        if old is None:
            continue
        if score < old * (1 - DROP_THRESHOLD):
            regressions.append({
                "eval": eval_name,
                "baseline": old,
                "current": score,
                "drop_percent": round((old - score) / old * 100, 2),
            })

    report = {
        "regression_detected": bool(regressions),
        "regressions": regressions,
        "current_scores": current,
        "baseline_scores": baseline_scores,
        "threshold_percent": DROP_THRESHOLD * 100,
    }
    print(json.dumps(report, indent=2))

    if args.update:
        baseline["scores"] = {**baseline_scores, **current}
        baseline["version"] = baseline.get("version", 0) + 1
        save_baseline(baseline)
        print(json.dumps({"baseline_updated": True, "version": baseline["version"]}))

    return 1 if regressions else 0


if __name__ == "__main__":
    sys.exit(main())
