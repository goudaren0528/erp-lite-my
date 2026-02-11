'use server'

import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

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

    const formattedOrders = orders.map(o => ({
        ...o,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        rentStartDate: o.rentStartDate?.toISOString() || null,
        returnDeadline: o.returnDeadline?.toISOString() || null,
    }));

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
