import type { AccountInfo } from '@azure/msal-browser';

/**
 * Client-side role resolution, for deciding what to *show*.
 *
 * This is presentation logic, not security. Everything here reads claims the browser already
 * holds, so a determined user can change the answer. The real check happens server-side in
 * `shared/lib/auth-server/server.ts` against a token the browser cannot forge. Hiding an admin
 * button is a courtesy; refusing the admin request is the control.
 */

export type AppRole = 'admin' | 'editor' | 'viewer';

/**
 * Group object ids differ per environment, so they are configuration. They are not secrets —
 * a group id grants nothing on its own — which is why NEXT_PUBLIC_ is appropriate here.
 */
const ROLE_GROUPS: ReadonlyArray<{ role: AppRole; groupId: string | undefined }> = [
  { role: 'admin', groupId: process.env.NEXT_PUBLIC_AZURE_AD_ROLE_GROUP_ADMIN },
  { role: 'editor', groupId: process.env.NEXT_PUBLIC_AZURE_AD_ROLE_GROUP_EDITOR },
  { role: 'viewer', groupId: process.env.NEXT_PUBLIC_AZURE_AD_ROLE_GROUP_VIEWER },
];

function claimArray(claim: unknown): string[] {
  return Array.isArray(claim) ? claim.filter((v): v is string => typeof v === 'string') : [];
}

export function rolesOf(account: AccountInfo | null | undefined): AppRole[] {
  if (!account) return [];
  const claims = account.idTokenClaims as Record<string, unknown> | undefined;

  // App roles come through named, so they need no mapping and no per-environment config.
  const roles = new Set(
    claimArray(claims?.roles).map((role) => role.toLowerCase()) as AppRole[],
  );

  const groups = claimArray(claims?.groups);
  for (const { role, groupId } of ROLE_GROUPS) {
    if (groupId && groups.includes(groupId)) roles.add(role);
  }

  return [...roles];
}

export function hasAnyRole(
  account: AccountInfo | null | undefined,
  required: readonly AppRole[],
): boolean {
  if (required.length === 0) return true;
  const roles = rolesOf(account);
  return required.some((role) => roles.includes(role));
}
