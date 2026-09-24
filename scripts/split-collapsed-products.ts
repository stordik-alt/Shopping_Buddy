import { splitCollapsedExternalProducts } from '@/lib/db/split-collapsed-products'

// One-off repair: give each retailer SKU that was merged into a same-named product its own product.
// Dry-run by default — prints the plan and changes nothing. Pass --apply to write.
//   dotenv -e .env.local -- tsx scripts/split-collapsed-products.ts          (dry run)
//   dotenv -e .env.local -- tsx scripts/split-collapsed-products.ts --apply
async function main() {
  const apply = process.argv.includes('--apply')
  const report = await splitCollapsedExternalProducts({ apply })

  for (const group of report.groups) {
    console.log(`${group.source}: "${group.productName}" keeps ${group.keep}`)
    for (const part of group.split) console.log(`    ${part.externalId} -> new product "${part.newName}"`)
  }
  console.log(
    apply
      ? `Applied: ${report.productsCreated} products created, ${report.refsMoved} refs moved, ${report.pricesMoved} price rows moved.`
      : `Dry run: ${report.groups.length} collapsed products, ${report.groups.reduce((n, g) => n + g.split.length, 0)} SKUs would be split. Nothing changed.`,
  )
  console.log(`Deals still on the original products (left alone, refreshed by the next ingestion run): ${report.dealsOnOriginals}`)
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
