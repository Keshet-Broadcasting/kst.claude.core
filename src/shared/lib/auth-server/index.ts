// Server-only Entra ID token verification and route-handler helpers. Safe to import from
// `middleware.ts` (Edge) and `app/api/**/route.ts`. Never import this from client code — it
// pulls in `jose` and `next/server`.
export {
  AuthError,
  verifyAzureToken,
  type AzureAdUser,
} from './verify-azure-token';
export {
  AUTH_USER_HEADER,
  DEV_AUTH_USER,
  authErrorResponse,
  decodeUser,
  encodeUser,
  getAuthUser,
  hasAnyRole,
  requireAuth,
  resolveRoles,
  withAuth,
} from './server';
