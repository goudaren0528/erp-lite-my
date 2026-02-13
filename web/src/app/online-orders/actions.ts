'use server'

import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { matchDeviceMapping } from "@/lib/product-matching"

export async function fetchOnlineOrders(params: {
    page: number;
    pageSize: number;
    sortBy: 'status' | 'createdAt';
    sortDirection: 'asc' | 'desc';
    status?: string;
    searchOrderNo?: string;
    searchRecipient?: string;
    searchProduct?: string;
}) {
    const {
        page,
        pageSize,
        sortBy,
        sortDirection,
        status,
        searchOrderNo,
        searchRecipient,
        searchProduct,
    } = params;

    const where: Prisma.OnlineOrderWhereInput = {};

    if (status && status !== 'ALL') {
        where.status = status;
    }

    if (searchOrderNo) {
        where.orderNo = { contains: searchOrderNo };
    }

    if (searchRecipient) {
        where.customerName = { contains: searchRecipient };
    }

    if (searchProduct) {
        where.OR = [
            { productName: { contains: searchProduct } },
            { itemTitle: { contains: searchProduct } },
        ];
    }

    const orders = await prisma.onlineOrder.findMany({
        where,
        orderBy: {
            createdAt: sortDirection
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
    });

    const total = await prisma.onlineOrder.count({ where });

    // Fetch products for dynamic matching
    const rawProducts = await prisma.product.findMany({
        select: {
            name: true,
            matchKeywords: true
        }
    });

    // Optimization: Parse keywords once
    const products = rawProducts.map(p => {
        let keywords: string[] = []
        try {
            if (p.matchKeywords) {
                const parsed = JSON.parse(p.matchKeywords)
                if (Array.isArray(parsed)) keywords = parsed
            }
        } catch {}
        return { name: p.name, keywords }
    });

    const formattedOrders = orders.map(o => {
        // Try to match product dynamically
        const matched = matchDeviceMapping(o.itemTitle || undefined, o.itemSku || undefined, products);

        return {
            ...o,
            productName: matched ? matched.deviceName : o.productName,
            createdAt: o.createdAt.toISOString(),
            updatedAt: o.updatedAt.toISOString(),
            rentStartDate: o.rentStartDate?.toISOString() || null,
            returnDeadline: o.returnDeadline?.toISOString() || null,
        }
    });

    return {
        orders: formattedOrders,
        total,
    };
}

export async function getOnlineOrderCounts(params: {
    searchOrderNo?: string;
    searchRecipient?: string;
    searchProduct?: string;
}) {
    const where: Prisma.OnlineOrderWhereInput = {};
    
    if (params.searchOrderNo) {
        where.orderNo = { contains: params.searchOrderNo };
    }

    if (params.searchRecipient) {
        where.customerName = { contains: params.searchRecipient };
    }

    if (params.searchProduct) {
        where.OR = [
            { productName: { contains: params.searchProduct } },
            { itemTitle: { contains: params.searchProduct } },
        ];
    }

    const grouped = await prisma.onlineOrder.groupBy({
        by: ['status'],
        where,
        _count: {
            status: true
        }
    });

    const counts: Record<string, number> = {};
    let total = 0;
    
    grouped.forEach(g => {
        counts[g.status] = g._count.status;
        total += g._count.status;
    });

    return { counts, total };
}

export async function getMatchProducts() {
    const productsRaw = await prisma.product.findMany({
        select: {
            id: true,
            name: true,
            variants: true,
            specs: {
                select: {
                    id: true,
                    specId: true,
                    name: true,
                    bomItems: {
                        select: {
                            itemTypeId: true,
                            quantity: true,
                            itemType: { select: { name: true } }
                        }
                    }
                }
            }
        }
    })

    return productsRaw.map(p => ({
        ...p,
        variants: typeof p.variants === 'string' ? JSON.parse(p.variants) : p.variants,
        specs: p.specs?.map(s => ({
            ...s,
            bomItems: s.bomItems?.map(b => ({
                itemTypeId: b.itemTypeId,
                quantity: b.quantity,
                itemTypeName: b.itemType?.name
            })) || []
        }))
    }))
}

export async function updateOnlineOrderMatchSpec(orderId: string, productId: string | null, specValue: string | null) {
    if (!specValue) {
        await prisma.onlineOrder.update({
            where: { id: orderId },
            data: { specId: null, productId: null }
        })
        return { success: true }
    }

    const spec = await prisma.productSpec.findFirst({
        where: {
            OR: [
                { id: specValue },
                ...(productId ? [{ productId, name: specValue }] : [])
            ]
        },
        select: { id: true, productId: true }
    })

    if (!spec) {
        throw new Error("未找到匹配规格")
    }

    await prisma.onlineOrder.update({
        where: { id: orderId },
        data: { specId: spec.id, productId: spec.productId }
    })
    return { success: true }
}
