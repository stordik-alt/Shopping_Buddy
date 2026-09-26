// What a household spends money on, for the budget and the expense overview. A different list from
// the shopping-list item categories (lib/types.ts ItemCategory): those describe products in a shop,
// these describe spending — rent, energy, the car, clothes — which no shopping list holds. The five
// item categories keep their names here, so a purchase's items map onto expenses one to one.
//
// Subcategories are optional and fixed per category (not free text), so the overview can add them up
// reliably. The database stores the category as an enum (migration 0035) and the subcategory as text
// checked against this list by the server (isValidSubcategory).

export const EXPENSE_CATEGORIES = [
  { name: 'Potraviny', subcategories: ['Nákup potravin', 'Pečivo', 'Maso a uzeniny', 'Nápoje'] },
  { name: 'Drogerie', subcategories: ['Kosmetika a hygiena', 'Čisticí prostředky'] },
  { name: 'Domácnost', subcategories: ['Vybavení a nádobí', 'Nábytek', 'Elektronika a spotřebiče', 'Opravy a údržba', 'Zahrada'] },
  {
    name: 'Bydlení',
    subcategories: ['Nájem nebo hypotéka', 'Elektřina', 'Plyn', 'Voda', 'Teplo', 'Internet a TV', 'Telefon', 'Poplatky SVJ a fond oprav', 'Pojištění domácnosti', 'Odpady'],
  },
  {
    name: 'Auto',
    subcategories: ['Palivo', 'Nabíjení', 'Servis a opravy', 'Pneumatiky', 'Povinné ručení', 'Havarijní pojištění', 'Dálniční známka', 'Parkování', 'STK a emise', 'Mytí'],
  },
  { name: 'Oblečení a obuv', subcategories: ['Oblečení', 'Obuv', 'Doplňky'] },
  { name: 'Děti', subcategories: ['Školka a škola', 'Kroužky', 'Hračky', 'Oblečení pro děti', 'Kapesné'] },
  { name: 'Zdraví', subcategories: ['Léky a lékárna', 'Lékař a zubař', 'Brýle a čočky'] },
  { name: 'Volný čas', subcategories: ['Restaurace a kavárny', 'Kultura', 'Sport', 'Dovolená', 'Předplatné'] },
  { name: 'Ostatní', subcategories: ['Dárky', 'Poplatky a daně', 'Jiné'] },
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['name']

/** The category names in display order (also the database enum's values). */
export const EXPENSE_CATEGORY_NAMES = EXPENSE_CATEGORIES.map((category) => category.name) as [ExpenseCategory, ...ExpenseCategory[]]

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORY_NAMES as readonly string[]).includes(value)
}

/** The subcategories offered for a category. */
export function subcategoriesOf(category: ExpenseCategory): readonly string[] {
  return EXPENSE_CATEGORIES.find((entry) => entry.name === category)?.subcategories ?? []
}

/** Whether `subcategory` belongs to `category`; no subcategory (null) is always valid. */
export function isValidSubcategory(category: ExpenseCategory, subcategory: string | null): boolean {
  return subcategory === null || subcategoriesOf(category).includes(subcategory)
}
