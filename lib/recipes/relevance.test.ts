import { describe, expect, it } from 'vitest'
import { filterAndRankRecipeResults, isRecipeTitleRelevant, recipeRelevanceScore } from '@/lib/recipes/relevance'
import type { Recipe } from '@/lib/recipes/types'

const recipe = (title: string, ingredients: string[] = []): Recipe => ({
  id: title,
  sourceId: 'test',
  sourceName: 'Test',
  sourceUrl: 'https://example.com/' + encodeURIComponent(title),
  canonicalUrl: 'https://example.com/' + encodeURIComponent(title),
  title,
  ingredients: ingredients.map((name, index) => ({
    id: String(index),
    originalText: name,
    name,
    scalable: false,
  })),
  fetchedAt: new Date().toISOString(),
  parserVersion: 1,
})

describe('recipe search relevance', () => {
  it('matches Czech diacritics-insensitively and recognizes word prefixes', () => {
    expect(recipeRelevanceScore(recipe('Kuřecí rizoto'), 'kuře')).toBeGreaterThan(0)
  })

  it('prefers title matches over ingredient-only matches', () => {
    const titleMatch = recipe('Kuřecí řízky')
    const ingredientMatch = recipe('Rizoto se zeleninou', ['kuřecí maso'])
    expect(recipeRelevanceScore(titleMatch, 'kuře')).toBeGreaterThan(recipeRelevanceScore(ingredientMatch, 'kuře'))
  })

  it('removes unrelated recipes instead of returning the whole source result set', () => {
    const results = filterAndRankRecipeResults([
      recipe('Kuřecí kari'),
      recipe('Čokoládový dort'),
      recipe('Kuře na paprice'),
    ], 'kuře')

    expect(results.map((item) => item.title)).toEqual(['Kuřecí kari', 'Kuře na paprice'])
  })

  it('rejects unrelated portal catalogue titles', () => {
    expect(isRecipeTitleRelevant('Čokoládový dort', 'kuřecí')).toBe(false)
    expect(isRecipeTitleRelevant('Kuřecí maso na paprice', 'kuře')).toBe(true)
    expect(isRecipeTitleRelevant('Kuřecí řízky', 'kuřecí maso')).toBe(true)
  })
})
