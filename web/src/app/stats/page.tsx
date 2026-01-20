import { getDb } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { StatsClient } from "./stats-client";

export default async function StatsPage() {
  const db = await getDb();
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === 'ADMIN';
  const canViewAllOrders = isAdmin || currentUser?.permissions?.includes('view_all_orders');

  const ordersToAnalyze = canViewAllOrders 
    ? db.orders 
    : db.orders.filter(o => o.creatorId === currentUser?.id);
  
  // Group by Creator (User)
  // Map CreatorId -> { name, orders: [], promoters: Map<name, {count, rent}> }
  
  const userStatsMap: Record<string, {
    userId: string,
    userName: string,
    orderCount: number,
    totalRent: number,
    promotersMap: Record<string, { name: string, count: number, rent: number }>
  }> = {};

  // Initialize with known users to ensure even empty ones might show up (optional, but good for completeness if requested. 
  // But requirement implies statistics of existing orders. Let's stick to orders.)
  
  // Actually, let's prepopulate with users if we want to show all accounts even with 0 orders? 
  // User didn't specify, but "statistical different account income" usually implies showing active ones.
  // Let's just iterate orders.

  ordersToAnalyze.forEach(order => {
      const creatorId = order.creatorId || 'unknown';
      const creatorName = order.creatorName || 'Unknown';
      
      if (!userStatsMap[creatorId]) {
          userStatsMap[creatorId] = {
              userId: creatorId,
              userName: creatorName,
              orderCount: 0,
              totalRent: 0,
              promotersMap: {}
          };
      }
      
      const stats = userStatsMap[creatorId];
      stats.orderCount++;
      stats.totalRent += order.rentPrice; // Assuming Rent Price is the income metric
      
      // Promoter Breakdown
      const promoterName = order.sourceContact || '未标记';
      const displayPromoterName = promoterName === 'self' ? '自主开发' : promoterName;
      
      if (!stats.promotersMap[displayPromoterName]) {
          stats.promotersMap[displayPromoterName] = {
              name: displayPromoterName,
              count: 0,
              rent: 0
          };
      }
      
      stats.promotersMap[displayPromoterName].count++;
      stats.promotersMap[displayPromoterName].rent += order.rentPrice;
  });

  const userStats = Object.values(userStatsMap).map(u => ({
      userId: u.userId,
      userName: u.userName,
      orderCount: u.orderCount,
      totalRent: u.totalRent,
      promoters: Object.values(u.promotersMap).sort((a, b) => b.rent - a.rent)
  })).sort((a, b) => b.totalRent - a.totalRent);


  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">结算统计</h2>
      
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总订单数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ordersToAnalyze.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总营收 (租金)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥ {ordersToAnalyze.reduce((acc, o) => acc + o.rentPrice, 0)}</div>
          </CardContent>
        </Card>
      </div>

      <StatsClient userStats={userStats} />
    </div>
  );
}
