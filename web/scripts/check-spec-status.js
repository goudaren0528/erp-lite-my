const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const total = await prisma.order.count({ where: { status: { in: ['PENDING_SHIPMENT','RENTING','OVERDUE','RETURNING','SHIPPED_PENDING_CONFIRMATION'] } } });
  const withSpec = await prisma.order.count({ where: { status: { in: ['PENDING_SHIPMENT','RENTING','OVERDUE','RETURNING','SHIPPED_PENDING_CONFIRMATION'] }, specId: { not: null } } });
  console.log('total active:', total, 'with specId:', withSpec, 'without:', total - withSpec);
  
  const products = await prisma.product.findMany({ include: { specs: { include: { bomItems: true } } } });
  console.log('products:', products.length);
  products.forEach(p => {
    console.log(' -', p.name, 'specs:', p.specs.length, p.specs.map(s => s.name + '(bom:' + s.bomItems.length + ')').join(', '));
  });
  
  const sample = await prisma.order.findMany({ where: { status: { in: ['PENDING_SHIPMENT','RENTING','OVERDUE','RETURNING'] }, specId: null }, take: 5, select: { orderNo: true, productName: true, variantName: true, specId: true, productId: true } });
  console.log('sample orders without specId:', JSON.stringify(sample, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
