export interface AuthResult {
  authenticated: boolean;
}

// STUB — the real auth service does not exist yet.
//
// TODO: replace this body with a real check against the auth service
// (read the session token from the incoming request, validate it, and
// return `{ authenticated: false }` when it is missing or invalid).
// Until then it lets every request through, so enabling the guard in
// production never locks the app out.
export function checkAuth(): AuthResult {
  return { authenticated: true };
}
