import Link from 'next/link'

// Shown for any address the app does not have (a mistyped link, an old bookmark).
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="surface w-full max-w-md space-y-4 p-6 text-center">
        <h1 className="text-lg font-semibold">Tuhle stránku jsme nenašli</h1>
        <p className="text-sm text-muted-foreground">Odkaz už možná neplatí. Vraťte se na úvodní stránku.</p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Zpět do aplikace
        </Link>
      </div>
    </main>
  )
}
