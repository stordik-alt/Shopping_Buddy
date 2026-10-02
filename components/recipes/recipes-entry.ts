'use client'

// Separate dynamic entry point for Recipes. Keeping this import boundary stable but distinct
// forces a fresh Turbopack chunk after the Recipes/Meal Plan UI move.
export { Recipes } from './recipes'
