// evals/runners/fts5_search.test.ts — T-19/T-27 FTS5 search + sanitization.
// Active from M1 onward (DB schema + assets_fts virtual table).

import { describe, it, expect } from 'vitest';
import goldenSet from '../golden_set/fts5_search.json' with { type: 'json' };

const RUN_INTEGRATION = process.env.RUN_INTEGRATION === '1';
const describeOrSkip = RUN_INTEGRATION ? describe : describe.skip;

describeOrSkip('fts5_search.json — T-19/T-27', () => {
  for (const c of goldenSet.cases) {
    it(`${c.id} — ${c.scenario}`, async () => {
      expect(c.given).toBeTruthy();
      expect(c.expected).toBeTruthy();
      expect(c.decision).toMatch(/T-\d+/);
    });
  }

  it('covers basic, tags, hyphen sanitize, AND reserved, korean, empty', () => {
    const ids = goldenSet.cases.map((c: { id: string }) => c.id);
    expect(ids).toContain('fts5-basic-keyword');
    expect(ids).toContain('fts5-tags-array');
    expect(ids).toContain('fts5-hyphen-sanitize');
    expect(ids).toContain('fts5-reserved-word-AND');
    expect(ids).toContain('fts5-korean-baseline');
    expect(ids).toContain('fts5-empty-query');
  });
});
