import { runRecipeImportCli } from '@/lib/recipes/importer'

runRecipeImportCli('apetit').catch((error) => {
  console.error(error)
  process.exit(1)
})
