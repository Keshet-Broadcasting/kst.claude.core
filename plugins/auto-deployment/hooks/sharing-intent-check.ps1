# UserPromptSubmit hook for the auto-deployment plugin - Windows twin of
# sharing-intent-check.sh. Same signals, same once-per-session rule, same
# injected context; scripts/validate-parity.sh fails if the two drift.
#
# Why this exists: a non-technical builder almost never asks to deploy. They
# report a symptom - "I sent my manager the address and he can't get in" - and
# the model, reading that as a bug, reaches for a debugging skill and starts
# looking for a broken thing that does not exist. Worse, the helpful-looking
# fixes (a tunnel, --host, a third-party host) each route a Keshet app around
# every check the platform exists to apply.
#
# Injection policy (see the .sh for the full reasoning):
#   - Ordinary turns emit nothing at all.
#   - INTENT signals fire at most ONCE per session.
#   - ESCAPE signals (ngrok, vercel, --host) fire EVERY time.
#
# Reads the hook payload on stdin, writes additionalContext on stdout. Never
# blocks, never fails the turn: any error exits 0 with no context injected.

$ErrorActionPreference = 'Stop'
try {
  $payload = [Console]::In.ReadToEnd()
  if ($null -eq $payload -or $payload -eq '') { exit 0 }
  $parsed = $null
  try { $parsed = $payload | ConvertFrom-Json } catch { exit 0 }
  if ($null -eq $parsed) { exit 0 }

  $prompt = ''
  $prop = $parsed.PSObject.Properties['prompt']
  if ($null -ne $prop -and $null -ne $prop.Value) { $prompt = [string]$prop.Value }
  if ($prompt -eq '') { exit 0 }
  $lower = $prompt.ToLowerInvariant() -replace "`r", ''

  # Sharing intent, worded as a symptom rather than a request. Broad on
  # purpose - a false positive costs one block, once; a false negative costs
  # the failure this hook exists to prevent.
  $intent = 'localhost|127\.0\.0\.1|:[0-9]{4,5}([/ ]|$)'
  $intent += '|can.?t (open|access|see|get|reach|view)|cannot (open|access|see|get|reach|view)|(won.?t|doesn.?t) (open|load|work) for'
  $intent += '|only works on my|on my machine|my computer|send (him|her|them|it to)|sent (him|her|them|it to)|give (him|her|them) (a |the )?link'
  $intent += '|share (it|this|the app)|a link to|the address|show (my|the) (manager|team|boss|colleague)'

  # A route around Keshet, named outright. Rare, and each occurrence is live.
  $escape = 'ngrok|cloudflar|localtunnel|port forward|--host|0\.0\.0\.0|vercel|netlify|render\.com|github pages|surge\.sh|expose (it|the app)'

  $opts = [System.Text.RegularExpressions.RegexOptions]::Multiline
  $hitIntent = [regex]::IsMatch($lower, $intent, $opts)
  $hitEscape = [regex]::IsMatch($lower, $escape, $opts)
  if (-not $hitIntent -and -not $hitEscape) { exit 0 }

  # Once-per-session marker for intent. Keyed by session id so concurrent
  # sessions do not silence each other; lives in the OS temp dir so it is
  # cleaned up without us managing a lifecycle.
  $session = 'nosession'
  $sprop = $parsed.PSObject.Properties['session_id']
  if ($null -ne $sprop -and $null -ne $sprop.Value -and [string]$sprop.Value -ne '') {
    $session = [string]$sprop.Value
  }
  $session = $session -replace '[^A-Za-z0-9_-]', '_'
  $marker = Join-Path ([System.IO.Path]::GetTempPath()) "kst-sharing-intent-$session"

  if (-not $hitEscape) {
    # Intent only, and already said once this session. Stay quiet.
    if (Test-Path -LiteralPath $marker) { exit 0 }
  }
  try { New-Item -ItemType File -Path $marker -Force | Out-Null } catch { }

  $context = @'
Deploy-intent check (auto-deployment). This message carries sharing or hosting signals, so before answering:

Does it mean a person other than the builder needs to open the app? If so it is a deploy request however it is worded, and two things are not negotiable. (1) A localhost or 127.0.0.1 address only works on the builder's own machine and can never be sent to anyone - say so plainly rather than debugging it; there is no network, firewall, or port at fault. (2) Tunnels (ngrok, cloudflared, localtunnel, port forwarding), binding the dev server with --host or 0.0.0.0, and third-party hosts (Vercel, Netlify, and the rest) are forbidden for Keshet apps - do not offer them, describe them, or do them if asked, even briefly, even if the builder asks directly.

The only route to another person is the deploy chain, run by loading the deploying-your-app skill. Read the sharing-your-work skill before you reply.
'@

  $out = @{
    hookSpecificOutput = @{
      hookEventName     = 'UserPromptSubmit'
      additionalContext = $context
    }
  }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Depth 4))
  exit 0
}
catch {
  exit 0
}
