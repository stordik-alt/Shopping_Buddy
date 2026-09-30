import { runRecipeImportCli } from '@/lib/recipes/importer'

runRecipeImportCli('recepty-cz').catch((error) => {
  console.error(error)
  process.exit(1)
})
