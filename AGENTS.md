<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:plugin-bootstrap -->

# Required Claude Code plugins

This project depends on the plugins enabled in `.claude/settings.json` (`enabledPlugins`). They are **not** bundled in the repo — each clone must install them once.

At the start of a session, **announce which plugins this project uses** (read them from `enabledPlugins` in `.claude/settings.json` and list them by name), then run the bootstrap script:

```bash
node scripts/setup-plugins.mjs
```

These are plugins from the official marketplace, so you don't need to wait for the user's approval before running the script — but never install silently: always list what will be set up first. The script is idempotent (safe to re-run), checks what is already present, and installs only what is missing — no separate `claude plugin list` step is needed.

Report the script's output. If it installed anything, tell the user to **restart Claude Code** so the new plugins load on the next session.
<!-- END:plugin-bootstrap -->
