// T-32D: Secret scanner allowlist as TypeScript constant.
// Audit log = git history of this file (per T-32D decision).
// Consumed by hooks/scan-secrets.js at scan time via regex extraction of the paths array below.

export const SECRET_ALLOWLIST = {
  paths: [
    'evals/golden_set/**/*.json',
    'evals/**/*.test.ts',
    'memory/**/*.md',
    'memory/episodes/**',
    '**/*.example',
    'hooks/scanner-allowlist.ts',
    '.claude/plans/**',
    'test/**',
  ],
  // Reserved for pattern-level overrides (currently empty).
  patterns: [] as RegExp[],
};
