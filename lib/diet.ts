import { normalizeMatchName } from '@/lib/receipt-list-match'

// Each member's eating preferences from the clickable questionnaire (docs/17_DIET_PREFERENCES.md): one
// diet and the things they avoid. The meal plan is shared by the household, so a recipe is offered only
// when it suits every member. Recipes carry no diet tags, so a recipe is judged by its ingredient names:
// an ingredient breaks a rule when one of its words starts with one of the rule's stems ("vepř" →
// "vepřová plec") or equals one of its exact words ("med", where a prefix would also catch "medvědí
// česnek"). Deterministic and testable; no AI.

export const DIETS = [
  { key: 'none', label: 'Jím všechno', description: 'Bez omezení.' },
  { key: 'vegetarian', label: 'Vegetariánská', description: 'Bez masa a ryb.' },
  { key: 'pescetarian', label: 'Pescetariánská', description: 'Bez masa, ryby ano.' },
  { key: 'vegan', label: 'Veganská', description: 'Bez masa, ryb, mléčných výrobků, vajec a medu.' },
] as const

export const DIET_AVOIDS = [
  { key: 'lactose', label: 'Mléčné výrobky (laktóza)' },
  { key: 'gluten', label: 'Lepek' },
  { key: 'nuts', label: 'Ořechy' },
  { key: 'eggs', label: 'Vejce' },
  { key: 'fish', label: 'Ryby a mořské plody' },
  { key: 'pork', label: 'Vepřové' },
] as const

export type DietKey = (typeof DIETS)[number]['key']
export type DietAvoidKey = (typeof DIET_AVOIDS)[number]['key']
export type MemberDiet = { diet: DietKey; avoids: DietAvoidKey[] }

export const NO_DIET: MemberDiet = { diet: 'none', avoids: [] }

/** A word stem (`vepr`) or, with a leading `=`, an exact word (`=med`), both without diacritics. */
type Stem = string

const PORK: Stem[] = ['vepr', 'sunk', 'slanin', 'spek', 'klobas', 'salam', 'park', 'sadl', 'kabanos', 'jitrnic', 'tlacenk']
const MEAT: Stem[] = [
  ...PORK,
  'maso', 'masa', 'masov', 'kure', 'kurat', 'kuraci', 'hovez', 'telec', 'kruti', '=kruta', '=krutu', 'kachn', '=husa', '=husi',
  'jehnec', 'jehne', 'skopov', 'zverin', 'srnc', 'divocak', 'krolik', 'rizek', 'rizk', 'jatra', 'jatern', 'ledvin',
  'sekan', 'zelatin', 'cevap', 'gyros', 'mortadel', 'prosciutt', 'chorizo', 'pancett',
]
const FISH: Stem[] = [
  '=ryba', '=ryby', '=rybi', '=rybu', '=rybou', '=rybich', 'tunak', 'losos', 'tresk', 'makrel', 'sardin', 'sardel', 'ancovic',
  'krevet', 'pstruh', '=kapr', '=kapra', 'sled', 'kalamar', 'chobotnic', 'surimi', 'tilapi', 'pangas', 'mors',
]
const DAIRY: Stem[] = [
  'mlek', 'mlec', 'smetan', 'masl', '=syr', '=syra', '=syru', '=syrem', '=syry', 'jogurt', 'tvaroh', 'slehack',
  'eidam', 'parmazan', 'mozzarel', 'ricott', 'mascarpon', 'kefir', 'podmasl', 'zakysan', 'gouda', 'hermelin', 'niva', 'cottage',
  'cheddar', 'feta', 'balkan', 'creme', 'gervais', 'lucin', 'ghi',
]
const EGGS: Stem[] = ['vejc', 'vaj', 'majonez']
const HONEY: Stem[] = ['=med', '=medu', '=medem']
const GLUTEN: Stem[] = [
  'mouk', 'psenic', 'zitn', 'zito', 'jecn', 'jecmen', 'chleb', 'chleba', 'rohlik', 'testovin', 'spaget', 'penne', 'fusill',
  'lasagn', 'nudl', 'kuskus', 'bulgur', 'krupic', 'strouhank', 'pecivo', 'toust', 'baget', 'knedlik', 'tortil', 'pizza', 'susenk',
  'kaiserk', 'houska', 'veka', 'piskot', 'pernik', 'oplatk', 'krekr', 'seitan', 'spald',
]
const NUTS: Stem[] = ['orech', 'orisk', 'mandl', 'liskov', 'kesu', 'pistac', 'arasid', 'bursk', 'pekan', 'makadam', 'nugat', 'nutell', 'marcipan']

