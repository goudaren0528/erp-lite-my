import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { calculateOrderRevenue } from "@/lib/utils";
import { PromoterStatsClient } from "./promoter-stats-client";

type StatsOrder = {
  creatorId: string | null;
  creatorName: string | null;
  sourceContact: string;
  promoterId?: string | null;
  channelId?: string | null;
  orderNo: string;
  productName: string;
  variantName: string;
  rentPrice: number;
  standardPrice: number | null;
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

export default async function PromoterStatsPage(props: PageProps) {
  const currentUser = await getCurrentUser();
  const canAccess = currentUser?.role === 'ADMIN' || currentUser?.permissions?.includes('stats_promoters');
  
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
  // Maps for ID-based lookup
  const promoterIdMap = new Map(promoters.map(p => [p.id, p]));
  const channelConfigIdMap = new Map(channelConfigs.map(c => [c.id, c]));
  
  // Maps for Name-based fallback lookup
  const promoterNameMap = new Map(promoters.map(p => [p.name, p]));
  const channelConfigNameMap = new Map(channelConfigs.map(c => [c.name, c]));

  const getPercentage = (count: number, rules: { type?: string; minCount: number; maxCount: number | null; percentage: number }[]) => {
    const match = rules.find(r => count >= r.minCount && (r.maxCount === null || count <= r.maxCount));
    return match ? match.percentage : 0;
  };
  
  // 3. Aggregate Basic Stats by User First (to calculate commissions correctly per account)
  const userStatsMap: Record<string, {
    userId: string,
    userName: string,
    orderCount: number,
    totalRevenue: number,
    refundedAmount: number,
    promotersMap: Record<string, { 
      name: string, 
      count: number, 
      revenue: number, 
      refundedAmount: number, 
      channelName?: string,
      highTicketCommission: number,
      orders: {
        orderNo: string;
        productName: string;
        variantName: string;
        rentPrice: number;
        standardPrice: number;
        highTicketCommission: number;
        insurancePrice: number;
        overdueFee: number | null;
        extensionsTotal: number;
        orderRevenue: number;
        refundAmount: number;
        status: string;
        orderDate: string;
      }[];
    }>
  }> = {};
  
  const isInRange = (value?: Date | null) => {
    if (!dateRange) return true;
    if (!value) return false;
    return value >= dateRange.gte && value <= dateRange.lte;
  };

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
      const revenue = calculateOrderRevenue(order);
      const extensionsTotal = order.extensions?.reduce((acc, ext) => acc + (ext.price || 0), 0) || 0;
      
      const user = userMap.get(creatorId);
      const accountGroup = user?.accountGroup;
      const highTicketRate = accountGroup?.highTicketRate || 0;
      const standardPrice = order.standardPrice || 0;
      const highTicketBase = Math.max(0, (order.rentPrice || 0) - standardPrice);
      const highTicketCommission = highTicketBase * (highTicketRate / 100);

      // Determine Promoter and Channel using ID priority
      const promoterId = order.promoterId;
      let promoter = promoterId ? promoterIdMap.get(promoterId) : null;
      if (!promoter) {
        // Fallback to name
        promoter = promoterNameMap.get(order.sourceContact);
      }
      
      const promoterName = promoter ? promoter.name : (order.sourceContact || '未标记');
      const displayPromoterName = promoterName === 'OFFLINE' ? '线下' : promoterName;

      // Determine Channel Config
      let channelConfig: any = null;
      if (order.channelId) {
          channelConfig = channelConfigIdMap.get(order.channelId);
      }
      if (!channelConfig && promoter) {
          if (promoter.channelConfigId) {
             channelConfig = channelConfigIdMap.get(promoter.channelConfigId);
          } else if (promoter.channel) {
             channelConfig = channelConfigNameMap.get(promoter.channel);
          }
      }
      if (!channelConfig && !promoter) {
           // Fallback for orders without promoter but with sourceContact name that matches a channel (rare legacy case?)
           // Or just try to find channel by name from sourceContact? (Unlikely but possible if sourceContact IS channel name)
      }

      const channelName = channelConfig?.name || undefined;

      const settlementByCompleted = channelConfig?.settlementByCompleted ?? true;
      const includeOrder = settlementByCompleted
        ? order.status === 'COMPLETED' && isInRange(order.completedAt)
        : isInRange(order.createdAt);

      if (!includeOrder) {
        return;
      }

      const isSelfPromoter = promoterName === 'self';

      if (order.status === 'CLOSED') {
          stats.refundedAmount += revenue;
      } else {
          stats.orderCount++;
          stats.totalRevenue += revenue;
      }

      if (isSelfPromoter) {
          return;
      }

      if (!stats.promotersMap[displayPromoterName]) {
          stats.promotersMap[displayPromoterName] = {
              name: displayPromoterName,
              count: 0,
              revenue: 0,
              refundedAmount: 0,
              channelName: channelName || undefined,
              highTicketCommission: 0,
              orders: []
          };
      }
      
      const promoterStats = stats.promotersMap[displayPromoterName];
      promoterStats.orders.push({
          orderNo: order.orderNo,
          productName: order.productName,
          variantName: order.variantName,
          rentPrice: order.rentPrice,
          standardPrice,
          highTicketCommission,
          insurancePrice: order.insurancePrice,
          overdueFee: order.overdueFee,
          extensionsTotal,
          orderRevenue: revenue,
          refundAmount: order.status === 'CLOSED' ? revenue : 0,
          status: order.status,
          orderDate: order.createdAt.toISOString()
      });

      if (order.status === 'CLOSED') {
          promoterStats.refundedAmount += revenue;
      } else {
          promoterStats.count++;
          promoterStats.revenue += revenue;
          promoterStats.highTicketCommission += highTicketCommission;
      }
  });

  // 4. Calculate Commission per User-Promoter Pair and Aggregate by Promoter
  const promoterAggMap = new Map<string, {
      name: string;
      channelName: string;
      orderCount: number;
      totalRevenue: number;
      refundedAmount: number;
      accountEffectivePercentageSum: number;
      accountEffectivePercentageCount: number;
      accountGroupRules: any[];
      accountGroupOrderCount: number;
      commission: number;
      highTicketCommission: number;
      highTicketRates: Set<number>;
      details: {
        userId: string;
        userName: string;
        accountGroupName: string;
        orderCount: number;
        revenue: number;
        refundedAmount: number;
        accountEffectivePercentage: number;
        channelCostPercentage: number;
        commission: number;
        highTicketCommission: number;
        accountGroupRules: any[];
        channelRules: any[];
      }[];
      orders: {
        orderNo: string;
        productName: string;
        variantName: string;
        rentPrice: number;
        standardPrice: number;
        highTicketCommission: number;
        insurancePrice: number;
        overdueFee: number | null;
        extensionsTotal: number;
        orderRevenue: number;
        refundAmount: number;
        status: string;
        orderDate: string;
        userName: string;
        accountEffectivePercentage: number;
        channelCostPercentage: number;
        accountGroupRules: any[];
        channelRules: any[];
      }[];
  }>();

  Object.values(userStatsMap).forEach(u => {
      const user = userMap.get(u.userId);
      const accountGroup = user?.accountGroup;
      
      const accountEffectivePercentage = accountGroup 
          ? getPercentage(u.orderCount, (accountGroup.rules as any[]).filter(r => (r.type || "QUANTITY") === "QUANTITY" && (r.target || "USER") === "USER" && !r.channelConfigId)) 
          : 0;

      Object.values(u.promotersMap).forEach(p => {
          let promoterRate = 0;
          let channelConfig: typeof channelConfigs[0] | undefined | null = null;
          let specificRules: any[] = [];

          if (p.channelName) {
              channelConfig = channelConfigNameMap.get(p.channelName);
              if (channelConfig && accountGroup) {
                  const currentChannelConfig = channelConfig;
                  // Find promoter rules defined in the Account Group for this Channel
                  specificRules = accountGroup.rules.filter((r: any) => 
                      r.channelConfigId === currentChannelConfig.id && 
                      r.target === 'PROMOTER'
                  );
                  promoterRate = getPercentage(p.count, specificRules);
              }
          }

          const commission = p.revenue * (promoterRate / 100);

          // Aggregate
          if (!promoterAggMap.has(p.name)) {
              promoterAggMap.set(p.name, {
                  name: p.name,
                  channelName: p.channelName || '无',
                  orderCount: 0,
                  totalRevenue: 0,
                  refundedAmount: 0,
                  accountEffectivePercentageSum: 0,
                  accountEffectivePercentageCount: 0,
                  accountGroupRules: [],
                  accountGroupOrderCount: 0,
                  commission: 0,
                  highTicketCommission: 0,
                  highTicketRates: new Set(),
                  details: [],
                  orders: []
              });
          }
          const agg = promoterAggMap.get(p.name)!;
          agg.orderCount += p.count;
          agg.totalRevenue += p.revenue;
          agg.refundedAmount += p.refundedAmount;
          agg.commission += commission;
          agg.highTicketCommission += p.highTicketCommission;
          if (accountGroup?.highTicketRate) {
            agg.highTicketRates.add(accountGroup.highTicketRate);
          }
          agg.accountEffectivePercentageSum += accountEffectivePercentage * p.count;
          agg.accountEffectivePercentageCount += p.count;
          if (p.count >= agg.accountGroupOrderCount) {
              agg.accountGroupOrderCount = p.count;
              agg.accountGroupRules = accountGroup?.rules || [];
          }
          agg.details.push({
              userId: u.userId,
              userName: u.userName,
              accountGroupName: accountGroup?.name || '无',
              orderCount: p.count,
              revenue: p.revenue,
              refundedAmount: p.refundedAmount,
              accountEffectivePercentage,
              channelCostPercentage: promoterRate, // Renaming for consistency, but this is Promoter Rate
              commission,
              highTicketCommission: p.highTicketCommission,
              accountGroupRules: accountGroup?.rules || [],
              channelRules: specificRules // Store the specific promoter rules here
          });
          p.orders.forEach(orderItem => {
              agg.orders.push({
                  ...orderItem,
                  userName: u.userName,
                  accountEffectivePercentage,
                  channelCostPercentage: promoterRate,
                  accountGroupRules: accountGroup?.rules || [],
                  channelRules: specificRules
              });
          });
          
          // Update channel name if missing (first win or last win)
          if (agg.channelName === '无' && p.channelName) {
              agg.channelName = p.channelName;
          }
      });
  });

  const promoterStats = Array.from(promoterAggMap.values())
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .map(p => {
        // Calculate weighted average rate for display if needed, or just use the first one if consistent
        // For the summary table, we can calculate an "Effective Average Rate" = Total Commission / Total Revenue
        const effectiveAverageRate = p.totalRevenue > 0 ? (p.commission / p.totalRevenue) * 100 : 0;

        return {
          ...p,
          highTicketRate: p.highTicketRates.size > 0 ? Math.max(...Array.from(p.highTicketRates)) : 0,
          accountEffectivePercentage: p.accountEffectivePercentageCount
            ? p.accountEffectivePercentageSum / p.accountEffectivePercentageCount
            : 0,
          channelEffectivePercentage: effectiveAverageRate,
          channelRules: [], // We won't use this for hover anymore, we'll use details
          netIncome: p.totalRevenue - p.commission // For promoter, net income is just commission? No, the page says "Net Income" = Revenue - Commission (Platform income). 
          // Wait, the previous code was: netIncome: p.totalRevenue - p.commission. 
          // If this page is for "Promoter Stats" from the platform perspective, then Net Income = Revenue - Payout. Correct.
        };
    });

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">推广员结算</h2>
      
      <PromoterStatsClient 
        promoterStats={promoterStats} 
        period={period}
        start={start}
        end={end}
      />
    </div>
  );
}
