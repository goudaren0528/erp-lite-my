'use server'

import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { matchDeviceMapping } from "@/lib/product-matching"
import { revalidatePath } from "next/cache"

export async function fetchOnlineOrders(params: {
    page: number;
    pageSize: number;
    sortBy: 'status' | 'createdAt';
    sortDirection: 'asc' | 'desc';
    status?: string;
    searchOrderNo?: string;
    searchRecipient?: string;
    searchProduct?: string;
    searchSn?: string;
    filterPlatform?: string;
    matchFilter?: 'ALL' | 'MATCHED' | 'UNMATCHED';
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
        searchSn,
        filterPlatform,
        matchFilter,
    } = params;

    const where: Prisma.OnlineOrderWhereInput = {};

    if (filterPlatform) {
        where.platform = filterPlatform;
    }

    if (matchFilter === 'MATCHED') {
        where.specId = { not: null };
    } else if (matchFilter === 'UNMATCHED') {
        where.specId = null;
    }

    if (status && status !== 'ALL') {
        where.status = status;
    }

    if (searchOrderNo) {
        where.orderNo = { contains: searchOrderNo };
    }

    if (searchRecipient) {
        where.customerName = { contains: searchRecipient };
    }

    const and: Prisma.OnlineOrderWhereInput[] = []
    if (searchProduct) {
        and.push({
            OR: [
                { productName: { contains: searchProduct } },
                { itemTitle: { contains: searchProduct } },
            ]
        })
    }
    if (searchSn) {
        const q = searchSn.trim()
        const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM OnlineOrder WHERE manualSn LIKE ${`%${q}%`}`
        and.push({ id: { in: rows.map(r => r.id) } })
    }
    if (and.length > 0) {
        where.AND = and
    }

    const orders = await prisma.onlineOrder.findMany({
        where,
        orderBy: {
            [sortBy]: sortDirection
        } as Prisma.OnlineOrderOrderByWithRelationInput,
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
        const keepManualProduct = Boolean(o.productId || o.specId)

        return {
            ...o,
            productName: keepManualProduct ? o.productName : (matched ? matched.deviceName : o.productName),
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
    searchSn?: string;
    filterPlatform?: string;
}) {
    const where: Prisma.OnlineOrderWhereInput = {};
    
    if (params.filterPlatform) {
        where.platform = params.filterPlatform;
    }

    if (params.searchOrderNo) {
        where.orderNo = { contains: params.searchOrderNo };
    }

    if (params.searchRecipient) {
        where.customerName = { contains: params.searchRecipient };
    }

    const and: Prisma.OnlineOrderWhereInput[] = []
    if (params.searchProduct) {
        and.push({
            OR: [
                { productName: { contains: params.searchProduct } },
                { itemTitle: { contains: params.searchProduct } },
            ]
        })
    }
    if (params.searchSn) {
        const q = params.searchSn.trim()
        const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM OnlineOrder WHERE manualSn LIKE ${`%${q}%`}`
        and.push({ id: { in: rows.map(r => r.id) } })
    }
    if (and.length > 0) {
        where.AND = and
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

export async function updateOnlineOrderManualSn(orderId: string, manualSn: string) {
    const value = manualSn.trim()
    try {
        await prisma.onlineOrder.update({
            where: { id: orderId },
            data: { manualSn: value }
        })
        revalidatePath("/online-orders")
        return { success: true }
    } catch {
        try {
            await prisma.$executeRaw`UPDATE OnlineOrder SET manualSn = ${value} WHERE id = ${orderId}`
            revalidatePath("/online-orders")
            return { success: true }
        } catch (rawError) {
            const message = rawError instanceof Error ? rawError.message : "保存失败"
            return { success: false, message }
        }
    }
}

export async function updateOnlineOrderMatchSpec(orderId: string, productId: string | null, specValue: string | null) {
    if (!specValue) {
        await prisma.onlineOrder.update({
            where: { id: orderId },
            data: { specId: null, productId: null }
        })
        revalidatePath('/online-orders')
        return { success: true }
    }

    const spec = await prisma.productSpec.findFirst({
        where: {
            OR: [
                { id: specValue },
                ...(productId ? [{ productId, name: specValue }] : [])
            ]
        },
        include: { product: true }
    })

    if (!spec) {
        throw new Error("未找到匹配规格")
    }

    await prisma.onlineOrder.update({
        where: { id: orderId },
        data: {
            specId: spec.id,
            productId: spec.productId,
        }
    })
    revalidatePath('/online-orders')
    return { success: true }
}

export async function syncOnlineOrderMatchSpec(orderId: string) {
    const source = await prisma.onlineOrder.findUnique({
        where: { id: orderId },
        select: {
            id: true,
            specId: true,
            productId: true,
            itemTitle: true,
            itemSku: true,
        }
    })

    if (!source) throw new Error("订单不存在")
    if (!source.specId || !source.productId) throw new Error("该订单尚未匹配规格")
    if (!source.itemTitle || !source.itemSku) throw new Error("该订单缺少商品标题或SKU，无法按标题+SKU同步")

    const res = await prisma.onlineOrder.updateMany({
        where: {
            id: { not: source.id },
            itemTitle: source.itemTitle,
            itemSku: source.itemSku,
            OR: [{ specId: null }, { productId: null }],
        },
        data: {
            specId: source.specId,
            productId: source.productId,
        }
    })

    revalidatePath('/online-orders')
    return { success: true, updated: res.count }
}
