import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { calculateOrderRevenue } from "@/lib/utils";
import { StatsClient } from "./stats-client";

type StatsOrder = {
  creatorId: string | null;
  creatorName: string | null;
  sourceContact: string;
  rentPrice: number;
  insurancePrice: number;
  overdueFee: number | null;
  extensions: { price: number }[];
  status: string;
}

export default async function StatsPage() {
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === 'ADMIN';
  const canViewAllOrders = isAdmin || currentUser?.permissions?.includes('view_all_orders');

  const ordersToAnalyze = await prisma.order.findMany({
      where: {
        ...(canViewAllOrders ? {} : { creatorId: currentUser?.id }),
        // status: { not: 'CLOSED' } // Removed to include CLOSED orders for refund stats
      },
      include: {
          extensions: true
      }
  });
  
  // Group by Creator (User)
  // Map CreatorId -> { name, orders: [], promoters: Map<name, {count, rent}> }
  
  const userStatsMap: Record<string, {
    userId: string,
    userName: string,
    orderCount: number,
    totalRevenue: number,
    refundedAmount: number,
    promotersMap: Record<string, { name: string, count: number, revenue: number }>
  }> = {};

  // Initialize with known users to ensure even empty ones might show up (optional, but good for completeness if requested. 
  // But requirement implies statistics of existing orders. Let's stick to orders.)
  
  ordersToAnalyze.forEach((order: StatsOrder) => {
      const creatorId = order.creatorId || 'unknown';
      const creatorName = order.creatorName || 'Unknown';
      
      if (!userStatsMap[creatorId]) {
          userStatsMap[creatorId] = {
              userId: creatorId,
              userName: creatorName,
              orderCount: 0,
              totalRevenue: 0,
              refundedAmount: 0,
              promotersMap: {}
          };
      }
      
      const stats = userStatsMap[creatorId];
      // calculateOrderRevenue expects Order type from types/index.ts.
      // Prisma Order includes extensions, which matches expectation.
      // But Dates are Date objects in Prisma result, while types/index.ts might imply strings (from JSON).
      const revenue = calculateOrderRevenue(order);

      if (order.status === 'CLOSED') {
          // For closed orders, add to refunded amount
          stats.refundedAmount += revenue;
          // Do NOT add to orderCount or totalRevenue (which are for valid orders)
      } else {
          // For valid orders
          stats.orderCount++;
          stats.totalRevenue += revenue;
          
          // Promoter Breakdown (only for valid orders)
          const promoterName = order.sourceContact || '未标记';
          const displayPromoterName = promoterName === 'self' ? '自主开发' : (promoterName === 'OFFLINE' ? '线下' : promoterName);
          
          if (!stats.promotersMap[displayPromoterName]) {
              stats.promotersMap[displayPromoterName] = {
                  name: displayPromoterName,
                  count: 0,
                  revenue: 0
              };
          }
          
          stats.promotersMap[displayPromoterName].count++;
          stats.promotersMap[displayPromoterName].revenue += revenue;
      }
  });

  const userStats = Object.values(userStatsMap).map(u => ({
      userId: u.userId,
      userName: u.userName,
      orderCount: u.orderCount,
      totalRevenue: u.totalRevenue,
      refundedAmount: u.refundedAmount,
      promoters: Object.values(u.promotersMap).sort((a, b) => b.revenue - a.revenue)
  })).sort((a, b) => b.totalRevenue - a.totalRevenue);


  const totalOrdersCount = userStats.reduce((acc, curr) => acc + curr.orderCount, 0);
  const totalRevenue = userStats.reduce((acc, curr) => acc + curr.totalRevenue, 0);
  const totalRefunded = userStats.reduce((acc, curr) => acc + curr.refundedAmount, 0);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">结算统计</h2>
      
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总订单数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrdersCount}</div>
            <p className="text-xs text-muted-foreground">有效订单</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总营收 (不含押金)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥ {totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">不含已关闭/退款订单</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已退款金额</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">¥ {totalRefunded.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">已关闭订单总额</p>
          </CardContent>
        </Card>
      </div>

      <StatsClient userStats={userStats} />
    </div>
  );
}
