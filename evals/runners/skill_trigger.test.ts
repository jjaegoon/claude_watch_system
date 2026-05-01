// evals/runners/skill_trigger.test.ts — T-14/T-23/T-32A scenario_tag.
// Active from M3 onward.

import { describe, it, expect } from 'vitest';
import goldenSet from '../golden_set/skill_trigger.json' with { type: 'json' };

const RUN_INTEGRATION = process.env.RUN_INTEGRATION === '1';
const describeOrSkip = RUN_INTEGRATION ? describe : describe.skip;

describeOrSkip('skill_trigger.json — T-14/T-23/T-32A', () => {
  for (const c of goldenSet.cases) {
    it(`${c.id} — ${c.scenario}`, async () => {
      expect(c.given).toBeTruthy();
      expect(c.expected).toBeTruthy();
      expect(c.decision).toMatch(/T-\d+/);
    });
  }

  it('covers registered, unregistered, rename scenarios (T-32A scenario_tag ≥2 branches)', () => {
    const ids = goldenSet.cases.map((c: { id: string }) => c.id);
    expect(ids).toContain('skill-trigger-registered');
    expect(ids).toContain('skill-trigger-unregistered');
    expect(ids).toContain('skill-trigger-rename-stale-cache');
  });
});
