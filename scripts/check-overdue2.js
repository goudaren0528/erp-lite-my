const { PrismaClient } = require('../web/node_modules/@prisma/client')
const prisma = new PrismaClient({ datasources: { db: { url: 'file:D:/erp-lite/web/data/db.sqlite' } } })
async function main() {
  const r = await prisma.onlineOrder.findMany({ where: { platform: '奥租', status: 'OVERDUE' }, select: { returnDeadline: true, orderNo: true }, take: 5 })
  console.log(JSON.stringify(r, null, 2))
  const now = new Date()
  r.forEach(o => {
    if (o.returnDeadline) {
      const daysAgo = (now - new Date(o.returnDeadline)) / 86400000
      console.log(o.orderNo, 'daysAgo:', daysAgo.toFixed(1))
    }
  })
}
main().catch(console.error).finally(() => prisma.$disconnect())
