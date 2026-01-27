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
    prisma.channelConfig.findMany(),
    prisma.promoter.findMany()
  ]);

  // 2. Build Lookup Maps
  const userMap = new Map(users.map(u => [u.id, u]));
  // Promoter Name -> Channel Config ID
  const promoterMap = new Map<string, string>();
  promoters.forEach(p => {
    const config = channelConfigs.find(c => c.name === p.channel);
    if (config) {
      promoterMap.set(p.name, config.id);
    }
  });

  // Channel Config Map (ID -> Name)
  const channelIdToName = new Map(channelConfigs.map(c => [c.id, c.name]));
  const channelNameToId = new Map(channelConfigs.map(c => [c.name, c.id]));

  const promoterNames = new Set(promoters.map(p => p.name));

  // Helper: Get Commission Percentage
  const getPercentage = (count: number, rules: any[]) => {
    if (!rules || rules.length === 0) return 0;
    const rule = rules.find(r => count >= r.minCount && (r.maxCount === null || count <= r.maxCount));
    return rule ? rule.percentage : 0;
  };

  // 3. Process Data
  const accountGroupsMap = new Map<string, {
    id: string,
    name: string,
    users: Map<string, {
      user: any,
      totalOrderCount: number,
      totalRevenue: number,
      refundedAmount: number,
      channels: Map<string, {
        channelId: string,
        channelName: string,
        orderCount: number,
        revenue: number,
        promoters: Map<string, {
            name: string,
            count: number,
            revenue: number
        }>
      }>,
      orders: any[]
    }>
  }>();

  const isInRange = (value?: Date | null) => {
    if (!dateRange) return true;
    if (!value) return false;
    return value >= dateRange.gte && value <= dateRange.lte;
  };

  // 3.1 First Pass: Aggregate Orders by User & Channel
  ordersToAnalyze.forEach((order: StatsOrder) => {
      const creatorId = order.creatorId || 'unknown';
      const user = userMap.get(creatorId);
      
      const settlementByCompleted = user?.accountGroup?.settlementByCompleted ?? true;
      const includeOrder = settlementByCompleted
        ? order.status === 'COMPLETED' && isInRange(order.completedAt)
        : isInRange(order.createdAt);

      if (!includeOrder) return;

      const groupId = user?.accountGroupId || 'ungrouped';
      const groupName = user?.accountGroup?.name || '未分组';
      
      if (!accountGroupsMap.has(groupId)) {
          accountGroupsMap.set(groupId, { id: groupId, name: groupName, users: new Map() });
      }
      const group = accountGroupsMap.get(groupId)!;

      if (!group.users.has(creatorId)) {
          group.users.set(creatorId, {
              user: user || { id: creatorId, name: order.creatorName || 'Unknown', username: 'Unknown' },
              totalOrderCount: 0,
              totalRevenue: 0,
              refundedAmount: 0,
              channels: new Map(),
              orders: []
          });
      }
      const userStats = group.users.get(creatorId)!;
      const revenue = calculateOrderRevenue(order);

      if (order.status === 'CLOSED') {
          userStats.refundedAmount += revenue;
          userStats.orders.push({
              ...order,
              orderRevenue: revenue,
              refundAmount: revenue,
              promoterName: order.sourceContact || '未标记'
          });
      } else {
          userStats.totalOrderCount++;
          userStats.totalRevenue += revenue;
          userStats.orders.push({
              ...order,
              orderRevenue: revenue,
              refundAmount: 0,
              promoterName: order.sourceContact || '未标记'
          });

          const promoterName = order.sourceContact || '未标记';
          let channelId = promoterMap.get(promoterName);
          let channelName = channelId ? channelIdToName.get(channelId) : undefined;

          if (!channelId) {
             channelId = channelNameToId.get(promoterName);
             if (channelId) channelName = promoterName;
          }
          
          const safeChannelId = channelId || 'default'; 
          const safeChannelName = channelName || (promoterName === 'self' ? '自主开发' : promoterName);

          if (!userStats.channels.has(safeChannelId)) {
              userStats.channels.set(safeChannelId, {
                  channelId: safeChannelId,
                  channelName: safeChannelName,
                  orderCount: 0,
                  revenue: 0,
                  promoters: new Map()
              });
          }
          const channelStats = userStats.channels.get(safeChannelId)!;
          channelStats.orderCount++;
          channelStats.revenue += revenue;

          if (!channelStats.promoters.has(promoterName)) {
              channelStats.promoters.set(promoterName, { name: promoterName, count: 0, revenue: 0 });
          }
          const promoterStats = channelStats.promoters.get(promoterName)!;
          promoterStats.count++;
          promoterStats.revenue += revenue;
      }
  });

  // 4. Flatten Data for Client
  const allStats: any[] = [];
  const accountGroups: { id: string; name: string }[] = [];

  Array.from(accountGroupsMap.values()).forEach(group => {
      accountGroups.push({ id: group.id, name: group.name });
      
      // Get rules from one of the users in the group (assuming consistent rules per group)
      // Actually we should look up the group definition from DB, but we have it via users include
      const groupRules = users.find(u => u.accountGroupId === group.id)?.accountGroup?.rules || [];
      
      const defaultUserRules = groupRules.filter((r: any) => r.target === 'USER' && !r.channelConfigId);
      const channelUserRulesMap = new Map<string, any[]>();
      const channelPromoterRulesMap = new Map<string, any[]>();

      groupRules.forEach((r: any) => {
          if (r.channelConfigId) {
              if (r.target === 'PROMOTER') {
                  if (!channelPromoterRulesMap.has(r.channelConfigId)) channelPromoterRulesMap.set(r.channelConfigId, []);
                  channelPromoterRulesMap.get(r.channelConfigId)!.push(r);
              } else {
                  if (!channelUserRulesMap.has(r.channelConfigId)) channelUserRulesMap.set(r.channelConfigId, []);
                  channelUserRulesMap.get(r.channelConfigId)!.push(r);
              }
          }
      });

      Array.from(group.users.values()).forEach(uStats => {
          let totalEmployeeCommission = 0;
          let totalPromoterCommission = 0;
          let totalVolumeGradientCommission = 0;
          let totalChannelCommission = 0;

          const effectiveBaseRate = getPercentage(uStats.totalOrderCount, defaultUserRules);

          const channelsDetails = Array.from(uStats.channels.values()).map(cStats => {
                const channelUserRules = cStats.channelId !== 'default' && channelUserRulesMap.has(cStats.channelId)
                    ? channelUserRulesMap.get(cStats.channelId)!
                    : [];
                const channelEffectiveRate = channelUserRules.length > 0
                    ? getPercentage(uStats.totalOrderCount, channelUserRules)
                    : effectiveBaseRate;
                const employeeRate = channelEffectiveRate;

              let channelPromoterCommission = 0;
              let channelVolumeGradientCommission = 0;
              let channelSubordinateCommission = 0;

              const promotersDetails = Array.from(cStats.promoters.values()).map(pStats => {
                  const promoterRules = cStats.channelId !== 'default' && channelPromoterRulesMap.has(cStats.channelId)
                      ? channelPromoterRulesMap.get(cStats.channelId)!
                      : [];
                  
                  const promoterRate = getPercentage(pStats.count, promoterRules);
                  const pCommission = pStats.revenue * (promoterRate / 100);
                  channelPromoterCommission += pCommission;

                  const isPromoter = promoterNames.has(pStats.name);

                  // Split Employee Commission Source
                  const employeeRateForOrder = isPromoter ? channelEffectiveRate : effectiveBaseRate;
                  const pEmployeeCommission = pStats.revenue * (employeeRateForOrder / 100);
                  
                  // Volume Gradient applies to Direct/Non-Promoter orders
                // Channel Commission applies to Promoter orders
                // Total Employee Commission = Volume Gradient + Channel Commission
                
                if (isPromoter) {
                    channelSubordinateCommission += pEmployeeCommission;
                } else {
                    channelVolumeGradientCommission += pEmployeeCommission;
                }

                return {
                    ...pStats,
                    rate: promoterRate,
                    commission: pCommission,
                    isPromoter,
                    accountRate: employeeRateForOrder,
                    accountCommission: pEmployeeCommission
                };
            });
            
            // Recalculate employeeCommission based on the sum of its parts to ensure strict equality
            // and avoid any floating point discrepancies or logic mismatch
            const calculatedEmployeeCommission = channelVolumeGradientCommission + channelSubordinateCommission;

            totalPromoterCommission += channelPromoterCommission;
            totalVolumeGradientCommission += channelVolumeGradientCommission;
            totalChannelCommission += channelSubordinateCommission;
            totalEmployeeCommission += calculatedEmployeeCommission;

            return {
                ...cStats,
                employeeRate,
                employeeCommission: calculatedEmployeeCommission,
                volumeGradientCommission: channelVolumeGradientCommission,
                subordinateCommission: channelSubordinateCommission,
                promoters: promotersDetails
            };
        });

          allStats.push({
              accountGroupId: group.id,
              accountGroupName: group.name,
              userId: uStats.user.id,
              userName: uStats.user.name || uStats.user.username,
              totalOrderCount: uStats.totalOrderCount,
              totalRevenue: uStats.totalRevenue,
              refundedAmount: uStats.refundedAmount,
              estimatedEmployeeCommission: totalEmployeeCommission,
              volumeGradientCommission: totalVolumeGradientCommission,
              channelCommission: totalChannelCommission,
              estimatedPromoterCommission: totalPromoterCommission,
              effectiveBaseRate,
              defaultUserRules,
              channels: channelsDetails,
              orders: uStats.orders
          });
      });
  });

  // Sort by Account Group Name, then Revenue Desc
  allStats.sort((a, b) => {
      if (a.accountGroupName !== b.accountGroupName) {
          return a.accountGroupName.localeCompare(b.accountGroupName);
      }
      return b.totalRevenue - a.totalRevenue;
  });

  accountGroups.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">账号结算统计</h2>
      
      <StatsClient 
        allStats={allStats}
        accountGroups={accountGroups}
        period={period}
        start={start}
        end={end}
      />
    </div>
  );
}
