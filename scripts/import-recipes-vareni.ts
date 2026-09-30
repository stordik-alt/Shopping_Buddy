import { runRecipeImportCli } from '@/lib/recipes/importer'

runRecipeImportCli('vareni').catch((error) => {
  console.error(error)
  process.exit(1)
})
