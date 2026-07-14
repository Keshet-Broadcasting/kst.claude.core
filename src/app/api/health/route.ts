import { NextResponse } from 'next/server';

/** A minimal route handler kept as a live example. Curl it: `curl localhost:3000/api/health`. */
export function GET() {
  return NextResponse.json({ status: 'ok' });
}
