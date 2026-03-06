const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.onlineOrder.count({ where: { platform: '奥租', status: 'OVERDUE' } });
  console.log('OVERDUE count:', count);
  
  const samples = await prisma.onlineOrder.findMany({
    where: { platform: '奥租', status: 'OVERDUE' },
    select: { orderNo: true, rentStartDate: true, returnDeadline: true, status: true, updatedAt: true },
    orderBy: { returnDeadline: 'asc' },
    take: 10
  });
  console.log(JSON.stringify(samples, null, 2));
}
main().finally(() => prisma.$disconnect());
