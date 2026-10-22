import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { getDb } from '../lib/db/client'
import { products, retailerProductRefs } from '../lib/db/schema'
import { eq, sql } from 'drizzle-orm'

async function audit() {
  const db = getDb()
  console.log('📊 Auditing products mapped to types by source...')
  
  const result = await db.select({
    source: retailerProductRefs.source,
    count: sql<number>`count(*)`,
  })
  .from(products)
  .innerJoin(retailerProductRefs, eq(products.id, retailerProductRefs.productId))
  .where(sql`products.product_type_id IS NOT NULL`)
  .groupBy(retailerProductRefs.source)

  console.table(result)
}

audit().catch(console.error)
