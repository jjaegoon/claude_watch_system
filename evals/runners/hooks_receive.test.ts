// evals/runners/hooks_receive.test.ts — T-13/T-14/T-23/T-28/T-29 hook payload tests.
// Active from M3 onward (apps/api /hooks/event endpoint + worker queue).

import { describe, it, expect } from 'vitest';
import goldenSet from '../golden_set/hooks_receive.json' with { type: 'json' };

const RUN_INTEGRATION = process.env.RUN_INTEGRATION === '1';
const describeOrSkip = RUN_INTEGRATION ? describe : describe.skip;

describeOrSkip('hooks_receive.json — T-13/T-14/T-23/T-28/T-29', () => {
  for (const c of goldenSet.cases) {
    it(`${c.id} — ${c.scenario}`, async () => {
      // TODO(M3): wire to real /hooks/event endpoint with synthetic stdin payload.
      expect(c.given).toBeTruthy();
      expect(c.expected).toBeTruthy();
      expect(c.decision).toMatch(/T-\d+/);
    });
  }

  it('covers V1 (Edit), V2 (Skill), V3 (MCP), session start/end, dedup', () => {
    const ids = goldenSet.cases.map((c: { id: string }) => c.id);
    expect(ids).toContain('hooks-V1-edit-tool');
    expect(ids).toContain('hooks-V2-skill-trigger');
    expect(ids).toContain('hooks-V3-mcp-tool');
    expect(ids).toContain('hooks-session-start');
    expect(ids).toContain('hooks-session-end');
    expect(ids).toContain('hooks-T29-dedup-by-tool-use-id');
  });
});
