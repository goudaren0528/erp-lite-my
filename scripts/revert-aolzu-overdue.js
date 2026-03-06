// Revert: restore orders that were changed from OVERDUE -> COMPLETED back to OVERDUE
// These are orders updated in the last few minutes with returnDeadline > 30 days ago
const { PrismaClient } = require('../web/node_modules/@prisma/client')
const prisma = new PrismaClient({ datasources: { db: { url: 'file:D:/erp-lite/web/data/db.sqlite' } } })

async function main() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentCutoff = new Date(Date.now() - 10 * 60 * 1000) // updated in last 10 minutes

  const result = await prisma.onlineOrder.updateMany({
    where: {
      platform: '奥租',
      status: 'COMPLETED',
      returnDeadline: { lt: cutoff },
      updatedAt: { gte: recentCutoff }
    },
    data: { status: 'OVERDUE', updatedAt: new Date() }
  })

  console.log(`Reverted ${result.count} orders back to OVERDUE`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
