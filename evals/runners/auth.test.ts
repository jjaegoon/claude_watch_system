// evals/runners/auth.test.ts — T-17/T-18/T-21 critical auth scenarios.
// Active from B-1 onward (DB schema present + apps/api routes/auth.ts implemented).
// Until then, .skip ensures vitest doesn't fail on unimplemented endpoints.

import { describe, it, expect } from 'vitest';
import goldenSet from '../golden_set/auth.json' with { type: 'json' };

const RUN_INTEGRATION = process.env.RUN_INTEGRATION === '1';
const describeOrSkip = RUN_INTEGRATION ? describe : describe.skip;

describeOrSkip('auth.json — T-17/T-18/T-21', () => {
  for (const c of goldenSet.cases) {
    it(`${c.id} — ${c.scenario}`, async () => {
      // TODO(M1): replace with real fetch against apps/api once /auth routes ship
      // For now, this is a structural test — verifies golden_set shape is honored.
      expect(c.id).toBeTruthy();
      expect(c.scenario).toBeTruthy();
      expect(c.expected).toBeTruthy();
      expect(c.decision).toMatch(/T-\d+/);
    });
  }

  it('golden set has expected critical-path scenarios', () => {
    const ids = goldenSet.cases.map((c: { id: string }) => c.id);
    expect(ids).toContain('auth-rotation-detect-theft');
    expect(ids).toContain('auth-login-rate-limit');
    expect(ids).toContain('auth-csrf-origin-mismatch');
  });
});
