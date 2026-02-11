"use server"

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

interface ProductVariant {
    name: string;
    priceRules: Record<string, number>;
}

import { startOfMonth, endOfMonth, parse, startOfDay, endOfDay } from "date-fns";

export async function syncAllOrdersStandardPrice(params: { type: 'all' | 'month' | 'custom', month?: string, start?: string, end?: string }) {
    try {
        const currentUser = await getCurrentUser();
        if (currentUser?.role !== 'ADMIN' && !currentUser?.permissions?.includes('manage_orders')) {
            throw new Error("无权限执行此操作");
        }

        // 1. Load products
        const products = await prisma.product.findMany();
        
        const productMap = new Map<string, { id: string; name: string; parsedVariants: ProductVariant[] }>();
        const productNameMap = new Map<string, { id: string; name: string; parsedVariants: ProductVariant[] }>();

        products.forEach(p => {
            try {
                const variants = JSON.parse(p.variants) as ProductVariant[];
                const productData = { ...p, parsedVariants: variants };
                productMap.set(p.id, productData);
                productNameMap.set(p.name, productData);
            } catch {
                console.error(`Failed to parse variants for product ${p.name}`);
            }
        });

        // 2. Load orders
        const whereOrder: Record<string, unknown> = {};
        
        if (params.type === 'month' && params.month) {
            try {
                // Parse month string (e.g. "2023-10")
                const date = parse(params.month, 'yyyy-MM', new Date());
                const start = startOfMonth(date);
                const end = endOfMonth(date);
                
                whereOrder.createdAt = {
                    gte: start,
                    lte: end
                };
            } catch {
                console.error("Invalid month format:", params.month);
                return { success: false, message: "无效的月份格式" };
            }
        } else if (params.type === 'custom' && params.start) {
            try {
                const start = startOfDay(new Date(params.start));
                const end = params.end ? endOfDay(new Date(params.end)) : endOfDay(new Date(params.start));
                
                whereOrder.createdAt = {
                    gte: start,
                    lte: end
                };
            } catch {
                console.error("Invalid date range:", params.start, params.end);
                return { success: false, message: "无效的日期范围" };
            }
        }
        // If type is 'all', whereOrder remains empty {}

        const orders = await prisma.order.findMany({
            where: whereOrder,
            select: {
                id: true,
                productId: true,
                productName: true,
                variantName: true,
                duration: true,
                standardPrice: true
            }
        });

        let updatedCount = 0;

        // 3. Update orders
        for (const order of orders) {
            let product = order.productId ? productMap.get(order.productId) : null;
            if (!product) {
                product = productNameMap.get(order.productName);
            }

            if (!product) continue;

            const variant = product.parsedVariants.find((v: ProductVariant) => v.name === order.variantName);
            if (!variant || !variant.priceRules) continue;

            const newStandardPrice = variant.priceRules[String(order.duration)] || 0;

            // Update if price differs (allowing small float diff)
            if (Math.abs((order.standardPrice || 0) - newStandardPrice) > 0.01) {
                await prisma.order.update({
                    where: { id: order.id },
                    data: { standardPrice: newStandardPrice }
                });
                updatedCount++;
            }
        }

        revalidatePath('/stats/accounts');
        revalidatePath('/stats/promoters');
        
        return { success: true, message: `已成功同步 ${updatedCount} 个订单的标准价` };
    } catch (error) {
        console.error("Sync error:", error);
        return { success: false, message: "同步失败: " + (error instanceof Error ? error.message : String(error)) };
    }
}

import { calculateOrderRevenue } from "@/lib/utils";

export async function fetchAccountOrders(params: {
    userId: string;
    channelName?: string;
    promoterName?: string;
    isRetail?: boolean;
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

    const { userId, channelName: rawChannelName, promoterName: rawPromoterName, isRetail, period, start, end, page, pageSize } = params;

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
    
    const where: Record<string, unknown> = {
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

    // Retail Filter: Exclude all known promoters AND non-retail sources
    if (isRetail) {
        const allPromoters = await prisma.promoter.findMany({ select: { id: true, name: true } });
        const promoterNames = allPromoters.map(p => p.name);
        const promoterIds = allPromoters.map(p => p.id);
        
        where.AND = [
            {
                OR: [
                    { promoterId: null },
                    { promoterId: { notIn: promoterIds } }
                ]
            },
            {
                sourceContact: { notIn: promoterNames }
            },
            {
                source: { notIn: ['PEER', 'PART_TIME_AGENT'] }
            },
            {
                channelId: null
            }
        ];
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
    const queryOptions: {
        where: typeof where;
        include: { extensions: true; channel: { select: { name: true } } };
        orderBy: { createdAt: 'desc' };
        skip?: number;
        take?: number;
    } = {
        where,
        include: { 
            extensions: true,
            channel: { select: { name: true } }
        },
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
            extensionsTotal: (o.extensions || []).reduce((acc, e) => acc + (e.price || 0), 0)
        };
    });

    return {
        orders: formattedOrders,
        total: totalCount
    };
}
