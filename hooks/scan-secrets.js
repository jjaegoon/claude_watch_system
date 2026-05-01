#!/usr/bin/env node
// T-32D: 9-pattern secret scanner. Node 22 stdlib only, no dependencies.
// Usage:
//   node scan-secrets.js <file>                  → scan file (path used for allowlist)
//   echo data | node scan-secrets.js             → scan stdin (no allowlist context)
//   echo data | node scan-secrets.js --for <p>   → scan stdin, check allowlist against <p>
// Exit codes: 0 = no secrets; 1 = secret(s) detected; 2 = read error.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PATTERNS = [
  { name: 'github_pat',     re: /\bghp_[A-Za-z0-9]{36,}\b/g },
  { name: 'github_pat_v2',  re: /\bgithub_pat_[A-Za-z0-9_]{82,}\b/g },
  { name: 'anthropic',      re: /\bsk-ant-[A-Za-z0-9_-]{40,}\b/g },
  { name: 'stripe_live',    re: /\bsk_live_[A-Za-z0-9]{24,}\b/g },
  { name: 'aws_akia',       re: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[0-9A-Z]{16}\b/g },
  { name: 'gcp_aiza',       re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'slack_xox',      re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'pem_private',    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { name: 'jwt',            re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'webhook_slack',  re: /\bhooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+\b/g },
];

function loadAllowlist() {
  const candidates = [
    path.join(__dirname, 'scanner-allowlist.ts'),
    path.join(process.cwd(), 'hooks', 'scanner-allowlist.ts'),
  ];
  for (const fp of candidates) {
    if (!fs.existsSync(fp)) continue;
    try {
      const txt = fs.readFileSync(fp, 'utf8');
      const m = txt.match(/paths\s*:\s*\[([\s\S]*?)\]/);
      if (m) {
        return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
      }
      process.stderr.write(`[scan-secrets] WARNING: allowlist found at ${fp} but paths[] not parseable\n`);
    } catch (e) {
      process.stderr.write(`[scan-secrets] WARNING: allowlist read error: ${e.message}\n`);
    }
  }
  return [];
}

const ALLOWLIST = loadAllowlist();

// Glob → RegExp via per-character translation. Handles **/ (zero-or-more dirs).
function globToRegex(glob) {
  let pattern = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    const n1 = glob[i + 1];
    const n2 = glob[i + 2];
    if (c === '*' && n1 === '*' && n2 === '/') {
      pattern += '(?:.*/)?';
      i += 3;
    } else if (c === '*' && n1 === '*') {
      pattern += '.*';
      i += 2;
    } else if (c === '*') {
      pattern += '[^/]*';
      i += 1;
    } else if (c === '?') {
      pattern += '.';
      i += 1;
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      pattern += '\\' + c;
      i += 1;
    } else {
      pattern += c;
      i += 1;
    }
  }
  return new RegExp('^' + pattern + '$');
}

function isAllowlisted(filePath) {
  if (!filePath) return false;
  const cwd = process.cwd();
  const abs = path.resolve(filePath);
  const rel = path.relative(cwd, abs).replace(/\\/g, '/');
  return ALLOWLIST.some(g => {
    const re = globToRegex(g);
    return re.test(rel) || re.test(filePath) || re.test(abs);
  });
}

function readContent(arg) {
  if (arg && arg !== '-') {
    return fs.readFileSync(arg, 'utf8');
  }
  // Read all of stdin synchronously (Node 22 supports /dev/stdin readFileSync).
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    throw new Error(`stdin read failed: ${e.message}`);
  }
}

function parseArgs(argv) {
  // argv[2..] — supports `<file>` or `--for <path>` (stdin mode with allowlist hint)
  const args = argv.slice(2);
  let file = null;
  let allowlistHint = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--for' && args[i + 1]) {
      allowlistHint = args[i + 1];
      i++;
    } else if (!file && args[i] !== '-') {
      file = args[i];
    }
  }
  return { file, allowlistHint };
}

(function main() {
  const { file, allowlistHint } = parseArgs(process.argv);

  // Allowlist check: prefer explicit hint, fall back to file arg.
  const allowlistTarget = allowlistHint || file;
  if (allowlistTarget && isAllowlisted(allowlistTarget)) {
    process.exit(0);
  }

  let content;
  try {
    content = readContent(file);
  } catch (e) {
    process.stderr.write(`[scan-secrets] read error: ${e.message}\n`);
    process.exit(2);
  }

  const findings = [];
  for (const { name, re } of PATTERNS) {
    const matches = content.match(re);
    if (matches) {
      for (const m of matches) {
        findings.push({ pattern: name, sample: m.slice(0, 16) + '…' });
      }
    }
  }

  if (findings.length === 0) {
    process.exit(0);
  }

  process.stderr.write(`[scan-secrets] ${file || '<stdin>'}: ${findings.length} finding(s)\n`);
  for (const f of findings) {
    process.stderr.write(`  - ${f.pattern}: ${f.sample}\n`);
  }
  process.exit(1);
})();
