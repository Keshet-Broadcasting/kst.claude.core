#!/usr/bin/env bash
# PreToolUse/Bash hook for the auto-deployment plugin.
#
# The fail-closed backstop under the sharing-your-work prohibition. A Keshet app
# reaches other people through the deployment service or not at all; a tunnel or
# a third-party host puts it in front of them with no audience decision, no
# secret scan, no sign-in passthrough, no IT review, and no record of who built
# it. Guidance covers the model that read the skill. This covers the one that
# did not.
#
# Costs nothing on a normal turn: it emits context only when a matching command
# is actually attempted, which should be never.
#
# Fails open on its own errors (exit 0, no decision) - a broken hook must not
# wedge the builder's shell. The permission system still applies underneath.

set -uo pipefail

payload=$(cat 2>/dev/null) || exit 0
command -v jq >/dev/null 2>&1 || exit 0

cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0
[ -n "$cmd" ] || exit 0
lower=$(printf '%s' "$cmd" | tr '[:upper:]' '[:lower:]')

# Anchored to COMMAND position - start of line, or just after a separator. A
# bare space would not do: `grep -r ngrok docs/` and `cat notes-about-vercel.md`
# are reading about these tools, not running them, and blocking those trains the
# model to route around the hook rather than respect it.
sep='(^|[;&|]|&&|\|\|)[[:space:]]*'
blocked="${sep}"'(ngrok|cloudflared|localtunnel|surge)([[:space:]]|$)'
blocked="$blocked"'|'"${sep}"'(npx|pnpx|bunx|yarn +dlx)[[:space:]]+(ngrok|localtunnel|surge|cloudflared)'
blocked="$blocked"'|'"${sep}"'(vercel|netlify|wrangler)[[:space:]]+(deploy|publish|pages)'
blocked="$blocked"'|--host[ =](0\.0\.0\.0|[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})'
blocked="$blocked"'|(^| )host=0\.0\.0\.0|--host( |$)'

printf '%s' "$lower" | grep -Eq "$blocked" || exit 0

reason="Blocked: this exposes the app outside the builder's machine without going through Keshet. A Keshet app reaches another person through the deployment service or not at all - a tunnel, a network-bound dev server, or a third-party host skips the audience decision, the secret scan, the sign-in passthrough, the IT review, and the record of who built it. Do not retry this, do not work around it, and do not offer the builder another route to the same place. Read the sharing-your-work skill and offer to send the app to Keshet instead."

jq -n --arg r "$reason" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}' 2>/dev/null || exit 0
