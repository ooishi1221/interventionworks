#!/usr/bin/env node
// Aggregated security check for Intervention Works repo.
// Runs: secretlint (full repo) → per-project npm audit → per-project tsc (if applicable).
// Exit non-zero on any failure. Designed to be called from repo root via `npm run security-check`.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const PROJECTS = [
  { name: 'moto-logos', path: 'engineering/moto-logos' },
  { name: 'moto-logos-admin', path: 'engineering/moto-logos-admin' },
  { name: 'moto-logos-lp', path: 'engineering/moto-logos-lp' },
  { name: 'moto-logos-slack', path: 'engineering/moto-logos-slack' },
];

const AUDIT_LEVEL = 'high';

const results = [];
let hadFailure = false;

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function banner(title) {
  const line = '='.repeat(64);
  console.log(`\n${line}\n  ${title}\n${line}`);
}

async function runStep(label, cmd, args, cwd) {
  banner(label);
  console.log(`$ ${cmd} ${args.join(' ')}  (in ${path.relative(REPO_ROOT, cwd) || '.'})`);
  const code = await run(cmd, args, cwd);
  const ok = code === 0;
  results.push({ label, ok });
  if (!ok) hadFailure = true;
  return ok;
}

async function main() {
  // 1. Secret scan (whole repo, using .secretlintignore for extra ignores beyond .gitignore)
  await runStep(
    'secretlint (whole repo)',
    'npx',
    ['--no-install', 'secretlint', '--secretlintignore', '.secretlintignore', '**/*'],
    REPO_ROOT
  );

  // 2. Per-project npm audit (prod deps only; high or critical fails)
  for (const project of PROJECTS) {
    const cwd = path.join(REPO_ROOT, project.path);
    if (!existsSync(path.join(cwd, 'package.json'))) {
      console.warn(`[skip] ${project.name}: no package.json`);
      continue;
    }

    await runStep(
      `${project.name}: npm audit --audit-level=${AUDIT_LEVEL} --omit=dev`,
      'npm',
      ['audit', `--audit-level=${AUDIT_LEVEL}`, '--omit=dev'],
      cwd
    );
  }

  banner('Summary');
  for (const r of results) {
    console.log(`  ${r.ok ? 'OK  ' : 'FAIL'}  ${r.label}`);
  }

  if (hadFailure) {
    console.error('\n❌ security-check failed. Review output above before committing / deploying.');
    process.exit(1);
  }
  console.log('\n✅ security-check passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
