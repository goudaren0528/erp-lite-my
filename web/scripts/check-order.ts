
import { prisma } from "../src/lib/db";

async function main() {
  const keyword = "1012";
  console.log(`Searching for order with keyword: ${keyword}`);

  // Check 'Order' table (Offline/Main orders)
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { orderNo: { contains: keyword } },
        { customerXianyuId: { contains: keyword } } // Just in case
      ]
    },
    select: {
      id: true,
      orderNo: true,
      status: true,
      logisticsCompany: true,
      trackingNumber: true,
      returnLogisticsCompany: true,
      returnTrackingNumber: true,
      latestLogisticsInfo: true,
      returnLatestLogisticsInfo: true
    }
  });

  console.log(`Found ${orders.length} orders in 'Order' table:`);
  orders.forEach(o => console.log(JSON.stringify(o, null, 2)));

  // Check 'OnlineOrder' table (Synced online orders)
  // Note: OnlineOrder might not be in the schema yet if it was added recently, let's check schema.prisma first?
  // Assuming OnlineOrder exists based on previous context.
  try {
      // @ts-ignore
      const onlineOrders = await prisma.onlineOrder.findMany({
        where: {
          orderNo: { contains: keyword }
        },
        select: {
          id: true,
          orderNo: true,
          status: true,
          logisticsCompany: true,
          trackingNumber: true,
          returnLogisticsCompany: true,
          returnTrackingNumber: true,
          latestLogisticsInfo: true,
          returnLatestLogisticsInfo: true
        }
      });
      console.log(`Found ${onlineOrders.length} orders in 'OnlineOrder' table:`);
      onlineOrders.forEach(o => console.log(JSON.stringify(o, null, 2)));
  } catch (e) {
      console.log("OnlineOrder table query failed or table does not exist.");
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
