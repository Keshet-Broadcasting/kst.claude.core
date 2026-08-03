import { AuthProvider } from '@/app';
import { AuthGuard } from '@/features/auth';

/**
 * Guards every route in the `(protected)` group with one declaration — including routes added
 * later, which is the property that matters. The group name in parentheses does not appear in
 * any URL; it exists only to give these routes a shared, guarded layout.
 *
 * `AuthProvider` lives here rather than in the root layout so the public pages keep their
 * server-rendered markup and don't wait on MSAL. Anything that needs sign-in goes under this
 * group.
 */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>{children}</AuthGuard>
    </AuthProvider>
  );
}
