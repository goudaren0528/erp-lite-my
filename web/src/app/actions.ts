'use server'

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { OrderStatus, User, Promoter, ProductVariant } from "@/types";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth"
import { autoMatchSpecId } from "@/lib/spec-auto-match";

// Helper to determine query mode based on database type
// SQLite does not support 'insensitive' mode, but Postgres does.
const isPostgres = process.env.DATABASE_URL?.startsWith('postgres');
const dbMode = isPostgres ? ('insensitive' as const) : undefined;
const containsFilter = (value: string) => (dbMode ? ({ contains: value, mode: dbMode } as const) : ({ contains: value } as const))

export async function fetchOrdersForExport({
    startDate,
    endDate,
    status,
    filterSettled
}: {
    startDate?: string;
    endDate?: string;
    status?: string;
    filterSettled?: 'ALL' | 'YES' | 'NO';
}) {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new Error("未登录")
    }
    const isAdmin = currentUser?.role === 'ADMIN';
    const canViewAllOrders = isAdmin || currentUser?.permissions?.includes('view_all_orders');
    
    const where: Prisma.OrderWhereInput = {};
    
    // Permission filter
    if (!canViewAllOrders) {
        where.creatorId = currentUser?.id;
    } else {
        where.creatorId = { not: 'system' };
    }
    
    // Date filter
    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            where.createdAt.gte = start;
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setDate(end.getDate() + 1);
            end.setHours(0, 0, 0, 0);
            where.createdAt.lt = end;
        }
    }
    
    // Status filter
    if (status && status !== 'ALL') {
        where.status = status;
    }
    
    // Settled filter
    if (filterSettled === 'YES') {
        where.settled = true;
    } else if (filterSettled === 'NO') {
        where.settled = false;
    }
    
    const orders = await prisma.order.findMany({
        where,
        select: {
            id: true,
            orderNo: true,
            source: true,
            platform: true,
            status: true,
            customerXianyuId: true,
            sourceContact: true,
            miniProgramOrderNo: true,
            xianyuOrderNo: true,
            productName: true,
            variantName: true,
            sn: true,
            duration: true,
            rentPrice: true,
            deposit: true,
            insurancePrice: true,
            overdueFee: true,
            totalAmount: true,
            address: true,
            recipientName: true,
            recipientPhone: true,
            logisticsCompany: true,
            trackingNumber: true,
            latestLogisticsInfo: true,
            returnLogisticsCompany: true,
            returnTrackingNumber: true,
            returnLatestLogisticsInfo: true,
            rentStartDate: true,
            deliveryTime: true,
            actualDeliveryTime: true,
            completedAt: true,
            returnDeadline: true,
            remark: true,
            creatorId: true,
            creatorName: true,
            createdAt: true,
            updatedAt: true,
            settled: true,
            extensions: { select: { days: true, price: true } },
        },
        orderBy: { createdAt: 'desc' }
    });
    
    return orders.map(o => ({
        ...o,
        rentStartDate: o.rentStartDate ? o.rentStartDate.toISOString() : null,
        deliveryTime: o.deliveryTime ? o.deliveryTime.toISOString() : null,
        actualDeliveryTime: o.actualDeliveryTime ? o.actualDeliveryTime.toISOString() : null,
        completedAt: o.completedAt ? o.completedAt.toISOString() : null,
        returnDeadline: o.returnDeadline ? o.returnDeadline.toISOString() : null,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
    }));
}

export async function syncOrderMatchSpec(orderId: string) {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new Error("未登录")
    }

    const src = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
            id: true,
            specId: true,
            productId: true,
            productName: true,
            variantName: true,
        }
    })

    if (!src) throw new Error("订单不存在")
    if (!src.specId || !src.productId) throw new Error("该订单尚未匹配规格")
    if (!src.productName || !src.variantName) throw new Error("该订单缺少设备信息，无法按设备信息同步")

    const res = await prisma.order.updateMany({
        where: {
            id: { not: src.id },
            productName: src.productName,
            variantName: src.variantName,
        },
        data: {
            specId: src.specId,
            productId: src.productId,
        }
    })

    revalidatePath('/orders')
    return { success: true, updated: res.count }
}

async function resolveOrderSpec(order: { specId?: string | null; productId?: string | null; variantName?: string | null }) {
    if (order.specId) {
        const byId = await prisma.productSpec.findUnique({
            where: { id: order.specId },
            include: { bomItems: true }
        })
        if (byId) return byId
        return prisma.productSpec.findFirst({
            where: { specId: order.specId },
            include: { bomItems: true }
        })
    }
    if (order.productId && order.variantName) {
        return prisma.productSpec.findFirst({
            where: { productId: order.productId, name: order.variantName },
            include: { bomItems: true }
        })
    }
    return null
}

async function getDefaultWarehouseId() {
    const warehouse = await prisma.warehouse.findFirst({ where: { isDefault: true } })
        ?? await prisma.warehouse.findFirst({ orderBy: { createdAt: "asc" } })
    return warehouse?.id || null
}

async function ensureOrderReservations(orderId: string) {
    const existing = await prisma.inventoryReservation.findFirst({ where: { orderId } })
    if (existing) return

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, specId: true, productId: true, variantName: true, rentStartDate: true, returnDeadline: true, duration: true }
    })
    if (!order) throw new Error("订单不存在")

    const spec = await resolveOrderSpec(order)
    if (!spec || spec.bomItems.length === 0) return

    const warehouseId = await getDefaultWarehouseId()
    if (!warehouseId) throw new Error("请先创建仓库")

    const startDate = order.rentStartDate ? new Date(order.rentStartDate) : new Date()
    let endDate: Date
    if (order.returnDeadline) {
        endDate = new Date(order.returnDeadline)
    } else {
        const days = order.duration && order.duration > 0 ? order.duration : 1
        endDate = new Date(startDate)
        endDate.setDate(endDate.getDate() + days)
    }

    await prisma.inventoryReservation.createMany({
        data: spec.bomItems.map(item => ({
            orderId: order.id,
            specId: spec.id,
            itemTypeId: item.itemTypeId,
            warehouseId,
            quantity: item.quantity,
            startDate,
            endDate
        }))
    })
}

async function allocateOrderInventory(orderId: string) {
    const existingAllocation = await prisma.inventoryAllocation.findFirst({ where: { orderId, returnedAt: null } })
    if (existingAllocation) return

    await ensureOrderReservations(orderId)

    const reservations = await prisma.inventoryReservation.findMany({
        where: { orderId },
        include: { itemType: true }
    })
    if (reservations.length === 0) return

    await prisma.$transaction(async (tx) => {
        for (const reservation of reservations) {
            if (reservation.itemType.isSerialized) {
                const availableItems = await tx.inventoryItem.findMany({
                    where: {
                        itemTypeId: reservation.itemTypeId,
                        warehouseId: reservation.warehouseId,
                        status: "AVAILABLE"
                    },
                    take: reservation.quantity,
                    orderBy: { createdAt: "asc" }
                })
                if (availableItems.length < reservation.quantity) {
                    throw new Error(`${reservation.itemType.name} 库存不足`)
                }
                for (const item of availableItems) {
                    await tx.inventoryAllocation.create({
                        data: {
                            orderId,
                            itemId: item.id,
                            warehouseId: reservation.warehouseId
                        }
                    })
                    await tx.inventoryItem.update({
                        where: { id: item.id },
                        data: { status: "RENTING" }
                    })
                }
            } else {
                const stock = await tx.inventoryStock.findUnique({
                    where: {
                        itemTypeId_warehouseId: {
                            itemTypeId: reservation.itemTypeId,
                            warehouseId: reservation.warehouseId
                        }
                    }
                })
                if (!stock || stock.quantity < reservation.quantity) {
                    throw new Error(`${reservation.itemType.name} 库存不足`)
                }
                await tx.inventoryStock.update({
                    where: {
                        itemTypeId_warehouseId: {
                            itemTypeId: reservation.itemTypeId,
                            warehouseId: reservation.warehouseId
                        }
                    },
                    data: { quantity: { decrement: reservation.quantity } }
                })
            }
        }
    })
}

