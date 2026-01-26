import { prisma } from "@/lib/db";
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
  createdAt: Date;
  completedAt: Date | null;
}

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function StatsPage(props: PageProps) {
  const currentUser = await getCurrentUser();
  const canAccess = currentUser?.role === 'ADMIN' || currentUser?.permissions?.includes('stats_accounts');
  
  if (!canAccess) {
      return <div className="p-8">无权限访问</div>;
  }

  const isAdmin = currentUser?.role === 'ADMIN';
  const canViewAllOrders = isAdmin || currentUser?.permissions?.includes('view_all_orders');

  const searchParams = await props.searchParams;
  const period = (searchParams?.period as string) || 'cumulative';
  const start = searchParams?.start as string;
  const end = searchParams?.end as string;

  let dateRange: { gte: Date; lte: Date } | null = null;
  let invalidRange = false;
  if (period === 'monthly') {
     const now = new Date();
     const date = start ? new Date(start) : now;
     const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
     const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
     firstDay.setHours(0,0,0,0);
     lastDay.setHours(23,59,59,999);
     dateRange = { gte: firstDay, lte: lastDay };
  } else if (period === 'custom') {
     if (start && end) {
       const firstDay = new Date(start);
       const lastDay = new Date(end);
       firstDay.setHours(0,0,0,0);
       lastDay.setHours(23,59,59,999);
       dateRange = { gte: firstDay, lte: lastDay };
     } else {
       invalidRange = true;
     }
  }

  // 1. Fetch all necessary data
  const orderDateFilter = invalidRange
    ? { id: 'nothing_to_match' }
    : dateRange
      ? {
          OR: [
            { createdAt: dateRange },
            { completedAt: dateRange }
          ]
        }
      : {};

  const [ordersToAnalyze, users, channelConfigs, promoters] = await Promise.all([
    prisma.order.findMany({
      where: {
        ...(canViewAllOrders ? {} : { creatorId: currentUser?.id }),
        ...orderDateFilter
      },
      include: {
        extensions: true
      }
    }),
    prisma.user.findMany({
      include: {
        accountGroup: {
          include: {
            rules: {
              orderBy: { minCount: 'asc' }
            }
          }
        }
      }
    }),
    prisma.channelConfig.findMany({
      include: {
        rules: {
          orderBy: { minCount: 'asc' }
        }
      }
    }),
    prisma.promoter.findMany()
  ]);

  // 2. Build Lookup Maps
  const userMap = new Map(users.map(u => [u.id, u]));
  const promoterChannelMap = new Map(promoters.map(p => [p.name, p.channel])); // Map Name -> ChannelName
  const channelConfigMap = new Map(channelConfigs.map(c => [c.name, c])); // Map ChannelName -> Config

  // Helper to find matching rule percentage
  const getPercentage = (count: number, rules: { type?: string; minCount: number; maxCount: number | null; percentage: number }[]) => {
    const match = rules.find(r => count >= r.minCount && (r.maxCount === null || count <= r.maxCount));
    return match ? match.percentage : 0;
  };
  
  // 3. Aggregate Basic Stats
  // Map CreatorId -> { ...basicStats, promotersMap: ... }
  
  const userStatsMap: Record<string, {
    userId: string,
    userName: string,
    orderCount: number,
    totalRevenue: number,
    refundedAmount: number,
    promotersMap: Record<string, { name: string, count: number, revenue: number, channelName?: string }>
  }> = {};
  
  const isInRange = (value?: Date | null) => {
    if (!dateRange) return true;
    if (!value) return false;
    return value >= dateRange.gte && value <= dateRange.lte;
  };

  ordersToAnalyze.forEach((order: StatsOrder) => {
      const creatorId = order.creatorId || 'unknown';
      const creatorName = order.creatorName || 'Unknown';
      const user = userMap.get(creatorId);
      const settlementByCompleted = user?.accountGroup?.settlementByCompleted ?? true;
      const includeOrder = settlementByCompleted
        ? order.status === 'COMPLETED' && isInRange(order.completedAt)
        : isInRange(order.createdAt);

      if (!includeOrder) {
        return;
      }
      
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
      const revenue = calculateOrderRevenue(order);

      if (order.status === 'CLOSED') {
          stats.refundedAmount += revenue;
      } else {
          stats.orderCount++;
          stats.totalRevenue += revenue;
          
          // Promoter Breakdown
          const promoterName = order.sourceContact || '未标记';
          const displayPromoterName = promoterName === 'self' ? '自主开发' : (promoterName === 'OFFLINE' ? '线下' : promoterName);
          
          if (!stats.promotersMap[displayPromoterName]) {
              // Try to find channel name from promoter list
              // If not found, check if the name itself is a known channel (unlikely but possible logic fallback)
              const channelName = promoterChannelMap.get(promoterName) || promoterChannelMap.get(displayPromoterName);
              
              stats.promotersMap[displayPromoterName] = {
                  name: displayPromoterName,
                  count: 0,
                  revenue: 0,
                  channelName: channelName || undefined
              };
          }
          
          stats.promotersMap[displayPromoterName].count++;
          stats.promotersMap[displayPromoterName].revenue += revenue;
      }
  });

  // 4. Calculate Commission
  const userStats = Object.values(userStatsMap).map(u => {
      const user = userMap.get(u.userId);
      const accountGroup = user?.accountGroup;
      
      // A. Account Effective Points
      // Based on USER'S total order count (u.orderCount)
      const accountEffectivePercentage = accountGroup 
          ? getPercentage(u.orderCount, (accountGroup.rules as { type?: string; minCount: number; maxCount: number | null; percentage: number }[]).filter(r => (r.type || "QUANTITY") === "QUANTITY")) 
          : 0;

      // B. Process Promoters & Calculate Commission
      let totalCommission = 0;

      const promoters = Object.values(u.promotersMap).map(p => {
          // Channel Cost Points
          // Based on PROMOTER'S total order count (p.count)
          let channelCostPercentage = 0;
          let channelConfig = null;

          if (p.channelName) {
              channelConfig = channelConfigMap.get(p.channelName);
              if (channelConfig) {
                  channelCostPercentage = getPercentage(p.count, (channelConfig.rules as { type?: string; minCount: number; maxCount: number | null; percentage: number }[]).filter(r => (r.type || "QUANTITY") === "QUANTITY"));
              }
          }

          // Commission Formula: Revenue * (Account% - Channel%)
          // If Channel% > Account%, Commission = 0
          let effectiveRate = accountEffectivePercentage - channelCostPercentage;
          if (effectiveRate < 0) effectiveRate = 0;
          
          const commission = p.revenue * (effectiveRate / 100);
          totalCommission += commission;

          return {
              ...p,
              channelName: p.channelName || '无',
              channelCostPercentage,
              commission,
              rules: channelConfig?.rules || []
          };
      }).sort((a, b) => b.revenue - a.revenue);

      return {
          userId: u.userId,
          userName: u.userName,
          accountGroupName: accountGroup?.name || '无',
          orderCount: u.orderCount,
          totalRevenue: u.totalRevenue,
          refundedAmount: u.refundedAmount,
          accountEffectivePercentage,
          estimatedCommission: totalCommission,
          accountGroupRules: accountGroup?.rules || [],
          promoters
      };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);


  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">账号结算</h2>
      
      <StatsClient 
        userStats={userStats} 
        period={period}
        start={start}
        end={end}
      />
    </div>
  );
}
