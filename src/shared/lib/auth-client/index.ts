// Browser-only MSAL wiring: sign-in config, silent token acquisition, client-side role
// resolution (for display), and the token-attaching fetch. Import from client components only.
export { AUTH_ENABLED, buildMsalConfig, getApiScopes, LOGIN_SCOPES } from './msal-config';
export { acquireAccessToken } from './acquire-token';
export { hasAnyRole, rolesOf, type AppRole } from './roles';
export { useApiFetch } from './useApiFetch';
