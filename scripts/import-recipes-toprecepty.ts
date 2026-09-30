import { runRecipeImportCli } from '@/lib/recipes/importer'

runRecipeImportCli('toprecepty').catch((error) => {
  console.error(error)
  process.exit(1)
})
