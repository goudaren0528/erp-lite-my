/**
 * Fix stale OVERDUE orders for 奥租.
 * Orders with returnDeadline > 60 days ago are very likely resolved.
 * This script updates them to COMPLETED.
 * 
 * Run with: node scripts/fix-aolzu-overdue.js [--dry-run]
 */
const { PrismaClient } = require('../web/node_modules/@prisma/client')
const prisma = new PrismaClient({ datasources: { db: { url: 'file:D:/erp-lite/web/data/db.sqlite' } } })

const DRY_RUN = process.argv.includes('--dry-run')
const DAYS_THRESHOLD = 30 // orders overdue for more than this many days

async function main() {
  const cutoff = new Date(Date.now() - DAYS_THRESHOLD * 24 * 60 * 60 * 1000)
  
  const staleOrders = await prisma.onlineOrder.findMany({
    where: {
      platform: '奥租',
      status: 'OVERDUE',
      returnDeadline: { lt: cutoff }
    },
    select: { id: true, orderNo: true, returnDeadline: true }
  })

  console.log(`Found ${staleOrders.length} OVERDUE orders with returnDeadline > ${DAYS_THRESHOLD} days ago`)
  if (staleOrders.length === 0) { console.log('Nothing to fix.'); return }

  staleOrders.slice(0, 5).forEach(o => {
    const daysAgo = Math.round((Date.now() - new Date(o.returnDeadline).getTime()) / 86400000)
    console.log(`  ${o.orderNo} | deadline: ${o.returnDeadline.toISOString().split('T')[0]} (${daysAgo}d ago)`)
  })
  if (staleOrders.length > 5) console.log(`  ... and ${staleOrders.length - 5} more`)

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes made. Remove --dry-run to apply.')
    return
  }

  const ids = staleOrders.map(o => o.id)
  const result = await prisma.onlineOrder.updateMany({
    where: { id: { in: ids } },
    data: { status: 'COMPLETED', updatedAt: new Date() }
  })

  console.log(`\nUpdated ${result.count} orders from OVERDUE -> COMPLETED`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