async function releaseOrderInventory(orderId: string) {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { actualDeliveryTime: true }
    })
    if (!order) return

    const allocations = await prisma.inventoryAllocation.findMany({
        where: { orderId, returnedAt: null },
        select: { id: true, itemId: true }
    })

    const reservations = await prisma.inventoryReservation.findMany({
        where: { orderId },
        include: { itemType: true }
    })

    await prisma.$transaction(async (tx) => {
        if (allocations.length > 0) {
            const itemIds = allocations.map(a => a.itemId)
            await tx.inventoryItem.updateMany({
                where: { id: { in: itemIds } },
                data: { status: "AVAILABLE" }
            })
            await tx.inventoryAllocation.updateMany({
                where: { id: { in: allocations.map(a => a.id) } },
                data: { returnedAt: new Date() }
            })
        }

        if (!order.actualDeliveryTime) return

        const increments = new Map<string, number>()
        for (const reservation of reservations) {
            if (reservation.itemType.isSerialized) continue
            const key = `${reservation.itemTypeId}|${reservation.warehouseId}`
            increments.set(key, (increments.get(key) || 0) + reservation.quantity)
        }

        for (const [key, quantity] of increments) {
            const [itemTypeId, warehouseId] = key.split("|")
            await tx.inventoryStock.upsert({
                where: {
                    itemTypeId_warehouseId: {
                        itemTypeId,
                        warehouseId
                    }
                },
                update: { quantity: { increment: quantity } },
                create: { itemTypeId, warehouseId, quantity }
            })
        }
    })
}

export async function createOrder(formData: FormData) {
  try {
      const currentUser = await getCurrentUser();
      
      const creatorId = currentUser?.id || 'system'; 
      const creatorName = currentUser?.name || '系统';

      const now = new Date();
      const orderNo = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      const rawData = Object.fromEntries(formData.entries());
      
      // Validate dates
      let rentStartDate: Date | null = null;
      let returnDeadline: Date | null = null;
      let deliveryTime: Date | null = null;

      if (rawData.rentStartDate) rentStartDate = new Date(rawData.rentStartDate as string);
      if (rawData.returnDeadline) returnDeadline = new Date(rawData.returnDeadline as string);
      if (rawData.deliveryTime) deliveryTime = new Date(rawData.deliveryTime as string);

      if (rentStartDate && returnDeadline) {
          if (returnDeadline <= rentStartDate) {
              throw new Error("租期结束日期不能早于开始日期");
          }
      }

      // Calculate standard price
      let standardPrice = 0;
      const productId = (rawData.productId as string) || "";
      const variantName = (rawData.variantName as string) || "";
      const inputSpecId = (rawData.specId as string) || "";
      const specLookupKey = inputSpecId.trim()
      const spec =
          (specLookupKey
              ? (await prisma.productSpec.findUnique({ where: { id: specLookupKey } })) ||
                (await prisma.productSpec.findFirst({ where: { specId: specLookupKey } }))
              : null) ||
          (productId && variantName
              ? await prisma.productSpec.findFirst({ where: { productId, name: variantName } })
              : null)
      const itemTitle = (rawData.itemTitle as string) || ""
      const itemSku = (rawData.itemSku as string) || ""
      // Auto-match specId from existing orders if not already resolved
      let resolvedSpecDbId = spec?.id || ""
      if (!resolvedSpecDbId && (itemTitle || itemSku)) {
          resolvedSpecDbId = (await autoMatchSpecId(itemTitle || null, itemSku || null)) || ""
      }
      const duration = Number(rawData.duration);

      if (duration > 0) {
          standardPrice = await getStandardPriceSnapshot({ specId: specLookupKey || undefined, productId, variantName, duration });
      }

      const order = await prisma.order.create({
        data: {
            orderNo,
            source: rawData.source as string,
            platform: (rawData.platform as string) || null,
            status: 'PENDING_REVIEW',
            
            customerXianyuId: (rawData.customerXianyuId as string) || '',
            sourceContact: (rawData.sourceContact as string) || '',
            promoterId: (rawData.promoterId as string) || null,
            channelId: (rawData.channelId as string) || null,
            miniProgramOrderNo: (rawData.miniProgramOrderNo as string) || null,
            xianyuOrderNo: (rawData.xianyuOrderNo as string) || null,
            
            productName: (rawData.productName as string) || '',
            productId: (rawData.productId as string) || null,
            variantName: (rawData.variantName as string) || '',
            specId: resolvedSpecDbId || null,
            sn: (rawData.sn as string) || null,
            itemTitle: itemTitle || null,
            itemSku: itemSku || null,
            
            duration: Number(rawData.duration) || 0,
            rentPrice: Number(rawData.rentPrice) || 0,
            deposit: Number(rawData.deposit) || 0,
            insurancePrice: Number(rawData.insurancePrice) || 0,
            overdueFee: 0,
            totalAmount: Number(rawData.totalAmount) || 0,
            standardPrice,
            
            address: (rawData.address as string) || '',
            recipientName: (rawData.recipientName as string) || null,
            recipientPhone: (rawData.recipientPhone as string) || null,
            
            rentStartDate,
            deliveryTime,
            returnDeadline,
            
            remark: (rawData.remark as string) || null,
            screenshot: (rawData.screenshot as string) || null,
            
            creatorId,
            creatorName,
            
            logs: {
                create: [{
                    action: '创建订单',
                    operator: creatorName,
                    desc: '创建订单'
                }]
            }
        }
      });
      
      await ensureOrderReservations(order.id)

      revalidatePath('/orders');
      return { success: true, message: "订单创建成功", orderId: order.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, message: message || "创建订单失败" };
  }
}

