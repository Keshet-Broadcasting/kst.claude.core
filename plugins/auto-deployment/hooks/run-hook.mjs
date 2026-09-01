#!/usr/bin/env node
// Thin OS dispatcher for the auto-deployment hooks.
//
// hooks.json registers each hook through this file, so one registration
// works on every platform: on Windows it runs the hook's .ps1 twin through
// Windows PowerShell, everywhere else it runs the .sh original through
// bash. Stdin, stdout, and the exit code pass straight through - the
// dispatcher adds no behaviour of its own.
//
// Fails open (exit 0, no output) on any error of its own, exactly like the
// hooks it dispatches: a broken dispatcher must not wedge the builder's
// shell.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

try {
  const here = dirname(fileURLToPath(import.meta.url));
  const name = process.argv[2] ?? "";
  // The hook name is a fixed identifier from hooks.json, never user input;
  // the allowlist below keeps it that way.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) process.exit(0);

  const isWindows = process.platform === "win32";
  const script = join(here, name + (isWindows ? ".ps1" : ".sh"));
  if (!existsSync(script)) process.exit(0);

  const result = isWindows
    ? spawnSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
        { stdio: "inherit" },
      )
    : spawnSync("bash", [script], { stdio: "inherit" });

  process.exit(typeof result.status === "number" ? result.status : 0);
} catch {
  process.exit(0);
}
