import { NextResponse, type NextRequest } from 'next/server';
import { guard } from '@/shared/lib/auth-guard';

// Auth guard entry point (Next 16 renamed the "middleware" convention to "proxy").
// Thin by design: the decision lives in the guard slice
// (src/shared/lib/auth-guard), this file only maps it onto a Next response.
export function proxy(request: NextRequest) {
  const decision = guard();

  if (decision.type === 'redirect') {
    return NextResponse.redirect(new URL(decision.location, request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on page and API routes, but skip Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
