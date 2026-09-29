'use client'

import { useEffect } from 'react'

// Last-resort boundary for an error in the root layout itself. It replaces the layout, so it has to
// bring its own <html>/<body> and cannot rely on the app's stylesheet or theme tokens — hence the
// small amount of inline styling.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="cs">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8f7f3', color: '#111' }}>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontSize: 18 }}>Něco se nepovedlo</h1>
            <p style={{ fontSize: 14, color: '#555' }}>Aplikaci se nepodařilo načíst. Zkuste to prosím znovu.</p>
            <button type="button" onClick={() => retry()} style={{ minHeight: 44, padding: '0 20px', borderRadius: 12, border: 0, background: '#12253a', color: '#fff', fontSize: 14, fontWeight: 600 }}>
              Zkusit znovu
            </button>
            {error.digest && <p style={{ fontSize: 12, color: '#777' }}>Kód chyby: {error.digest}</p>}
          </div>
        </main>
      </body>
    </html>
  )
}
