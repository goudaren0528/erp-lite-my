const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Check online orders with address
    const online = await prisma.onlineOrder.findMany({
        where: { address: { not: null } },
        select: { address: true, platform: true },
        take: 5
    });
    console.log('=== OnlineOrder address samples ===');
    online.forEach(o => console.log(o.platform, JSON.stringify(o.address)));

    // Check offline orders with address
    const offline = await prisma.order.findMany({
        where: { address: { not: null } },
        select: { address: true, platform: true },
        take: 5
    });
    console.log('=== Order address samples ===');
    offline.forEach(o => console.log(o.platform, JSON.stringify(o.address)));

    // Count how many online orders have null address
    const nullCount = await prisma.onlineOrder.count({ where: { address: null } });
    const totalCount = await prisma.onlineOrder.count();
    console.log(`OnlineOrder: ${nullCount}/${totalCount} have null address`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
