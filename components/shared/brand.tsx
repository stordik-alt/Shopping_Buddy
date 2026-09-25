export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {/* Buddy's head from the intro artwork (public/brand, served to signed-out visitors by
          proxy.ts). Decorative: the name next to it, or the page title, says what this is. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- images are unoptimized in next.config */}
      <img
        src="/brand/buddy-avatar.webp"
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-xl bg-[#001123] object-cover shadow-sm ring-1 ring-primary/30"
      />
      {!compact && <span className="text-lg font-semibold tracking-tight">Rodinný nákup</span>}
    </div>
  )
}
