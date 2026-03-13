const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
p.onlineOrder.findMany({
  where: { platform: 'CHENGLIN' },
  orderBy: { updatedAt: 'desc' },
  take: 5,
  select: { orderNo: true, platform: true, status: true, itemTitle: true, updatedAt: true }
}).then(rows => {
  console.log('最新5条 CHENGLIN 订单:')
  rows.forEach(r => console.log(JSON.stringify(r)))
  p.$disconnect()
})
