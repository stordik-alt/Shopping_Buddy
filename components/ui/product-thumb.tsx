import { cn } from '@/lib/utils'

/** A product picture that is only a supplement. Without a URL it renders nothing, so the card keeps
 *  its text-only layout (no empty frame, no broken placeholder). Pictures load from the stable
 *  external URL and are never copied to our storage. Decorative: the product name beside it says
 *  what it is. */
function ProductThumb({ src, className }: { src?: string | null; className?: string }) {
  if (!src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external product URLs; next/image would need every host allow-listed
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className={cn('size-14 shrink-0 rounded-xl bg-white object-contain p-1', className)} />
  )
}

export { ProductThumb }
