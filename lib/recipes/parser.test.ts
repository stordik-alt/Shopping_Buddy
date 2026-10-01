import { describe, expect, it } from 'vitest'
import { normalizeRatingToFive, normalizeRecipeIngredient, parseRecipeJsonLd, parseServings } from '@/lib/recipes/parser'

const source = {
  sourceId: 'test',
  sourceName: 'Test',
  sourceUrl: 'https://example.com/recept',
}

describe('parseRecipeJsonLd', () => {
  it('reads a Recipe from JSON-LD and @graph', () => {
    const html = `
      <script type="application/ld+json">
        {"@context":"https://schema.org","@graph":[
          {"@type":"WebSite","name":"Example"},
          {"@type":"Recipe","name":"Kuřecí rizoto","description":"Rychlá večeře",
           "image":["https://example.com/rizoto.jpg"],
           "recipeYield":"4 porce","prepTime":"PT15M","cookTime":"PT30M",
           "recipeIngredient":["750 g kuřecího masa","450 g rýže","2 ks cibule","1 lžička grilovacího koření","špetka soli","sůl podle chuti"],
           "aggregateRating":{"ratingValue":"4,5","bestRating":"5","ratingCount":"128"}}
        ]}
      </script>`
    const recipe = parseRecipeJsonLd(html, source)

    expect(recipe.title).toBe('Kuřecí rizoto')
    expect(recipe.servings).toBe(4)
    expect(recipe.prepTimeMinutes).toBe(15)
    expect(recipe.totalTimeMinutes).toBe(45)
    expect(recipe.ingredients[0]).toMatchObject({ quantity: 750, unit: 'g', name: 'kuřecího masa', scalable: true })
    expect(recipe.ingredients[2]).toMatchObject({ quantity: 2, unit: 'ks', name: 'cibule' })
    expect(recipe.ingredients[3]).toMatchObject({ quantity: 1, unit: 'lžička', name: 'grilovacího koření', scalable: true })
    expect(recipe.ingredients[4]).toMatchObject({ quantity: 1, unit: 'špetka', name: 'soli', scalable: true })
    expect(recipe.ingredients[5]).toMatchObject({ name: 'sůl podle chuti', scalable: false })
    expect(recipe.ratingValue).toBe(4.5)
    expect(recipe.ratingScale).toBe(5)
    expect(recipe.ratingCount).toBe(128)
  })

  it('resolves relative and protocol-relative recipe image URLs', () => {
    const html = `
      <script type="application/ld+json">
        {"@type":"Recipe","name":"Toprecepty fixture",
         "image":["//static.toprecepty.cz/fotky/recepty/test.jpg"]}
      </script>`
    const recipe = parseRecipeJsonLd(html, {
      sourceId: 'toprecepty',
      sourceName: 'Toprecepty',
      sourceUrl: 'https://www.toprecepty.cz/recept/test/',
    })

    expect(recipe.imageUrl).toBe('https://static.toprecepty.cz/fotky/recepty/test.jpg')
  })

  it('supports numeric servings, decimal commas and fractional quantities', () => {
    const html = `<script type="application/ld+json">
      {"@type":"Recipe","name":"Test","recipeYield":6,"recipeIngredient":["1/2 l mléka","0,75 kg mouky"]}
    </script>`
    const recipe = parseRecipeJsonLd(html, source)
    expect(recipe.servings).toBe(6)
    expect(recipe.ingredients[0]).toMatchObject({ quantity: 0.5, unit: 'l', name: 'mléka' })
    expect(recipe.ingredients[1]).toMatchObject({ quantity: 0.75, unit: 'kg', name: 'mouky' })
  })

  it('does not invent a zero rating when aggregateRating is missing', () => {
    const html = `<script type="application/ld+json">{"@type":"Recipe","name":"Bez hodnocení"}</script>`
    const recipe = parseRecipeJsonLd(html, source)
    expect(recipe.ratingValue).toBeUndefined()
    expect(recipe.ratingCount).toBeUndefined()
  })
})

describe('ingredient normalization', () => {
  it('preserves structured legacy data when the original text is not parseable', () => {
    expect(
      normalizeRecipeIngredient({
        id: 'legacy-3',
        originalText: 'grilovací koření',
        quantity: 1,
        unit: 'lžička',
        name: 'grilovací koření',
        scalable: true,
      }),
    ).toMatchObject({ quantity: 1, unit: 'lžička', name: 'grilovací koření', scalable: true })
  })

  it('normalizes legacy stored ingredient text as well as newly parsed ingredients', () => {
    expect(
      normalizeRecipeIngredient({
        id: 'legacy-1',
        originalText: 'špetka soli',
        name: 'špetka soli',
        scalable: false,
      }),
    ).toMatchObject({ quantity: 1, unit: 'špetka', name: 'soli', scalable: true })

    expect(
      normalizeRecipeIngredient({
        id: 'legacy-2',
        originalText: '1 lžička grilovacího koření',
        quantity: 1,
        unit: 'lžička',
        name: 'lžička grilovacího koření',
        scalable: true,
      }),
    ).toMatchObject({ quantity: 1, unit: 'lžička', name: 'grilovacího koření' })
  })
})

describe('rating normalization', () => {
  it('normalizes different source scales to 0–5 for comparison', () => {
    expect(normalizeRatingToFive(4.5, 5)).toBe(4.5)
    expect(normalizeRatingToFive(9, 10)).toBe(4.5)
  })
})

describe('servings', () => {
  it('parses text and numeric yields', () => {
    expect(parseServings('4 porce')).toBe(4)
    expect(parseServings(6)).toBe(6)
    expect(parseServings('neznámé')).toBeUndefined()
  })
})
