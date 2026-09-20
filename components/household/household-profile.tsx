import { useState } from 'react'
import { Users } from 'lucide-react'
import { ChildCard } from '@/components/household/child-card'
import { MemberCard } from '@/components/household/member-card'
import { MemberRow } from '@/components/household/member-row'
import { TagInput } from '@/components/shared/tag-input'
import { initialHousehold } from '@/lib/mock-data'
import type { Child, HouseholdMember, PriceSensitivity, QualityPreference } from '@/lib/types'

const splitList = (value: string) =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

export function HouseholdProfile() {
  const [household, setHousehold] = useState(initialHousehold)
  const [invite, setInvite] = useState('')
  const [invited, setInvited] = useState<string[]>([])
  const [alerts, setAlerts] = useState(true)

  const [memberForm, setMemberForm] = useState({ name: '', age: '', favoriteFoods: '', dislikedFoods: '', allergies: '' })
  const [childForm, setChildForm] = useState({ name: '', age: '', preferences: '', specialNeeds: '' })

  function addInvite() {
    const email = invite.trim()
    if (!email || !email.includes('@')) return
    setInvited((current) => [...current, email])
    setInvite('')
  }

  function addMember() {
    const name = memberForm.name.trim()
    const age = Number(memberForm.age)
    if (!name || !Number.isFinite(age) || age <= 0) return
    const member: HouseholdMember = {
      id: Date.now(),
      name,
      role: 'Člen domácnosti',
      age,
      preferences: '',
      favoriteFoods: splitList(memberForm.favoriteFoods),
      dislikedFoods: splitList(memberForm.dislikedFoods),
      allergies: splitList(memberForm.allergies),
    }
    setHousehold((current) => ({ ...current, members: [...current.members, member] }))
    setMemberForm({ name: '', age: '', favoriteFoods: '', dislikedFoods: '', allergies: '' })
  }

  function removeMember(id: number) {
    setHousehold((current) => ({ ...current, members: current.members.filter((member) => member.id !== id) }))
  }

  function addChild() {
    const name = childForm.name.trim()
    const age = Number(childForm.age)
    if (!name || !Number.isFinite(age) || age <= 0) return
    const child: Child = {
      id: Date.now(),
      name,
      age,
      preferences: childForm.preferences.trim(),
      specialNeeds: childForm.specialNeeds.trim() || undefined,
    }
    setHousehold((current) => ({ ...current, children: [...current.children, child] }))
    setChildForm({ name: '', age: '', preferences: '', specialNeeds: '' })
  }

  function removeChild(id: number) {
    setHousehold((current) => ({ ...current, children: current.children.filter((child) => child.id !== id) }))
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Spolu v domácnosti</p>
        <label className="mt-1 block">
          <span className="sr-only">Název domácnosti</span>
          <input
            value={household.name}
            onChange={(event) => setHousehold((current) => ({ ...current, name: event.target.value }))}
            className="w-full rounded-xl border border-transparent bg-transparent text-2xl font-semibold outline-none focus:border-input focus:bg-background focus:px-2 focus:py-1"
          />
        </label>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5">
        <p className="text-sm font-semibold">Měsíční rozpočet domácnosti</p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min="0"
            aria-label="Měsíční rozpočet"
            value={household.monthlyBudget}
            onChange={(event) => setHousehold((current) => ({ ...current, monthlyBudget: Math.max(0, Number(event.target.value) || 0) }))}
            className="w-32 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-sm text-muted-foreground">Kč / měsíc</span>
        </div>
      </div>

      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold">Členové domácnosti</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Profil každého člena pomáhá personalizovat nákupy i jídelníček.</p>
          </div>
          <Users className="text-primary" />
        </div>
        <div className="mt-5 flex flex-col gap-2">
          {household.members.map((member) => (
            <MemberCard key={member.id} member={member} onRemove={() => removeMember(member.id)} />
          ))}
        </div>
        <div className="mt-5 grid gap-2 rounded-2xl border border-dashed border-border p-4 sm:grid-cols-2">
          <input
            aria-label="Jméno člena"
            value={memberForm.name}
            onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Jméno"
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            aria-label="Věk člena"
            type="number"
            min="0"
            value={memberForm.age}
            onChange={(event) => setMemberForm((current) => ({ ...current, age: event.target.value }))}
            placeholder="Věk"
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            aria-label="Oblíbené potraviny"
            value={memberForm.favoriteFoods}
            onChange={(event) => setMemberForm((current) => ({ ...current, favoriteFoods: event.target.value }))}
            placeholder="Oblíbené potraviny (odděleno čárkou)"
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:col-span-2"
          />
          <input
            aria-label="Nechce potraviny"
            value={memberForm.dislikedFoods}
            onChange={(event) => setMemberForm((current) => ({ ...current, dislikedFoods: event.target.value }))}
            placeholder="Nechce (odděleno čárkou)"
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            aria-label="Alergie a intolerance"
            value={memberForm.allergies}
            onChange={(event) => setMemberForm((current) => ({ ...current, allergies: event.target.value }))}
            placeholder="Alergie / intolerance (odděleno čárkou)"
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button onClick={addMember} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:col-span-2">
            Přidat člena domácnosti
          </button>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row">
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
        {invited.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {invited.map((email) => (
              <MemberRow key={email} initials="?" name={email} detail="Pozvánka odeslána" />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-card p-6">
        <p className="font-semibold">Děti</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Samostatný profil dítěte s preferencemi a specifickými potřebami.</p>
        <div className="mt-5 flex flex-col gap-2">
          {household.children.map((child) => (
            <ChildCard key={child.id} child={child} onRemove={() => removeChild(child.id)} />
          ))}
        </div>
        <div className="mt-5 grid gap-2 rounded-2xl border border-dashed border-border p-4 sm:grid-cols-2">
          <input
            aria-label="Jméno dítěte"
            value={childForm.name}
            onChange={(event) => setChildForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Jméno"
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            aria-label="Věk dítěte"
            type="number"
            min="0"
            value={childForm.age}
            onChange={(event) => setChildForm((current) => ({ ...current, age: event.target.value }))}
            placeholder="Věk"
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            aria-label="Preference dítěte"
            value={childForm.preferences}
            onChange={(event) => setChildForm((current) => ({ ...current, preferences: event.target.value }))}
            placeholder="Preference"
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            aria-label="Specifické potřeby dítěte"
            value={childForm.specialNeeds}
            onChange={(event) => setChildForm((current) => ({ ...current, specialNeeds: event.target.value }))}
            placeholder="Specifické potřeby"
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button onClick={addChild} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:col-span-2">
            Přidat dítě
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-6">
        <p className="font-semibold">Nákupní preference domácnosti</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Kontext pro budoucí nákupní engine a AI asistenta.</p>
        <div className="mt-5 flex flex-col gap-5">
          <TagInput
            label="Preferované značky"
            values={household.preferences.preferredBrands}
            onChange={(values) => setHousehold((current) => ({ ...current, preferences: { ...current.preferences, preferredBrands: values } }))}
            placeholder="Např. Milka"
          />
          <TagInput
            label="Preferované obchody"
            values={household.preferences.preferredStores}
            onChange={(values) => setHousehold((current) => ({ ...current, preferences: { ...current.preferences, preferredStores: values } }))}
            placeholder="Např. Lidl"
          />
          <TagInput
            label="Preferované produkty"
            values={household.preferences.preferredProducts}
            onChange={(values) => setHousehold((current) => ({ ...current, preferences: { ...current.preferences, preferredProducts: values } }))}
            placeholder="Např. Ovesné vločky"
          />
          <TagInput
            label="Produkty, které nekupovat"
            values={household.preferences.excludedProducts}
            onChange={(values) => setHousehold((current) => ({ ...current, preferences: { ...current.preferences, excludedProducts: values } }))}
            placeholder="Např. Energetické nápoje"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Cenová preference
              <select
                value={household.preferences.priceSensitivity}
                onChange={(event) =>
                  setHousehold((current) => ({
                    ...current,
                    preferences: { ...current.preferences, priceSensitivity: event.target.value as PriceSensitivity },
                  }))
                }
                className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 outline-none"
              >
                <option>Nejlevnější</option>
                <option>Vyvážené</option>
                <option>Kvalita především</option>
              </select>
            </label>
            <label className="text-sm">
              Preference kvality
              <select
                value={household.preferences.qualityPreference}
                onChange={(event) =>
                  setHousehold((current) => ({
                    ...current,
                    preferences: { ...current.preferences, qualityPreference: event.target.value as QualityPreference },
                  }))
                }
                className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 outline-none"
              >
                <option>Standardní</option>
                <option>Prémiová</option>
              </select>
            </label>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
            <span>Preferovat české výrobky</span>
            <input
              type="checkbox"
              checked={household.preferences.preferCzechProducts}
              onChange={(event) =>
                setHousehold((current) => ({ ...current, preferences: { ...current.preferences, preferCzechProducts: event.target.checked } }))
              }
              className="size-4 accent-primary"
            />
          </label>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-6">
        <p className="font-semibold">Upozornění</p>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex items-center justify-between rounded-2xl bg-muted p-4 text-sm">
            <div>
              <p className="font-medium">Týdenní souhrn</p>
              <p className="text-xs text-muted-foreground">Rozpočet, úspory a otevřené položky</p>
            </div>
            <input type="checkbox" checked={alerts} onChange={(event) => setAlerts(event.target.checked)} className="size-4 accent-primary" />
          </label>
        </div>
      </section>
    </div>
  )
}
