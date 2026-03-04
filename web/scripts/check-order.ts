
import { prisma } from "../src/lib/db";

async function main() {
  const keyword = "O202602262026925859504996352";
  console.log(`Searching for order with keyword: ${keyword}`);

  // Check 'OnlineOrder' table (Synced online orders)
  try {
      const onlineOrders = await prisma.onlineOrder.findMany({
        where: {
          orderNo: { contains: keyword }
        }
      });
      console.log(`Found ${onlineOrders.length} orders in 'OnlineOrder' table:`);
      onlineOrders.forEach(o => console.log(JSON.stringify(o, null, 2)));
      
      // Also check if any orders exist with platform '奥租'
      const count = await prisma.onlineOrder.count({
          where: { platform: '奥租' }
      });
      console.log(`Total '奥租' orders in DB: ${count}`);
      
  } catch (e) {
      console.log("OnlineOrder table query failed:", e);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
