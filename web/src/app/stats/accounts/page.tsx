import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { StatsClient } from "./stats-client";

type Rule = {
  minCount: number
  maxCount: number | null
  percentage: number
  target?: string
  channelConfigId?: string | null
}

type UserWithGroup = {
  id: string
  name: string | null
  username: string | null
  accountGroupId: string | null
  accountGroup?: {
    name: string
    rules: Rule[]
    highTicketRate?: number | null
    settlementByCompleted?: boolean | null
  } | null
}

type RawStat = {
  creatorId: string | null
  source?: string | null
  promoterId?: string | null
  channelId?: string | null
  promoterName?: string | null
  orderCount: number | string
  totalRevenue: number | string
  refundedAmount: number | string
  highTicketBase: number | string
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

  // 1. Fetch Users and Configs first (needed for raw sql logic? No, logic is in SQL)
  // Actually we need users to map the results back.
  const [users, channelConfigs, promoters] = await Promise.all([
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

  // Execute Raw SQL for Aggregation
  let rawStats: RawStat[] = [];
  
  if (!invalidRange) {
      const startDate = dateRange ? dateRange.gte : new Date('2000-01-01'); // Default far past if cumulative
      const endDate = dateRange ? dateRange.lte : new Date('2100-01-01');   // Default far future
      
      // Permission Filter
      const userFilter = canViewAllOrders ? '1=1' : `o."creatorId" = '${currentUser?.id}'`;
      
      // Date/Status Filter Logic (mimics code logic)
      // If dateRange is null (cumulative), we still need valid SQL.
      // If cumulative, we generally include all relevant orders.
      // Existing code: if !dateRange return true (include all).
      
      const dateCondition = dateRange 
          ? `
            CASE 
                WHEN COALESCE(ag."settlementByCompleted", true) = true THEN 
                    (o.status = 'COMPLETED' AND o."completedAt" >= to_timestamp(${startDate.getTime()} / 1000.0) AND o."completedAt" <= to_timestamp(${endDate.getTime()} / 1000.0))
                ELSE
                    (o."createdAt" >= to_timestamp(${startDate.getTime()} / 1000.0) AND o."createdAt" <= to_timestamp(${endDate.getTime()} / 1000.0))
            END
          `
          : '1=1';

      rawStats = await prisma.$queryRaw`
        WITH ExtensionSums AS (
            SELECT "orderId", SUM(price) as extTotal
            FROM "OrderExtension"
            GROUP BY "orderId"
        )
        SELECT
            o."creatorId",
            o.source,
            o."promoterId",
            o."channelId",
            o."sourceContact" as "promoterName",
            SUM(CASE WHEN o.status != 'CLOSED' THEN 1 ELSE 0 END) as "orderCount",
            SUM(CASE WHEN o.status != 'CLOSED' THEN (o."rentPrice" + o."insurancePrice" + COALESCE(o."overdueFee", 0) + COALESCE(es.extTotal, 0)) ELSE 0 END) as "totalRevenue",
            SUM(CASE WHEN o.status = 'CLOSED' THEN (o."rentPrice" + o."insurancePrice" + COALESCE(o."overdueFee", 0) + COALESCE(es.extTotal, 0)) ELSE 0 END) as "refundedAmount",
            SUM(CASE WHEN o.status != 'CLOSED' AND o."rentPrice" > o."standardPrice" THEN (o."rentPrice" - o."standardPrice") ELSE 0 END) as "highTicketBase"
        FROM "Order" o
        LEFT JOIN ExtensionSums es ON o.id = es."orderId"
        LEFT JOIN "User" u ON o."creatorId" = u.id
        LEFT JOIN "AccountGroup" ag ON u."accountGroupId" = ag.id
        WHERE ${Prisma.raw(userFilter)} AND ${Prisma.raw(dateCondition)}
        GROUP BY o."creatorId", o.source, o."promoterId", o."channelId", o."sourceContact"
      `;
  }


  // 2. Build Lookup Maps
  const userMap = new Map(users.map(u => [u.id, u]));
  // Promoter ID -> Name, Channel ID
  const promoterIdMap = new Map<string, { name: string, channelId: string | null }>();
  promoters.forEach(p => {
    promoterIdMap.set(p.id, { name: p.name, channelId: p.channelConfigId });
  });

  // Legacy Name Map (Fallback)
  const promoterNameMap = new Map<string, string>();
  promoters.forEach(p => {
    const config = channelConfigs.find(c => c.name === p.channel);
    if (config) {
      promoterNameMap.set(p.name, config.id);
    }
  });

  // Channel Config Map (ID -> Name)
  const channelIdToName = new Map(channelConfigs.map(c => [c.id, c.name]));
  const channelNameToId = new Map(channelConfigs.map(c => [c.name, c.id]));

  const promoterNames = new Set(promoters.map(p => p.name));

  // Helper: Get Commission Percentage
  const getPercentage = (count: number, rules: Rule[]) => {
    if (!rules || rules.length === 0) return 0;
    const rule = rules.find(r => count >= r.minCount && (r.maxCount === null || count <= r.maxCount));
    return rule ? rule.percentage : 0;
  };

  // 3. Process Data
  const accountGroupsMap = new Map<string, {
    id: string,
    name: string,
    users: Map<string, {
      user: UserWithGroup,
      totalOrderCount: number,
      totalRevenue: number,
      refundedAmount: number,
      highTicketBase: number,
      channels: Map<string, {
        channelId: string,
        channelName: string,
        orderCount: number,
        revenue: number,
        highTicketBase: number,
        promoters: Map<string, {
            name: string,
            count: number,
            revenue: number,
            highTicketBase: number
        }>
      }>,
      orders: any[]
    }>
  }>();

  // 3.1 Aggregate Raw Stats
  rawStats.forEach((stat) => {
      const creatorId = stat.creatorId || 'unknown';
      const promoterName = stat.promoterName || '未标记';
      // const source = stat.source; // Not used in existing logic, relying on promoterName

      const orderCount = Number(stat.orderCount || 0);
      const revenue = Number(stat.totalRevenue || 0);
      const refund = Number(stat.refundedAmount || 0);
      const highTicketBase = Number(stat.highTicketBase || 0);

      const user = userMap.get(creatorId);
      
      const groupId = user?.accountGroupId || 'ungrouped';
      const groupName = user?.accountGroup?.name || '未分组';
      
      if (!accountGroupsMap.has(groupId)) {
          accountGroupsMap.set(groupId, { id: groupId, name: groupName, users: new Map() });
      }
      const group = accountGroupsMap.get(groupId)!;

      if (!group.users.has(creatorId)) {
            const fallbackUser: UserWithGroup = {
                id: creatorId,
                name: 'Unknown',
                username: 'Unknown',
                accountGroupId: null,
                accountGroup: null
            };
            group.users.set(creatorId, {
                user: user || fallbackUser,
                totalOrderCount: 0,
                totalRevenue: 0,
              refundedAmount: 0,
              highTicketBase: 0,
              channels: new Map(),
              orders: [] // Empty by default (Server Side Pagination)
          });
      }
      const userStats = group.users.get(creatorId)!;

      // Add Refund (CLOSED orders)
      userStats.refundedAmount += refund;

      // Add Revenue/Count (Non-CLOSED orders)
      if (orderCount > 0) {
          userStats.totalOrderCount += orderCount;
          userStats.totalRevenue += revenue;
          userStats.highTicketBase += highTicketBase;

          let channelId = stat.channelId;
          const pId = stat.promoterId;
          
          // If channelId is missing, try to find it via Promoter ID
          if (!channelId && pId && promoterIdMap.has(pId)) {
              channelId = promoterIdMap.get(pId)!.channelId;
          }

          // Legacy Fallback: try to find via Promoter Name
          if (!channelId) {
             channelId = promoterNameMap.get(promoterName);
          }

          const channelName = channelId ? channelIdToName.get(channelId) : undefined;

          if (!channelId) {
             // Fallback: check if promoterName itself is a channel name
             const idByName = channelNameToId.get(promoterName);
             if (idByName) {
                 // channelName = promoterName; // Already matches
             }
          }
          
          const safeChannelId = channelId || 'default'; 
          const safeChannelName = channelName || (promoterName === 'self' ? '自主开发' : promoterName);

          if (!userStats.channels.has(safeChannelId)) {
              userStats.channels.set(safeChannelId, {
                  channelId: safeChannelId,
                  channelName: safeChannelName,
                  orderCount: 0,
                  revenue: 0,
                  highTicketBase: 0,
                  promoters: new Map()
              });
          }
          const channelStats = userStats.channels.get(safeChannelId)!;
          channelStats.orderCount += orderCount;
          channelStats.revenue += revenue;
          channelStats.highTicketBase += highTicketBase;

          // Use ID-based name if available to ensure consistency even if sourceContact was old name
          const displayPromoterName = (pId && promoterIdMap.has(pId)) 
              ? promoterIdMap.get(pId)!.name 
              : promoterName;

          if (!channelStats.promoters.has(displayPromoterName)) {
              channelStats.promoters.set(displayPromoterName, { name: displayPromoterName, count: 0, revenue: 0, highTicketBase: 0 });
          }
          const promoterStats = channelStats.promoters.get(displayPromoterName)!;
          promoterStats.count += orderCount;
          promoterStats.revenue += revenue;
          promoterStats.highTicketBase += highTicketBase;
      }
  });


  // 4. Flatten Data for Client
  const allStats: {
    accountGroupId: string;
    accountGroupName: string;
    highTicketRate: number;
    userId: string;
    userName: string;
    totalOrderCount: number;
    totalRevenue: number;
    refundedAmount: number;
    estimatedEmployeeCommission: number;
    volumeGradientCommission: number;
    channelCommission: number;
    peerCommission: number;
    agentCommission: number;
    highTicketCommission: number;
    estimatedPromoterCommission: number;
    effectiveBaseRate: number;
    defaultUserRules: Rule[];
    channels: Array<{
      channelId: string;
      channelName: string;
      orderCount: number;
      revenue: number;
      highTicketBase: number;
      employeeRate: number;
      employeeCommission: number;
      volumeGradientCommission: number;
      subordinateCommission: number;
      highTicketCommission: number;
      promoters: Array<{
        name: string;
        count: number;
        revenue: number;
        highTicketBase: number;
        rate: number;
        commission: number;
        isPromoter: boolean;
        accountRate: number;
        accountCommission: number;
        highTicketCommission: number;
      }>;
    }>;
    orders: any[];
  }[] = [];
  const accountGroups: { id: string; name: string }[] = [];

  Array.from(accountGroupsMap.values()).forEach(group => {
      accountGroups.push({ id: group.id, name: group.name });
      
      // Get rules from one of the users in the group (assuming consistent rules per group)
      // Actually we should look up the group definition from DB, but we have it via users include
      const groupData = users.find(u => u.accountGroupId === group.id)?.accountGroup;
      const groupRules = groupData?.rules || [];
      const highTicketRate = groupData?.highTicketRate || 0;
      
      const defaultUserRules = groupRules.filter((r: Rule) => r.target === 'USER' && !r.channelConfigId);
      const channelUserRulesMap = new Map<string, Rule[]>();
      const channelPromoterRulesMap = new Map<string, Rule[]>();

      groupRules.forEach((r: Rule) => {
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
          let totalPeerCommission = 0;
          let totalAgentCommission = 0;
          let totalHighTicketCommission = 0;

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
              let channelHighTicketCommission = 0;

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
                  
                  // High Ticket Commission Calculation
                  // Only for Retail (default channel) orders
                  let pHighTicketCommission = 0;
                  if (cStats.channelId === 'default' && !isPromoter) {
                      pHighTicketCommission = pStats.highTicketBase * (highTicketRate / 100);
                  }
                  channelHighTicketCommission += pHighTicketCommission;

                  // Volume Gradient applies to Direct/Non-Promoter orders
                  // Channel Commission applies to Promoter orders
                  // Total Employee Commission = Volume Gradient + Channel Commission + High Ticket Commission
                  
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
                      accountCommission: pEmployeeCommission,
                      highTicketCommission: pHighTicketCommission
                  };
            });
            
            // Recalculate employeeCommission based on the sum of its parts to ensure strict equality
            // and avoid any floating point discrepancies or logic mismatch
            const calculatedEmployeeCommission = channelVolumeGradientCommission + channelSubordinateCommission + channelHighTicketCommission;

            totalPromoterCommission += channelPromoterCommission;
            totalVolumeGradientCommission += channelVolumeGradientCommission;
            totalChannelCommission += channelSubordinateCommission;
            totalHighTicketCommission += channelHighTicketCommission;
            
            // Split Channel Commission into Peer and Agent
            if (channelSubordinateCommission > 0) {
                if (cStats.channelName.includes('同行')) {
                    totalPeerCommission += channelSubordinateCommission;
                } else {
                    totalAgentCommission += channelSubordinateCommission;
                }
            }

            totalEmployeeCommission += calculatedEmployeeCommission;

            return {
                ...cStats,
                employeeRate,
                employeeCommission: calculatedEmployeeCommission,
                volumeGradientCommission: channelVolumeGradientCommission,
                subordinateCommission: channelSubordinateCommission,
                highTicketCommission: channelHighTicketCommission,
                promoters: promotersDetails
            };
        });

          allStats.push({
              accountGroupId: group.id,
              accountGroupName: group.name,
              highTicketRate,
              userId: uStats.user.id,
              userName: uStats.user.name ?? uStats.user.username ?? "未知用户",
              totalOrderCount: uStats.totalOrderCount,
              totalRevenue: uStats.totalRevenue,
              refundedAmount: uStats.refundedAmount,
              estimatedEmployeeCommission: totalEmployeeCommission,
              volumeGradientCommission: totalVolumeGradientCommission,
              channelCommission: totalChannelCommission,
              peerCommission: totalPeerCommission,
              agentCommission: totalAgentCommission,
              highTicketCommission: totalHighTicketCommission,
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
