'use client'

import { createAuthClient as createNeonAuthClient } from '@neondatabase/auth/next'
import { createAuthClient as createLocalAuthClient } from 'better-auth/react'

// Talks to the same-origin /api/auth route. NEXT_PUBLIC_LOCAL_DATABASE=1 (local setup, .env.local) selects
// the plain Better Auth client that pairs with lib/auth/local.ts; otherwise the Neon Auth client.
export const authClient = (process.env.NEXT_PUBLIC_LOCAL_DATABASE === '1' ? (createLocalAuthClient() as unknown) : createNeonAuthClient()) as ReturnType<typeof createNeonAuthClient>
