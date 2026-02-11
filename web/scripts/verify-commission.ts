
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type RawStat = {
    creatorId: string | null;
    source: string | null;
    promoterId: string | null;
    channelId: string | null;
    promoterName: string | null;
    orderCount: number | string;
    totalRevenue: number | string;
    refundedAmount: number | string;
    highTicketBase: number | string;
};

type Rule = {
    target?: string | null;
    channelConfigId?: string | null;
    minCount?: number | null;
    maxCount?: number | null;
    percentage?: number | null;
};

type PromoterStat = {
    name: string;
    count: number;
    revenue: number;
    highTicketBase: number;
};

async function main() {
    console.log('Verifying commission for 吴慧云...');

    const user = await prisma.user.findFirst({
        where: { name: '吴慧云' },
        include: {
            accountGroup: {
                include: {
                    rules: {
                        orderBy: { minCount: 'asc' }
                    }
                }
            }
        }
    });

    if (!user) {
        console.error('User 吴慧云 not found');
        return;
    }

    console.log(`Found User: ${user.name} (${user.id})`);
    console.log(`Account Group: ${user.accountGroup?.name}`);

    const [channelConfigs, promoters] = await Promise.all([
        prisma.channelConfig.findMany(),
        prisma.promoter.findMany()
    ]);

    // Build Maps
    const promoterIdMap = new Map<string, { name: string, channelId: string | null }>();
    promoters.forEach(p => {
        promoterIdMap.set(p.id, { name: p.name, channelId: p.channelConfigId });
    });

    const promoterNameMap = new Map<string, string>();
    promoters.forEach(p => {
        const config = channelConfigs.find(c => c.name === p.channel);
        if (config) {
            promoterNameMap.set(p.name, config.id);
        }
    });

    const channelIdToName = new Map(channelConfigs.map(c => [c.id, c.name]));
    const promoterNames = new Set(promoters.map(p => p.name));

    // Raw SQL Query (Simplified for this user and cumulative period)
    const rawStats = await prisma.$queryRaw<RawStat[]>`
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
        WHERE o."creatorId" = ${user.id}
        GROUP BY o."creatorId", o.source, o."promoterId", o."channelId", o."sourceContact"
    `;

    // Process Stats
    let totalOrderCount = 0;
    let totalRevenue = 0;
    let totalHighTicketBase = 0;

    // First pass to get totals
    rawStats.forEach((stat) => {
        const orderCount = Number(stat.orderCount || 0);
        const revenue = Number(stat.totalRevenue || 0);
        const highTicketBase = Number(stat.highTicketBase || 0);
        
        if (orderCount > 0) {
            totalOrderCount += orderCount;
            totalRevenue += revenue;
            totalHighTicketBase += highTicketBase;
        }
    });

    console.log(`Total Orders: ${totalOrderCount}`);
    console.log(`Total Revenue: ${totalRevenue}`);
    console.log(`Total High Ticket Base: ${totalHighTicketBase}`);

    // Rules
    const groupRules = user.accountGroup?.rules || [];
    const highTicketRate = user.accountGroup?.highTicketRate || 0;
    
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

    const getPercentage = (count: number, rules: Rule[]) => {
        if (!rules || rules.length === 0) return 0;
        const rule = rules.find(r => count >= (r.minCount ?? 0) && (r.maxCount === null || r.maxCount === undefined || count <= r.maxCount));
        return rule ? (rule.percentage ?? 0) : 0;
    };

    const effectiveBaseRate = getPercentage(totalOrderCount, defaultUserRules);
    console.log(`Effective Base Rate: ${effectiveBaseRate}%`);
    console.log(`High Ticket Rate: ${highTicketRate}%`);

    // Second pass to calculate commissions
    let totalVolumeGradientCommission = 0;
    let totalChannelCommission = 0; // Subordinate
    let totalHighTicketCommission = 0;
    let totalPeerCommission = 0;
    let totalAgentCommission = 0;
    let totalEmployeeCommission = 0;

    // Group by Channel to match page.tsx logic
    const channelsMap = new Map<string, {
        channelId: string,
        channelName: string,
        promoters: PromoterStat[]
    }>();

    rawStats.forEach((stat) => {
        const orderCount = Number(stat.orderCount || 0);
        const revenue = Number(stat.totalRevenue || 0);
        const highTicketBase = Number(stat.highTicketBase || 0);

        if (orderCount === 0) return;

        let channelId = stat.channelId;
        const pId = stat.promoterId;
        const promoterName = stat.promoterName || '未标记';

        if (!channelId && pId && promoterIdMap.has(pId)) {
            channelId = promoterIdMap.get(pId)!.channelId;
        }
        if (!channelId) {
            channelId = promoterNameMap.get(promoterName) || null;
        }

        const channelName = channelId ? channelIdToName.get(channelId) : undefined;
        
        const safeChannelId = channelId || 'default'; 
        const safeChannelName = channelName || (promoterName === 'self' ? '自主开发' : promoterName);

        if (!channelsMap.has(safeChannelId)) {
            channelsMap.set(safeChannelId, {
                channelId: safeChannelId,
                channelName: safeChannelName,
                promoters: []
            });
        }

        const displayPromoterName = (pId && promoterIdMap.has(pId)) 
            ? promoterIdMap.get(pId)!.name 
            : promoterName;

        channelsMap.get(safeChannelId)!.promoters.push({
            name: displayPromoterName,
            count: orderCount,
            revenue: revenue,
            highTicketBase: highTicketBase
        });
    });

    console.log('\n--- Breakdown by Channel ---');

    channelsMap.forEach((cStats) => {
        const channelUserRules = cStats.channelId !== 'default' && channelUserRulesMap.has(cStats.channelId)
            ? channelUserRulesMap.get(cStats.channelId)!
            : [];
        const channelEffectiveRate = channelUserRules.length > 0
            ? getPercentage(totalOrderCount, channelUserRules)
            : effectiveBaseRate;

        let channelVolumeGradient = 0;
        let channelSubordinate = 0;
        let channelHighTicket = 0;

        cStats.promoters.forEach(pStats => {
            const isPromoter = promoterNames.has(pStats.name);
            
            const employeeRateForOrder = isPromoter ? channelEffectiveRate : effectiveBaseRate;
            const pEmployeeCommission = pStats.revenue * (employeeRateForOrder / 100);

            let pHighTicketCommission = 0;
            if (cStats.channelId === 'default' && !isPromoter) {
                pHighTicketCommission = pStats.highTicketBase * (highTicketRate / 100);
            }

            if (isPromoter) {
                channelSubordinate += pEmployeeCommission;
            } else {
                channelVolumeGradient += pEmployeeCommission;
            }
            channelHighTicket += pHighTicketCommission;
        });

        const calculatedEmployee = channelVolumeGradient + channelSubordinate + channelHighTicket;
        
        console.log(`Channel: ${cStats.channelName}`);
        console.log(`  Volume Gradient: ${channelVolumeGradient.toFixed(2)}`);
        console.log(`  Subordinate (Channel): ${channelSubordinate.toFixed(2)}`);
        console.log(`  High Ticket: ${channelHighTicket.toFixed(2)}`);
        console.log(`  Total Employee: ${calculatedEmployee.toFixed(2)}`);

        totalVolumeGradientCommission += channelVolumeGradient;
        totalChannelCommission += channelSubordinate;
        totalHighTicketCommission += channelHighTicket;
        totalEmployeeCommission += calculatedEmployee;

        if (channelSubordinate > 0) {
            if (cStats.channelName.includes('同行')) {
                totalPeerCommission += channelSubordinate;
            } else {
                totalAgentCommission += channelSubordinate;
            }
        }
    });

    console.log('\n--- Final Totals ---');
    console.log(`Volume Gradient Commission: ${totalVolumeGradientCommission.toFixed(2)}`);
    console.log(`Channel Commission (Total): ${totalChannelCommission.toFixed(2)}`);
    console.log(`  - Peer Commission: ${totalPeerCommission.toFixed(2)}`);
    console.log(`  - Agent Commission: ${totalAgentCommission.toFixed(2)}`);
    console.log(`High Ticket Commission: ${totalHighTicketCommission.toFixed(2)}`);
    console.log(`Employee Total Commission: ${totalEmployeeCommission.toFixed(2)}`);
    
    const sumCheck = totalVolumeGradientCommission + totalChannelCommission + totalHighTicketCommission;
    console.log(`Sum Check (Vol + Chan + High): ${sumCheck.toFixed(2)}`);
    
    if (Math.abs(sumCheck - totalEmployeeCommission) < 0.01) {
        console.log('✅ Sum matches Total Employee Commission');
    } else {
        console.log('❌ Sum MISMATCH');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
