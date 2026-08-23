#!/usr/bin/env bash
# UserPromptSubmit hook for the auto-deployment plugin.
#
# Why this exists: a non-technical builder almost never asks to deploy. They
# report a symptom - "I sent my manager the address and he can't get in" - and
# the model, reading that as a bug, reaches for a debugging skill and starts
# looking for a broken thing that does not exist. Worse, the helpful-looking
# fixes (a tunnel, --host, a third-party host) each route a Keshet app around
# every check the platform exists to apply.
#
# Skill descriptions match on the deploy framing. This hook adds the framing
# the builder actually uses, deterministically.
#
# ---------------------------------------------------------------------------
# On cost. Injected context attaches to the user message and stays in the
# transcript for the session - there is no way to show the model something for
# one turn only. So the design is not "inject cheaply", it is "inject rarely":
#
#   - Ordinary turns emit nothing at all. Not a word.
#   - INTENT signals (localhost, "he can't open it", "send him a link") fire at
#     most ONCE per session. The point is to redirect the model the first time
#     it misreads sharing as a bug; saying it again teaches it to skim.
#   - ESCAPE signals (ngrok, vercel, --host) fire EVERY time. Each one is a live
#     attempt to route around Keshet, they are rare, and one missed is worse
#     than any amount of context.
#
# A typical session injects zero tokens. A sharing session injects one block.
# ---------------------------------------------------------------------------
#
# Reads the hook payload on stdin, writes additionalContext on stdout. Never
# blocks, never fails the turn: any error exits 0 with no context injected.

set -uo pipefail

payload=$(cat 2>/dev/null) || exit 0
command -v jq >/dev/null 2>&1 || exit 0

prompt=$(printf '%s' "$payload" | jq -r '.prompt // ""' 2>/dev/null) || exit 0
[ -n "$prompt" ] || exit 0
lower=$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]')

# Sharing intent, worded as a symptom rather than a request. Broad on purpose -
# a false positive costs one block, once; a false negative costs the failure
# this hook exists to prevent.
intent='localhost|127\.0\.0\.1|:[0-9]{4,5}([/ ]|$)'
intent="$intent"'|can.?t (open|access|see|get|reach|view)|cannot (open|access|see|get|reach|view)|(won.?t|doesn.?t) (open|load|work) for'
intent="$intent"'|only works on my|on my machine|my computer|send (him|her|them|it to)|sent (him|her|them|it to)|give (him|her|them) (a |the )?link'
intent="$intent"'|share (it|this|the app)|a link to|the address|show (my|the) (manager|team|boss|colleague)'

# A route around Keshet, named outright. Rare, and each occurrence is live.
escape='ngrok|cloudflar|localtunnel|port forward|--host|0\.0\.0\.0|vercel|netlify|render\.com|github pages|surge\.sh|expose (it|the app)'

hit_intent=false
hit_escape=false
printf '%s' "$lower" | grep -Eq "$intent" && hit_intent=true
printf '%s' "$lower" | grep -Eq "$escape" && hit_escape=true

$hit_intent || $hit_escape || exit 0

# Once-per-session marker for intent. Keyed by session id so concurrent
# sessions do not silence each other; lives in the OS temp dir so it is cleaned
# up without us managing a lifecycle.
session=$(printf '%s' "$payload" | jq -r '.session_id // "nosession"' 2>/dev/null) || session="nosession"
marker="${TMPDIR:-/tmp}/kst-sharing-intent-${session//[^A-Za-z0-9_-]/_}"

if ! $hit_escape; then
  # Intent only, and already said once this session. Stay quiet.
  [ -e "$marker" ] && exit 0
fi
: > "$marker" 2>/dev/null || true

read -r -d '' context <<'EOF'
Deploy-intent check (auto-deployment). This message carries sharing or hosting signals, so before answering:

Does it mean a person other than the builder needs to open the app? If so it is a deploy request however it is worded, and two things are not negotiable. (1) A localhost or 127.0.0.1 address only works on the builder's own machine and can never be sent to anyone - say so plainly rather than debugging it; there is no network, firewall, or port at fault. (2) Tunnels (ngrok, cloudflared, localtunnel, port forwarding), binding the dev server with --host or 0.0.0.0, and third-party hosts (Vercel, Netlify, and the rest) are forbidden for Keshet apps - do not offer them, describe them, or do them if asked, even briefly, even if the builder asks directly.

The only route to another person is the deploy chain, dispatched via the orchestrator agent. Read the sharing-your-work skill before you reply.
EOF

jq -n --arg c "$context" \
  '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$c}}' 2>/dev/null || exit 0
