#!/usr/bin/env node
// Bootstrap the Claude Code plugins this project depends on.
//
// Source of truth is .claude/settings.json (`enabledPlugins`). This script installs
// whatever is enabled there but not yet present in the local plugin cache. It is
// idempotent: re-running it when everything is installed is a no-op.
//
// Plugins are NOT bundled in the repo — the settings file only names them, so each
// clone must fetch them once from their marketplace. Newly installed plugins load on
// the NEXT Claude Code session, not the current one.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const settingsPath = join(projectRoot, '.claude', 'settings.json');

/** Run the `claude` CLI. Returns stdout when `capture`, otherwise streams to the terminal. */
function claude(args, { capture = false } = {}) {
  return execFileSync('claude', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

let settings;
try {
  settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
} catch (err) {
  console.error(`Cannot read ${settingsPath}: ${err.message}`);
  process.exit(1);
}

// enabledPlugins values may be a bare `true` or the object form `{ "enabled": true, ... }`.
// Treat both as enabled; anything else (false, { enabled: false }) is off.
const enabled = Object.entries(settings.enabledPlugins ?? {})
  .filter(([, on]) => on === true || (on && typeof on === 'object' && on.enabled === true))
  .map(([id]) => id);

if (enabled.length === 0) {
  console.log('No plugins enabled in .claude/settings.json — nothing to do.');
  process.exit(0);
}

// The official marketplace (claude-plugins-official) is built in. Any custom marketplace
// a plugin comes from must be registered first, or the install can't resolve it.
for (const [name, entry] of Object.entries(settings.extraKnownMarketplaces ?? {})) {
  const source = entry?.source ?? {};
  const kind = source.source; // "github" | "git" | "directory"
  const ref = source.repo ?? source.url ?? source.path;
  if (!ref) {
    console.warn(`Skipping marketplace "${name}": unrecognized source shape.`);
    continue;
  }

  // Directory sources are an absolute local path. They are machine-specific and should NOT
  // be committed to settings.json — a fresh clone on another machine won't have that path.
  // Warn if one is committed, and skip it entirely when the path is absent here (otherwise
  // `marketplace add <path>` fails with "Path does not exist").
  if (kind === 'directory' || (source.path && !source.repo && !source.url)) {
    console.warn(
      `⚠ Marketplace "${name}" uses a local directory source (${ref}). ` +
        `Local paths are machine-specific and should not be committed to settings.json.`,
    );
    if (!existsSync(ref)) {
      console.warn(`  → local marketplace ${name} skipped — path not present on this machine.`);
      continue;
    }
  }

  try {
    // Capture output so we can tell "already registered" (exit 0) apart from a real failure
    // (exit non-zero → throw). An already-registered marketplace still exits 0 and prints
    // "already on disk", so it never reaches the catch.
    const out = claude(['plugin', 'marketplace', 'add', ref], { capture: true });
    if (/already on disk|already registered|already known/i.test(out)) {
      console.log(`• Marketplace ${name} already registered (skipped).`);
    } else {
      console.log(`✓ Registered marketplace ${name} (${ref}).`);
    }
  } catch (err) {
    // A non-zero exit is a genuine failure — unreachable repo, git auth error, bad path.
    // Surface the actual stderr instead of pretending it was already registered. Non-fatal:
    // keep going so the install step fails loudly for plugins from this marketplace.
    const detail = (err.stderr || err.message || '').toString().trim();
    console.warn(`⚠ Could not register marketplace ${name} (${ref}):\n${detail}`);
  }
}

let installed;
try {
  const out = claude(['plugin', 'list', '--json'], { capture: true });
  // Observed schema (claude 2.1.x): a top-level array of objects, each with an `id` of the
  // form "name@marketplace" — exactly the enabledPlugins key format. Stay tolerant of a
  // future `{ plugins: [...] }` wrapper or an id-less shape just in case.
  const parsed = JSON.parse(out);
  const items = Array.isArray(parsed) ? parsed : (parsed.plugins ?? []);
  installed = new Set(
    items
      .map((p) => p.id ?? (p.name && p.marketplace ? `${p.name}@${p.marketplace}` : null))
      .filter(Boolean),
  );
} catch (err) {
  console.error(`Could not read installed plugins: ${err.message}`);
  process.exit(1);
}

const missing = enabled.filter((id) => !installed.has(id));

if (missing.length === 0) {
  console.log(`✓ All ${enabled.length} enabled plugin(s) already installed.`);
  process.exit(0);
}

console.log(`Installing ${missing.length} missing plugin(s): ${missing.join(', ')}`);

let failures = 0;
for (const id of missing) {
  try {
    // --scope project records enablement in this repo's .claude/settings.json. Verified on
    // claude 2.1.x: because we only install ids that are ALREADY listed in enabledPlugins,
    // the install does not rewrite or reformat settings.json (the entry is unchanged), so a
    // fresh clone stays git-clean after setup. The plugin payload itself lives in the local
    // cache, not the repo.
    claude(['plugin', 'install', id, '--scope', 'project']);
    console.log(`✓ Installed ${id}`);
  } catch (err) {
    failures += 1;
    console.error(`✗ Failed to install ${id}: ${err.message}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} plugin(s) failed to install — see errors above.`);
  process.exit(1);
}

console.log('\n✓ Done. Restart Claude Code so the newly installed plugins load.');
