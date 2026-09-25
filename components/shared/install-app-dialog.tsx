'use client'

import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { installPlatform, type InstallPlatform } from '@/lib/install-prompt'

// Shown when the browser has no install dialog the app can open (Safari on iPhone/iPad, Firefox, or
// Chrome after its offer was dismissed): how to add the app to the home screen by hand. A native
// <dialog> opened with showModal() keeps focus inside and closes on Escape by itself.
const STEPS: Record<InstallPlatform, { title: string; steps: string[] }> = {
  ios: {
    title: 'Přidejte si Buddyho na plochu',
    steps: [
      'Dole na liště Safari klepněte na ikonu Sdílet (čtvereček se šipkou nahoru).',
      'V nabídce zvolte „Přidat na plochu“.',
      'Potvrďte „Přidat“ — Buddy se objeví mezi aplikacemi.',
    ],
  },
  android: {
    title: 'Nainstalujte si Buddyho',
    steps: [
      'Vpravo nahoře v prohlížeči otevřete menu ⋮.',
      'Zvolte „Instalovat aplikaci“ (nebo „Přidat na plochu“).',
      'Potvrďte instalaci — Buddy se objeví mezi aplikacemi.',
    ],
  },
  desktop: {
    title: 'Buddy v mobilu',
    steps: [
      'Otevřete tuto stránku v prohlížeči v telefonu.',
      'Přihlaste se a v menu účtu vpravo nahoře zvolte „Stáhnout aplikaci do mobilu“.',
    ],
  },
}

export function InstallAppDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [platform, setPlatform] = useState<InstallPlatform>('desktop')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setPlatform(installPlatform(navigator.userAgent, navigator.maxTouchPoints))
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const { title, steps } = STEPS[platform]
  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> element itself; one inside lands on its content.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      aria-labelledby="install-app-title"
      className="m-auto w-[min(calc(100vw-2rem),24rem)] rounded-3xl border border-border bg-popover p-0 text-popover-foreground shadow-2xl backdrop:bg-black/50"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- images are unoptimized in next.config */}
          <img src="/brand/buddy-icon-192.png" alt="" width={48} height={48} className="size-12 shrink-0 rounded-2xl" />
          <h2 id="install-app-title" className="min-w-0 flex-1 pt-1 text-base font-semibold leading-snug">{title}</h2>
          <button type="button" onClick={onClose} className="icon-button -mr-2 -mt-2" aria-label="Zavřít">
            <X />
          </button>
        </div>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
          Rozumím
        </button>
      </div>
    </dialog>
  )
}
