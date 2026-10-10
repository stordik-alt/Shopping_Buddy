import { useState } from 'react'
import { Bell, Baby, SlidersHorizontal, Users, WalletCards } from 'lucide-react'
import { ChildCard } from '@/components/household/child-card'
import { MemberCard } from '@/components/household/member-card'
import { DietQuestionnaire } from '@/components/household/diet-questionnaire'
import { MemberRow } from '@/components/household/member-row'
import { NotificationSettings } from '@/components/household/notification-settings'
import { NearbyStores } from '@/components/household/nearby-stores'
import { PantryCheckinSettings } from '@/components/household/pantry-checkin-settings'
import { PantryPlaces } from '@/components/household/pantry-places'
import { CollapsibleSection } from '@/components/shared/collapsible-section'
import { TagInput } from '@/components/shared/tag-input'
import { isCalendarMonth } from '@/lib/budget-period'
import type { MemberDiet } from '@/lib/diet'
import type { PendingInvitation } from '@/lib/db/queries'
import type { StoreSelection } from '@/lib/nearby-stores'
import type { Household, HouseholdPreferences, ItemCategory, PantryArea, PantryPlace, PriceSensitivity, QualityPreference, Store } from '@/lib/types'
import { userFacingError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'

const splitList = (value: string) =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

export function HouseholdProfile({
  household,
  isOwner,
  pendingInvitations,
  onUpdateHousehold,
  onAddMember,
  onRemoveMember,
  onSetMemberDiet,
  onAddChild,
  onRemoveChild,
  onUpdatePreferences,
  onInvite,
  onRevokeInvitation,
  storeChains,
  stores,
  storeSelection,
  onSaveStorePreferences,
  pantryPlaces,
  onAddPantryPlace,
  onRemovePantryPlace,
  pantryCheckinDays,
  onSetPantryCheckinDays,
  pantryCheckinSubcategoryDays,
  onSetPantrySubcategoryCheckinDays,
  notificationsOff,
  onSetNotificationKind,
  pushPublicKey,
}: {
  household: Household
  isOwner: boolean
  pendingInvitations: PendingInvitation[]
  onUpdateHousehold: (changes: { name?: string; monthlyBudget?: number }) => void
  onAddMember: (member: { name: string; age: number; favoriteFoods: string[]; dislikedFoods: string[]; allergies: string[] }) => void
  onRemoveMember: (id: string) => void
  /** Saves a member's eating questionnaire (docs/17_DIET_PREFERENCES.md). */
  onSetMemberDiet: (id: string, diet: MemberDiet) => Promise<void>
  onAddChild: (child: { name: string; age: number; preferences: string; specialNeeds?: string }) => void
  onRemoveChild: (id: string) => void
  onUpdatePreferences: (changes: Partial<HouseholdPreferences>) => void
  onInvite: (email: string) => Promise<{ token: string }>
  onRevokeInvitation: (id: string) => void
  /** The signed-in user's own "stores in my area" (personal, not the household's). */
  storeChains: { id: string; chain: string; isOnline?: boolean }[]
  stores: Store[]
  storeSelection: StoreSelection
  onSaveStorePreferences: (input: { maxDistanceKm: number | null; chainIds: string[]; locationIds: string[]; priorityChainIds: string[]; maxShopStores: number | null }) => Promise<StoreSelection>
  /** The household's own Zásoby places, beyond the fixed Spíž/Lednice/Mrazák/... list. */
  pantryPlaces: PantryPlace[]
  onAddPantryPlace: (area: PantryArea, name: string) => Promise<PantryPlace>
  onRemovePantryPlace: (placeId: string) => Promise<void>
  /** The household's own per-category pantry check-in interval overrides. */
  pantryCheckinDays: Partial<Record<ItemCategory, number>>
  onSetPantryCheckinDays: (category: ItemCategory, days: number | null) => Promise<Partial<Record<ItemCategory, number>>>
  /** The same per subcategory, keyed by `checkinSubcategoryKey`. */
  pantryCheckinSubcategoryDays: Record<string, number>
  onSetPantrySubcategoryCheckinDays: (category: ItemCategory, subcategory: string, days: number | null) => Promise<Record<string, number>>
  /** The kinds of notification this member switched off (docs/14_NOTIFICATION_PREFERENCES.md). */
  notificationsOff: string[]
  onSetNotificationKind: (kind: string, enabled: boolean) => Promise<void>
  pushPublicKey: string | null
}) {
  const [invite, setInvite] = useState('')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState('')

  // The member whose eating questionnaire is open.
  const [dietMemberId, setDietMemberId] = useState<string | null>(null)
  const dietMember = household.members.find((member) => member.id === dietMemberId)
  const [memberForm, setMemberForm] = useState({ name: '', age: '', favoriteFoods: '', dislikedFoods: '', allergies: '' })
  const [childForm, setChildForm] = useState({ name: '', age: '', preferences: '', specialNeeds: '' })
  const [showMemberForm, setShowMemberForm] = useState(false)
  const [showChildForm, setShowChildForm] = useState(false)

  async function sendInvite() {
    const email = invite.trim()
    if (!email || !email.includes('@')) return
    setInviteError('')
    try {
      const { token } = await onInvite(email)
      setInviteLink(`${window.location.origin}/invite/${token}`)
      setInvite('')
    } catch (err) {
      setInviteError(userFacingError(err, 'Pozvánku se nepodařilo vytvořit.'))
    }
  }

  function addMember() {
    const name = memberForm.name.trim()
    const age = Number(memberForm.age)
    if (!name || !Number.isFinite(age) || age <= 0) return
    onAddMember({
      name,
      age,
      favoriteFoods: splitList(memberForm.favoriteFoods),
      dislikedFoods: splitList(memberForm.dislikedFoods),
      allergies: splitList(memberForm.allergies),
    })
    setMemberForm({ name: '', age: '', favoriteFoods: '', dislikedFoods: '', allergies: '' })
    setShowMemberForm(false)
  }

  function addChild() {
    const name = childForm.name.trim()
    const age = Number(childForm.age)
    if (!name || !Number.isFinite(age) || age <= 0) return
    onAddChild({ name, age, preferences: childForm.preferences.trim(), specialNeeds: childForm.specialNeeds.trim() || undefined })
    setChildForm({ name: '', age: '', preferences: '', specialNeeds: '' })
    setShowChildForm(false)
  }

  const { preferredBrands, preferredStores, preferredProducts, excludedProducts } = household.preferences
  const preferenceCount = preferredBrands.length + preferredStores.length + preferredProducts.length + excludedProducts.length

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Spolu v domácnosti</p>
        <label className="mt-1 block">
          <span className="sr-only">Název domácnosti</span>
          {/* The household's name as the page heading, editable in place (not a boxed form field). */}
          <input
            value={household.name}
            onChange={(event) => onUpdateHousehold({ name: event.target.value })}
            className="min-h-11 w-full rounded-xl border border-transparent bg-transparent px-1 text-2xl font-semibold outline-none hover:border-border focus:border-ring focus:bg-background focus:px-2 focus:py-1 focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </label>
      </div>

      <div className="surface p-5">
        <div className="flex items-center gap-3">
          <WalletCards className="size-5 shrink-0 text-accent-text" aria-hidden />
          <p className="text-sm font-semibold">Měsíční rozpočet domácnosti</p>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Input
            type="number"
            min="0"
            aria-label="Měsíční rozpočet"
            value={household.monthlyBudget}
            onChange={(event) => onUpdateHousehold({ monthlyBudget: Math.max(0, Number(event.target.value) || 0) })}
            className="w-40 px-3"
          />
          <span className="text-sm text-muted-foreground">{isCalendarMonth(household.budgetPeriod) ? 'Kč / měsíc' : 'Kč / období'}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Rozpočtové období (kalendářní měsíc, od výplaty nebo vlastní) nastavíte v Rozpočet → Plánování.</p>
      </div>

      <CollapsibleSection
        title="Členové domácnosti"
        icon={<Users />}
        summary={household.members.map((member) => member.name).join(', ') || 'Zatím nikdo'}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">Profil každého člena pomáhá personalizovat nákupy i jídelníček.</p>
        <div className="mt-5 flex flex-col gap-2">
          {household.members.map((member) => (
            <MemberCard key={member.id} member={member} onRemove={() => onRemoveMember(member.id)} onEditDiet={() => setDietMemberId(member.id)} />
          ))}
        </div>
        {dietMember && (
          <DietQuestionnaire
            memberName={dietMember.name}
            initial={dietMember.diet}
            onClose={() => setDietMemberId(null)}
            onSave={(answers) => onSetMemberDiet(dietMember.id, answers)}
          />
        )}
        <button
          type="button"
          aria-expanded={showMemberForm}
          onClick={() => setShowMemberForm((current) => !current)}
          className="mt-5 min-h-11 w-full rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showMemberForm ? 'Zavřít formulář' : '+ Přidat člena'}
        </button>
        <div className={`mt-3 gap-2 rounded-2xl border border-dashed border-border p-4 sm:grid-cols-2 ${showMemberForm ? 'grid' : 'hidden'}`}>
          <Input
            aria-label="Jméno člena"
            value={memberForm.name}
            onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Jméno"
            className="px-3"
          />
          <Input
            aria-label="Věk člena"
            type="number"
            min="0"
            value={memberForm.age}
            onChange={(event) => setMemberForm((current) => ({ ...current, age: event.target.value }))}
            placeholder="Věk"
            className="px-3"
          />
          <Input
            aria-label="Oblíbené potraviny"
            value={memberForm.favoriteFoods}
            onChange={(event) => setMemberForm((current) => ({ ...current, favoriteFoods: event.target.value }))}
            placeholder="Oblíbené potraviny"
            className="px-3 sm:col-span-2"
          />
          <Input
            aria-label="Nechce potraviny"
            value={memberForm.dislikedFoods}
            onChange={(event) => setMemberForm((current) => ({ ...current, dislikedFoods: event.target.value }))}
            placeholder="Nechce"
            className="px-3"
          />
          <Input
            aria-label="Alergie a intolerance"
            value={memberForm.allergies}
            onChange={(event) => setMemberForm((current) => ({ ...current, allergies: event.target.value }))}
            placeholder="Alergie / intolerance"
            className="px-3"
          />
          <p className="text-sm text-fg-muted sm:col-span-2">Víc potravin nebo alergií oddělte čárkou.</p>
          <Button size="lg" onClick={addMember} className="sm:col-span-2">
            Přidat člena domácnosti
          </Button>
        </div>
        {isOwner && (
          <div className="mt-5 border-t border-border pt-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                aria-label="E-mail člena domácnosti"
                type="email"
                value={invite}
                onChange={(event) => setInvite(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) sendInvite()
                }}
                placeholder="email@rodina.cz"
                className="px-3 min-w-0 flex-1"
              />
              <Button variant="outline" size="lg" onClick={sendInvite}>
                Pozvat člena
              </Button>
            </div>
            {inviteError && <p className="mt-2 text-sm text-destructive">{inviteError}</p>}
            {inviteLink && (
              <div className="mt-3 rounded-xl bg-muted p-3 text-sm">
                <p className="text-muted-foreground">Odkaz pro pozvánku (platí 7 dní) — pošlete jej pozvanému sami:</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-words">{inviteLink}</code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(inviteLink)}
                    className="min-h-10 shrink-0 rounded-lg bg-background px-3 py-2 text-sm font-medium hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Kopírovat
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {pendingInvitations.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {pendingInvitations.map((invitation) => (
              <MemberRow
                key={invitation.id}
                initials="?"
                name={invitation.email}
                detail={`Pozvánka čeká · platí do ${new Date(invitation.expiresAt).toLocaleDateString('cs-CZ')}`}
                action={
                  isOwner && (
                    <button
                      onClick={() => onRevokeInvitation(invitation.id)}
                      type="button"
                      className="min-h-10 shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-fg-secondary hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Zrušit
                    </button>
                  )
                }
              />
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Děti" icon={<Baby />} summary={household.children.map((child) => child.name).join(', ') || 'Zatím žádné dítě'}>
        <p className="text-sm leading-relaxed text-muted-foreground">Samostatný profil dítěte s preferencemi a specifickými potřebami.</p>
        <div className="mt-5 flex flex-col gap-2">
          {household.children.map((child) => (
            <ChildCard key={child.id} child={child} onRemove={() => onRemoveChild(child.id)} />
          ))}
        </div>
        <button
          type="button"
          aria-expanded={showChildForm}
          onClick={() => setShowChildForm((current) => !current)}
          className="mt-5 min-h-11 w-full rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showChildForm ? 'Zavřít formulář' : '+ Přidat dítě'}
        </button>
        <div className={`mt-3 gap-2 rounded-2xl border border-dashed border-border p-4 sm:grid-cols-2 ${showChildForm ? 'grid' : 'hidden'}`}>
          <Input
            aria-label="Jméno dítěte"
            value={childForm.name}
            onChange={(event) => setChildForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Jméno"
            className="px-3"
          />
          <Input
            aria-label="Věk dítěte"
            type="number"
            min="0"
            value={childForm.age}
            onChange={(event) => setChildForm((current) => ({ ...current, age: event.target.value }))}
            placeholder="Věk"
            className="px-3"
          />
          <Input
            aria-label="Preference dítěte"
            value={childForm.preferences}
            onChange={(event) => setChildForm((current) => ({ ...current, preferences: event.target.value }))}
            placeholder="Preference"
            className="px-3"
          />
          <Input
            aria-label="Specifické potřeby dítěte"
            value={childForm.specialNeeds}
            onChange={(event) => setChildForm((current) => ({ ...current, specialNeeds: event.target.value }))}
            placeholder="Specifické potřeby"
            className="px-3"
          />
          <Button size="lg" onClick={addChild} className="sm:col-span-2">
            Přidat dítě
          </Button>
        </div>
      </CollapsibleSection>

      <NearbyStores chains={storeChains} stores={stores} selection={storeSelection} onSave={onSaveStorePreferences} />

      <PantryPlaces places={pantryPlaces} onAdd={onAddPantryPlace} onRemove={onRemovePantryPlace} />

      <PantryCheckinSettings
        overrides={pantryCheckinDays}
        onSave={onSetPantryCheckinDays}
        subcategoryOverrides={pantryCheckinSubcategoryDays}
        onSaveSubcategory={onSetPantrySubcategoryCheckinDays}
      />

      <CollapsibleSection title="Nákupní preference domácnosti" icon={<SlidersHorizontal />} summary={`Počet uložených preferencí: ${preferenceCount}`}>
        <p className="text-sm leading-relaxed text-muted-foreground">Kontext pro budoucí nákupní engine a AI asistenta.</p>
        <div className="mt-5 flex flex-col gap-5">
          <TagInput
            label="Preferované značky"
            values={household.preferences.preferredBrands}
            onChange={(values) => onUpdatePreferences({ preferredBrands: values })}
            placeholder="Např. Milka"
          />
          <TagInput
            label="Preferované obchody"
            values={household.preferences.preferredStores}
            onChange={(values) => onUpdatePreferences({ preferredStores: values })}
            placeholder="Např. Lidl"
          />
          <TagInput
            label="Preferované produkty"
            values={household.preferences.preferredProducts}
            onChange={(values) => onUpdatePreferences({ preferredProducts: values })}
            placeholder="Např. Ovesné vločky"
          />
          <TagInput
            label="Produkty, které nekupovat"
            values={household.preferences.excludedProducts}
            onChange={(values) => onUpdatePreferences({ excludedProducts: values })}
            placeholder="Např. Energetické nápoje"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Cenová preference
              <Select
                value={household.preferences.priceSensitivity}
                onChange={(event) => onUpdatePreferences({ priceSensitivity: event.target.value as PriceSensitivity })}
                className="px-3 mt-2"
              >
                <option>Nejlevnější</option>
                <option>Vyvážené</option>
                <option>Kvalita především</option>
              </Select>
            </label>
            <label className="text-sm">
              Preference kvality
              <Select
                value={household.preferences.qualityPreference}
                onChange={(event) => onUpdatePreferences({ qualityPreference: event.target.value as QualityPreference })}
                className="px-3 mt-2"
              >
                <option>Standardní</option>
                <option>Prémiová</option>
              </Select>
            </label>
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
            <span>Preferovat české výrobky</span>
            <input
              type="checkbox"
              checked={household.preferences.preferCzechProducts}
              onChange={(event) => onUpdatePreferences({ preferCzechProducts: event.target.checked })}
              className="size-5 accent-[var(--accent-solid)]"
            />
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Upozornění"
        icon={<Bell />}
        summary={notificationsOff.length === 0 ? 'Dostáváte všechna upozornění' : 'Vypnuto: ' + notificationsOff.length}
      >
        <NotificationSettings off={notificationsOff} onChange={onSetNotificationKind} pushPublicKey={pushPublicKey} />
      </CollapsibleSection>
    </div>
  )
}