export async function fetchOrders(params: {
    page: number;
    pageSize: number;
    sortBy: 'status' | 'createdAt';
    sortDirection: 'asc' | 'desc';
    includeSystem?: boolean;
    matchFilter?: 'ALL' | 'MATCHED' | 'UNMATCHED';
    filterOrderNo?: string;
    filterXianyuOrderNo?: string;
    filterCustomer?: string;
    filterPromoter?: string;
    filterProduct?: string;
    filterSn?: string;
    filterCreator?: string;
    filterDuration?: string;
    filterRecipientName?: string;
    filterRecipientPhone?: string;
    filterStatus?: string;
    filterSource?: string;
    filterPlatform?: string;
    startDate?: string;
    endDate?: string;
    filterSettled?: 'ALL' | 'YES' | 'NO';
}) {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new Error("Unauthorized");
    }

    const {
        page,
        pageSize,
        sortBy,
        sortDirection,
        includeSystem,
        matchFilter,
        filterOrderNo: rawFilterOrderNo,
        filterXianyuOrderNo: rawFilterXianyuOrderNo,
        filterCustomer: rawFilterCustomer,
        filterPromoter: rawFilterPromoter,
        filterProduct: rawFilterProduct,
        filterSn: rawFilterSn,
        filterCreator: rawFilterCreator,
        filterDuration,
        filterRecipientName: rawFilterRecipientName,
        filterRecipientPhone: rawFilterRecipientPhone,
        filterStatus,
        filterSource,
        filterPlatform,
        startDate,
        endDate,
        filterSettled
    } = params;

    const filterOrderNo = rawFilterOrderNo?.trim();
    const filterXianyuOrderNo = rawFilterXianyuOrderNo?.trim();
    const filterCustomer = rawFilterCustomer?.trim();
    const filterPromoter = rawFilterPromoter?.trim();
    const filterProduct = rawFilterProduct?.trim();
    const filterSn = rawFilterSn?.trim();
    const filterCreator = rawFilterCreator?.trim();
    const filterRecipientName = rawFilterRecipientName?.trim();
    const filterRecipientPhone = rawFilterRecipientPhone?.trim();

    const isAdmin = currentUser.role === 'ADMIN';
    const canViewAllOrders = isAdmin || currentUser.permissions?.includes('view_all_orders');

    let baseWhere: Prisma.OrderWhereInput = canViewAllOrders ? {} : { creatorId: currentUser.id };

    if (includeSystem) {
        baseWhere = { creatorId: 'system' };
    } else if (canViewAllOrders) {
        baseWhere = { creatorId: { not: 'system' } };
    }

    if (matchFilter === 'MATCHED') {
        baseWhere.specId = { not: null };
    } else if (matchFilter === 'UNMATCHED') {
        baseWhere.specId = null;
    }

    if (filterOrderNo) {
        baseWhere.OR = [
            { orderNo: containsFilter(filterOrderNo) },
            { miniProgramOrderNo: containsFilter(filterOrderNo) }
        ];
    }

    if (filterXianyuOrderNo) {
        baseWhere.xianyuOrderNo = containsFilter(filterXianyuOrderNo);
    }

    if (filterCustomer) {
        baseWhere.customerXianyuId = containsFilter(filterCustomer);
    }

    if (filterProduct) {
        baseWhere.productName = containsFilter(filterProduct);
    }

    if (filterSn) {
        baseWhere.sn = containsFilter(filterSn);
    }

    if (filterDuration) {
        const durationNum = Number(filterDuration);
        if (Number.isFinite(durationNum)) {
            baseWhere.duration = durationNum;
        }
    }

    if (filterRecipientName) {
        baseWhere.recipientName = containsFilter(filterRecipientName);
    }

    if (filterRecipientPhone) {
        baseWhere.recipientPhone = { contains: filterRecipientPhone };
    }

    if (filterSource && filterSource !== 'ALL') {
        baseWhere.source = filterSource;
    }

    if (filterPlatform && filterPlatform !== 'ALL') {
        baseWhere.platform = filterPlatform;
    }

    if (startDate || endDate) {
        const createdAt: { gte?: Date; lt?: Date } = {};
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            createdAt.gte = start;
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setDate(end.getDate() + 1);
            end.setHours(0, 0, 0, 0);
            createdAt.lt = end;
        }
        baseWhere.createdAt = createdAt;
    }

    if (filterSettled === 'YES') {
        baseWhere.settled = true;
    } else if (filterSettled === 'NO') {
        baseWhere.settled = false;
    }

    if (filterCreator) {
        const creatorUsers = await prisma.user.findMany({
            where: {
                name: containsFilter(filterCreator)
            },
            select: { id: true }
        });
        const creatorIds = creatorUsers.map(u => u.id);
        if (creatorIds.length > 0) {
            baseWhere.creatorId = { in: creatorIds };
        } else {
            baseWhere.creatorId = 'no-match';
        }
    }

    if (filterPromoter) {
        const matchedPromoters = await prisma.promoter.findMany({
            where: {
                OR: [
                    { name: containsFilter(filterPromoter) },
                    { phone: { contains: filterPromoter } }
                ]
            },
            select: { id: true, name: true }
        });
        const promoterIds = matchedPromoters.map(p => p.id);
        const promoterNames = matchedPromoters.map(p => p.name);
        baseWhere.OR = [
            ...(baseWhere.OR || []),
            { sourceContact: containsFilter(filterPromoter) },
            ...(promoterIds.length > 0 ? [{ promoterId: { in: promoterIds } }] : []),
            ...(promoterNames.length > 0 ? [{ sourceContact: { in: promoterNames } }] : [])
        ];
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const overdueWhere = {
        status: 'RENTING',
        returnDeadline: { lt: todayStart }
    };

    const baseCount = await prisma.order.count({ where: baseWhere });

    const statusGroups = await prisma.order.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: baseWhere
    });

    const overdueCount = await prisma.order.count({
        where: {
            ...baseWhere,
            ...overdueWhere
        }
    });

    const statusCounts: Record<string, number> = statusGroups.reduce((acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
    }, {} as Record<string, number>);

    statusCounts.OVERDUE = overdueCount;

    if (statusCounts.RENTING) {
        statusCounts.RENTING = Math.max(0, statusCounts.RENTING - overdueCount);
    }

    const where: Prisma.OrderWhereInput = { ...baseWhere };
    if (filterStatus && filterStatus !== 'ALL') {
        if (filterStatus === 'OVERDUE') {
            where.status = overdueWhere.status;
            where.returnDeadline = overdueWhere.returnDeadline;
        } else {
            where.status = filterStatus;
        }
    }

    const orderBy =
        sortBy === 'createdAt'
            ? { createdAt: sortDirection }
            : { createdAt: sortDirection };

    const [orders, total, todayOrders] = await Promise.all([
        prisma.order.findMany({
            where,
            orderBy,
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { extensions: true, logs: true }
        }),
        prisma.order.count({ where }),
        prisma.order.findMany({
            where: {
                ...baseWhere,
                creatorId: { not: 'system' }, // Exclude online orders
                createdAt: { gte: todayStart, lt: todayEnd }
            },
            select: {
                totalAmount: true,
                extensions: { select: { price: true } }
            }
        })
    ]);

    const formattedOrders = orders.map(o => ({
        ...o,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        rentStartDate: o.rentStartDate?.toISOString() || null,
        deliveryTime: o.deliveryTime?.toISOString() || null,
        returnDeadline: o.returnDeadline?.toISOString() || null,
        completedAt: o.completedAt?.toISOString() || null,
        extensions: o.extensions.map(e => ({
            ...e,
            createdAt: e.createdAt.toISOString()
        })),
        logs: o.logs.map(l => ({
            ...l,
            timestamp: l.createdAt.toISOString(),
            details: l.desc || undefined,
            createdAt: l.createdAt.toISOString()
        }))
    }));

    const todayAmount = todayOrders.reduce((sum, o) => {
        const extTotal = o.extensions.reduce((acc, e) => acc + e.price, 0);
        return sum + o.totalAmount + extTotal;
    }, 0);

    return {
        orders: formattedOrders,
        total,
        baseTotal: baseCount,
        statusCounts,
        todayCount: todayOrders.length,
        todayAmount
    };
}

export async function saveUser(user: Partial<User> & { id?: string }) {
    try {
        if (user.id) {
            // Update
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    name: user.name,
                    username: user.username,
                    password: user.password,
                    role: user.role,
                    permissions: user.permissions ? JSON.stringify(user.permissions) : undefined
                }
            });
            revalidatePath('/users');
            return { success: true, message: "用户更新成功" };
        } else {
            // Create
            await prisma.user.create({
                data: {
                    name: user.name || '',
                    username: user.username || '',
                    password: user.password || '123456',
                    role: user.role || 'SHIPPING',
                    permissions: JSON.stringify(user.permissions || []),
                    accountGroupId: user.accountGroupId
                }
            });
            revalidatePath('/users');
            return { success: true, message: "用户创建成功" };
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "保存用户失败" };
    }
}

