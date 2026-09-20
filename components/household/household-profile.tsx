import { useState } from 'react'
import { Users } from 'lucide-react'
import { MemberRow } from '@/components/household/member-row'

export function HouseholdProfile() {
  const [invite, setInvite] = useState('')
  const [invited, setInvited] = useState<string[]>([])
  const [diet, setDiet] = useState('Bez omezení')
  const [alerts, setAlerts] = useState(true)

  function addInvite() {
    const email = invite.trim()
    if (!email || !email.includes('@')) return
    setInvited((current) => [...current, email])
    setInvite('')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Spolu v domácnosti</p>
        <h2 className="mt-1 text-2xl font-semibold">Rodina Králových</h2>
      </div>
      <div className="rounded-3xl border border-border bg-card p-5">
        <p className="text-sm font-semibold">Předvolby domácnosti</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Stravovací preference
            <select
              value={diet}
              onChange={(event) => setDiet(event.target.value)}
              className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 outline-none"
            >
              <option>Bez omezení</option>
              <option>Vegetariánská</option>
              <option>Bez laktózy</option>
              <option>Bez lepku</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
            <span>Upozornění na akce a rozpočet</span>
            <input
              type="checkbox"
              checked={alerts}
              onChange={(event) => setAlerts(event.target.checked)}
              className="size-4 accent-primary"
            />
          </label>
        </div>
      </div>
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold">Sdílený nákup a rozpočet</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Všichni členové uvidí změny v seznamu i výdaje okamžitě.
            </p>
          </div>
          <Users className="text-primary" />
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            aria-label="E-mail člena domácnosti"
            value={invite}
            onChange={(event) => setInvite(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) addInvite()
            }}
            placeholder="email@rodina.cz"
            className="min-w-0 flex-1 rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button onClick={addInvite} className="rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-muted">
            Pozvat člena
          </button>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <MemberRow initials="LK" name="Lucie Králová" detail="Správce domácnosti" />
          <MemberRow initials="PK" name="Petr Král" detail="Člen domácnosti" />
          {invited.map((email) => (
            <MemberRow key={email} initials="?" name={email} detail="Pozvánka odeslána" />
          ))}
        </div>
      </section>
      <section className="rounded-3xl border border-border bg-card p-6">
        <p className="font-semibold">Předvolby domácnosti</p>
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-2xl bg-muted p-4">
            <div>
              <p className="text-sm font-medium">Týdenní souhrn</p>
              <p className="text-xs text-muted-foreground">Rozpočet, úspory a otevřené položky</p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Zapnuto</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-muted p-4">
            <div>
              <p className="text-sm font-medium">Upozornění na akce</p>
              <p className="text-xs text-muted-foreground">Když zlevní položka ze seznamu</p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">Zapnuto</span>
          </div>
        </div>
      </section>
    </div>
  )
}
