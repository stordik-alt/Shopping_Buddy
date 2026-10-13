import { describe, expect, it } from 'vitest'
import { itemCategoryEnum, itemPriorityEnum, itemUnitEnum } from '@/lib/db/schema'
import { checkItemChoices, checkOptionalText, checkRequiredText, ITEM_CATEGORY_VALUES, ITEM_NAME_MAX, ITEM_NOTE_MAX, ITEM_PRIORITY_VALUES } from '@/lib/shopping-input'
import { ITEM_UNITS } from '@/lib/units'

describe('shopping input limits', () => {
  it('keeps its value lists identical to the database enums', () => {
    expect([...ITEM_CATEGORY_VALUES]).toEqual(itemCategoryEnum.enumValues)
    expect([...ITEM_PRIORITY_VALUES]).toEqual(itemPriorityEnum.enumValues)
    expect([...ITEM_UNITS]).toEqual(itemUnitEnum.enumValues)
  })

  it('requires a name within the limit and returns it unchanged', () => {
    expect(checkRequiredText(' Mléko ', 'Název', ITEM_NAME_MAX)).toBe(' Mléko ')
    expect(() => checkRequiredText('   ', 'Název', ITEM_NAME_MAX)).toThrow('povinný')
    expect(() => checkRequiredText(undefined, 'Název', ITEM_NAME_MAX)).toThrow('povinný')
    expect(() => checkRequiredText('x'.repeat(ITEM_NAME_MAX + 1), 'Název', ITEM_NAME_MAX)).toThrow('příliš dlouhý')
    expect(checkRequiredText('x'.repeat(ITEM_NAME_MAX), 'Název', ITEM_NAME_MAX)).toHaveLength(ITEM_NAME_MAX)
  })

  it('lets an optional text be empty but not long or not text', () => {
    expect(() => checkOptionalText(undefined, 'Poznámka', ITEM_NOTE_MAX)).not.toThrow()
    expect(() => checkOptionalText(null, 'Poznámka', ITEM_NOTE_MAX)).not.toThrow()
    expect(() => checkOptionalText('', 'Poznámka', ITEM_NOTE_MAX)).not.toThrow()
    expect(() => checkOptionalText('x'.repeat(ITEM_NOTE_MAX + 1), 'Poznámka', ITEM_NOTE_MAX)).toThrow('příliš dlouhý')
    expect(() => checkOptionalText(5, 'Poznámka', ITEM_NOTE_MAX)).toThrow('text')
  })

  it('refuses values the database would refuse', () => {
    expect(() => checkItemChoices({ unit: 'kg', category: 'Děti', priority: 'Vysoká', onSale: true })).not.toThrow()
    expect(() => checkItemChoices({})).not.toThrow()
    expect(() => checkItemChoices({ unit: 'tuna' })).toThrow('jednotka')
    expect(() => checkItemChoices({ category: 'Zbraně' })).toThrow('kategorie')
    expect(() => checkItemChoices({ priority: 'Kritická' })).toThrow('priorita')
    expect(() => checkItemChoices({ onSale: 'ano' })).toThrow('akce')
  })
})
