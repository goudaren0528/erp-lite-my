"use server"

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { calculateOrderRevenue } from "@/lib/utils";

export async function fetchAccountOrders(params: {
    userId: string;
    channelName?: string;
    promoterName?: string;
    period: string;
    start?: string;
    end?: string;
    page: number;
    pageSize: number;
}) {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new Error("Unauthorized");
    }

    const { userId, channelName: rawChannelName, promoterName: rawPromoterName, period, start, end, page, pageSize } = params;

    const channelName = rawChannelName?.trim();
    const promoterName = rawPromoterName?.trim();

    // Determine Date Range
    let dateRange: { gte: Date; lte: Date } | null = null;
    if (period === 'monthly') {
        const now = new Date();
        const date = start ? new Date(start) : now;
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        firstDay.setHours(0, 0, 0, 0);
        lastDay.setHours(23, 59, 59, 999);
        dateRange = { gte: firstDay, lte: lastDay };
    } else if (period === 'custom' && start && end) {
        const firstDay = new Date(start);
        const lastDay = new Date(end);
        firstDay.setHours(0, 0, 0, 0);
        lastDay.setHours(23, 59, 59, 999);
        dateRange = { gte: firstDay, lte: lastDay };
    }

    // Determine Filtering Logic (Settlement Mode)
    // We need to fetch the user's account group settings to know if we filter by createdAt or completedAt
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { accountGroup: true }
    });

    const settlementByCompleted = user?.accountGroup?.settlementByCompleted ?? true;
    
    const where: any = {
        creatorId: userId,
    };

    if (channelName) {
        // Channel filtering logic needs to match what was done in page.tsx
        // But wait, order doesn't have channelName directly. It has source/sourceContact (Promoter).
        // The mapping is complex (Promoter -> Channel).
        // If the user asks for orders for a specific channel, we need to find all promoters belonging to that channel.
        // Or if the channel is "Retail", "Peer", etc.
        // This is getting complicated to replicate exactly in a simple query.
        
        // Alternative: The UI passes the list of promoters for this channel? No, that's too big.
        // Re-check schema: Promoter model has `channel` field.
        // So we can find all promoter names for this channel.
        if (channelName) {
             const promoters = await prisma.promoter.findMany({
                 where: { channel: channelName },
                 select: { name: true }
             });
             const promoterNames = promoters.map(p => p.name);
             
             // Also need to handle legacy/manual mapping if any?
             // For now, let's assume sourceContact matches promoter name.
             // If channel is one of the built-in types (PEER, etc) and not a Config Channel?
             // The logic in page.tsx maps orders to channels via promoters.
             
             if (promoterNames.length > 0) {
                 where.sourceContact = { in: promoterNames };
             } else {
                 // Maybe it's a direct channel?
                 // If no promoters found, maybe we shouldn't filter by promoter?
                 // But the user clicked on a specific channel row.
                 // Let's rely on promoterName if provided, which is more specific.
             }
        }
    }

    if (promoterName) {
        where.sourceContact = promoterName;
    }

    // Apply Date Filter
    if (dateRange) {
        if (settlementByCompleted) {
            where.status = 'COMPLETED';
            where.completedAt = dateRange;
        } else {
            where.createdAt = dateRange;
        }
    }

    // Fetch Orders
    const queryOptions: any = {
        where,
        include: { extensions: true },
        orderBy: { createdAt: 'desc' },
    };

    if (pageSize > 0) {
        queryOptions.skip = (page - 1) * pageSize;
        queryOptions.take = pageSize;
    }

    const [orders, totalCount] = await Promise.all([
        prisma.order.findMany(queryOptions),
        prisma.order.count({ where })
    ]);

    // Format for Client
    const formattedOrders = orders.map(o => {
        const revenue = calculateOrderRevenue(o);
        return {
            ...o,
            revenue: revenue, // Standardize field name
            promoterName: o.sourceContact || '未标记',
            extensionsTotal: (o as any).extensions?.reduce((acc: number, e: any) => acc + e.price, 0) || 0
        };
    });

    return {
        orders: formattedOrders,
        total: totalCount
    };
}
