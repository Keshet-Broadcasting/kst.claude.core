# PreToolUse/Bash hook for the auto-deployment plugin - Windows twin of
# block-external-hosting.sh. Same patterns, same deny decision;
# scripts/validate-parity.sh fails if the two drift.
#
# The fail-closed backstop under the sharing-your-work prohibition. A Keshet
# app reaches other people through the deployment service or not at all; a
# tunnel or a third-party host puts it in front of them with no audience
# decision, no secret scan, no sign-in passthrough, no IT review, and no
# record of who built it. Guidance covers the model that read the skill. This
# covers the one that did not.
#
# Costs nothing on a normal turn: it emits context only when a matching
# command is actually attempted, which should be never.
#
# Fails open on its own errors (exit 0, no decision) - a broken hook must not
# wedge the builder's shell. The permission system still applies underneath.

$ErrorActionPreference = 'Stop'
try {
  $payload = [Console]::In.ReadToEnd()
  if ($null -eq $payload -or $payload -eq '') { exit 0 }
  $parsed = $null
  try { $parsed = $payload | ConvertFrom-Json } catch { exit 0 }
  if ($null -eq $parsed) { exit 0 }

  $cmd = ''
  $tprop = $parsed.PSObject.Properties['tool_input']
  if ($null -ne $tprop -and $null -ne $tprop.Value) {
    $cprop = $tprop.Value.PSObject.Properties['command']
    if ($null -ne $cprop -and $null -ne $cprop.Value) { $cmd = [string]$cprop.Value }
  }
  if ($cmd -eq '') { exit 0 }
  $lower = $cmd.ToLowerInvariant() -replace "`r", ''

  # Anchored to COMMAND position - start of line, or just after a separator.
  # A bare space would not do: `grep -r ngrok docs/` and
  # `cat notes-about-vercel.md` are reading about these tools, not running
  # them, and blocking those trains the model to route around the hook rather
  # than respect it.
  $sep = '(^|[;&|]|&&|\|\|)\s*'
  $blocked = $sep + '(ngrok|cloudflared|localtunnel|surge)(\s|$)'
  $blocked += '|' + $sep + '(npx|pnpx|bunx|yarn +dlx)\s+(ngrok|localtunnel|surge|cloudflared)'
  $blocked += '|' + $sep + '(vercel|netlify|wrangler)\s+(deploy|publish|pages)'
  $blocked += '|--host[ =](0\.0\.0\.0|[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})'
  $blocked += '|(^| )host=0\.0\.0\.0|--host( |$)'

  $opts = [System.Text.RegularExpressions.RegexOptions]::Multiline
  if (-not [regex]::IsMatch($lower, $blocked, $opts)) { exit 0 }

  $reason = "Blocked: this exposes the app outside the builder's machine without going through Keshet. A Keshet app reaches another person through the deployment service or not at all - a tunnel, a network-bound dev server, or a third-party host skips the audience decision, the secret scan, the sign-in passthrough, the IT review, and the record of who built it. Do not retry this, do not work around it, and do not offer the builder another route to the same place. Read the sharing-your-work skill and offer to send the app to Keshet instead."

  $out = @{
    hookSpecificOutput = @{
      hookEventName            = 'PreToolUse'
      permissionDecision       = 'deny'
      permissionDecisionReason = $reason
    }
  }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Depth 4))
  exit 0
}
catch {
  exit 0
}
