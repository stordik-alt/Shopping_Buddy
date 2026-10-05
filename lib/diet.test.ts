import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cleanMemberDiet, DIET_AVOIDS, DIETS, dietLabels, householdDietStems, ingredientBreaksDiet, recipeFitsDiet } from '@/lib/diet'

describe('diet rules', () => {
  const vegetarian = householdDietStems([{ diet: 'vegetarian', avoids: [] }])
  const vegan = householdDietStems([{ diet: 'vegan', avoids: [] }])

  it('a vegetarian diet rules out meat and fish, not vegetables or dairy', () => {
    for (const name of ['Kuřecí prsa', 'Vepřová plec', 'Hovězí zadní', 'Šunka', 'Slanina', 'Tuňák ve vlastní šťávě', 'Losos', 'Ryby', 'Mleté maso']) {
      expect(ingredientBreaksDiet(name, vegetarian), name).toBe(true)
    }
    for (const name of ['Mrkev', 'Mléko polotučné', 'Rybíz', 'Kurkuma', 'Paprika', 'Medvědí česnek', 'Eidam']) {
      expect(ingredientBreaksDiet(name, vegetarian), name).toBe(false)
    }
  })

  it('a pescetarian diet keeps fish', () => {
    const pescetarian = householdDietStems([{ diet: 'pescetarian', avoids: [] }])
    expect(ingredientBreaksDiet('Losos', pescetarian)).toBe(false)
    expect(ingredientBreaksDiet('Kuřecí stehna', pescetarian)).toBe(true)
  })

  it('a vegan diet also rules out dairy, eggs and honey, but not plant milks or peanut butter', () => {
    for (const name of ['Mléko', 'Máslo', 'Sýr', 'Řecký jogurt', 'Vejce', 'Vajíčka', 'Med', 'Smetana na vaření']) {
      expect(ingredientBreaksDiet(name, vegan), name).toBe(true)
    }
    for (const name of ['Ovesné mléko', 'Kokosové mléko', 'Arašídové máslo', 'Tofu', 'Medvědí česnek']) {
      expect(ingredientBreaksDiet(name, vegan), name).toBe(false)
    }
  })

  it('avoids add their own rules, and members combine', () => {
    const stems = householdDietStems([
      { diet: 'none', avoids: ['gluten'] },
      { diet: 'none', avoids: ['nuts'] },
    ])
    expect(ingredientBreaksDiet('Hladká mouka', stems)).toBe(true)
    expect(ingredientBreaksDiet('Špagety', stems)).toBe(true)
    expect(ingredientBreaksDiet('Vlašské ořechy', stems)).toBe(true)
    expect(ingredientBreaksDiet('Rýže', stems)).toBe(false)
    expect(householdDietStems([{ diet: 'none', avoids: [] }])).toEqual([])
  })

  it('a recipe fits when no ingredient breaks a rule', () => {
    expect(recipeFitsDiet(['Ovesné vločky', 'Banán', 'Mléko'], vegetarian)).toBe(true)
    expect(recipeFitsDiet(['Těstoviny', 'Slanina', 'Vejce'], vegetarian)).toBe(false)
    expect(recipeFitsDiet(['Cokoli'], [])).toBe(true)
  })

  it('cleans the answers and refuses unknown keys', () => {
    expect(cleanMemberDiet({ diet: 'vegan', avoids: ['nuts', 'gluten', 'nuts'] })).toEqual({ diet: 'vegan', avoids: ['gluten', 'nuts'] })
    expect(cleanMemberDiet({ diet: 'paleo', avoids: [] })).toBeNull()
    expect(cleanMemberDiet({ diet: 'none', avoids: ['sugar'] })).toBeNull()
    expect(cleanMemberDiet({ diet: 'none', avoids: 'gluten' })).toBeNull()
  })

  it('labels a member for the card', () => {
    expect(dietLabels({ diet: 'vegetarian', avoids: ['gluten'] })).toEqual(['Vegetariánská', 'Bez: lepek'])
    expect(dietLabels({ diet: 'none', avoids: [] })).toEqual([])
  })

  it('matches the database check constraints of migration 0068', () => {
    const sql = readFileSync('lib/db/migrations/0068_member_diets.sql', 'utf8')
    for (const { key } of [...DIETS, ...DIET_AVOIDS]) expect(sql).toContain(`'${key}'`)
  })
})
