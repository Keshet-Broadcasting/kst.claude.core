#!/usr/bin/env node
// Validates every folder under src/shared/embeds/ has a well-formed embed.json and an
// index.ts, that no forbidden prop appears in the folder's component source, and that
// templateVersion matches the current template version.

// embed.schema.json declares "$schema": ".../draft/2020-12/schema" — the plain `ajv`
// export only bundles the draft-07 meta-schema, so it must come from the 2020 subpath.
import Ajv2020 from 'ajv/dist/2020.js';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_EMBED_TEMPLATE_VERSION } from './embed-constants.mjs';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const embedsDir = join(projectRoot, 'src', 'shared', 'embeds');
const schema = JSON.parse(readFileSync(join(projectRoot, 'embed.schema.json'), 'utf8'));

const ajv = new Ajv2020();
const validate = ajv.compile(schema);

function checkEmbed(name) {
  const dir = join(embedsDir, name);
  const errors = [];

  const indexPath = join(dir, 'index.ts');
  if (!existsSync(indexPath)) {
    errors.push(`${name}: missing index.ts (public API)`);
  }

  const manifestPath = join(dir, 'embed.json');
  if (!existsSync(manifestPath)) {
    errors.push(`${name}: missing embed.json`);
    return errors;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!validate(manifest)) {
    for (const issue of validate.errors ?? []) {
      errors.push(`${name}: embed.json ${issue.instancePath || '(root)'} ${issue.message}`);
    }
    return errors;
  }

  if (manifest.templateVersion !== CURRENT_EMBED_TEMPLATE_VERSION) {
    errors.push(
      `${name}: templateVersion "${manifest.templateVersion}" is stale (current: "${CURRENT_EMBED_TEMPLATE_VERSION}"). Regenerate with pnpm embed:add.`,
    );
  }

  const sourceFiles = readdirSync(dir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
  const sourceText = sourceFiles.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');

  for (const prop of manifest.forbiddenProps ?? []) {
    const propUsagePattern = new RegExp(`\\b${prop}\\s*=`);
    if (propUsagePattern.test(sourceText)) {
      errors.push(`${name}: forbidden prop "${prop}" is used in the wrapper source`);
    }
  }

  return errors;
}

function main() {
  if (!existsSync(embedsDir)) {
    console.log('No src/shared/embeds directory — nothing to check.');
    return;
  }

  const names = readdirSync(embedsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (names.length === 0) {
    console.log('src/shared/embeds is empty — nothing to check.');
    return;
  }

  const allErrors = names.flatMap(checkEmbed);

  if (allErrors.length > 0) {
    console.error('embed:check failed:\n' + allErrors.map((e) => `  - ${e}`).join('\n'));
    process.exit(1);
  }

  console.log(`embed:check passed for: ${names.join(', ')}`);
}

main();