const DIET_STEMS: Record<DietKey, Stem[]> = {
  none: [],
  vegetarian: [...MEAT, ...FISH],
  pescetarian: MEAT,
  vegan: [...MEAT, ...FISH, ...DAIRY, ...EGGS, ...HONEY],
}

const AVOID_STEMS: Record<DietAvoidKey, Stem[]> = {
  lactose: DAIRY,
  gluten: GLUTEN,
  nuts: NUTS,
  eggs: EGGS,
  fish: FISH,
  pork: PORK,
}

// "Arašídové máslo", "kakaové máslo" etc. are not dairy; neither are plant "mléka".
const PLANT_DAIRY = /\b(arasidov|kakaov|kokosov|mandlov|ovesn|sojov|rizov|rostlinn|bambuck)\w*\s+(mlek|mlec|masl|smetan|jogurt)/

export function isDietKey(value: unknown): value is DietKey {
  return typeof value === 'string' && DIETS.some((diet) => diet.key === value)
}

export function isDietAvoidKey(value: unknown): value is DietAvoidKey {
  return typeof value === 'string' && DIET_AVOIDS.some((avoid) => avoid.key === value)
}

/** The stems every member's diet forbids, together — the plan is shared. */
export function householdDietStems(members: ReadonlyArray<MemberDiet>): Stem[] {
  const stems = new Set<Stem>()
  for (const member of members) {
    for (const stem of DIET_STEMS[member.diet] ?? []) stems.add(stem)
    for (const avoid of member.avoids) for (const stem of AVOID_STEMS[avoid] ?? []) stems.add(stem)
  }
  return [...stems]
}

/** Whether an ingredient's name breaks one of the stems. */
export function ingredientBreaksDiet(name: string, stems: ReadonlyArray<Stem>): boolean {
  if (stems.length === 0) return false
  const normalized = normalizeMatchName(name)
  const words = normalized.split(' ').filter(Boolean)
  const plantDairy = PLANT_DAIRY.test(normalized)
  return stems.some((stem) => {
    if (plantDairy && DAIRY.includes(stem)) return false
    return stem.startsWith('=') ? words.includes(stem.slice(1)) : words.some((word) => word.startsWith(stem))
  })
}

/** Whether a recipe suits the household's diets — none of its ingredients breaks a rule. */
export function recipeFitsDiet(ingredientNames: ReadonlyArray<string>, stems: ReadonlyArray<Stem>): boolean {
  return stems.length === 0 || !ingredientNames.some((name) => ingredientBreaksDiet(name, stems))
}

/** A member's answers, cleaned: an unknown diet is "none", unknown or repeated avoids are dropped, and an
 *  avoid the diet already covers is kept (it is still what the member said). */
export function cleanMemberDiet(input: { diet: unknown; avoids: unknown }): MemberDiet | null {
  if (!isDietKey(input.diet) || !Array.isArray(input.avoids) || !input.avoids.every(isDietAvoidKey)) return null
  return { diet: input.diet, avoids: DIET_AVOIDS.map((avoid) => avoid.key).filter((key) => (input.avoids as string[]).includes(key)) }
}

/** "Vegetariánská · bez lepku a ořechů"-style chips for the member card; empty for no restriction. */
export function dietLabels(member: MemberDiet): string[] {
  const labels: string[] = []
  if (member.diet !== 'none') labels.push(DIETS.find((diet) => diet.key === member.diet)!.label)
  for (const avoid of member.avoids) labels.push(`Bez: ${DIET_AVOIDS.find((entry) => entry.key === avoid)!.label.toLocaleLowerCase('cs')}`)
  return labels
}