export async function deleteUser(userId: string) {
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        
        if (user?.username === 'admin') {
            throw new Error("无法删除超级管理员")
        }

        await prisma.user.delete({ where: { id: userId } });
        revalidatePath('/users');
        return { success: true, message: "用户删除成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "删除用户失败" };
    }
}


export async function savePromoter(promoter: Partial<Promoter> & { id?: string }) {
    try {
        const currentUser = await getCurrentUser()
        
        if (promoter.id) {
            await prisma.promoter.update({
                where: { id: promoter.id },
                data: {
                    name: promoter.name,
                    phone: promoter.phone,
                    channel: promoter.channel,
                    channelConfigId: promoter.channelConfigId
                }
            });
        } else {
             await prisma.promoter.create({
                data: {
                    name: promoter.name || '',
                    phone: promoter.phone,
                    channel: promoter.channel,
                    channelConfigId: promoter.channelConfigId,
                    creatorId: currentUser?.id,
                }
            });
        }
        
        revalidatePath('/promoters')
        revalidatePath('/orders') 
        return { success: true, message: promoter.id ? "推广人员更新成功" : "推广人员创建成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "保存推广人员失败" };
    }
}

export async function deletePromoter(promoterId: string) {
    try {
        await prisma.promoter.delete({ where: { id: promoterId } });
        revalidatePath('/promoters')
        revalidatePath('/orders')
        return { success: true, message: "推广人员删除成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "删除推广人员失败" };
    }
}

async function getStandardPriceBySpec(specId: string, duration: number): Promise<number> {
    try {
        const spec =
            (await prisma.productSpec.findUnique({ where: { id: specId } })) ||
            (await prisma.productSpec.findFirst({ where: { specId } }))
        if (!spec || !spec.priceRules) return 0;
        const rules = JSON.parse(spec.priceRules) as Record<string, number>;
        const price = rules[String(duration)];
        return price || 0;
    } catch (e) {
        console.error("Error calculating standard price:", e);
        return 0;
    }
}

async function getStandardPriceSnapshot(params: { specId?: string; productId?: string; variantName?: string; duration: number }): Promise<number> {
    const { specId, productId, variantName, duration } = params
    if (specId) {
        return getStandardPriceBySpec(specId, duration)
    }
    if (!productId || !variantName) return 0
    try {
        const spec = await prisma.productSpec.findFirst({
            where: { productId, name: variantName }
        })
        if (!spec || !spec.priceRules) return 0
        const rules = JSON.parse(spec.priceRules) as Record<string, number>
        const price = rules[String(duration)]
        return price || 0
    } catch (e) {
        console.error("Error calculating standard price:", e)
        return 0
    }
}

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: '待审核',
  PENDING_SHIPMENT: '待发货',
  SHIPPED_PENDING_CONFIRMATION: '已发货待确认',
  PENDING_RECEIPT: '待收货',
  RENTING: '待归还',
  OVERDUE: '已逾期',
  RETURNING: '归还中',
  COMPLETED: '已完成',
  BOUGHT_OUT: '已购买',
  CLOSED: '已关闭',
}

interface ExtensionOps {
    deleteMany?: Record<string, never>;
    create?: { days: number; price: number; createdAt: Date }[];
}

export async function updateOrder(orderId: string, formData: FormData) {
    try {
        const rawData = Object.fromEntries(formData.entries());
        
        // Validate dates
        let rentStartDate: Date | null = null;
        let returnDeadline: Date | null = null;
        let deliveryTime: Date | null = null;

        if (rawData.rentStartDate) rentStartDate = new Date(rawData.rentStartDate as string);
        if (rawData.returnDeadline) returnDeadline = new Date(rawData.returnDeadline as string);
        if (rawData.deliveryTime) deliveryTime = new Date(rawData.deliveryTime as string);

        if (rentStartDate && returnDeadline) {
            if (returnDeadline <= rentStartDate) {
                throw new Error("租期结束日期不能早于开始日期");
            }
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { overdueFee: true }
        });
        if (!order) {
            throw new Error("Order not found");
        }

        // Check for duplicate Mini Program Order No
        const miniProgramOrderNo = rawData.miniProgramOrderNo as string;
        if (miniProgramOrderNo && miniProgramOrderNo.trim()) {
            const existingOrder = await prisma.order.findFirst({
                where: {
                    miniProgramOrderNo: miniProgramOrderNo.trim(),
                    id: { not: orderId } // Exclude current order
                }
            });
            if (existingOrder) {
                throw new Error("重复小程序订单号不可录入");
            }
        }

        // Handle extension modifications
        const extensionsJSON = rawData.extensionsJSON as string;
        const extensionOps: ExtensionOps = {};
        
        if (extensionsJSON) {
            try {
                const parsedExtensions = JSON.parse(extensionsJSON);
                if (Array.isArray(parsedExtensions)) {
                    // Replace all extensions
                    extensionOps.deleteMany = {};
                    extensionOps.create = parsedExtensions.map((e: { days: unknown; price: unknown; createdAt?: string }) => ({
                        days: Number(e.days),
                        price: Number(e.price),
                        createdAt: e.createdAt ? new Date(e.createdAt) : new Date()
                    }))
                }
            } catch (e) {
                console.error("Failed to parse extensions JSON", e);
            }
        }

        // Handle NEW extension addition
        const extDays = Number(rawData.extensionDays)
        const extPrice = Number(rawData.extensionPrice)
        
        if (extDays > 0) {
             if (!extensionOps.create) extensionOps.create = [];
             extensionOps.create.push({
                days: extDays,
                price: extPrice,
                createdAt: new Date()
             });
        }

        const totalAmount = Number(rawData.totalAmount) || 0

        // Calculate standard price
        let standardPrice = 0;
        const productId = rawData.productId as string;
        const variantName = rawData.variantName as string;
        const specId = rawData.specId as string;
        const duration = Number(rawData.duration);

        // Validate specId exists before writing to avoid foreign key constraint violation
        // Mirror createOrder logic: try id → specId field → productId+variantName fallback
        let resolvedSpecId: string | null = null
        if (specId?.trim()) {
            const specExists =
                (await prisma.productSpec.findUnique({ where: { id: specId.trim() } })) ||
                (await prisma.productSpec.findFirst({ where: { specId: specId.trim() } }))
            resolvedSpecId = specExists?.id || null
        }
        if (!resolvedSpecId && productId && variantName) {
            const specByProduct = await prisma.productSpec.findFirst({ where: { productId, name: variantName } })
            resolvedSpecId = specByProduct?.id || null
        }
        const itemTitle = (rawData.itemTitle as string) || ""
        const itemSku = (rawData.itemSku as string) || ""
        if (!resolvedSpecId && (itemTitle || itemSku)) {
            resolvedSpecId = (await autoMatchSpecId(itemTitle || null, itemSku || null)) || null
        }

        if (duration > 0) {
            standardPrice = await getStandardPriceSnapshot({ specId, productId, variantName, duration });
        }

        await prisma.order.update({
            where: { id: orderId },
            data: {
                source: rawData.source as string,
                platform: (rawData.platform as string) || null,
                customerXianyuId: (rawData.customerXianyuId as string) || '',
                sourceContact: (rawData.sourceContact as string) || '',
                promoterId: (rawData.promoterId as string) || null,
                channelId: (rawData.channelId as string) || null,
                miniProgramOrderNo: (rawData.miniProgramOrderNo as string) || null,
                xianyuOrderNo: (rawData.xianyuOrderNo as string) || null,
                
                productName: (rawData.productName as string) || '',
                productId: (rawData.productId as string) || null,
                variantName: (rawData.variantName as string) || '',
                specId: resolvedSpecId,
                sn: (rawData.sn as string) || null,
                
                duration: Number(rawData.duration) || 0,
                rentPrice: Number(rawData.rentPrice) || 0,
                standardPrice,
                deposit: Number(rawData.deposit) || 0,
                insurancePrice: Number(rawData.insurancePrice) || 0,
                overdueFee: Number(rawData.overdueFee) || 0,
                totalAmount,
                
                address: (rawData.address as string) || '',
                recipientName: (rawData.recipientName as string) || null,
                recipientPhone: (rawData.recipientPhone as string) || null,
                
                rentStartDate,
                deliveryTime,
                returnDeadline,
                
                remark: (rawData.remark as string) || null,
                screenshot: (rawData.screenshot as string) || null,
                
                extensions: Object.keys(extensionOps).length > 0 ? extensionOps : undefined
            }
        });

        revalidatePath('/orders');
        return { success: true, message: "订单更新成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "更新订单失败" };
    }
}

export async function updateOrderSourceInfo(orderId: string, source: string, sourceContact: string, platform?: string, promoterId?: string, channelId?: string) {
    try {
        const data: { source: string; sourceContact: string; platform?: string; promoterId?: string | null; channelId?: string | null } = {
            source,
            sourceContact,
            promoterId: promoterId || null,
            channelId: channelId || null,
        }
        if (platform) {
            data.platform = platform
        }

        await prisma.order.update({
            where: { id: orderId },
            data: {
                ...data,
                logs: {
                    create: {
                        action: '更新推广信息',
                        operator: await getCurrentUser().then(u => u?.name || '系统'),
                        desc: `更新渠道为: ${source}, 推广员为: ${sourceContact}${platform ? `, 推广方式: ${platform}` : ''}`
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "推广信息更新成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "更新失败" };
    }
}

export async function updateOrderMatchSpec(orderId: string, productId: string | null, specValue: string | null) {
    if (!specValue) {
        await prisma.order.update({
            where: { id: orderId },
            data: { specId: null, productId: null }
        })
        revalidatePath('/orders')
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

    await prisma.order.update({
        where: { id: orderId },
        data: {
            specId: spec.id,
            productId: spec.productId,
        }
    })

    // 自动同步：将相同 productName+variantName 的其他订单也填入同样规格
    if (spec.id) {
        const src = await prisma.order.findUnique({
            where: { id: orderId },
            select: { productName: true, variantName: true }
        })
        if (src?.productName && src?.variantName) {
            await prisma.order.updateMany({
                where: {
                    id: { not: orderId },
                    productName: src.productName,
                    variantName: src.variantName,
                },
                data: { specId: spec.id, productId: spec.productId }
            })
        }
    }

    revalidatePath('/orders')
    return { success: true }
}

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus) {
  try {
    const currentUser = await getCurrentUser();
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    
    if (!order) throw new Error("Order not found");
    if (order.status === newStatus) {
        return { success: true, message: "订单状态已是最新" }
    }

    const oldStatus = order.status;
    const oldStatusLabel = STATUS_LABELS[oldStatus] || oldStatus;
    const newStatusLabel = STATUS_LABELS[newStatus] || newStatus;
    
    const data: { status: OrderStatus; completedAt?: Date | null; logs: { create: { action: string; operator: string; desc: string } } } = {
        status: newStatus,
        logs: {
            create: {
                action: '状态变更',
                operator: currentUser?.name || '系统',
                desc: `${oldStatusLabel} -> ${newStatusLabel}`
            }
        }
    };

    if (newStatus === 'COMPLETED' && !order.completedAt) {
        data.completedAt = new Date();
    }

    await prisma.order.update({
        where: { id: orderId },
        data
    });

    if (newStatus === 'COMPLETED' || newStatus === 'CLOSED') {
        await releaseOrderInventory(orderId)
    }

    revalidatePath('/orders');
    return { success: true, message: "订单状态更新成功" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, message: message || "更新状态失败" };
  }
}

export async function updateOrderRemark(orderId: string, remark: string) {
    try {
        await prisma.order.update({
            where: { id: orderId },
            data: { remark }
        });
        revalidatePath('/orders');
        return { success: true, message: "备注更新成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "更新备注失败" };
    }
}

export async function updateMiniProgramOrderNo(orderId: string, no: string) {
    try {
        const trimmedNo = no?.trim()
        if (trimmedNo && !/^SH\d{20}$/.test(trimmedNo)) {
             throw new Error("小程序订单号格式错误，应为 SH + 20位数字")
        }
        await prisma.order.update({
            where: { id: orderId },
            data: { miniProgramOrderNo: trimmedNo || '' }
        });
        revalidatePath('/orders');
        return { success: true, message: "小程序单号更新成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "更新小程序单号失败" };
    }
}

export async function updateXianyuOrderNo(orderId: string, no: string) {
    try {
        await prisma.order.update({
            where: { id: orderId },
            data: { xianyuOrderNo: no }
        });
        revalidatePath('/orders');
        return { success: true, message: "闲鱼单号更新成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "更新闲鱼单号失败" };
    }
}

export async function updateOrderScreenshot(orderId: string, screenshotUrl: string) {
    try {
        await prisma.order.update({
            where: { id: orderId },
            data: { screenshot: screenshotUrl }
        });
        revalidatePath('/orders');
        return { success: true, message: "截图上传成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "截图更新失败" };
    }
}

export async function extendOrder(orderId: string, days: number, price: number) {
  try {
    const currentUser = await getCurrentUser();
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    
    if (!order) throw new Error("Order not found");

    let returnDeadline = order.returnDeadline;
    if (returnDeadline) {
         returnDeadline = new Date(returnDeadline);
         returnDeadline.setDate(returnDeadline.getDate() + days);
    }
    
    await prisma.order.update({
        where: { id: orderId },
        data: {
            returnDeadline,
            extensions: {
                create: {
                    days,
                    price
                }
            },
            logs: {
                create: {
                    action: '续租',
                    operator: currentUser?.name || '系统',
                    desc: `续租 ${days} 天，费用 ${price} 元`
                }
            }
        }
    });

    revalidatePath('/orders');
    return { success: true, message: "续租成功" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, message: message || "续租失败" };
  }
}

export async function deleteOrder(orderId: string) {
    try {
        await prisma.order.delete({ where: { id: orderId } });
        revalidatePath('/orders');
        return { success: true, message: "订单删除成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "删除订单失败" };
    }
}

export async function shipOrder(orderId: string, data: { trackingNumber?: string, logisticsCompany?: string, sn?: string }) {
    try {
        const currentUser = await getCurrentUser();
        await allocateOrderInventory(orderId)
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'SHIPPED_PENDING_CONFIRMATION',
                trackingNumber: data.trackingNumber,
                logisticsCompany: data.logisticsCompany,
                sn: data.sn,
                actualDeliveryTime: new Date(),
                logs: {
                    create: {
                        action: '发货',
                        operator: currentUser?.name || '系统',
                        desc: `发货: ${data.logisticsCompany || ''} ${data.trackingNumber || ''}${data.sn ? ` SN:${data.sn}` : ''}`
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "发货成功，请确认发货信息" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "发货失败" };
    }
}

export async function confirmShipment(orderId: string) {
    try {
        const currentUser = await getCurrentUser();
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'PENDING_RECEIPT',
                logs: {
                    create: {
                        action: '确认发货',
                        operator: currentUser?.name || '系统',
                        desc: '确认发货信息，等待客户收货'
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "确认成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "确认失败" };
    }
}

export async function returnOrder(orderId: string, data: { returnTrackingNumber?: string, returnLogisticsCompany?: string }) {
    try {
        const currentUser = await getCurrentUser();
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'RETURNING',
                returnTrackingNumber: data.returnTrackingNumber,
                returnLogisticsCompany: data.returnLogisticsCompany,
                logs: {
                    create: {
                        action: '归还',
                        operator: currentUser?.name || '系统',
                        desc: `归还: ${data.returnLogisticsCompany || ''} ${data.returnTrackingNumber || ''}`
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "归还登记成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "归还登记失败" };
    }
}

export async function approveOrder(orderId: string) {
    try {
        const currentUser = await getCurrentUser();
        await ensureOrderReservations(orderId)
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'PENDING_SHIPMENT',
                logs: {
                    create: {
                        action: '审核通过',
                        operator: currentUser?.name || '系统',
                        desc: '审核通过，等待发货'
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "审核通过" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "审核失败" };
    }
}

export async function rejectOrder(orderId: string) {
    try {
        const currentUser = await getCurrentUser();
        await releaseOrderInventory(orderId)
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'CLOSED', // or REJECTED if enum allows? Assuming CLOSED for now or check enum
                logs: {
                    create: {
                        action: '审核拒绝',
                        operator: currentUser?.name || '系统',
                        desc: '审核拒绝，订单关闭'
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "审核拒绝" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "操作失败" };
    }
}

export async function closeOrder(orderId: string, remark?: string) {
    try {
        const currentUser = await getCurrentUser();
        await releaseOrderInventory(orderId)
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'CLOSED',
                logs: {
                    create: {
                        action: '关闭订单',
                        operator: currentUser?.name || '系统',
                        desc: remark ? `强制关闭订单: ${remark}` : '强制关闭订单'
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "订单已关闭" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "关闭失败" };
    }
}

export async function addOverdueFee(orderId: string, fee: number) {
    try {
        const currentUser = await getCurrentUser();
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new Error("Order not found");

        const newOverdueFee = (order.overdueFee || 0) + fee;
        const totalAmount = (order.totalAmount || 0) + fee;
        
        await prisma.order.update({
            where: { id: orderId },
            data: {
                overdueFee: newOverdueFee,
                totalAmount,
                logs: {
                    create: {
                        action: '增加逾期费',
                        operator: currentUser?.name || '系统',
                        desc: `增加逾期费: ${fee}, 总计: ${newOverdueFee}`
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "逾期费更新成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "操作失败" };
    }
}

export async function saveProduct(product: { id?: string, name: string, variants: ProductVariant[], matchKeywords?: string, totalStock?: number }) {
    try {
        const variantsStr = JSON.stringify(product.variants || []);

        const incomingSpecIds = new Set<string>();
        for (const v of product.variants || []) {
            if (!v.specId) {
                // Generate specId if missing
                v.specId = `SKU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            }
            if (incomingSpecIds.has(v.specId)) {
                return { success: false, message: "规格ID不能重复" };
            }
            incomingSpecIds.add(v.specId);
            if (!v.bomItems || v.bomItems.length === 0) {
                return { success: false, message: "每个规格必须配置BOM" };
            }
        }
        
        if (product.id) {
            const updated = await prisma.product.update({
                where: { id: product.id },
                data: {
                    name: product.name,
                    variants: variantsStr,
                    matchKeywords: product.matchKeywords,
                    totalStock: product.totalStock
                }
            });

            const existingSpecs = await prisma.productSpec.findMany({
                where: { productId: product.id }
            });
            const existingBySpecId = new Map(existingSpecs.map(s => [s.specId, s]));
            const nextSpecIds = new Set(product.variants.map(v => v.specId || "").filter(Boolean));

            for (const spec of existingSpecs) {
                if (!nextSpecIds.has(spec.specId)) {
                    await prisma.productSpec.delete({ where: { id: spec.id } });
                }
            }

            for (const variant of product.variants) {
                const priceRulesStr = JSON.stringify(variant.priceRules || {});
                const accessories = variant.accessories || "";
                const insurancePrice = Number(variant.insurancePrice) || 0;
                const specId = variant.specId || "";

                const existing = existingBySpecId.get(specId);
                if (existing) {
                    await prisma.productSpec.update({
                        where: { id: existing.id },
                        data: {
                            name: variant.name,
                            accessories,
                            insurancePrice,
                            priceRules: priceRulesStr
                        }
                    });

                    await prisma.specBom.deleteMany({ where: { specId: existing.id } });
                    if (variant.bomItems && variant.bomItems.length > 0) {
                        await prisma.specBom.createMany({
                            data: variant.bomItems.map(b => ({
                                specId: existing.id,
                                itemTypeId: b.itemTypeId,
                                quantity: Number(b.quantity) || 1
                            }))
                        });
                    }
                } else {
                    const created = await prisma.productSpec.create({
                        data: {
                            specId,
                            name: variant.name,
                            accessories,
                            insurancePrice,
                            priceRules: priceRulesStr,
                            productId: updated.id
                        }
                    });
                    if (variant.bomItems && variant.bomItems.length > 0) {
                        await prisma.specBom.createMany({
                            data: variant.bomItems.map(b => ({
                                specId: created.id,
                                itemTypeId: b.itemTypeId,
                                quantity: Number(b.quantity) || 1
                            }))
                        });
                    }
                }
            }

            revalidatePath('/products');
            return { success: true, message: "商品更新成功" };
        } else {
            const created = await prisma.product.create({
                data: {
                    name: product.name,
                    variants: variantsStr,
                    matchKeywords: product.matchKeywords,
                    totalStock: product.totalStock || 100
                }
            });

            for (const variant of product.variants) {
                const createdSpec = await prisma.productSpec.create({
                    data: {
                        specId: variant.specId || "",
                        name: variant.name,
                        accessories: variant.accessories || "",
                        insurancePrice: Number(variant.insurancePrice) || 0,
                        priceRules: JSON.stringify(variant.priceRules || {}),
                        productId: created.id
                    }
                });
                if (variant.bomItems && variant.bomItems.length > 0) {
                    await prisma.specBom.createMany({
                        data: variant.bomItems.map(b => ({
                            specId: createdSpec.id,
                            itemTypeId: b.itemTypeId,
                            quantity: Number(b.quantity) || 1
                        }))
                    });
                }
            }
            revalidatePath('/products');
            return { success: true, message: "商品创建成功" };
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "保存商品失败" };
    }
}

export async function syncProductSpecsFromVariants() {
    try {
        const products = await prisma.product.findMany()
        let createdCount = 0
        let updatedCount = 0

        for (const product of products) {
            let variants: ProductVariant[] = []
            try {
                variants = product.variants ? JSON.parse(product.variants) : []
            } catch {
                variants = []
            }

            const existingSpecs = await prisma.productSpec.findMany({ where: { productId: product.id } })
            const existingBySpecId = new Map(existingSpecs.map(s => [s.specId, s]))

            const updatedVariants = variants.map((v, index) => {
                const specId = v.specId || `SKU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
                return { ...v, specId }
            })

            for (const variant of updatedVariants) {
                const specId = variant.specId || ""
                const priceRulesStr = JSON.stringify(variant.priceRules || {})
                const accessories = variant.accessories || ""
                const insurancePrice = Number(variant.insurancePrice) || 0
                const existing = existingBySpecId.get(specId)
                if (existing) {
                    await prisma.productSpec.update({
                        where: { id: existing.id },
                        data: {
                            name: variant.name,
                            accessories,
                            insurancePrice,
                            priceRules: priceRulesStr
                        }
                    })
                    updatedCount++
                } else {
                    await prisma.productSpec.create({
                        data: {
                            specId,
                            name: variant.name,
                            accessories,
                            insurancePrice,
                            priceRules: priceRulesStr,
                            productId: product.id
                        }
                    })
                    createdCount++
                }
            }

            await prisma.product.update({
                where: { id: product.id },
                data: {
                    variants: JSON.stringify(updatedVariants)
                }
            })
        }

        revalidatePath('/products')
        return { success: true, message: `同步完成，新增 ${createdCount} 条规格，更新 ${updatedCount} 条规格` }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "同步失败" }
    }
}

export async function createInventoryItemType(data: { name: string; isSerialized: boolean; unit?: string; category?: string; purchasePrice?: number }) {
    try {
        if (!data.name.trim()) return { success: false, message: "物品名称不能为空" }
        await prisma.inventoryItemType.create({
            data: {
                name: data.name.trim(),
                isSerialized: data.isSerialized,
                unit: data.unit || null,
                category: data.category || null,
                purchasePrice: data.purchasePrice || null
            }
        })
        revalidatePath('/inventory')
        return { success: true, message: "物品类型创建成功" }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "物品类型创建失败" }
    }
}

export async function updateInventoryItemType(id: string, data: { name: string; isSerialized: boolean; unit?: string; category?: string; purchasePrice?: number }) {
    try {
        if (!data.name.trim()) return { success: false, message: "物品名称不能为空" }
        await prisma.inventoryItemType.update({
            where: { id },
            data: {
                name: data.name.trim(),
                isSerialized: data.isSerialized,
                unit: data.unit || null,
                category: data.category || null,
                purchasePrice: data.purchasePrice || null
            }
        })
        revalidatePath('/inventory')
        return { success: true, message: "物品类型更新成功" }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "物品类型更新失败" }
    }
}

export async function updateWarehouse(id: string, name: string) {
    try {
        if (!name.trim()) return { success: false, message: "仓库名称不能为空" }
        await prisma.warehouse.update({
            where: { id },
            data: { name: name.trim() }
        })
        revalidatePath('/inventory')
        return { success: true, message: "仓库名称更新成功" }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "仓库名称更新失败" }
    }
}

export async function deleteInventoryItemType(id: string) {
    try {
        await prisma.inventoryItemType.delete({ where: { id } })
        revalidatePath('/inventory')
        return { success: true, message: "物品类型删除成功" }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "物品类型删除失败" }
    }
}

export async function createWarehouse(data: { name: string; isDefault?: boolean }) {
    try {
        if (!data.name.trim()) return { success: false, message: "仓库名称不能为空" }
        if (data.isDefault) {
            await prisma.warehouse.updateMany({ data: { isDefault: false } })
        }
        await prisma.warehouse.create({
            data: {
                name: data.name.trim(),
                isDefault: !!data.isDefault
            }
        })
        revalidatePath('/inventory')
        return { success: true, message: "仓库创建成功" }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "仓库创建失败" }
    }
}

export async function setDefaultWarehouse(id: string) {
    try {
        await prisma.warehouse.updateMany({ data: { isDefault: false } })
        await prisma.warehouse.update({ where: { id }, data: { isDefault: true } })
        revalidatePath('/inventory')
        return { success: true, message: "默认仓库已更新" }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "默认仓库更新失败" }
    }
}

export async function deleteWarehouse(id: string) {
    try {
        const warehouse = await prisma.warehouse.findUnique({ where: { id } })
        if (!warehouse) return { success: false, message: "仓库不存在" }
        if (warehouse.isDefault) return { success: false, message: "无法删除默认仓库，请先设置其他仓库为默认" }
        
        await prisma.warehouse.delete({ where: { id } })
        revalidatePath('/inventory')
        return { success: true, message: "仓库删除成功" }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "仓库删除失败" }
    }
}

export async function createInventoryItem(data: { itemTypeId: string; warehouseId: string; sn?: string }) {
    try {
        const itemType = await prisma.inventoryItemType.findUnique({ where: { id: data.itemTypeId } })
        if (!itemType) return { success: false, message: "物品类型不存在" }
        if (!itemType.isSerialized) return { success: false, message: "非序列化物品请走库存数量调整" }

        await prisma.inventoryItem.create({
            data: {
                itemTypeId: data.itemTypeId,
                warehouseId: data.warehouseId,
                sn: data.sn || null,
                status: "AVAILABLE"
            }
        })
        revalidatePath('/inventory')
        return { success: true, message: "入库成功" }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "入库失败" }
    }
}

export async function batchCreateInventoryItems(data: { itemTypeId: string; warehouseId: string; sns: string[] }) {
    try {
        const itemType = await prisma.inventoryItemType.findUnique({ where: { id: data.itemTypeId } })
        if (!itemType) return { success: false, message: "物品类型不存在" }
        if (!itemType.isSerialized) return { success: false, message: "非序列化物品请走库存数量调整" }
        if (!data.sns || data.sns.length === 0) return { success: false, message: "请提供序列号" }

        const validSns = data.sns.filter(sn => sn.trim().length > 0).map(sn => sn.trim())
        if (validSns.length === 0) return { success: false, message: "没有有效的序列号" }

        // Find existing items with these SNs (non-deleted)
        const existing = await prisma.inventoryItem.findMany({
            where: { sn: { in: validSns }, status: { not: "DELETED" } },
            select: { id: true, sn: true }
        })
        const existingSnMap = new Map(existing.map(e => [e.sn!, e.id]))

        const toCreate = validSns.filter(sn => !existingSnMap.has(sn))
        const toUpdate = validSns.filter(sn => existingSnMap.has(sn))

        await prisma.$transaction([
            ...toCreate.map(sn =>
                prisma.inventoryItem.create({
                    data: { itemTypeId: data.itemTypeId, warehouseId: data.warehouseId, sn, status: "AVAILABLE" }
                })
            ),
            ...toUpdate.map(sn =>
                prisma.inventoryItem.update({
                    where: { id: existingSnMap.get(sn)! },
                    data: { itemTypeId: data.itemTypeId, warehouseId: data.warehouseId }
                })
            ),
        ])

        revalidatePath('/inventory')
        const msg = toCreate.length > 0 && toUpdate.length > 0
            ? `新增 ${toCreate.length} 个，更新 ${toUpdate.length} 个`
            : toCreate.length > 0 ? `成功入库 ${toCreate.length} 个物品` : `更新 ${toUpdate.length} 个物品`
        return { success: true, message: msg }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "批量入库失败" }
    }
}

export async function deleteInventoryItem(id: string) {
    try {
        // Soft delete: Change status to DELETED
        await prisma.inventoryItem.update({
            where: { id },
            data: { status: "DELETED" }
        })
        revalidatePath('/inventory')
        return { success: true, message: "物品已删除" }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "物品删除失败" }
    }
}

export async function batchOutboundInventoryItems(data: { itemTypeId: string; warehouseId: string; sns: string[] }) {
    try {
        const validSns = data.sns.filter(s => s.trim().length > 0).map(s => s.trim())
        if (validSns.length === 0) return { success: false, message: "请输入至少一个序列号" }

        const items = await prisma.inventoryItem.findMany({
            where: { itemTypeId: data.itemTypeId, warehouseId: data.warehouseId, sn: { in: validSns }, status: { not: "DELETED" } },
            select: { id: true, sn: true }
        })

        const foundSns = items.map(i => i.sn)
        const notFound = validSns.filter(s => !foundSns.includes(s))

        if (items.length === 0) return { success: false, message: "未找到任何匹配的序列号" }

        await prisma.inventoryItem.updateMany({
            where: { id: { in: items.map(i => i.id) } },
            data: { status: "DELETED" }
        })

        revalidatePath('/inventory')
        const msg = notFound.length > 0
            ? `已出库 ${items.length} 个，未找到: ${notFound.join(', ')}`
            : `已出库 ${items.length} 个`
        return { success: true, message: msg }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "批量出库失败" }
    }
}

export async function adjustInventoryStock(data: { itemTypeId: string; warehouseId: string; quantity: number }) {
    try {
        const itemType = await prisma.inventoryItemType.findUnique({ where: { id: data.itemTypeId } })
        if (!itemType) return { success: false, message: "物品类型不存在" }
        if (itemType.isSerialized) return { success: false, message: "序列化物品请录入SN" }
        const quantity = Number(data.quantity)
        if (!Number.isFinite(quantity) || quantity === 0) return { success: false, message: "数量必须不为0" }

        await prisma.inventoryStock.upsert({
            where: {
                itemTypeId_warehouseId: {
                    itemTypeId: data.itemTypeId,
                    warehouseId: data.warehouseId
                }
            },
            update: {
                quantity: { increment: quantity }
            },
            create: {
                itemTypeId: data.itemTypeId,
                warehouseId: data.warehouseId,
                quantity
            }
        })
        revalidatePath('/inventory')
        return { success: true, message: "库存数量已更新" }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "库存更新失败" }
    }
}

export async function migrateDeviceMappings() {
    try {
        const rawConfig = await getAppConfigValue("online_orders_sync_config")
        if (!rawConfig) return { success: false, message: "未找到配置" }
        
        const config = JSON.parse(rawConfig)
        const mappings = config.deviceMappings as { keyword: string; deviceName: string }[] | undefined
        
        if (!mappings || !Array.isArray(mappings)) {
            return { success: false, message: "未找到映射配置" }
        }

        const products = await prisma.product.findMany()
        let updatedCount = 0

        for (const product of products) {
            // Find all keywords mapping to this product name
            const productKeywords = mappings
                .filter(m => m.deviceName === product.name)
                .map(m => m.keyword)
                .filter(Boolean)
            
            if (productKeywords.length > 0) {
                // Merge with existing keywords if any
                let existingKeywords: string[] = []
                try {
                    if (product.matchKeywords) {
                        existingKeywords = JSON.parse(product.matchKeywords)
                    }
                } catch {
                    // ignore parse error
                }

                const newKeywords = Array.from(new Set([...existingKeywords, ...productKeywords]))
                
                await prisma.product.update({
                    where: { id: product.id },
                    data: {
                        matchKeywords: JSON.stringify(newKeywords)
                    }
                })
                updatedCount++
            }
        }

        revalidatePath('/products')
        return { success: true, message: `迁移成功，更新了 ${updatedCount} 个商品` }
    } catch (error) {
        console.error(error)
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: "迁移失败: " + message }
    }
}

export async function deleteProduct(productId: string) {
    try {
        await prisma.product.delete({ where: { id: productId } });
        return { success: true, message: "商品删除成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "删除商品失败" };
    }
}

export async function getAppConfigValue(key: string) {
    const appConfig = (prisma as unknown as { appConfig?: typeof prisma.appConfig }).appConfig
    if (!appConfig) {
        return null;
    }
    const config = await appConfig.findUnique({
        where: { key }
    });
    return config?.value ?? null;
}

export async function setAppConfigValue(key: string, value: string) {
    try {
        const currentUser = await getCurrentUser();
        const isAdmin = currentUser?.role === 'ADMIN';
        const canManage = isAdmin || currentUser?.permissions?.includes('online_orders');
        if (!canManage) {
            return { success: false, message: "无权限操作" };
        }
        const appConfig = (prisma as unknown as { appConfig?: typeof prisma.appConfig }).appConfig
        if (!appConfig) {
            return { success: false, message: "配置模块未就绪" };
        }
        await appConfig.upsert({
            where: { key },
            update: { value },
            create: { key, value }
        });
        revalidatePath('/online-orders');
        return { success: true, message: "配置更新成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "配置更新失败" };
    }
}

// Non-completed order statuses
const ACTIVE_ORDER_STATUSES = ['WAIT_PAY', 'PENDING_REVIEW', 'PENDING_SHIPMENT', 'PENDING_RECEIPT', 'RENTING', 'RETURNING', 'OVERDUE']

/**
 * Get non-completed orders linked to a non-serialized inventory item type (via SpecBom).
 * Used for the inventory overview "查看" detail for non-serialized items.
 */
export async function getOrdersByItemTypeId(itemTypeId: string) {
    // Find all specs that have this itemType in their BOM
    const bomItems = await prisma.specBom.findMany({
        where: { itemTypeId },
        select: { specId: true }
    })
    const specIds = bomItems.map(b => b.specId)
    if (specIds.length === 0) return { orders: [], onlineOrders: [] }

    const [orders, onlineOrders] = await Promise.all([
        prisma.order.findMany({
            where: {
                specId: { in: specIds },
                status: { in: ACTIVE_ORDER_STATUSES }
            },
            select: {
                id: true, orderNo: true, status: true, sourceContact: true, platform: true,
                rentStartDate: true, returnDeadline: true, sn: true,
                spec: { select: { name: true } }
            },
            orderBy: { rentStartDate: 'asc' }
        }),
        prisma.onlineOrder.findMany({
            where: {
                specId: { in: specIds },
                status: { in: ACTIVE_ORDER_STATUSES }
            },
            select: {
                id: true, orderNo: true, status: true, customerName: true, platform: true,
                rentStartDate: true, returnDeadline: true, manualSn: true,
                spec: { select: { name: true } }
            },
            orderBy: { rentStartDate: 'asc' }
        })
    ])

    return {
        orders: orders.map(o => ({ ...o, customerName: o.sourceContact, manualSn: o.sn })),
        onlineOrders
    }
}

/**
 * Get orders (online + offline) that reference a specific SN (manualSn field).
 * Used for the serialized item SN detail view.
 */
export async function getOrdersBySn(sn: string) {
    const [orders, onlineOrders] = await Promise.all([
        prisma.order.findMany({
            where: { sn: sn, status: { in: ACTIVE_ORDER_STATUSES } },
            select: {
                id: true, orderNo: true, status: true, sourceContact: true, platform: true,
                rentStartDate: true, returnDeadline: true,
                spec: { select: { name: true } }
            },
            orderBy: { rentStartDate: 'asc' }
        }),
        prisma.onlineOrder.findMany({
            where: { manualSn: sn, status: { in: ACTIVE_ORDER_STATUSES } },
            select: {
                id: true, orderNo: true, status: true, customerName: true, platform: true,
                rentStartDate: true, returnDeadline: true,
                spec: { select: { name: true } }
            },
            orderBy: { rentStartDate: 'asc' }
        })
    ])

    return {
        orders: orders.map(o => ({ ...o, customerName: o.sourceContact, manualSn: undefined })),
        onlineOrders
    }
}

export async function updateOrderSettled(orderId: string, settled: boolean) {
    try {
        await prisma.order.update({
            where: { id: orderId },
            data: { settled }
        });
        revalidatePath('/orders');
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "更新结款状态失败" };
    }
}

// ── API Token management ──────────────────────────────────────────────────────

export async function getApiTokenAction() {
    const currentUser = await getCurrentUser()
    if (currentUser?.role !== 'ADMIN') return { success: false, token: null }
    const { getApiToken } = await import('@/lib/api-token')
    const token = await getApiToken()
    return { success: true, token }
}

export async function generateApiTokenAction() {
    const currentUser = await getCurrentUser()
    if (currentUser?.role !== 'ADMIN') return { success: false, token: null, message: '无权限' }
    const { generateApiToken } = await import('@/lib/api-token')
    const token = await generateApiToken()
    return { success: true, token }
}
