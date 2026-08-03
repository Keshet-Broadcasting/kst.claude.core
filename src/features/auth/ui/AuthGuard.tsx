'use client';

import { useEffect, type ReactNode } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { LOGIN_SCOPES, hasAnyRole, type AppRole } from '@/shared/lib/auth-client';

/**
 * The guard — the React answer to Angular's `canActivate: [MsalGuard]`.
 *
 * Angular resolves guards during routing, before the component exists. React has no routing
 * phase to hook, so the guard is a component that wraps the protected tree and decides what to
 * render. Same contract, different seam: nothing inside it mounts until the user is allowed in.
 *
 * Wrap a whole area rather than each page. In the App Router the natural place is the layout of
 * a route group — `app/(protected)/layout.tsx` — which guards every route in the group with one
 * declaration and no per-page repetition.
 */
export function AuthGuard({
  children,
  roles = [],
  pending = null,
  forbidden = <div role="alert">You don&apos;t have access to this page.</div>,
}: {
  children: ReactNode;
  /** Optional role requirement. Empty means "any signed-in user". */
  roles?: readonly AppRole[];
  /** Rendered while sign-in is in flight. A skeleton reads better than a blank screen. */
  pending?: ReactNode;
  /** Rendered when the user is signed in but lacks the role. */
  forbidden?: ReactNode;
}) {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    // `inProgress === None` is the important half of this condition. MSAL is briefly
    // unauthenticated while it processes a redirect response; starting a second login there
    // throws `interaction_in_progress` and traps the user in a redirect loop.
    if (!isAuthenticated && inProgress === InteractionStatus.None) {
      void instance.loginRedirect({
        scopes: LOGIN_SCOPES,
        // Return the user to the page they asked for, not to the app root.
        redirectStartPage: window.location.href,
      });
    }
  }, [isAuthenticated, inProgress, instance]);

  if (!isAuthenticated) return <>{pending}</>;

  if (!hasAnyRole(instance.getActiveAccount() ?? accounts[0], roles)) {
    // Signed in, wrong role: a redirect to login would just bounce them back here, so show
    // the refusal instead.
    return <>{forbidden}</>;
  }

  return <>{children}</>;
}
