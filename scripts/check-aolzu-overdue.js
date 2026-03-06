// Check OVERDUE aolzu orders and their returnDeadline distribution
const { PrismaClient } = require('../web/node_modules/@prisma/client')
const prisma = new PrismaClient({ datasources: { db: { url: 'file:D:/erp-lite/web/data/db.sqlite' } } })

async function main() {
  const overdueOrders = await prisma.onlineOrder.findMany({
    where: { platform: '奥租', status: 'OVERDUE' },
    select: { orderNo: true, returnDeadline: true, rentStartDate: true, updatedAt: true },
    orderBy: { returnDeadline: 'asc' }
  })

  const now = new Date()
  console.log(`Total OVERDUE orders for 奥租: ${overdueOrders.length}`)

  const buckets = { 'no_deadline': 0, 'within_30d': 0, '30_90d_ago': 0, '90_180d_ago': 0, 'over_180d_ago': 0 }
  for (const o of overdueOrders) {
    if (!o.returnDeadline) { buckets.no_deadline++; continue }
    const daysAgo = (now - new Date(o.returnDeadline)) / (1000 * 60 * 60 * 24)
    if (daysAgo < 30) buckets.within_30d++
    else if (daysAgo < 90) buckets['30_90d_ago']++
    else if (daysAgo < 180) buckets['90_180d_ago']++
    else buckets.over_180d_ago++
  }

  console.log('\nreturnDeadline distribution:')
  console.log('  No deadline:', buckets.no_deadline)
  console.log('  Within 30 days ago (possibly still overdue):', buckets.within_30d)
  console.log('  30-90 days ago:', buckets['30_90d_ago'])
  console.log('  90-180 days ago:', buckets['90_180d_ago'])
  console.log('  Over 180 days ago:', buckets.over_180d_ago)

  // Show sample of old ones
  const old = overdueOrders.filter(o => o.returnDeadline && (now - new Date(o.returnDeadline)) / 86400000 > 30)
  if (old.length > 0) {
    console.log('\nSample old OVERDUE orders (returnDeadline > 30 days ago):')
    old.slice(0, 10).forEach(o => {
      const daysAgo = o.returnDeadline ? Math.round((now - new Date(o.returnDeadline)) / 86400000) : 'N/A'
      console.log(`  ${o.orderNo} | deadline: ${o.returnDeadline?.toISOString().split('T')[0]} (${daysAgo}d ago) | updated: ${o.updatedAt.toISOString().split('T')[0]}`)
    })
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
