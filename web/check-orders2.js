const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
// 查最近更新的所有订单，不限平台
p.onlineOrder.findMany({
  orderBy: { updatedAt: 'desc' },
  take: 10,
  select: { orderNo: true, platform: true, status: true, itemTitle: true, updatedAt: true }
}).then(rows => {
  console.log('最近更新的10条订单:')
  rows.forEach(r => console.log(JSON.stringify(r)))
  p.$disconnect()
})
