'use client'

import { useEffect } from 'react'

// Shown when a page throws while rendering (a database hiccup, a failed server read), instead of the
// framework's generic error screen. The message stays generic on purpose: the real error can carry
// server details, so only its digest is shown for support and the full error goes to the console.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="surface w-full max-w-md space-y-4 p-6 text-center">
        <h1 className="text-lg font-semibold">Něco se nepovedlo</h1>
        <p className="text-sm text-muted-foreground">Stránku se nepodařilo načíst. Zkontrolujte připojení a zkuste to znovu. Vaše data jsou v bezpečí.</p>
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Zkusit znovu
        </button>
        {error.digest && <p className="text-xs text-muted-foreground">Kód chyby: {error.digest}</p>}
      </div>
    </main>
  )
}
