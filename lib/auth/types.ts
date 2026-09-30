import type { NextRequest, NextResponse } from 'next/server'

// The slice of the auth server the app uses. Both Neon Auth (production) and the self-hosted
// Better Auth (local PostgreSQL, lib/auth/local.ts) satisfy it.
export type AppAuth = {
  getSession(): Promise<{ data: { user: { id: string; email: string; name: string } } | null }>
  handler(): Record<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', (request: NextRequest) => Promise<Response>>
  middleware(options: { loginUrl: string }): (request: NextRequest) => Promise<NextResponse> | NextResponse
}
