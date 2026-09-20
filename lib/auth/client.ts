'use client'

import { createAuthClient } from '@neondatabase/auth/next'

// Talks to the same-origin /api/auth proxy; no config needed.
export const authClient = createAuthClient()
