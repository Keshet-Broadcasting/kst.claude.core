#!/usr/bin/env node
// Fast starter-conformance gate for the very start of a deploy.
//
// It answers one question cheaply: is this folder the kst.claude.core starter
// at all? It only looks at markers on disk - it never installs, builds, or
// starts anything. The full build-contract reproduction stays in preflight.mjs
// and runs later, inside the deployment agent.
//
// This gate exists so the orchestrator can stop a deploy in seconds when the
// project is not on the starter, and tell the builder to adapt it first with
// the kst-onboarding plugin - in a NEW session. The gate does not adapt,
// redirect, or fix anything; it only reports.
//
// Usage:
//   node conformance-check.mjs [app folder]   (default: ".")
//
// Output: one JSON object on the last line -
//   { conformant: boolean, missing: string[], summary: string }
// Exit code: 0 conformant, 1 not conformant, 2 could not run.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HEALTH_ROUTE_FILES = ['route.ts', 'route.js', 'route.mjs'];

const appDir = process.argv[2] ?? '.';

const emit = (result, code) => {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(code);
};

try {
  if (!existsSync(appDir) || !statSync(appDir).isDirectory()) {
    emit({ conformant: false, missing: [], summary: `No readable folder at ${appDir}.` }, 2);
  }

  let pkg = null;
  try {
    const parsed = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));
    pkg = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    pkg = null;
  }

  const hasNext = typeof pkg?.dependencies?.next === 'string';
  const hasHealth = HEALTH_ROUTE_FILES.some((file) =>
    existsSync(join(appDir, 'app', 'api', 'health', file)),
  );

  const missing = [
    ...(pkg ? [] : ['a readable package.json']),
    ...(hasNext ? [] : ['next listed under dependencies']),
    ...(existsSync(join(appDir, 'pnpm-lock.yaml')) ? [] : ['pnpm-lock.yaml']),
    ...(hasHealth ? [] : ['the health route at app/api/health']),
  ];

  if (missing.length === 0) {
    emit({ conformant: true, missing: [], summary: 'The folder has the starter shape Keshet builds.' }, 0);
  }

  emit(
    {
      conformant: false,
      missing,
      summary: `This project is not on the Keshet starter yet. Missing: ${missing.join(', ')}.`,
    },
    1,
  );
} catch (err) {
  emit({ conformant: false, missing: [], summary: `Conformance check could not run: ${err.message}` }, 2);
}
